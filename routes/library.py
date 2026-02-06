import os
import re
import zipfile
import rarfile
import threading
import tempfile
import shutil
import mimetypes
import uuid
from datetime import datetime, timedelta
from concurrent.futures import ThreadPoolExecutor

# Explicitly register JXL if not present
if not mimetypes.types_map.get('.jxl'):
    mimetypes.add_type('image/jxl', '.jxl')
from fastapi import APIRouter, HTTPException, BackgroundTasks, Depends, Response
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from PIL import Image, ImageDraw, ImageFont
from config import COMICS_DIR, IMG_EXTENSIONS, get_thumbnail_path, BASE_CACHE_DIR
from database import (
    get_db_connection, get_reading_progress, create_scan_job, 
    get_latest_scan_job, get_running_scan_job, complete_scan_job
)
from scanner import scan_library_task, fast_scan_library_task, rescan_library_task, natural_sort_key, extract_cover_image
from dependencies import get_current_user, get_admin_user
from logger import logger

router = APIRouter(prefix="/api", tags=["library"])

# Global state for export progress
export_jobs = {}

# Cleanup stuck scans on startup
def cleanup_stuck_scans() -> None:
    """Mark any scan_jobs with status='running' as 'failed' (since they were interrupted by restart)"""
    try:
        conn = get_db_connection()
        conn.execute(
            '''UPDATE scan_jobs 
               SET status = 'failed', errors = 'Scan interrupted (server restart or crash)'
               WHERE status = 'running' '''
        )
        conn.commit()
        conn.close()
    except Exception as e:
        logger.error(f"Note: Could not cleanup stuck scans: {e}")

def cleanup_orphaned_exports() -> None:
    """Delete orphaned .cbz temp files older than 1 hour from previous server runs"""
    try:
        import glob
        import time
        
        temp_dir = tempfile.gettempdir()
        current_time = time.time()
        one_hour_ago = current_time - 3600  # 1 hour in seconds
        
        # Find all .cbz files in temp directory
        cbz_files = glob.glob(os.path.join(temp_dir, "*.cbz"))
        
        cleaned_count = 0
        for file_path in cbz_files:
            try:
                # Get file modification time
                file_mtime = os.path.getmtime(file_path)
                
                # Delete if older than 1 hour
                if file_mtime < one_hour_ago:
                    os.remove(file_path)
                    cleaned_count += 1
            except Exception as e:
                logger.warning(f"Could not cleanup orphaned export {file_path}: {e}")
        
        if cleaned_count > 0:
            logger.info(f"Cleaned up {cleaned_count} orphaned export files")
    except Exception as e:
        logger.error(f"Note: Could not cleanup orphaned exports: {e}")

# Call cleanup on module load
cleanup_stuck_scans()
cleanup_orphaned_exports()

def create_placeholder_image() -> str:
    """Create a 'Generating...' placeholder image if it doesn't exist"""
    placeholder_path = os.path.join(BASE_CACHE_DIR, "_placeholder.webp")
    if not os.path.exists(placeholder_path):
        try:
            # Create a simple gray placeholder image
            img = Image.new('RGB', (300, 450), (128, 128, 128))  # type: ignore[arg-type]
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
            
            img.save(placeholder_path, format="WEBP", quality=70)
        except Exception as e:
            logger.error(f"Error creating placeholder image: {e}")
    return placeholder_path

