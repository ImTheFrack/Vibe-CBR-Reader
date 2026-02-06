from typing import Optional, Dict, Any, List
from .connection import get_db_connection


def get_annotations(user_id: int, comic_id: str, page_number: Optional[int] = None) -> List[Dict[str, Any]]:
    """Get annotations for a user on a specific comic/page"""
    conn = get_db_connection()
    
    if page_number is not None:
        annotations = conn.execute(
            '''SELECT * FROM page_annotations 
               WHERE user_id = ? AND comic_id = ? AND page_number = ?
               ORDER BY created_at DESC''',
            (user_id, comic_id, page_number)
        ).fetchall()
    else:
        annotations = conn.execute(
            '''SELECT * FROM page_annotations 
               WHERE user_id = ? AND comic_id = ?
               ORDER BY created_at DESC''',
            (user_id, comic_id)
        ).fetchall()
    
    conn.close()
    return [dict(a) for a in annotations]


def add_annotation(user_id: int, comic_id: str, page_number: int, 
                   note: Optional[str] = None, highlight_text: Optional[str] = None,
                   x: Optional[float] = None, y: Optional[float] = None,
                   width: Optional[float] = None, height: Optional[float] = None) -> int:
    """Add a new annotation, returns annotation ID"""
    conn = get_db_connection()
    cursor = conn.execute(
        '''INSERT INTO page_annotations 
           (user_id, comic_id, page_number, note, highlight_text, x, y, width, height)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)''',
        (user_id, comic_id, page_number, note, highlight_text, x, y, width, height)
    )
    annotation_id = cursor.lastrowid or 0
    conn.commit()
    conn.close()
    return annotation_id


def delete_annotation(user_id: int, annotation_id: int) -> bool:
    """Delete an annotation, returns True if deleted"""
    conn = get_db_connection()
    cursor = conn.execute(
        'DELETE FROM page_annotations WHERE id = ? AND user_id = ?',
        (annotation_id, user_id)
    )
    deleted = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return deleted


def update_annotation(user_id: int, annotation_id: int, **kwargs) -> bool:
    """Update annotation fields"""
    allowed_fields = ['note', 'highlight_text', 'x', 'y', 'width', 'height']
    updates = {k: v for k, v in kwargs.items() if k in allowed_fields}
    
    if not updates:
        return False
    
    conn = get_db_connection()
    set_clause = ', '.join([f"{k} = ?" for k in updates.keys()])
    values = list(updates.values()) + [annotation_id, user_id]
    
    cursor = conn.execute(
        f'UPDATE page_annotations SET {set_clause} WHERE id = ? AND user_id = ?',
        values
    )
    updated = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return updated
