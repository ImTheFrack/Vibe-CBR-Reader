from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
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
    ereader: Optional[bool] = None
    default_view_mode: Optional[str] = None
    default_nav_mode: Optional[str] = None
    default_sort_by: Optional[str] = None
    reader_direction: Optional[str] = None
    reader_display: Optional[str] = None
    reader_zoom: Optional[str] = None
    title_card_style: Optional[str] = None
    brightness: Optional[float] = None
    contrast: Optional[float] = None
    saturation: Optional[float] = None
    invert: Optional[float] = None
    tone_value: Optional[float] = None
    tone_mode: Optional[str] = None
    auto_advance_interval: Optional[int] = None

class PasswordChange(BaseModel):
    current_password: str
    new_password: str

# --- User Account Routes ---

@router.post("/users/me/password")
async def change_password(data: PasswordChange, current_user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, str]:
    """Change current user's password"""
    from db.users import authenticate_user, update_user_password
    
    # Verify current password
    user = authenticate_user(current_user['username'], data.current_password)
    if not user:
        raise HTTPException(status_code=400, detail="Invalid current password")
    
    # Update to new password
    update_user_password(current_user['id'], data.new_password)
    return {"message": "Password updated successfully"}

@router.get("/users/me/stats")
async def get_my_stats(current_user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    """Get reading statistics for the current user"""
    from db.progress import get_user_stats
    return get_user_stats(current_user['id'])

# --- Reading Progress Routes ---

@router.get("/progress")
async def get_all_progress(current_user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    """Get all reading progress for current user"""
    progress = get_reading_progress(current_user['id'])
    if progress is None:
        return {}
    return progress

@router.get("/progress/recent")
async def get_recent_progress(current_user: Dict[str, Any] = Depends(get_current_user), limit: int = 12) -> List[Dict[str, Any]]:
    """Get recently read comics with progress"""
    progress = get_reading_progress(current_user['id'])
    
    # Sort by last_read and get most recent
    if progress:
        sorted_progress = sorted(
            progress.values(),
            key=lambda x: x.get('last_read') or '',
            reverse=True
        )[:limit]
    else:
        sorted_progress = []
    
    return sorted_progress

@router.get("/progress/{comic_id}")
async def get_comic_progress(comic_id: str, current_user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
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
async def update_progress(progress_data: ReadingProgressUpdate, current_user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, str]:
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
        progress_data.additional_seconds or 0
    )
    return {"message": "Progress updated"}

@router.delete("/progress")
async def clear_history(current_user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, str]:
    """Clear all reading history for current user"""
    clear_reading_progress(current_user['id'])
    return {"message": "Reading history cleared"}

@router.delete("/progress/{comic_id}")
async def delete_comic_history(comic_id: str, current_user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, str]:
    """Delete reading progress for specific comic"""
    delete_reading_progress(current_user['id'], comic_id)
    return {"message": "Comic history removed"}

# --- User Preferences Routes ---

@router.get("/preferences")
async def get_preferences(current_user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    """Get user preferences"""
    prefs = get_user_preferences(current_user['id'])
    if prefs:
        return prefs
    raise HTTPException(status_code=404, detail="Preferences not found")

@router.put("/preferences")
async def update_preferences(prefs_data: PreferencesUpdate, current_user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, str]:
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
async def get_user_bookmarks(current_user: Dict[str, Any] = Depends(get_current_user)) -> List[Dict[str, Any]]:
    """Get all bookmarks for current user"""
    bookmarks = get_bookmarks(current_user['id'])
    return bookmarks

@router.get("/bookmarks/{comic_id}")
async def get_comic_bookmarks(comic_id: str, current_user: Dict[str, Any] = Depends(get_current_user)) -> List[Dict[str, Any]]:
    """Get bookmarks for specific comic"""
    bookmarks = get_bookmarks(current_user['id'], comic_id)
    return bookmarks

@router.post("/bookmarks")
async def create_bookmark(bookmark_data: BookmarkCreate, current_user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, str]:
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
async def delete_bookmark(comic_id: str, page_number: int, current_user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, str]:
    """Remove a bookmark"""
    remove_bookmark(current_user['id'], comic_id, page_number)
    return {"message": "Bookmark removed"}
