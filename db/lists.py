import sqlite3
import json
from typing import Optional, Dict, Any, List
from .connection import get_db_connection


def create_list(user_id: int, name: str, description: Optional[str] = None, is_public: bool = False) -> Optional[int]:
    """Create a new user list.
    
    Returns list_id on success, None on duplicate name.
    """
    conn = get_db_connection()
    try:
        cursor = conn.execute(
            'INSERT INTO user_lists (user_id, name, description, is_public) VALUES (?, ?, ?, ?)',
            (user_id, name, description, 1 if is_public else 0)
        )
        conn.commit()
        return cursor.lastrowid
    except sqlite3.IntegrityError:
        return None
    finally:
        conn.close()


def get_list(list_id: int, user_id: Optional[int] = None) -> Optional[Dict[str, Any]]:
    """Get a list by ID.
    
    If user_id is provided, returns the list only if user owns it (or it's public).
    If user_id is None, returns only public lists.
    """
    conn = get_db_connection()
    try:
        if user_id is None:
            # Only return public lists
            row = conn.execute(
                'SELECT * FROM user_lists WHERE id = ? AND is_public = 1',
                (list_id,)
            ).fetchone()
        else:
            # Return if user owns it OR it's public
            row = conn.execute(
                'SELECT * FROM user_lists WHERE id = ? AND (user_id = ? OR is_public = 1)',
                (list_id, user_id)
            ).fetchone()
        
        if not row:
            return None
        
        result = dict(row)
        # Convert is_public to boolean
        result['is_public'] = bool(result['is_public'])
        return result
    finally:
        conn.close()


def get_user_lists(user_id: int) -> List[Dict[str, Any]]:
    """Get all lists for a user (including public lists from other users)."""
    conn = get_db_connection()
    try:
        rows = conn.execute(
            '''SELECT * FROM user_lists 
               WHERE user_id = ? OR is_public = 1
               ORDER BY updated_at DESC''',
            (user_id,)
        ).fetchall()
        
        result = [dict(row) for row in rows]
        for item in result:
            item['is_public'] = bool(item['is_public'])
        return result
    finally:
        conn.close()


def get_public_lists(limit: int = 20, offset: int = 0) -> List[Dict[str, Any]]:
    """Get public lists from all users."""
    conn = get_db_connection()
    try:
        rows = conn.execute(
            '''SELECT * FROM user_lists 
               WHERE is_public = 1
               ORDER BY updated_at DESC
               LIMIT ? OFFSET ?''',
            (limit, offset)
        ).fetchall()
        
        result = [dict(row) for row in rows]
        for item in result:
            item['is_public'] = bool(item['is_public'])
        return result
    finally:
        conn.close()


def update_list(list_id: int, user_id: int, **kwargs) -> bool:
    """Update list fields.
    
    Available kwargs: name, description, is_public
    Returns True if updated, False if not found or not authorized.
    """
    if not kwargs:
        return False
    
    # Build dynamic update query
    allowed_fields = {'name', 'description', 'is_public'}
    updates = []
    values = []
    
    for key, value in kwargs.items():
        if key not in allowed_fields:
            continue
        if key == 'is_public':
            updates.append('is_public = ?')
            values.append(1 if value else 0)
        else:
            updates.append(f'{key} = ?')
            values.append(value)
    
    if not updates:
        return False
    
    values.extend([list_id, user_id])
    
    conn = get_db_connection()
    try:
        cursor = conn.execute(
            f'UPDATE user_lists SET {", ".join(updates)}, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?',
            values
        )
        conn.commit()
        return cursor.rowcount > 0
    finally:
        conn.close()


def delete_list(list_id: int, user_id: int) -> bool:
    """Delete a list and cascade delete all items.
    
    Returns True if deleted, False if not found or not authorized.
    """
    conn = get_db_connection()
    try:
        conn.execute('DELETE FROM user_list_items WHERE list_id = ?', (list_id,))
        cursor = conn.execute(
            'DELETE FROM user_lists WHERE id = ? AND user_id = ?',
            (list_id, user_id)
        )
        conn.commit()
        return cursor.rowcount > 0
    finally:
        conn.close()


