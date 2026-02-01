import os
import zipfile
import rarfile
import threading
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, BackgroundTasks, Depends, Response
from fastapi.responses import FileResponse
from typing import Optional
from PIL import Image, ImageDraw, ImageFont
from config import COMICS_DIR, CACHE_DIR, IMG_EXTENSIONS
from database import (
    get_db_connection, get_reading_progress, create_scan_job, 
    get_latest_scan_job, get_running_scan_job, complete_scan_job
)
from scanner import scan_library_task, fast_scan_library_task, rescan_library_task, natural_sort_key, extract_cover_image
from dependencies import get_current_user

router = APIRouter(prefix="/api", tags=["library"])

# Cleanup stuck scans on startup
def cleanup_stuck_scans():
    """Mark any scan_jobs with status='running' and started_at < 1 hour ago as 'failed'"""
    conn = get_db_connection()
    one_hour_ago = datetime.now() - timedelta(hours=1)
    conn.execute(
        '''UPDATE scan_jobs 
           SET status = 'failed', errors = 'Scan interrupted (server restart or crash)'
           WHERE status = 'running' AND started_at < ?''',
        (one_hour_ago,)
    )
    conn.commit()
    conn.close()

# Call cleanup on module load
cleanup_stuck_scans()

def create_placeholder_image():
    """Create a 'Generating...' placeholder image if it doesn't exist"""
    placeholder_path = os.path.join(CACHE_DIR, "_placeholder.jpg")
    if not os.path.exists(placeholder_path):
        try:
            # Create a simple gray placeholder image
            img = Image.new('RGB', (300, 450), color=(128, 128, 128))
            draw = ImageDraw.Draw(img)
            
            # Try to use a font, fallback to default if unavailable
            try:
                font = ImageFont.truetype("arial.ttf", 24)
            except:
                font = ImageFont.load_default()
            
            # Draw "Generating..." text in the center
            text = "Generating..."
            bbox = draw.textbbox((0, 0), text, font=font)
            text_width = bbox[2] - bbox[0]
            text_height = bbox[3] - bbox[1]
            position = ((300 - text_width) // 2, (450 - text_height) // 2)
            draw.text(position, text, fill=(255, 255, 255), font=font)
            
            img.save(placeholder_path, format="JPEG", quality=85)
        except Exception as e:
            print(f"Error creating placeholder image: {e}")
    return placeholder_path

def generate_thumbnail_with_timeout(comic_path: str, comic_id: str, timeout: int = 10) -> dict:
    """
    Generate thumbnail with timeout protection.
    Returns: {'success': bool, 'timeout': bool, 'cache_path': str}
    """
    result = {'success': False, 'timeout': False, 'cache_path': None}
    
    # Generate to temp file with PID and thread ID for race condition protection
    pid = os.getpid()
    thread_id = threading.get_ident()
    temp_id = f"{comic_id}_{pid}_{thread_id}_tmp"
    temp_cache_path = os.path.join(CACHE_DIR, f"{temp_id}.jpg")
    final_cache_path = os.path.join(CACHE_DIR, f"{comic_id}.jpg")
    
    def target():
        try:
            # Extract and save to temp file using temp_id
            success = extract_cover_image(comic_path, temp_id)
            if success:
                result['success'] = True
                result['cache_path'] = temp_cache_path
        except Exception as e:
            print(f"Error generating thumbnail for {comic_id}: {e}")
            result['success'] = False
    
    thread = threading.Thread(target=target)
    thread.daemon = False  # We want to track this thread
    thread.start()
    thread.join(timeout)
    
    if thread.is_alive():
        # Timeout occurred
        result['timeout'] = True
        result['success'] = False
        
        # Continue generation in background (daemon thread)
        def continue_in_background():
            thread.join()  # Wait for original thread to finish
            if result['success'] and os.path.exists(temp_cache_path):
                try:
                    # Atomic rename - if final file already exists, another request won the race
                    if not os.path.exists(final_cache_path):
                        os.rename(temp_cache_path, final_cache_path)
                        # Update database
                        conn = get_db_connection()
                        conn.execute('UPDATE comics SET has_thumbnail = 1 WHERE id = ?', (comic_id,))
                        conn.commit()
                        conn.close()
                    else:
                        # Another thread already created it, clean up our temp file
                        if os.path.exists(temp_cache_path):
                            os.remove(temp_cache_path)
                except Exception as e:
                    print(f"Error in background thumbnail generation for {comic_id}: {e}")
        
        bg_thread = threading.Thread(target=continue_in_background)
        bg_thread.daemon = True
        bg_thread.start()
    else:
        # Thread completed within timeout
        if result['success'] and os.path.exists(temp_cache_path):
            try:
                # Atomic rename - if final file already exists, another request won the race
                if not os.path.exists(final_cache_path):
                    os.rename(temp_cache_path, final_cache_path)
                    result['cache_path'] = final_cache_path
                else:
                    # Another thread already created it, clean up our temp file
                    if os.path.exists(temp_cache_path):
                        os.remove(temp_cache_path)
                    result['cache_path'] = final_cache_path
            except Exception as e:
                print(f"Error finalizing thumbnail for {comic_id}: {e}")
                result['success'] = False
    
    return result

# Create placeholder on module load
create_placeholder_image()

@router.post("/scan")
async def scan_library(background_tasks: BackgroundTasks):
    if not os.path.exists(COMICS_DIR):
        raise HTTPException(status_code=404, detail="Comics directory not found")
    
    # Check if a scan is already running
    running_job = get_running_scan_job()
    if running_job:
        raise HTTPException(status_code=409, detail="A scan is already in progress")
    
    # Start fast scan (no job_id needed - it creates its own)
    background_tasks.add_task(fast_scan_library_task)
    return {"message": "Fast scan started"}

@router.get("/scan/status")
async def get_scan_status():
    """Get current scan progress"""
    latest_job = get_latest_scan_job()
    
    if not latest_job:
        return {
            "id": None,
            "status": "idle",
            "total_comics": 0,
            "processed_comics": 0,
            "started_at": None,
            "completed_at": None,
            "errors": None
        }
    
    return {
        "id": latest_job['id'],
        "status": latest_job['status'],
        "total_comics": latest_job['total_comics'],
        "processed_comics": latest_job['processed_comics'],
        "started_at": latest_job['started_at'],
        "completed_at": latest_job['completed_at'],
        "errors": latest_job.get('errors')
    }

@router.post("/rescan")
async def rescan_library(background_tasks: BackgroundTasks):
    if not os.path.exists(COMICS_DIR):
        raise HTTPException(status_code=404, detail="Comics directory not found")
    
    background_tasks.add_task(rescan_library_task)
    return {"message": "Full rescan started in background"}

@router.get("/books")
async def list_books():
    conn = get_db_connection()
    books = conn.execute("SELECT * FROM comics ORDER BY category, series, volume, chapter, filename").fetchall()
    conn.close()
    return [dict(row) for row in books]

@router.get("/cover/{comic_id}")
async def get_cover(comic_id: str):
    cache_path = os.path.join(CACHE_DIR, f"{comic_id}.jpg")
    
    # If thumbnail exists in cache, serve it immediately
    if os.path.exists(cache_path):
        return FileResponse(cache_path)
    
    # Thumbnail missing - generate on-demand
    # First, get comic path from database
    conn = get_db_connection()
    comic = conn.execute("SELECT path FROM comics WHERE id = ?", (comic_id,)).fetchone()
    conn.close()
    
    if not comic:
        return Response(status_code=404)
    
    comic_path = comic['path']
    
    # Check if file exists
    if not os.path.exists(comic_path):
        return Response(status_code=404)
    
    # Double-check cache again (race condition: another request may have just created it)
    if os.path.exists(cache_path):
        return FileResponse(cache_path)
    
    # Generate thumbnail with timeout
    result = generate_thumbnail_with_timeout(comic_path, comic_id, timeout=10)
    
    if result['timeout']:
        # Timeout occurred - return placeholder and continue generation in background
        placeholder_path = os.path.join(CACHE_DIR, "_placeholder.jpg")
        return FileResponse(placeholder_path)
    
    if result['success']:
        # Update has_thumbnail flag in database
        conn = get_db_connection()
        conn.execute('UPDATE comics SET has_thumbnail = 1 WHERE id = ?', (comic_id,))
        conn.commit()
        conn.close()
        
        # Serve the newly generated thumbnail
        final_cache_path = os.path.join(CACHE_DIR, f"{comic_id}.jpg")
        if os.path.exists(final_cache_path):
            return FileResponse(final_cache_path)
    
    # Generation failed - return 404
    return Response(status_code=404)

@router.get("/read/{comic_id}")
async def read_comic(comic_id: str, current_user: dict = Depends(get_current_user)):
    """Returns metadata for the reader, including user's progress if logged in"""
    conn = get_db_connection()
    book = conn.execute("SELECT * FROM comics WHERE id = ?", (comic_id,)).fetchone()
    conn.close()
    
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    
    result = dict(book)
    
    # Add user's reading progress if logged in
    if current_user:
        progress = get_reading_progress(current_user['id'], comic_id)
        if progress:
            result['user_progress'] = progress
    
    return result

@router.get("/read/{comic_id}/page/{page_num}")
async def get_comic_page(comic_id: str, page_num: int):
    conn = get_db_connection()
    book = conn.execute("SELECT path FROM comics WHERE id = ?", (comic_id,)).fetchone()
    conn.close()
    
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    
    filepath = book['path']
    try:
        image_data = None
        file_ext = os.path.splitext(filepath)[1].lower()
        
        if file_ext == '.cbz':
            with zipfile.ZipFile(filepath, 'r') as z:
                images = sorted([n for n in z.namelist() if n.lower().endswith(IMG_EXTENSIONS)], key=natural_sort_key)
                if 0 <= page_num < len(images):
                    with z.open(images[page_num]) as f:
                        image_data = f.read()
        elif file_ext == '.cbr':
            with rarfile.RarFile(filepath) as r:
                images = sorted([n for n in r.namelist() if n.lower().endswith(IMG_EXTENSIONS)], key=natural_sort_key)
                if 0 <= page_num < len(images):
                    with r.open(images[page_num]) as f:
                        image_data = f.read()
        
        if image_data:
            return Response(content=image_data, media_type="image/jpeg")
        else:
            raise HTTPException(status_code=404, detail="Page not found")
    except Exception as e:
        print(f"Error reading page {page_num} of {filepath}: {e}")
        raise HTTPException(status_code=500, detail="Error reading comic archive")
