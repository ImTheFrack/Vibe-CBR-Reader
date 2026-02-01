from fastapi import APIRouter, HTTPException, Depends
from typing import Optional
from database import get_all_series, get_series_with_comics
from dependencies import get_optional_user

router = APIRouter(prefix="/api/series", tags=["series"])

@router.get("")
async def list_series(category: Optional[str] = None, subcategory: Optional[str] = None, current_user: Optional[dict] = Depends(get_optional_user)):
    """List all series with optional filtering"""
    series_list = get_all_series(category=category, subcategory=subcategory)
    return series_list

@router.get("/{series_name}")
async def get_series_detail(series_name: str, current_user: Optional[dict] = Depends(get_optional_user)):
    """Get full series details including all comics and user progress"""
    user_id = current_user['id'] if current_user else None
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
    total_pages = sum(c.get('pages', 0) for c in comics)
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