def generate_thumbnail_with_timeout(comic_path: str, comic_id: str, timeout: int = 10) -> Dict[str, Any]:
    """
    Generate thumbnail with timeout protection.
    Returns: {'success': bool, 'timeout': bool, 'cache_path': str}
    """
    result: Dict[str, Any] = {'success': False, 'timeout': False, 'cache_path': None}
    
    # Generate to temp file with PID and thread ID for race condition protection
    pid = os.getpid()
    thread_id = threading.get_ident()
    temp_id = f"{comic_id}_{pid}_{thread_id}_tmp"
    temp_cache_path = get_thumbnail_path(temp_id)
    final_cache_path = get_thumbnail_path(comic_id)
    
    def target() -> None:
        try:
            # Extract and save to temp file using temp_id
            success = extract_cover_image(comic_path, temp_id)
            if success:
                result['success'] = True
                result['cache_path'] = temp_cache_path
        except Exception as e:
            logger.error(f"Error generating thumbnail for {comic_id}: {e}")
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
        def continue_in_background() -> None:
            thread.join()  # Wait for original thread to finish
            if result['success'] and temp_cache_path and os.path.exists(temp_cache_path):
                try:
                    # Atomic rename - if final file already exists, another request won the race
                    if final_cache_path and not os.path.exists(final_cache_path):
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
                    logger.error(f"Error in background thumbnail generation for {comic_id}: {e}")
        
        bg_thread = threading.Thread(target=continue_in_background)
        bg_thread.daemon = True
        bg_thread.start()
    else:
        # Thread completed within timeout
        if result['success'] and temp_cache_path and os.path.exists(temp_cache_path):
            try:
                # Atomic rename - if final file already exists, another request won the race
                if final_cache_path and not os.path.exists(final_cache_path):
                    os.rename(temp_cache_path, final_cache_path)
                    result['cache_path'] = final_cache_path
                else:
                    # Another thread already created it, clean up our temp file
                    if os.path.exists(temp_cache_path):
                        os.remove(temp_cache_path)
                    result['cache_path'] = final_cache_path
            except Exception as e:
                logger.error(f"Error finalizing thumbnail for {comic_id}: {e}")
                result['success'] = False
    
    return result

# Create placeholder on module load
create_placeholder_image()

@router.get("/config")
async def get_config() -> Dict[str, str]:
    # Normalize to ensure consistency with scanner and database paths
    norm_path = os.path.normpath(os.path.abspath(COMICS_DIR))
    return {"comics_dir": norm_path}

@router.get("/search")
async def search(q: str, current_user: Dict[str, Any] = Depends(get_current_user)) -> List[Dict[str, Any]]:
    """Search for series using FTS5"""
    from db.series import search_series
    return search_series(q)

@router.post("/scan")
async def scan_library(background_tasks: BackgroundTasks, current_user: Dict[str, Any] = Depends(get_admin_user)) -> Dict[str, str]:
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
async def get_scan_status(current_user: Dict[str, Any] = Depends(get_admin_user)) -> Dict[str, Any]:
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
        "current_file": latest_job.get('current_file'),
        "phase": latest_job.get('phase'),
        "new_comics": latest_job.get('new_comics', 0),
        "deleted_comics": latest_job.get('deleted_comics', 0),
        "changed_comics": latest_job.get('changed_comics', 0),
        "processed_pages": latest_job.get('processed_pages', 0),
        "page_errors": latest_job.get('page_errors', 0),
        "processed_thumbnails": latest_job.get('processed_thumbnails', 0),
        "thumbnail_errors": latest_job.get('thumbnail_errors', 0),
        "started_at": latest_job['started_at'],
        "completed_at": latest_job['completed_at'],
        "errors": latest_job.get('errors')
    }

@router.post("/rescan")
async def rescan_library(background_tasks: BackgroundTasks, current_user: Dict[str, Any] = Depends(get_admin_user)) -> Dict[str, str]:
    if not os.path.exists(COMICS_DIR):
        raise HTTPException(status_code=404, detail="Comics directory not found")
    
    background_tasks.add_task(rescan_library_task)
    return {"message": "Full rescan started in background"}

