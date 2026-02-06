from fastapi import APIRouter, Depends
from typing import Dict, Any, List
from dependencies import get_current_user
from database import get_db_connection

router = APIRouter(prefix="/api", tags=["discovery"])


@router.get("/discovery/continue-reading")
async def get_continue_reading(
    current_user: Dict[str, Any] = Depends(get_current_user)
) -> List[Dict[str, Any]]:
    """
    Returns comics that the user has started reading but not completed.
    Ordered by last_read DESC, limited to 20 results.
    Includes progress percentage.
    """
    conn = get_db_connection()
    
    comics = conn.execute(
        '''SELECT c.id, c.title, c.series, c.filename, c.path, c.has_thumbnail,
                  rp.current_page, rp.total_pages, rp.last_read,
                  CASE 
                    WHEN rp.total_pages > 0 THEN ROUND((rp.current_page * 100.0) / rp.total_pages)
                    ELSE 0
                  END as progress_percentage
           FROM reading_progress rp
           JOIN comics c ON rp.comic_id = c.id
           WHERE rp.user_id = ? AND rp.current_page > 0 AND rp.completed = 0
           ORDER BY rp.last_read DESC
           LIMIT 20''',
        (current_user['id'],)
    ).fetchall()
    
    conn.close()
    
    result = []
    for row in comics:
        d = dict(row)
        result.append(d)
    
    return result


@router.get("/discovery/new-additions")
async def get_new_additions(
    current_user: Dict[str, Any] = Depends(get_current_user)
) -> List[Dict[str, Any]]:
    """
    Returns recently added comics ordered by mtime DESC.
    Limited to 20 results.
    Only returns comics that have thumbnails.
    """
    conn = get_db_connection()
    
    comics = conn.execute(
        '''SELECT id, title, series, filename, path, has_thumbnail, mtime
           FROM comics
           WHERE has_thumbnail = 1
           ORDER BY mtime DESC
           LIMIT 20''',
    ).fetchall()
    
    conn.close()
    
    result = []
    for row in comics:
        d = dict(row)
        result.append(d)
    
    return result
