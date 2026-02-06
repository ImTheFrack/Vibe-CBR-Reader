import json
import re
import time
from collections import defaultdict
from .connection import get_db_connection
from logger import logger

def create_or_update_series(name, metadata=None, category=None, subcategory=None, cover_comic_id=None, conn=None):
    """Create or update a series with metadata from series.json"""
    own_conn = conn is None
    if own_conn:
        conn = get_db_connection()
    
    if metadata is None:
        metadata = {}
    
    # Convert lists to JSON strings
    def to_json(val):
        if val is None:
            return None
        if isinstance(val, (list, tuple)):
            return json.dumps(val)
        return val
    
    # Check if series exists
    existing = conn.execute('SELECT id FROM series WHERE name = ?', (name,)).fetchone()
    
    if existing:
        # Update existing series
        conn.execute('''
            UPDATE series SET
                title = COALESCE(?, title),
                title_english = COALESCE(?, title_english),
                title_japanese = COALESCE(?, title_japanese),
                synonyms = COALESCE(?, synonyms),
                authors = COALESCE(?, authors),
                synopsis = COALESCE(?, synopsis),
                genres = COALESCE(?, genres),
                tags = COALESCE(?, tags),
                demographics = COALESCE(?, demographics),
                status = COALESCE(?, status),
                total_volumes = COALESCE(?, total_volumes),
                total_chapters = COALESCE(?, total_chapters),
                release_year = COALESCE(?, release_year),
                mal_id = COALESCE(?, mal_id),
                anilist_id = COALESCE(?, anilist_id),
                cover_comic_id = COALESCE(?, cover_comic_id),
                category = COALESCE(?, category),
                subcategory = COALESCE(?, subcategory),
                updated_at = CURRENT_TIMESTAMP
            WHERE name = ?
        ''', (
            metadata.get('title'),
            metadata.get('title_english'),
            to_json(metadata.get('title_japanese')),
            to_json(metadata.get('synonyms')),
            to_json(metadata.get('authors')),
            metadata.get('synopsis'),
            to_json(metadata.get('genres')),
            to_json(metadata.get('tags')),
            to_json(metadata.get('demographics')),
            metadata.get('status'),
            metadata.get('total_volumes'),
            metadata.get('total_chapters'),
            metadata.get('release_year'),
            metadata.get('mal_id'),
            metadata.get('anilist_id'),
            cover_comic_id,
            category,
            subcategory,
            name
        ))
        series_id = existing['id']
    else:
        # Insert new series
        cursor = conn.execute('''
            INSERT INTO series (
                name, title, title_english, title_japanese, synonyms, authors,
                synopsis, genres, tags, demographics, status, total_volumes,
                total_chapters, release_year, mal_id, anilist_id, cover_comic_id,
                category, subcategory
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            name,
            metadata.get('title'),
            metadata.get('title_english'),
            to_json(metadata.get('title_japanese')),
            to_json(metadata.get('synonyms')),
            to_json(metadata.get('authors')),
            metadata.get('synopsis'),
            to_json(metadata.get('genres')),
            to_json(metadata.get('tags')),
            to_json(metadata.get('demographics')),
            metadata.get('status'),
            metadata.get('total_volumes'),
            metadata.get('total_chapters'),
            metadata.get('release_year'),
            metadata.get('mal_id'),
            metadata.get('anilist_id'),
            cover_comic_id,
            category,
            subcategory
        ))
        series_id = cursor.lastrowid
    
    if own_conn:
        conn.commit()
        conn.close()
    return series_id

def get_series_by_name(name):
    """Get series by name"""
    conn = get_db_connection()
    series = conn.execute('SELECT * FROM series WHERE name = ?', (name,)).fetchone()
    conn.close()
    return dict(series) if series else None

def get_series_with_comics(name, user_id=None):
    """Get series with all its comics, optionally including user progress"""
    conn = get_db_connection()
    
    # Get series info
    series = conn.execute('SELECT * FROM series WHERE name = ?', (name,)).fetchone()
    
    if not series:
        # Search fallback for Windows path differences
        comic_link = conn.execute('''
            SELECT series_id FROM comics 
            WHERE path LIKE ? OR path LIKE ? 
            LIMIT 1
        ''', (f'%/{name}/%', f'%\\{name}\\%')).fetchone()
        
        if comic_link and comic_link['series_id']:
            series = conn.execute('SELECT * FROM series WHERE id = ?', (comic_link['series_id'],)).fetchone()
            
    if not series:
        conn.close()
        return None
    
    series_dict = dict(series)
    
    # Parse JSON fields
    for field in ['synonyms', 'authors', 'genres', 'tags', 'demographics', 'title_japanese']:
        if series_dict.get(field):
            try:
                series_dict[field] = json.loads(series_dict[field])
            except (json.JSONDecodeError, TypeError):
                pass
    
    # Get all comics for this series
    if series_dict.get('id'):
        comics = conn.execute('''
            SELECT c.* FROM comics c
            WHERE c.series_id = ?
            ORDER BY 
                CASE WHEN c.volume IS NULL OR c.volume = 0 THEN 999999 ELSE c.volume END,
                COALESCE(c.chapter, 0), 
                c.filename
        ''', (series_dict['id'],)).fetchall()
    else:
        # Fallback: match by series name
        comics = conn.execute('''
            SELECT * FROM comics
            WHERE series = ?
            ORDER BY 
                CASE WHEN volume IS NULL OR volume = 0 THEN 999999 ELSE volume END,
                COALESCE(chapter, 0), 
                filename
        ''', (name,)).fetchall()
    
    series_dict['comics'] = [dict(c) for c in comics]
    
    # Add user progress if requested
    if user_id and series_dict['comics']:
        for comic in series_dict['comics']:
            progress = conn.execute('''
                SELECT current_page, completed FROM reading_progress
                WHERE user_id = ? AND comic_id = ?
            ''', (user_id, comic['id'])).fetchone()
            if progress:
                comic['user_progress'] = dict(progress)
    
    conn.close()
    return series_dict

def update_comic_series_id(comic_id, series_id):
    """Update the series_id for a comic"""
    conn = get_db_connection()
    conn.execute('UPDATE comics SET series_id = ? WHERE id = ?', (series_id, comic_id))
    conn.commit()
    conn.close()

def get_all_series(category=None, subcategory=None, limit=100, offset=0):
    """Get all series with optional filtering"""
    conn = get_db_connection()
    
    query = 'SELECT * FROM series WHERE 1=1'
    params = []
    
    if category:
        query += ' AND category = ?'
        params.append(category)
    if subcategory:
        query += ' AND subcategory = ?'
        params.append(subcategory)
    
    query += ' ORDER BY name LIMIT ? OFFSET ?'
    params.extend([limit, offset])
    
    series_list = conn.execute(query, params).fetchall()
    conn.close()
    
    result = []
    for series in series_list:
        s = dict(series)
        for field in ['synonyms', 'authors', 'genres', 'tags', 'demographics', 'title_japanese']:
            if s.get(field):
                try:
                    s[field] = json.loads(s[field])
                except (json.JSONDecodeError, TypeError):
                    pass
        result.append(s)
    
    return result

# --- Global Cache for Tags ---
_TAG_CACHE = {
    'system_tags': None,
    'containment_map': None,
    'tag_lookup': None,
    'last_updated': 0
}

def _refresh_tag_cache(conn=None):
    """Rebuild the tag metadata cache"""
    global _TAG_CACHE
    
    if _TAG_CACHE['system_tags'] is not None:
        return
        
    close_conn = False
    if conn is None:
        conn = get_db_connection()
        close_conn = True
        
    rows = conn.execute("SELECT genres, tags, demographics FROM series").fetchall()
    
    def normalize_tag(t):
        if not t: return ""
        return " ".join(t.split()).lower()

    system_tags = {}
    for row in rows:
        combined = []
        try:
            if row['genres']: combined.extend(json.loads(row['genres']))
            if row['tags']: combined.extend(json.loads(row['tags']))
            if row['demographics']: combined.extend(json.loads(row['demographics']))
        except: pass
        
        for t in combined:
            if not t: continue
            norm = normalize_tag(t)
            if norm not in system_tags:
                system_tags[norm] = t
            elif t[0].isupper() and not system_tags[norm][0].isupper():
                system_tags[norm] = t
                
    all_norms = sorted(system_tags.keys())
    containment_map = defaultdict(set)
    for child in all_norms:
        if len(child.split()) > 1:
            for potential_parent in all_norms:
                if len(potential_parent) >= len(child): continue
                if re.search(r'\b' + re.escape(potential_parent) + r'\b', child):
                    containment_map[child].add(potential_parent)
                    
    tag_lookup = defaultdict(list)
    for norm in all_norms:
        if len(norm) >= 3:
            first_word = norm.split()[0]
            tag_lookup[first_word].append(norm)
            
    _TAG_CACHE['system_tags'] = system_tags
    _TAG_CACHE['containment_map'] = containment_map
    _TAG_CACHE['tag_lookup'] = tag_lookup
    _TAG_CACHE['last_updated'] = time.time()
    
    if close_conn:
        conn.close()

def invalidate_tag_cache():
    """Invalidate the tag metadata cache to force a refresh on next use"""
    global _TAG_CACHE
    _TAG_CACHE['system_tags'] = None
    _TAG_CACHE['containment_map'] = None
    _TAG_CACHE['tag_lookup'] = None
    _TAG_CACHE['last_updated'] = 0

def warm_up_metadata_cache():
    """Warm up the tag and search caches on server boot"""
    import time
    start = time.time()
    logger.info("Warming up metadata caches...")
    
    # 1. Rebuild FTS Index
    force_rebuild_fts()
    
    # 2. Warm up Tag Cache
    _refresh_tag_cache()
    
    elapsed = time.time() - start
    logger.info(f"Metadata caches warmed up in {elapsed:.2f}s")

def force_rebuild_fts():
    """Manually rebuild the FTS5 search index"""
    conn = get_db_connection()
    try:
        conn.execute("INSERT INTO series_fts(series_fts) VALUES('rebuild')")
        conn.commit()
        return True
    except:
        return False
    finally:
        conn.close()

def search_series(query, limit=50):
    """Search for series using FTS5 with fallback to LIKE"""
    if not query or not query.strip():
        return []
        
    conn = get_db_connection()
    import sqlite3
    
    results = []
    try:
        # Prepare query for FTS5
        # 1. Remove special FTS5 characters to prevent syntax errors
        # 2. Split into words and add * to each for prefix matching
        clean_query = re.sub(r'[^\w\s]', ' ', query).strip()
        words = clean_query.split()
        if not words:
            return []
            
        # Format: "word1"* "word2"*
        fts_query = ' '.join([f'"{w}"*' for w in words])
        
        rows = conn.execute('''
            SELECT s.*, rank
            FROM series_fts f
            JOIN series s ON s.id = f.rowid
            WHERE series_fts MATCH ?
            ORDER BY rank
            LIMIT ?
        ''', (fts_query, limit)).fetchall()
        results = [dict(r) for r in rows]
    except sqlite3.OperationalError:
        # FTS table might not exist or FTS not supported
        pass

    if not results:
        # Fallback to LIKE (simple substring match)
        like_query = f'%{query}%'
        rows = conn.execute('''
            SELECT * FROM series 
            WHERE name LIKE ? OR title LIKE ? OR title_english LIKE ? OR synopsis LIKE ? OR authors LIKE ?
            LIMIT ?
        ''', (like_query, like_query, like_query, like_query, like_query, limit)).fetchall()
        results = [dict(r) for r in rows]
    
    conn.close()
    
    # Process JSON fields
    for s in results:
        for field in ['synonyms', 'authors', 'genres', 'tags', 'demographics', 'title_japanese']:
            if s.get(field):
                try:
                    s[field] = json.loads(s[field])
                except (json.JSONDecodeError, TypeError):
                    pass
    return results

def get_gaps_report():
    """Identify numerical jumps in chapter/volume sequences"""
    conn = get_db_connection()
    
    # Get all comics ordered by series, volume, chapter
    rows = conn.execute('''
        SELECT series, volume, chapter, filename
        FROM comics
        WHERE series IS NOT NULL
        ORDER BY series, volume, chapter
    ''').fetchall()
    conn.close()
    
    series_comics = defaultdict(list)
    for row in rows:
        series_comics[row['series']].append(dict(row))
        
    report = []
    
    for series_name, comics in series_comics.items():
        # Chapter gaps
        chapters = sorted([c['chapter'] for c in comics if c['chapter'] is not None])
        if len(chapters) > 1:
            gaps = []
            for i in range(len(chapters) - 1):
                curr = chapters[i]
                nxt = chapters[i+1]
                # If gap is > 1 and both are integers (or .0)
                if nxt - curr > 1 and int(curr) == curr and int(nxt) == nxt:
                    for g in range(int(curr) + 1, int(nxt)):
                        gaps.append(g)
            
            if gaps:
                report.append({
                    'series': series_name,
                    'type': 'chapter',
                    'gaps': gaps,
                    'count': len(gaps)
                })
                
        # Volume gaps
        volumes = sorted(list(set([c['volume'] for c in comics if c['volume'] is not None])))
        if len(volumes) > 1:
            v_gaps = []
            for i in range(len(volumes) - 1):
                curr = volumes[i]
                nxt = volumes[i+1]
                if nxt - curr > 1 and int(curr) == curr and int(nxt) == nxt:
                    for g in range(int(curr) + 1, int(nxt)):
                        v_gaps.append(g)
            
            if v_gaps:
                report.append({
                    'series': series_name,
                    'type': 'volume',
                    'gaps': v_gaps,
                    'count': len(v_gaps)
                })
                
    return report

def add_rating(user_id, series_id, rating):
    """Add or update a user's rating for a series"""
    conn = get_db_connection()
    conn.execute('''
        INSERT INTO ratings (user_id, series_id, rating)
        VALUES (?, ?, ?)
        ON CONFLICT(user_id, series_id) DO UPDATE SET rating = excluded.rating, created_at = CURRENT_TIMESTAMP
    ''', (user_id, series_id, rating))
    conn.commit()
    conn.close()

def get_series_rating(series_id):
    """Get average rating and count for a series"""
    conn = get_db_connection()
    row = conn.execute('''
        SELECT AVG(rating) as avg_rating, COUNT(*) as rating_count
        FROM ratings WHERE series_id = ?
    ''', (series_id,)).fetchone()
    conn.close()
    return {
        'avg_rating': round(row['avg_rating'], 1) if row['avg_rating'] else 0,
        'rating_count': row['rating_count']
    }

def get_user_rating(user_id, series_id):
    """Get a specific user's rating for a series"""
    conn = get_db_connection()
    row = conn.execute('''
        SELECT rating FROM ratings WHERE user_id = ? AND series_id = ?
    ''', (user_id, series_id)).fetchone()
    conn.close()
    return row['rating'] if row else None

def get_series_metadata():
    """Get unique genres, tags, and statuses for filtering"""
    conn = get_db_connection()
    
    # Get unique statuses
    statuses = [row[0] for row in conn.execute("SELECT DISTINCT status FROM series WHERE status IS NOT NULL").fetchall()]
    
    # Get unique genres and tags from cache
    _refresh_tag_cache(conn)
    genres = sorted(list(_TAG_CACHE['system_tags'].values()))
    
    conn.close()
    return {
        "statuses": sorted(statuses),
        "genres": genres
    }

def get_series_by_tags(selected_tags=None):
    """Get series stats filtered by tags/genres"""
    if selected_tags is None:
        selected_tags = []
    
    def normalize_tag(t):
        if not t: return ""
        return " ".join(t.split()).lower()
    
    selected_norms = [normalize_tag(t) for t in selected_tags]
    
    conn = get_db_connection()
    _refresh_tag_cache(conn)
    
    all_system_tags = _TAG_CACHE['system_tags']
    containment_map = _TAG_CACHE['containment_map']
    tag_lookup = _TAG_CACHE['tag_lookup']
    
    rows = conn.execute('''
        SELECT id, name, title, genres, tags, demographics, synopsis, cover_comic_id, total_chapters 
        FROM series
    ''').fetchall()
    
    processed_series = []
    for row in rows:
        s_genres = json.loads(row['genres']) if row['genres'] else []
        s_tags = json.loads(row['tags']) if row['tags'] else []
        s_demographics = json.loads(row['demographics']) if row['demographics'] else []
        explicit_norms = set(normalize_tag(t) for t in (s_genres + s_tags + s_demographics) if t)
        
        processed_series.append({
            'id': row['id'], 'name': row['name'], 'title': row['title'],
            'synopsis': row['synopsis'], 'explicit_norms': explicit_norms,
            'cover_comic_id': row['cover_comic_id'], 'total_chapters': row['total_chapters'] or 0
        })

    matching_series = []
    tag_counts = {} 
    
    comics_by_series = defaultdict(list)
    fan_query = '''
        SELECT series_id, id, volume, chapter, filename
        FROM (
            SELECT series_id, id, volume, chapter, filename,
                   ROW_NUMBER() OVER (PARTITION BY series_id ORDER BY 
                       CASE WHEN volume IS NULL OR volume = 0 THEN 999999 ELSE volume END,
                       COALESCE(chapter, 0), filename
                   ) as rn
            FROM comics WHERE series_id IS NOT NULL
        ) WHERE rn <= 3
    '''
    for c in conn.execute(fan_query).fetchall():
        comics_by_series[c['series_id']].append(dict(c))

    for series in processed_series:
        series_all_norms = series['explicit_norms'].copy()
        for t in list(series_all_norms):
            series_all_norms.update(containment_map.get(t, []))
        
        metadata_text = f"{series['title'] or ''} {series['name'] or ''} {series['synopsis'] or ''}".lower()
        meta_words = set(re.findall(r'\w+', metadata_text))
        
        for word in meta_words:
            if word in tag_lookup:
                for potential_tag in tag_lookup[word]:
                    if potential_tag in metadata_text:
                        if re.search(r'\b' + re.escape(potential_tag) + r'\b', metadata_text):
                            series_all_norms.add(potential_tag)
                            series_all_norms.update(containment_map.get(potential_tag, []))
        
        if all(sel in series_all_norms for sel in selected_norms):
            matching_series.append({
                'id': series['id'], 'name': series['name'], 'title': series['title'],
                'cover_comic_id': series['cover_comic_id'], 'count': series['total_chapters'],
                'comics': comics_by_series.get(series['id'], [])
            })
            for tag_norm in series_all_norms:
                if tag_norm not in selected_norms:
                    if tag_norm not in tag_counts:
                        tag_counts[tag_norm] = {
                            'name': all_system_tags.get(tag_norm, tag_norm), 
                            'count': 0, 'covers': [], 'series_names': []
                        }
                    data = tag_counts[tag_norm]
                    data['count'] += 1
                    if len(data['covers']) < 3 and series['cover_comic_id']:
                        data['covers'].append(series['cover_comic_id'])
                    if len(data['series_names']) < 3:
                        data['series_names'].append(series['title'] or series['name'])
    
    related_tags_list = [{'name': d['name'], 'count': d['count'], 'covers': d['covers'], 'series_names': d['series_names']} for d in tag_counts.values()]
    related_tags_list.sort(key=lambda x: (-x['count'], x['name']))
    conn.close()
    return {'matching_count': len(matching_series), 'related_tags': related_tags_list, 'series': matching_series}