@router.get("/books")
async def list_books(
    limit: int = 100,
    offset: int = 0,
    current_user: Dict[str, Any] = Depends(get_current_user)
) -> Dict[str, Any]:
    limit = max(1, min(limit, 500))
    offset = max(0, offset)
    
    conn = get_db_connection()
    
    count_query = 'SELECT COUNT(*) as total FROM comics'
    total = conn.execute(count_query).fetchone()['total']
    
    # Join with series to get metadata like genres and status
    query = '''
        SELECT c.*, s.genres, s.status as series_status, s.tags, s.authors
        FROM comics c
        LEFT JOIN series s ON c.series_id = s.id
        ORDER BY c.category, c.series, c.volume, c.chapter, c.filename
        LIMIT ? OFFSET ?
    '''
    books = conn.execute(query, (limit, offset)).fetchall()
    conn.close()
    
    result = []
    import json
    for row in books:
        d = dict(row)
        # Parse JSON fields if present
        for field in ['genres', 'tags', 'authors']:
            if d.get(field):
                try:
                    d[field] = json.loads(d[field])
                except:
                    d[field] = []
            else:
                d[field] = []
        result.append(d)
    
    return {
        "items": result,
        "total": total,
        "limit": limit,
        "offset": offset,
        "has_more": (offset + limit) < total
    }

@router.get("/cover/{comic_id}")
async def get_cover(comic_id: str, current_user: Dict[str, Any] = Depends(get_current_user)) -> Response:
    cache_path = get_thumbnail_path(comic_id)
    
    # If thumbnail exists in cache, serve it immediately
    if cache_path and os.path.exists(cache_path):
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
    if cache_path and os.path.exists(cache_path):
        return FileResponse(cache_path)
    
    # Generate thumbnail with timeout
    result = generate_thumbnail_with_timeout(comic_path, comic_id, timeout=10)
    
    if result['timeout']:
        # Timeout occurred - return placeholder and continue generation in background
        placeholder_path = os.path.join(BASE_CACHE_DIR, "_placeholder.webp")
        return FileResponse(placeholder_path)
    
    if result['success']:
        # Update has_thumbnail flag in database
        conn = get_db_connection()
        conn.execute('UPDATE comics SET has_thumbnail = 1 WHERE id = ?', (comic_id,))
        conn.commit()
        conn.close()
        
        # Serve the newly generated thumbnail
        final_cache_path = get_thumbnail_path(comic_id)
        if final_cache_path and os.path.exists(final_cache_path):
            return FileResponse(final_cache_path)
    
    # Generation failed - return 404
    return Response(status_code=404)

