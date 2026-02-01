import os
import zipfile
import rarfile
from fastapi import APIRouter, HTTPException, BackgroundTasks, Depends, Response
from fastapi.responses import FileResponse
from typing import Optional
from config import COMICS_DIR, CACHE_DIR, IMG_EXTENSIONS
from database import get_db_connection, get_reading_progress
from scanner import scan_library_task, rescan_library_task, natural_sort_key
from dependencies import get_current_user

router = APIRouter(prefix="/api", tags=["library"])

@router.post("/scan")
async def scan_library(background_tasks: BackgroundTasks):
    if not os.path.exists(COMICS_DIR):
        raise HTTPException(status_code=404, detail="Comics directory not found")
    
    background_tasks.add_task(scan_library_task)
    return {"message": "Scan started in background"}

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
    if os.path.exists(cache_path):
        return FileResponse(cache_path)
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
