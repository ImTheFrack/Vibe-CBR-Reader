from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from database import get_all_series, get_series_with_comics
from dependencies import get_current_user

router = APIRouter(prefix="/api/series", tags=["series"])

@router.get("")
async def list_series(
    limit: int = 100,
    offset: int = 0,
    category: Optional[str] = None,
    subcategory: Optional[str] = None,
    current_user: Dict[str, Any] = Depends(get_current_user)
) -> Dict[str, Any]:
    """List all series with optional filtering and pagination"""
    limit = max(1, min(limit, 500))
    offset = max(0, offset)
    
    # Get total count with filters
    from database import get_db_connection
    conn = get_db_connection()
    
    count_query = 'SELECT COUNT(*) as total FROM series WHERE 1=1'
    params = []
    
    if category:
        count_query += ' AND category = ?'
        params.append(category)
    if subcategory:
        count_query += ' AND subcategory = ?'
        params.append(subcategory)
    
    total = conn.execute(count_query, params).fetchone()['total']
    conn.close()
    
    # Get paginated series list
    series_list = get_all_series(category=category, subcategory=subcategory, limit=limit, offset=offset)
    
    return {
        "items": series_list,
        "total": total,
        "limit": limit,
        "offset": offset,
        "has_more": offset + len(series_list) < total
    }

@router.get("/metadata")
async def get_metadata(current_user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    """Get unique genres, tags, and statuses for filtering"""
    from db.series import get_series_metadata
    return get_series_metadata()

class RatingCreate(BaseModel):
    series_id: int
    rating: int

@router.post("/rating")
async def rate_series(data: RatingCreate, current_user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, str]:
    """Rate a series"""
    from database import add_rating
    if not (1 <= data.rating <= 5):
        raise HTTPException(status_code=400, detail="Rating must be between 1 and 5")
    add_rating(current_user['id'], data.series_id, data.rating)
    return {"message": "Rating saved"}

@router.get("/rating/{series_id}")
async def get_rating(series_id: int, current_user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    """Get rating info for a series"""
    from database import get_series_rating, get_user_rating
    return {
        "series": get_series_rating(series_id),
        "user_rating": get_user_rating(current_user['id'], series_id)
    }

class TagFilterRequest(BaseModel):
    selected_tags: List[str] = []

@router.post("/tags/filter")
async def filter_series_by_tags(request: TagFilterRequest, current_user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    """Filter series by tags and return stats/results"""
    from database import get_series_by_tags
    return get_series_by_tags(request.selected_tags)

@router.get("/{series_name}")
async def get_series_detail(series_name: str, current_user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    """Get full series details including all comics and user progress"""
    user_id = current_user['id']
    series = get_series_with_comics(series_name, user_id=user_id)
    
    if not series:
        raise HTTPException(status_code=404, detail="Series not found")
    
    # Add prev/next references for each comic
    comics = series.get('comics', [])
    for i, comic in enumerate(comics):
        if i > 0:
            comic['prev_comic'] = {'id': comics[i-1]['id'], 'title': comics[i-1]['title']}
        if i < len(comics) - 1:
            comic['next_comic'] = {'id': comics[i+1]['id'], 'title': comics[i+1]['title']}
    
    # Calculate series statistics
    total_pages = sum((c.get('pages') or 0) for c in comics)
    read_pages = 0
    completed_count = 0
    in_progress_count = 0
    
    for comic in comics:
        progress = comic.get('user_progress')
        if progress:
            read_pages += progress.get('current_page', 0)
            if progress.get('completed'):
                completed_count += 1
            elif progress.get('current_page', 0) > 0:
                in_progress_count += 1
    
    series['stats'] = {
        'total_comics': len(comics),
        'total_pages': total_pages,
        'completed_comics': completed_count,
        'in_progress_comics': in_progress_count,
        'read_pages': read_pages,
        'progress_percentage': (read_pages / total_pages * 100) if total_pages > 0 else 0
    }
    
    # Find first unread or in-progress comic for "Continue Reading"
    continue_comic = None
    for comic in comics:
        progress = comic.get('user_progress')
        if not progress or (not progress.get('completed') and progress.get('current_page', 0) > 0):
            continue_comic = comic
            break
    
    # If no in-progress, find first unread
    if not continue_comic:
        for comic in comics:
            progress = comic.get('user_progress')
            if not progress:
                continue_comic = comic
                break
    
    if continue_comic:
        progress = continue_comic.get('user_progress')
        series['continue_reading'] = {
            'comic_id': continue_comic['id'],
            'title': continue_comic['title'],
            'chapter': continue_comic.get('chapter'),
            'volume': continue_comic.get('volume'),
            'page': progress.get('current_page', 0) if progress else 0
        }
    
    return series
