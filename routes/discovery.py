from fastapi import APIRouter, Depends
from typing import Dict, Any, List
from collections import defaultdict
from datetime import datetime, timedelta
from dependencies import get_current_user
from database import get_db_connection
from db.lists import get_user_lists, get_public_lists, get_list_items

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
    nsfw_mode = current_user.get('nsfw_mode', 'off')
    nsfw_select = ', s.is_nsfw' if nsfw_mode == 'blur' else ''
    nsfw_filter = (
        ' AND (s.is_nsfw = 0 OR s.is_nsfw IS NULL OR c.series_id IS NULL)'
        if nsfw_mode == 'filter' else ''
    )

    conn = get_db_connection()

    comics = conn.execute(
        f'''SELECT c.id, c.title, c.series, c.filename, c.path, c.has_thumbnail{nsfw_select},
                  rp.current_page, rp.total_pages, rp.last_read,
                  CASE
                    WHEN rp.total_pages > 0 THEN ROUND((rp.current_page * 100.0) / rp.total_pages)
                    ELSE 0
                  END as progress_percentage
           FROM reading_progress rp
           JOIN comics c ON rp.comic_id = c.id
           LEFT JOIN series s ON c.series_id = s.id
           WHERE rp.user_id = ? AND rp.current_page > 0 AND rp.completed = 0{nsfw_filter}
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
    nsfw_mode = current_user.get('nsfw_mode', 'off')
    nsfw_select = ', s.is_nsfw' if nsfw_mode == 'blur' else ''
    nsfw_filter = (
        ' AND (s.is_nsfw = 0 OR s.is_nsfw IS NULL OR comics.series_id IS NULL)'
        if nsfw_mode == 'filter' else ''
    )

    conn = get_db_connection()

    # Get recent comics with series info
    comics = conn.execute(
        f'''SELECT comics.id, comics.title, comics.series, comics.series_id,
                   comics.filename, comics.path, comics.has_thumbnail, comics.mtime{nsfw_select}
           FROM comics
           LEFT JOIN series s ON comics.series_id = s.id
           WHERE comics.has_thumbnail = 1{nsfw_filter}
           ORDER BY comics.mtime DESC
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
            group = {
                'type': 'series_group',
                'series': series_name,
                'series_id': chapters[0]['series_id'],
                'count': len(chapters),
                'first_comic_id': chapters[0]['id'],
                'latest_mtime': max(c['mtime'] for c in chapters),
                'chapter_titles': [c['title'] for c in chapters[:5]],  # First 5 titles
            }
            if nsfw_mode == 'blur':
                group['is_nsfw'] = chapters[0].get('is_nsfw', 0)
            result.append(group)

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
    nsfw_mode = current_user.get('nsfw_mode', 'off')
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
        '''SELECT genres, tags, demographics FROM series WHERE id IN ({})'''.format(
            ','.join(['?'] * len(series_ids))
        ),
        series_ids
    ).fetchall()
    
    # Extract and normalize tags
    from db import extract_tags, normalize_tag
    import json
    
    user_tags = set()
    for row in tags_query:
        combined = []
        try:
            if row['genres']: combined.extend(extract_tags(json.loads(row['genres'])))
            if row['tags']: combined.extend(extract_tags(json.loads(row['tags'])))
            if row['demographics']: combined.extend(extract_tags(json.loads(row['demographics'])))
        except: pass
        
        for t in combined:
            norm = normalize_tag(t)
            if norm:
                user_tags.add(norm)
    
    if not user_tags:
        conn.close()
        return []
    
    # Find series with matching tags that user hasn't read
    placeholders = ','.join(['?'] * len(series_ids))
    nsfw_select = ', s.is_nsfw' if nsfw_mode == 'blur' else ''
    nsfw_where = ' AND s.is_nsfw = 0' if nsfw_mode == 'filter' else ''
    suggestions = conn.execute(
        f'''SELECT s.id, s.name, s.title, s.synopsis{nsfw_select},
                   COALESCE(valid_cover.id, MIN(c.id)) as cover_comic_id,
                   s.genres, s.tags, s.demographics, s.status, s.total_chapters,
                   COUNT(c.id) as available_chapters
            FROM series s
            LEFT JOIN comics c ON c.series_id = s.id AND c.has_thumbnail = 1
            LEFT JOIN comics valid_cover ON valid_cover.id = s.cover_comic_id AND valid_cover.has_thumbnail = 1
            WHERE s.id NOT IN ({placeholders})
              AND (s.genres IS NOT NULL OR s.tags IS NOT NULL OR s.demographics IS NOT NULL){nsfw_where}
            GROUP BY s.id''',
        series_ids
    ).fetchall()
    
    # Score by tag matches
    scored = []
    for row in suggestions:
        series_tags = set()
        combined = []
        try:
            if row['genres']: combined.extend(extract_tags(json.loads(row['genres'])))
            if row['tags']: combined.extend(extract_tags(json.loads(row['tags'])))
            if row['demographics']: combined.extend(extract_tags(json.loads(row['demographics'])))
        except: pass
        
        for t in combined:
            norm = normalize_tag(t)
            if norm:
                series_tags.add(norm)
        
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
        entry = {
            'id': data['id'],
            'name': data['name'],
            'title': data['title'],
            'synopsis': data['synopsis'],
            'cover_comic_id': data['cover_comic_id'],
            'status': data['status'],
            'total_chapters': data['total_chapters'],
            'available_chapters': data['available_chapters'],
            'matching_tags': item['matching_tags'],
            'match_score': item['score'],
        }
        if nsfw_mode == 'blur':
            entry['is_nsfw'] = data.get('is_nsfw', 0)
        result.append(entry)

    conn.close()
    return result


