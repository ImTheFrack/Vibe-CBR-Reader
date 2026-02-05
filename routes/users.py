from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from database import (
    get_reading_progress, update_reading_progress,
    get_user_preferences, update_user_preferences,
    get_bookmarks, add_bookmark, remove_bookmark,
    clear_reading_progress, delete_reading_progress
)
from dependencies import get_current_user

router = APIRouter(prefix="/api", tags=["users"])

class ReadingProgressUpdate(BaseModel):
    comic_id: str
    current_page: int
    total_pages: Optional[int] = None
    completed: Optional[bool] = None
    reader_display: Optional[str] = None
    reader_direction: Optional[str] = None
    reader_zoom: Optional[str] = None
    additional_seconds: Optional[int] = 0

class BookmarkCreate(BaseModel):
    comic_id: str
    page_number: int
    note: Optional[str] = None

class PreferencesUpdate(BaseModel):
    theme: Optional[str] = None
    default_view_mode: Optional[str] = None
    default_nav_mode: Optional[str] = None
    default_sort_by: Optional[str] = None
    reader_direction: Optional[str] = None
    reader_display: Optional[str] = None
    reader_zoom: Optional[str] = None
    title_card_style: Optional[str] = None

# --- Reading Progress Routes ---

@router.get("/progress")
async def get_all_progress(current_user: dict = Depends(get_current_user)):
    """Get all reading progress for current user"""
    progress = get_reading_progress(current_user['id'])
    return progress

@router.get("/progress/recent")
async def get_recent_progress(current_user: dict = Depends(get_current_user), limit: int = 12):
    """Get recently read comics with progress"""
    progress = get_reading_progress(current_user['id'])
    
    # Sort by last_read and get most recent
    sorted_progress = sorted(
        progress.values(),
        key=lambda x: x.get('last_read') or '',
        reverse=True
    )[:limit]
    
    return sorted_progress

@router.get("/progress/{comic_id}")
async def get_comic_progress(comic_id: str, current_user: dict = Depends(get_current_user)):
    """Get reading progress for specific comic"""
    progress = get_reading_progress(current_user['id'], comic_id)
    if progress:
        return progress
    # Return a default progress object instead of 404
    return {
        "comic_id": comic_id,
        "current_page": 0,
        "total_pages": 0,
        "completed": False,
        "last_read": None,
        "reader_display": None,
        "reader_direction": None,
        "reader_zoom": None,
        "seconds_read": 0
    }

@router.post("/progress")
async def update_progress(progress_data: ReadingProgressUpdate, current_user: dict = Depends(get_current_user)):
    """Update reading progress"""
    update_reading_progress(
        current_user['id'],
        progress_data.comic_id,
        progress_data.current_page,
        progress_data.total_pages,
        progress_data.completed,
        progress_data.reader_display,
        progress_data.reader_direction,
        progress_data.reader_zoom,
        progress_data.additional_seconds
    )
    return {"message": "Progress updated"}

@router.delete("/progress")
async def clear_history(current_user: dict = Depends(get_current_user)):
    """Clear all reading history for current user"""
    clear_reading_progress(current_user['id'])
    return {"message": "Reading history cleared"}

@router.delete("/progress/{comic_id}")
async def delete_comic_history(comic_id: str, current_user: dict = Depends(get_current_user)):
    """Delete reading progress for specific comic"""
    delete_reading_progress(current_user['id'], comic_id)
    return {"message": "Comic history removed"}

# --- User Preferences Routes ---

@router.get("/preferences")
async def get_preferences(current_user: dict = Depends(get_current_user)):
    """Get user preferences"""
    prefs = get_user_preferences(current_user['id'])
    if prefs:
        return prefs
    raise HTTPException(status_code=404, detail="Preferences not found")

@router.put("/preferences")
async def update_preferences(prefs_data: PreferencesUpdate, current_user: dict = Depends(get_current_user)):
    """Update user preferences"""
    # Filter out None values
    updates = {k: v for k, v in prefs_data.dict().items() if v is not None}
    
    if not updates:
        raise HTTPException(status_code=400, detail="No preferences to update")
    
    success = update_user_preferences(current_user['id'], **updates)
    
    if success:
        return {"message": "Preferences updated"}
    raise HTTPException(status_code=400, detail="Failed to update preferences")

# --- Bookmark Routes ---

@router.get("/bookmarks")
async def get_user_bookmarks(current_user: dict = Depends(get_current_user)):
    """Get all bookmarks for current user"""
    bookmarks = get_bookmarks(current_user['id'])
    return bookmarks

@router.get("/bookmarks/{comic_id}")
async def get_comic_bookmarks(comic_id: str, current_user: dict = Depends(get_current_user)):
    """Get bookmarks for specific comic"""
    bookmarks = get_bookmarks(current_user['id'], comic_id)
    return bookmarks

@router.post("/bookmarks")
async def create_bookmark(bookmark_data: BookmarkCreate, current_user: dict = Depends(get_current_user)):
    """Add a bookmark"""
    success = add_bookmark(
        current_user['id'],
        bookmark_data.comic_id,
        bookmark_data.page_number,
        bookmark_data.note
    )
    
    if success:
        return {"message": "Bookmark added"}
    raise HTTPException(status_code=400, detail="Bookmark already exists")

@router.delete("/bookmarks/{comic_id}/{page_number}")
async def delete_bookmark(comic_id: str, page_number: int, current_user: dict = Depends(get_current_user)):
    """Remove a bookmark"""
    remove_bookmark(current_user['id'], comic_id, page_number)
    return {"message": "Bookmark removed"}