def add_series_to_list(list_id: int, series_id: int, position: Optional[int] = None) -> bool:
    """Add a series to a list.
    
    Returns True on success, False on duplicate or error.
    """
    conn = get_db_connection()
    try:
        # Get max position if not provided
        if position is None:
            max_pos = conn.execute(
                'SELECT MAX(position) as max_pos FROM user_list_items WHERE list_id = ?',
                (list_id,)
            ).fetchone()
            position = (max_pos['max_pos'] + 1) if max_pos['max_pos'] is not None else 0
        
        cursor = conn.execute(
            'INSERT INTO user_list_items (list_id, series_id, position) VALUES (?, ?, ?)',
            (list_id, series_id, position)
        )
        
        # Update the list's updated_at timestamp
        conn.execute(
            'UPDATE user_lists SET updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            (list_id,)
        )
        
        conn.commit()
        return cursor.rowcount > 0
    except sqlite3.IntegrityError:
        return False
    finally:
        conn.close()


def remove_series_from_list(list_id: int, series_id: int) -> bool:
    """Remove a series from a list.
    
    Returns True if removed, False if not found.
    """
    conn = get_db_connection()
    try:
        cursor = conn.execute(
            'DELETE FROM user_list_items WHERE list_id = ? AND series_id = ?',
            (list_id, series_id)
        )
        
        # Update the list's updated_at timestamp
        conn.execute(
            'UPDATE user_lists SET updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            (list_id,)
        )
        
        conn.commit()
        return cursor.rowcount > 0
    finally:
        conn.close()


def get_series_lists(series_id: int, user_id: int) -> List[Dict[str, Any]]:
    """Get all lists containing a specific series for a user.
    
    Returns list of dicts with list info (id, name, is_public).
    """
    conn = get_db_connection()
    try:
        rows = conn.execute(
            '''SELECT ul.id, ul.name, ul.is_public 
               FROM user_lists ul
               JOIN user_list_items uli ON ul.id = uli.list_id
               WHERE uli.series_id = ? AND ul.user_id = ?
               ORDER BY ul.name''',
            (series_id, user_id)
        ).fetchall()
        
        result = [dict(row) for row in rows]
        for item in result:
            item['is_public'] = bool(item['is_public'])
        return result
    finally:
        conn.close()


def get_list_items(list_id: int) -> List[Dict[str, Any]]:
    """Get all items in a list with series info joined.
    
    Returns list of dicts with series information.
    """
    conn = get_db_connection()
    try:
        rows = conn.execute(
            '''SELECT uli.id, uli.list_id, uli.series_id, uli.position, uli.added_at,
                      s.name as series_name, s.cover_comic_id, s.synonyms, s.authors, s.genres
               FROM user_list_items uli
               JOIN series s ON uli.series_id = s.id
               WHERE uli.list_id = ?
               ORDER BY uli.position''',
            (list_id,)
        ).fetchall()
        
        result = []
        for row in rows:
            item = dict(row)
            # Parse JSON fields from series
            for field in ['synonyms', 'authors', 'genres']:
                if item.get(field):
                    try:
                        item[field] = json.loads(item[field])
                    except (json.JSONDecodeError, TypeError):
                        pass
            result.append(item)
        return result
    finally:
        conn.close()


def reorder_list_items(list_id: int, item_ids_ordered: List[int]) -> bool:
    """Reorder items in a list by providing ordered list of item IDs.
    
    Returns True if reordered, False on error.
    """
    if not item_ids_ordered:
        return False
    
    conn = get_db_connection()
    try:
        # Update positions based on order
        for position, item_id in enumerate(item_ids_ordered):
            conn.execute(
                'UPDATE user_list_items SET position = ? WHERE id = ? AND list_id = ?',
                (position, item_id, list_id)
            )
        
        # Update the list's updated_at timestamp
        conn.execute(
            'UPDATE user_lists SET updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            (list_id,)
        )
        
        conn.commit()
        return True
    except Exception:
        conn.rollback()
        return False
    finally:
        conn.close()
