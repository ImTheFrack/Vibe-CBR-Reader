from typing import Optional, Dict, Any, List
from .connection import get_db_connection

# Reading progress functions
def get_reading_progress(user_id: int, comic_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Get reading progress for a user. If comic_id is None, get all progress."""
    conn = get_db_connection()
    
    if comic_id:
        progress = conn.execute(
            '''SELECT comic_id, current_page, total_pages, completed, last_read,
                      reader_display, reader_direction, reader_zoom, seconds_read
               FROM reading_progress WHERE user_id = ? AND comic_id = ?''',
            (user_id, comic_id)
        ).fetchone()
        conn.close()
        return dict(progress) if progress else None
    else:
        progress_list = conn.execute(
            '''SELECT comic_id, current_page, total_pages, completed, last_read,
                      reader_display, reader_direction, reader_zoom, seconds_read
               FROM reading_progress WHERE user_id = ? ORDER BY last_read DESC''',
            (user_id,)
        ).fetchall()
        conn.close()
        return {p['comic_id']: dict(p) for p in progress_list}

def update_reading_progress(user_id: int, comic_id: str, current_page: int, total_pages: Optional[int] = None, completed: Optional[bool] = None, 
                            reader_display: Optional[str] = None, reader_direction: Optional[str] = None, reader_zoom: Optional[str] = None, additional_seconds: int = 0) -> None:
    """Update or insert reading progress"""
    conn = get_db_connection()
    
    # Check if record exists
    existing = conn.execute(
        'SELECT id FROM reading_progress WHERE user_id = ? AND comic_id = ?',
        (user_id, comic_id)
    ).fetchone()
    
    if existing:
        # Update
        updates = ["current_page = ?", "last_read = CURRENT_TIMESTAMP", "seconds_read = seconds_read + ?"]
        params: List[Any] = [current_page, additional_seconds]
        
        if total_pages is not None:
            updates.append("total_pages = ?")
            params.append(total_pages)
        if completed is not None:
            updates.append("completed = ?")
            params.append(completed)
        if reader_display is not None:
            updates.append("reader_display = ?")
            params.append(reader_display)
        if reader_direction is not None:
            updates.append("reader_direction = ?")
            params.append(reader_direction)
        if reader_zoom is not None:
            updates.append("reader_zoom = ?")
            params.append(reader_zoom)
            
        params.extend([user_id, comic_id])
        sql = f"UPDATE reading_progress SET {', '.join(updates)} WHERE user_id = ? AND comic_id = ?"
        conn.execute(sql, params)
    else:
        # Insert
        conn.execute(
            '''INSERT INTO reading_progress 
               (user_id, comic_id, current_page, total_pages, completed, 
                reader_display, reader_direction, reader_zoom, seconds_read)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)''',
            (user_id, comic_id, current_page, total_pages or 0, completed or False,
             reader_display, reader_direction, reader_zoom, additional_seconds)
        )
    
    conn.commit()
    conn.close()

def clear_reading_progress(user_id: int) -> None:
    """Delete all reading progress for a user (Purge History)"""
    conn = get_db_connection()
    conn.execute('DELETE FROM reading_progress WHERE user_id = ?', (user_id,))
    conn.commit()
    conn.close()

def delete_reading_progress(user_id: int, comic_id: str) -> None:
    """Delete reading progress for a specific comic and user"""
    conn = get_db_connection()
    conn.execute(
        'DELETE FROM reading_progress WHERE user_id = ? AND comic_id = ?',
        (user_id, comic_id)
    )
    conn.commit()
    conn.close()

def get_user_stats(user_id: int) -> Dict[str, Any]:
    """Calculate reading statistics for a user"""
    conn = get_db_connection()
    
    # Total comics started
    total_comics = conn.execute(
        'SELECT COUNT(*) FROM reading_progress WHERE user_id = ?',
        (user_id,)
    ).fetchone()[0]
    
    # Total comics completed
    completed_comics = conn.execute(
        'SELECT COUNT(*) FROM reading_progress WHERE user_id = ? AND completed = 1',
        (user_id,)
    ).fetchone()[0]
    
    # Total pages read (sum of current_page for all comics)
    total_pages_read = conn.execute(
        'SELECT SUM(current_page) FROM reading_progress WHERE user_id = ?',
        (user_id,)
    ).fetchone()[0] or 0
    
    # Total time spent reading (seconds)
    total_seconds = conn.execute(
        'SELECT SUM(seconds_read) FROM reading_progress WHERE user_id = ?',
        (user_id,)
    ).fetchone()[0] or 0
    
    conn.close()
    
    return {
        "total_comics": total_comics,
        "completed_comics": completed_comics,
        "total_pages_read": total_pages_read,
        "total_seconds": total_seconds,
        "completion_rate": round((completed_comics / total_comics * 100), 1) if total_comics > 0 else 0
    }

# User preferences functions
def get_user_preferences(user_id: int) -> Optional[Dict[str, Any]]:
    """Get user preferences"""
    conn = get_db_connection()
    prefs = conn.execute(
        'SELECT * FROM user_preferences WHERE user_id = ?',
        (user_id,)
    ).fetchone()
    conn.close()
    return dict(prefs) if prefs else None

def update_user_preferences(user_id: int, **kwargs: Any) -> bool:
    """Update user preferences"""
    allowed_fields = ['theme', 'ereader', 'default_view_mode', 'default_nav_mode', 'default_sort_by', 
                      'reader_direction', 'reader_display', 'reader_zoom', 'title_card_style',
                      'brightness', 'contrast', 'saturation', 'invert', 'tone_value', 'tone_mode', 'auto_advance_interval',
                      'nsfw_mode']
    
    updates = {k: v for k, v in kwargs.items() if k in allowed_fields}
    if not updates:
        return False
    
    conn = get_db_connection()
    set_clause = ', '.join([f"{k} = ?" for k in updates.keys()])
    values = list(updates.values()) + [user_id]
    
    conn.execute(
        f'''UPDATE user_preferences 
            SET {set_clause}, updated_at = CURRENT_TIMESTAMP 
            WHERE user_id = ?''',
        values
    )
    conn.commit()
    conn.close()
    return True

# Bookmark functions
def get_bookmarks(user_id: int, comic_id: Optional[str] = None) -> List[Dict[str, Any]]:
    """Get bookmarks for a user"""
    conn = get_db_connection()
    
    if comic_id:
        bookmarks = conn.execute(
            '''SELECT comic_id, page_number, note, created_at 
               FROM bookmarks WHERE user_id = ? AND comic_id = ? ORDER BY page_number''',
            (user_id, comic_id)
        ).fetchall()
    else:
        bookmarks = conn.execute(
            '''SELECT comic_id, page_number, note, created_at 
               FROM bookmarks WHERE user_id = ? ORDER BY created_at DESC''',
            (user_id,)
        ).fetchall()
    
    conn.close()
    return [dict(b) for b in bookmarks]

def add_bookmark(user_id: int, comic_id: str, page_number: int, note: Optional[str] = None) -> bool:
    """Add a bookmark"""
    conn = get_db_connection()
    import sqlite3
    try:
        conn.execute(
            'INSERT INTO bookmarks (user_id, comic_id, page_number, note) VALUES (?, ?, ?, ?)',
            (user_id, comic_id, page_number, note)
        )
        conn.commit()
        return True
    except sqlite3.IntegrityError:
        return False
    finally:
        conn.close()

def remove_bookmark(user_id: int, comic_id: str, page_number: int) -> None:
    """Remove a bookmark"""
    conn = get_db_connection()
    conn.execute(
        'DELETE FROM bookmarks WHERE user_id = ? AND comic_id = ? AND page_number = ?',
        (user_id, comic_id, page_number)
    )
    conn.commit()
    conn.close()
