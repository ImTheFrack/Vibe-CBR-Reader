from typing import Optional, List, Dict, Any
import sqlite3
from .connection import get_db_connection

def delete_comics_by_ids(comic_ids: List[str], conn: Optional[sqlite3.Connection] = None) -> None:
    """Delete multiple comics by their IDs"""
    if not comic_ids:
        return
    own_conn = conn is None
    if own_conn:
        conn = get_db_connection()
    # SQLite has a limit on parameters, so we do it in chunks if necessary
    placeholders = ','.join(['?'] * len(comic_ids))
    conn.execute(f'DELETE FROM comics WHERE id IN ({placeholders})', comic_ids)
    if own_conn:
        conn.commit()
        conn.close()

def get_pending_comics(limit: int = 100, conn: Optional[sqlite3.Connection] = None) -> List[Dict[str, Any]]:
    """Get comics that need page counting or thumbnail extraction"""
    own_conn = conn is None
    if own_conn:
        conn = get_db_connection()
    comics = conn.execute('''
        SELECT id, path FROM comics 
        WHERE processed = 0 
        LIMIT ?
    ''', (limit,)).fetchall()
    if own_conn:
        conn.close()
    return [dict(c) for c in comics]

def update_comic_metadata(comic_id: str, pages: int, processed: bool) -> None:
    """Update comic with counted pages and processed (thumbnail) status"""
    conn = get_db_connection()
    conn.execute('''
        UPDATE comics 
        SET pages = ?, processed = ?, has_thumbnail = ?
        WHERE id = ?
    ''', (pages, processed, processed, comic_id))
    conn.commit()
    conn.close()