def _filter_list_items_nsfw(items: List[Dict[str, Any]], nsfw_mode: str) -> List[Dict[str, Any]]:
    if nsfw_mode == 'off' or not items:
        return items

    series_ids = [i['series_id'] for i in items if i.get('series_id')]
    if not series_ids:
        return items

    conn = get_db_connection()
    try:
        placeholders = ','.join(['?'] * len(series_ids))
        rows = conn.execute(
            f'SELECT id, is_nsfw FROM series WHERE id IN ({placeholders})',
            series_ids,
        ).fetchall()
        nsfw_map = {r['id']: r['is_nsfw'] for r in rows}
    finally:
        conn.close()

    if nsfw_mode == 'filter':
        return [i for i in items if not nsfw_map.get(i.get('series_id'), 0)]

    for i in items:
        i['is_nsfw'] = nsfw_map.get(i.get('series_id'), 0)
    return items


@router.get("/discovery/my-lists")
async def get_my_lists(
    current_user: Dict[str, Any] = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    Returns user's lists with cover thumbnails.
    Each list includes: id, name, description, item_count, cover_url
    """
    nsfw_mode = current_user.get('nsfw_mode', 'off')
    user_id = current_user['id']
    lists = get_user_lists(user_id)
    my_lists = [lst for lst in lists if lst['user_id'] == user_id]

    result = []
    for lst in my_lists:
        items = get_list_items(lst['id'])
        if nsfw_mode != 'off':
            items = _filter_list_items_nsfw(items, nsfw_mode)
        cover_url = None
        if items:
            first_item = items[0]
            cover_comic_id = first_item.get('cover_comic_id')
            if cover_comic_id:
                cover_url = f"/api/cover/{cover_comic_id}"

        result.append({
            'id': lst['id'],
            'name': lst['name'],
            'description': lst.get('description', ''),
            'item_count': len(items),
            'cover_url': cover_url,
            'is_public': lst.get('is_public', False)
        })

    return {'items': result}


@router.get("/discovery/public-lists")
async def get_public_lists_discovery(
    current_user: Dict[str, Any] = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    Returns public lists from all users (excluding current user's own lists).
    Limited to 20 results.
    Each list includes: id, name, description, item_count, cover_url, owner_username
    """
    nsfw_mode = current_user.get('nsfw_mode', 'off')
    user_id = current_user['id']
    lists = get_public_lists(limit=20, offset=0)
    other_public_lists = [lst for lst in lists if lst['user_id'] != user_id]

    conn = get_db_connection()
    try:
        result = []
        for lst in other_public_lists:
            user_row = conn.execute(
                'SELECT username FROM users WHERE id = ?',
                (lst['user_id'],)
            ).fetchone()
            owner_username = user_row['username'] if user_row else 'Unknown'

            items = get_list_items(lst['id'])
            if nsfw_mode != 'off':
                items = _filter_list_items_nsfw(items, nsfw_mode)
            cover_url = None
            if items:
                first_item = items[0]
                cover_comic_id = first_item.get('cover_comic_id')
                if cover_comic_id:
                    cover_url = f"/api/cover/{cover_comic_id}"

            result.append({
                'id': lst['id'],
                'name': lst['name'],
                'description': lst.get('description', ''),
                'item_count': len(items),
                'cover_url': cover_url,
                'owner_username': owner_username
            })

        return {'items': result}
    finally:
        conn.close()
