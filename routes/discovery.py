from fastapi import APIRouter, Depends
from typing import Dict, Any, List
from collections import defaultdict
from datetime import datetime, timedelta
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
    Returns recently added comics grouped by series.
    Each group shows: series name, cover (first chapter), count badge, latest mtime.
    Consolidated to show "X new chapters" per series.
    Limited to 30 series groups.
    Only returns comics that have thumbnails.
    """
    conn = get_db_connection()
    
    # Get recent comics with series info
    comics = conn.execute(
        '''SELECT id, title, series, series_id, filename, path, has_thumbnail, mtime
           FROM comics
           WHERE has_thumbnail = 1
           ORDER BY mtime DESC
           LIMIT 100''',
    ).fetchall()
    
    conn.close()
    
    # Group by series
    series_groups = defaultdict(list)
    for comic in comics:
        series_key = comic['series'] or 'Unknown Series'
        series_groups[series_key].append(dict(comic))
    
    # Build consolidated result
    result = []
    for series_name, chapters in series_groups.items():
        if len(chapters) > 0:
            result.append({
                'type': 'series_group',
                'series': series_name,
                'series_id': chapters[0]['series_id'],
                'count': len(chapters),
                'first_comic_id': chapters[0]['id'],
                'latest_mtime': max(c['mtime'] for c in chapters),
                'chapter_titles': [c['title'] for c in chapters[:5]]  # First 5 titles
            })
    
    # Sort by latest_mtime DESC and limit to 30
    result.sort(key=lambda x: x['latest_mtime'], reverse=True)
    return result[:30]


@router.get("/discovery/suggestions")
async def get_suggestions(
    current_user: Dict[str, Any] = Depends(get_current_user)
) -> List[Dict[str, Any]]:
    """
    Get series suggestions based on user's recent reading history.
    Analyzes tags from 3 most recent reads OR all reads in last 7 days (whichever is more).
    Returns up to 30 suggested series with matching tags.
    """
    conn = get_db_connection()
    
    # Get reads from last 7 days OR at least 3 most recent (whichever is more)
    seven_days_ago = datetime.now() - timedelta(days=7)
    
    recent = conn.execute(
        '''SELECT DISTINCT c.series, c.series_id
           FROM reading_progress rp
           JOIN comics c ON rp.comic_id = c.id
           WHERE rp.user_id = ? AND c.series_id IS NOT NULL
             AND rp.last_read >= ?
           ORDER BY rp.last_read DESC''',
        (current_user['id'], seven_days_ago.isoformat())
    ).fetchall()
    
    # If less than 3 reads in last 7 days, get 3 most recent instead
    if len(recent) < 3:
        recent = conn.execute(
            '''SELECT DISTINCT c.series, c.series_id
               FROM reading_progress rp
               JOIN comics c ON rp.comic_id = c.id
               WHERE rp.user_id = ? AND c.series_id IS NOT NULL
               ORDER BY rp.last_read DESC
               LIMIT 3''',
            (current_user['id'],)
        ).fetchall()
    
    if not recent:
        conn.close()
        return []
    
    # Get tags from those series
    series_ids = [r['series_id'] for r in recent]
    tags_query = conn.execute(
        '''SELECT genres, tags FROM series WHERE id IN ({})'''.format(
            ','.join(['?'] * len(series_ids))
        ),
        series_ids
    ).fetchall()
    
    # Extract and normalize tags
    user_tags = set()
    for row in tags_query:
        if row['genres']:
            try:
                genres = row['genres'] if isinstance(row['genres'], list) else __import__('json').loads(row['genres'])
                user_tags.update(g.strip() for g in genres if g and isinstance(g, str))
            except:
                pass
        if row['tags']:
            try:
                tags = row['tags'] if isinstance(row['tags'], list) else __import__('json').loads(row['tags'])
                user_tags.update(t.strip() for t in tags if t and isinstance(t, str))
            except:
                pass
    
    if not user_tags:
        conn.close()
        return []
    
    # Find series with matching tags that user hasn't read
    placeholders = ','.join(['?'] * len(series_ids))
    suggestions = conn.execute(
        f'''SELECT s.id, s.name, s.title, s.synopsis, s.cover_comic_id,
                   s.genres, s.tags, s.status, s.total_chapters,
                   COUNT(c.id) as available_chapters
            FROM series s
            LEFT JOIN comics c ON c.series_id = s.id
            WHERE s.id NOT IN ({placeholders})
              AND (s.genres IS NOT NULL OR s.tags IS NOT NULL)
            GROUP BY s.id''',
        series_ids
    ).fetchall()
    
    # Score by tag matches
    scored = []
    for row in suggestions:
        series_tags = set()
        if row['genres']:
            try:
                genres = row['genres'] if isinstance(row['genres'], list) else __import__('json').loads(row['genres'])
                series_tags.update(g.strip() for g in genres if g and isinstance(g, str))
            except:
                pass
        if row['tags']:
            try:
                tags = row['tags'] if isinstance(row['tags'], list) else __import__('json').loads(row['tags'])
                series_tags.update(t.strip() for t in tags if t and isinstance(t, str))
            except:
                pass
        
        matches = user_tags & series_tags
        if matches:
            scored.append({
                'score': len(matches),
                'data': dict(row),
                'matching_tags': list(matches)
            })
    
    # Sort by score and return top 30
    scored.sort(key=lambda x: x['score'], reverse=True)
    result = []
    for item in scored[:30]:
        data = item['data']
        result.append({
            'id': data['id'],
            'name': data['name'],
            'title': data['title'],
            'synopsis': data['synopsis'],
            'cover_comic_id': data['cover_comic_id'],
            'status': data['status'],
            'total_chapters': data['total_chapters'],
            'available_chapters': data['available_chapters'],
            'matching_tags': item['matching_tags'],
            'match_score': item['score']
        })
    
    conn.close()
    return result