@router.get("/read/{comic_id}")
async def read_comic(comic_id: str, current_user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    """Returns metadata for the reader, including user's progress if logged in"""
    conn = get_db_connection()
    book = conn.execute("SELECT * FROM comics WHERE id = ?", (comic_id,)).fetchone()
    
    if not book:
        conn.close()
        raise HTTPException(status_code=404, detail="Book not found")
    
    result = dict(book)
    
    # On-demand page counting if missing
    if result.get('pages') is None or result.get('pages') == 0:
        filepath = result['path']
        try:
            pages = 0
            if filepath.lower().endswith('.cbz'):
                with zipfile.ZipFile(filepath, 'r') as z:
                    pages = len([n for n in z.namelist() if n.lower().endswith(IMG_EXTENSIONS)])
            elif filepath.lower().endswith('.cbr'):
                with rarfile.RarFile(filepath) as r:
                    pages = len([n for n in r.namelist() if n.lower().endswith(IMG_EXTENSIONS)])
            
            if pages > 0:
                conn.execute("UPDATE comics SET pages = ? WHERE id = ?", (pages, comic_id))
                conn.commit()
                result['pages'] = pages
                logger.info(f"Lazy-counted {pages} pages for {comic_id}")
        except Exception as e:
            logger.error(f"Error lazy-counting pages for {comic_id}: {e}")
    
    # Add user's reading progress if logged in
    if current_user:
        progress = get_reading_progress(current_user['id'], comic_id)
        if progress:
            result['user_progress'] = progress
    
    conn.close()
    return result

@router.get("/read/{comic_id}/page/{page_num}")
async def get_comic_page(comic_id: str, page_num: int, current_user: Dict[str, Any] = Depends(get_current_user)) -> Response:
    conn = get_db_connection()
    book = conn.execute("SELECT path FROM comics WHERE id = ?", (comic_id,)).fetchone()
    conn.close()
    
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    
    filepath = book['path']
    try:
        image_data: Optional[bytes] = None
        images: List[str] = []
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
        
        if image_data and images:
            # Guess media type from the original filename in the archive
            img_filename = images[page_num]
            content_type, _ = mimetypes.guess_type(img_filename)
            return Response(content=image_data, media_type=content_type or "image/jpeg")
        else:
            raise HTTPException(status_code=404, detail="Page not found")
    except Exception as e:
        logger.error(f"Error reading page {page_num} of {filepath}: {e}")
        raise HTTPException(status_code=500, detail="Error reading comic archive")

class ExportCBZRequest(BaseModel):
    comic_ids: List[str]
    filename: Optional[str] = "export.cbz"

def create_export_task(job_id: str, comic_ids: List[str], export_filename: str) -> None:
    """Background task to build the CBZ file with timeout protection"""
    try:
        conn = get_db_connection()
        comics = []
        for cid in comic_ids:
            c = conn.execute("SELECT * FROM comics WHERE id = ?", (cid,)).fetchone()
            if c:
                comics.append(dict(c))
        conn.close()
        
        if not comics:
            export_jobs[job_id].update({'status': 'failed', 'error': 'No valid comics found'})
            return

        # Sort: Volumes first, then others naturally
        comics.sort(key=lambda c: (0 if (c.get('volume') or 0) > 0 else 1, natural_sort_key(c.get('filename'))))

        fd, temp_path = tempfile.mkstemp(suffix=".cbz")
        os.close(fd)
        
        total = len(comics)
        export_jobs[job_id]['file_path'] = temp_path
        
        with zipfile.ZipFile(temp_path, 'w', compression=zipfile.ZIP_STORED) as out_zip:
            for idx, comic in enumerate(comics):
                # 1. Check for explicit cancellation
                # 2. Check for Heartbeat Timeout (User closed browser)
                last_ping = export_jobs.get(job_id, {}).get('last_ping')
                is_timeout = last_ping and (datetime.now() - last_ping).total_seconds() > 30
                
                if export_jobs.get(job_id, {}).get('status') == 'cancelled' or is_timeout:
                    reason = "cancelled" if not is_timeout else "timeout (browser disconnected)"
                    logger.info(f"Export job {job_id} stopped: {reason}")
                    out_zip.close()
                    if os.path.exists(temp_path):
                        os.remove(temp_path)
                    if is_timeout:
                        export_jobs[job_id]['status'] = 'cancelled'
                    return

                filepath = comic['path']
                if not os.path.exists(filepath):
                    continue
                
                # Internal structure reflects path beneath [TITLE]
                try:
                    # Normalize path and get relative to COMICS_DIR
                    norm_path = filepath.replace('\\', '/')
                    norm_root = COMICS_DIR.replace('\\', '/')
                    rel_path = os.path.relpath(norm_path, norm_root).replace('\\', '/')
                    parts = rel_path.split('/')
                    
                    series_name = comic['series']
                    
                    # Find where the Title (Series) folder is in the path
                    series_idx = -1
                    for i, part in enumerate(parts):
                        if part == series_name:
                            series_idx = i
                            break
                    
                    # If found and not the last part (which is the file itself)
                    if series_idx != -1 and series_idx < len(parts) - 1:
                        # Sub-path is everything AFTER the Series folder
                        remainder = parts[series_idx+1:]
                        # e.g. ["Vol 1", "Ch 1.cbz"] -> "Vol 1/Ch 1"
                        inner_path = "/".join(remainder)
                        folder_name = os.path.splitext(inner_path)[0]
                        folder_prefix = folder_name + "/"
                    else:
                        # Fallback: Just the filename without extension
                        folder_prefix = os.path.splitext(parts[-1])[0] + "/"
                except Exception as e:
                    logger.error(f"Path resolution error for {filepath}: {e}")
                    folder_prefix = os.path.splitext(comic['filename'])[0] + "/"
                
                try:
                    file_ext = os.path.splitext(filepath)[1].lower()
                    if file_ext == '.cbz':
                        with zipfile.ZipFile(filepath, 'r') as in_zip:
                            img_names = [n for n in in_zip.namelist() if n.lower().endswith(IMG_EXTENSIONS)]
                            for img_name in img_names:
                                with in_zip.open(img_name) as f_in:
                                    target_name = f"{folder_prefix}{os.path.basename(img_name)}"
                                    with out_zip.open(target_name, 'w') as f_out:
                                        shutil.copyfileobj(f_in, f_out)
                    elif file_ext == '.cbr':
                        with rarfile.RarFile(filepath) as in_rar:
                            img_names = [n for n in in_rar.namelist() if n.lower().endswith(IMG_EXTENSIONS)]
                            for img_name in img_names:
                                with in_rar.open(img_name) as f_in:
                                    target_name = f"{folder_prefix}{os.path.basename(img_name)}"
                                    with out_zip.open(target_name, 'w') as f_out:
                                        shutil.copyfileobj(f_in, f_out)
                except Exception as e:
                    logger.error(f"Error adding {filepath} to export: {e}")
                
                # Update progress
                export_jobs[job_id]['progress'] = int(((idx + 1) / total) * 100)

        export_jobs[job_id]['status'] = 'completed'
        export_jobs[job_id]['progress'] = 100
        logger.info(f"Export job {job_id} complete: {temp_path}")
        
    except Exception as e:
        logger.error(f"Export task {job_id} failed: {e}", exc_info=True)
        export_jobs[job_id] = {'status': 'failed', 'error': str(e)}

@router.post("/export/cbz")
async def start_export_cbz(
    request: ExportCBZRequest, 
    background_tasks: BackgroundTasks, 
    current_user: Dict[str, Any] = Depends(get_current_user)
) -> Dict[str, str]:
    """Start an export job in the background"""
    job_id = str(uuid.uuid4())
    export_jobs[job_id] = {
        'status': 'processing',
        'progress': 0,
        'filename': request.filename if request.filename else "export.cbz",
        'created_at': datetime.now(),
        'last_ping': datetime.now()
    }
    
    background_tasks.add_task(create_export_task, job_id, request.comic_ids, export_jobs[job_id]['filename'])
    return {"job_id": job_id}

@router.get("/export/status/{job_id}")
async def get_export_status(job_id: str, current_user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    """Check the status of an export job and provide disk info"""
    if job_id not in export_jobs:
        raise HTTPException(status_code=404, detail="Export job not found")
    
    # Update heartbeat
    export_jobs[job_id]['last_ping'] = datetime.now()
    
    status = export_jobs[job_id].copy()
    
    # Add disk usage info for the temp directory
    try:
        temp_dir = tempfile.gettempdir()
        usage = shutil.disk_usage(temp_dir)
        status['disk'] = {
            'total': usage.total,
            'used': usage.used,
            'free': usage.free,
            'percent': round((usage.used / usage.total) * 100, 1)
        }
    except Exception:
        status['disk'] = None
        
    return status

@router.delete("/export/cancel/{job_id}")
async def cancel_export(job_id: str, current_user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, str]:
    """Cancel a running export job"""
    if job_id not in export_jobs:
        raise HTTPException(status_code=404, detail="Export job not found")
    
    export_jobs[job_id]['status'] = 'cancelled'
    return {"message": "Export cancellation requested"}

@router.get("/export/download/{job_id}")
async def download_export(job_id: str, background_tasks: BackgroundTasks, current_user: Dict[str, Any] = Depends(get_current_user)) -> FileResponse:
    """Download a completed export file"""
    if job_id not in export_jobs or export_jobs[job_id]['status'] != 'completed':
        raise HTTPException(status_code=404, detail="Export not ready or not found")
    
    job = export_jobs[job_id]
    temp_path = job['file_path']
    
    if not os.path.exists(temp_path):
        raise HTTPException(status_code=404, detail="Export file missing on server")
        
    # Schedule cleanup of the temp file and job info after response
    def cleanup() -> None:
        if os.path.exists(temp_path):
            os.remove(temp_path)
        if job_id in export_jobs:
            del export_jobs[job_id]
            
    background_tasks.add_task(cleanup)
    
    return FileResponse(
        temp_path, 
        filename=job['filename'], 
        media_type="application/vnd.comicbook+zip"
    )