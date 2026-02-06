from typing import Optional, List, Dict, Any
from .connection import get_db_connection


def get_libraries() -> List[Dict[str, Any]]:
    """Get all libraries"""
    conn = get_db_connection()
    libraries = conn.execute(
        'SELECT * FROM libraries ORDER BY is_default DESC, name ASC'
    ).fetchall()
    conn.close()
    return [dict(lib) for lib in libraries]


def get_library(library_id: int) -> Optional[Dict[str, Any]]:
    """Get a specific library by ID"""
    conn = get_db_connection()
    library = conn.execute(
        'SELECT * FROM libraries WHERE id = ?',
        (library_id,)
    ).fetchone()
    conn.close()
    return dict(library) if library else None


def get_default_library() -> Optional[Dict[str, Any]]:
    """Get the default library"""
    conn = get_db_connection()
    library = conn.execute(
        'SELECT * FROM libraries WHERE is_default = 1 LIMIT 1'
    ).fetchone()
    conn.close()
    return dict(library) if library else None


def create_library(name: str, path: str, is_default: bool = False) -> int:
    """Create a new library, returns library ID"""
    conn = get_db_connection()
    
    # If this is the default, unset other defaults
    if is_default:
        conn.execute('UPDATE libraries SET is_default = 0 WHERE is_default = 1')
    
    cursor = conn.execute(
        'INSERT INTO libraries (name, path, is_default) VALUES (?, ?, ?)',
        (name, path, is_default)
    )
    library_id = cursor.lastrowid or 0
    conn.commit()
    conn.close()
    return library_id


def update_library(library_id: int, **kwargs) -> bool:
    """Update library fields"""
    allowed_fields = ['name', 'path', 'is_default']
    updates = {k: v for k, v in kwargs.items() if k in allowed_fields}
    
    if not updates:
        return False
    
    conn = get_db_connection()
    
    # If setting as default, unset others
    if updates.get('is_default'):
        conn.execute('UPDATE libraries SET is_default = 0 WHERE is_default = 1')
    
    set_clause = ', '.join([f"{k} = ?" for k in updates.keys()])
    values = list(updates.values()) + [library_id]
    
    cursor = conn.execute(
        f'UPDATE libraries SET {set_clause} WHERE id = ?',
        values
    )
    updated = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return updated


def delete_library(library_id: int) -> bool:
    """Delete a library (comics will have library_id set to NULL)"""
    conn = get_db_connection()
    cursor = conn.execute(
        'DELETE FROM libraries WHERE id = ?',
        (library_id,)
    )
    deleted = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return deleted


def get_library_comics_count(library_id: int) -> int:
    """Get the number of comics in a library"""
    conn = get_db_connection()
    result = conn.execute(
        'SELECT COUNT(*) FROM comics WHERE library_id = ?',
        (library_id,)
    ).fetchone()
    conn.close()
    return result[0] if result else 0
