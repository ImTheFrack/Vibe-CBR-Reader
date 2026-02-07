import json
import re
import time
import sqlite3
import unicodedata
from typing import Optional, List, Dict, Any
from collections import defaultdict
from .connection import get_db_connection
from logger import logger

def resolve_norm(norm: str, modifications: Dict[str, Any]) -> str:
    """Recursively resolve a tag norm through any merge modifications."""
    visited = {norm}
    while norm in modifications:
        mod = modifications[norm]
        if mod['action'] == 'merge' and mod['target_norm']:
            target = mod['target_norm']
            if target in visited: # Cycle detection
                break
            norm = target
            visited.add(norm)
        else:
            break
    return norm

def create_or_update_series(name: str, metadata: Optional[Dict[str, Any]] = None, category: Optional[str] = None, subcategory: Optional[str] = None, cover_comic_id: Optional[str] = None, conn: Optional[sqlite3.Connection] = None) -> int:
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
    
    series_id: int
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
        series_id = int(existing['id'])
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
        assert cursor.lastrowid is not None
        series_id = cursor.lastrowid
    
    if own_conn:
        conn.commit()
        conn.close()
    return series_id

def get_series_by_name(name: str) -> Optional[Dict[str, Any]]:
    """Get series by name"""
    conn = get_db_connection()
    series = conn.execute('SELECT * FROM series WHERE name = ?', (name,)).fetchone()
    conn.close()
    return dict(series) if series else None

def get_series_with_comics(name: str, user_id: Optional[int] = None) -> Optional[Dict[str, Any]]:
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

def update_comic_series_id(comic_id: str, series_id: int) -> None:
    """Update the series_id for a comic"""
    conn = get_db_connection()
    conn.execute('UPDATE comics SET series_id = ? WHERE id = ?', (series_id, comic_id))
    conn.commit()
    conn.close()

def rename_or_merge_series(series_id: int, new_name: str, conn: Optional[sqlite3.Connection] = None) -> int:
    """Rename a series, or merge it into an existing series if the name is already taken"""
    own_conn = conn is None
    if own_conn:
        conn = get_db_connection()
    
    current = conn.execute("SELECT name FROM series WHERE id = ?", (series_id,)).fetchone()
    if not current:
        if own_conn: conn.close()
        return series_id
        
    if current['name'] == new_name:
        if own_conn: conn.close()
        return series_id
        
    try:
        conn.execute("UPDATE series SET name = ? WHERE id = ?", (new_name, series_id))
        if own_conn: conn.commit()
    except sqlite3.IntegrityError:
        # Name conflict: another series record already has this name
        other = conn.execute("SELECT id FROM series WHERE name = ?", (new_name,)).fetchone()
        if other:
            target_id = other['id']
            # Move all comics to the target series
            conn.execute("UPDATE comics SET series_id = ? WHERE series_id = ?", (target_id, series_id))
            # Delete the source series
            conn.execute("DELETE FROM series WHERE id = ?", (series_id,))
            series_id = target_id
            logger.info(f"Merged series {series_id} into {target_id} due to name conflict: {new_name}")
            if own_conn: conn.commit()
            
    if own_conn:
        conn.close()
    return series_id

def get_all_series(category: Optional[str] = None, subcategory: Optional[str] = None, limit: int = 100, offset: int = 0) -> List[Dict[str, Any]]:
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

def sanitize_tag(t: str) -> str:
    """Clean a tag for display (strip brackets, quotes, whitespace, and trailing slashes/commas)."""
    if not t: return ""
    # Strip common wrapping characters and trailing debris
    t = t.strip(' \t\n\r"\'[]/\\,;.')
    return t.strip()

def normalize_text(t: str) -> str:
    """Normalize text for matching (lowercase + accent-insensitive)."""
    if not t: return ""
    # Remove accents/diacritics
    t = unicodedata.normalize('NFKD', t).encode('ascii', 'ignore').decode('utf-8')
    return t.lower()

def singularize(word: str) -> str:
    """Very simple singularization for common manga tags."""
    if not word or len(word) <= 3:
        return word
    
    # Common words that shouldn't be singularized if they end in s
    exceptions = {'series', 'species', 'class', 'business', 'status', 'canvas', 'glass', 'grass', 'boss', 'less', 'tennis', 'hypnosis'}
    if word in exceptions:
        return word

    # Handle common manga patterns like "Friend/s" or "Monster(s)"
    word = word.replace('/s', '').replace('(s)', '')

    if word.endswith('ies'):
        # e.g., "Families" -> "Family", "Stories" -> "Story"
        return word[:-3] + 'y'
    
    if word.endswith('es'):
        # If it ends in ses, xes, ches, shes, we strip 'es' (e.g., Boxes -> Box)
        if any(word.endswith(suffix) for suffix in ['ses', 'xes', 'ches', 'shes']):
             return word[:-2]
        
    if word.endswith('s') and not word.endswith('ss'):
        # e.g., "Video Games" -> "Video Game", "Vampires" -> "Vampire"
        return word[:-1]
    
    return word

def normalize_tag(t: Any) -> str:
    """Normalize a tag string for consistent matching and filtering (accent-insensitive + singularized + punctuation-blind)."""
    if not t:
        return ""
    
    # 1. Handle non-string types
    if not isinstance(t, str):
        if isinstance(t, (list, tuple)) and len(t) > 0:
            return normalize_tag(t[0])
        return ""
        
    # 2. Handle literal "[]" or empty JSON-like strings
    if t == "[]" or not t.strip():
        return ""
        
    # 3. Handle double-encoded JSON or tags wrapped in brackets
    if t.startswith('[') and t.endswith(']'):
        try:
            parsed = json.loads(t)
            if isinstance(parsed, list):
                if not parsed:
                    return ""
                return normalize_tag(parsed[0])
        except:
            pass
            
    # 4. Lowercase and remove accents
    t = normalize_text(t)
            
    # 5. Aggressively replace all non-alphanumeric characters with spaces
    # This turns "friend/s" or "friend-s" into "friend s"
    t = re.sub(r'[^a-z0-9]', ' ', t)
            
    # 6. Tokenize and clean up
    words = t.split()
    if not words:
        return ""
        
    # If the last word is just 's', it's usually a plural indicator like /s or (s)
    if words[-1] == 's' and len(words) > 1:
        words.pop()
        
    # 7. Singularize the last word
    if words:
        words[-1] = singularize(words[-1])
        t = " ".join(words)
        
    return t.strip()

def extract_tags(val: Any) -> List[str]:
    """Deeply extract tags from potentially nested lists/JSON strings"""
    if not val:
        return []
    if isinstance(val, list):
        res = []
        for item in val:
            res.extend(extract_tags(item))
        return res
    if isinstance(val, str):
        if val == "[]" or not val.strip():
            return []
        if val.startswith('[') and val.endswith(']'):
            try:
                parsed = json.loads(val)
                if isinstance(parsed, list):
                    return extract_tags(parsed)
            except:
                pass
        return [val]
    return [str(val)]

# --- Global Cache for Tags ---
_TAG_CACHE = {
    'system_tags': None,
    'containment_map': None,
    'tag_lookup': None,
    'modifications': {}, # Map source_norm -> {action, target_norm, display_name}
    'last_updated': 0
}

def _refresh_tag_cache(conn: Optional[sqlite3.Connection] = None) -> None:
    """Rebuild the tag metadata cache with support for modifications (blacklist, merge, rename)"""
    global _TAG_CACHE
    
    if _TAG_CACHE['system_tags'] is not None:
        return
        
    close_conn = False
    if conn is None:
        conn = get_db_connection()
        close_conn = True
        
    # Load modifications
    mod_rows = conn.execute("SELECT source_norm, action, target_norm, display_name FROM tag_modifications").fetchall()
    modifications = {row['source_norm']: dict(row) for row in mod_rows}
    
    rows = conn.execute("SELECT genres, tags, demographics FROM series").fetchall()
    
    system_tags = {}
    
    # 1. Add whitelist/renamed tags first
    for norm, mod in modifications.items():
        if mod['action'] == 'whitelist' and mod['display_name']:
            system_tags[norm] = mod['display_name']

    # 2. Add merge targets to ensure they have a display name
    for mod in modifications.values():
        if mod['action'] == 'merge' and mod['target_norm']:
            t_norm = mod['target_norm']
            if t_norm not in system_tags:
                # If target is whitelisted elsewhere, use that display
                t_mod = modifications.get(t_norm)
                if t_mod and t_mod['action'] == 'whitelist' and t_mod['display_name']:
                    system_tags[t_norm] = t_mod['display_name']
                else:
                    system_tags[t_norm] = t_norm.title()

    # 3. Process series data
    for row in rows:
        combined = []
        try:
            if row['genres']: combined.extend(extract_tags(json.loads(row['genres'])))
            if row['tags']: combined.extend(extract_tags(json.loads(row['tags'])))
            if row['demographics']: combined.extend(extract_tags(json.loads(row['demographics'])))
        except: pass
        
        for t in combined:
            raw_norm = normalize_tag(t)
            if not raw_norm: continue
            
            # Apply modifications
            mod = modifications.get(raw_norm)
            norm = raw_norm
            is_merged = False
            if mod:
                if mod['action'] == 'blacklist':
                    continue
                if mod['action'] == 'merge' and mod['target_norm']:
                    norm = mod['target_norm']
                    is_merged = True
            
            if norm not in system_tags:
                system_tags[norm] = sanitize_tag(t)
            elif not is_merged:
                # If target is whitelisted/renamed, that already took priority in Step 1
                # Otherwise, if this instance is uppercase and the current isn't, prefer it
                clean = sanitize_tag(t)
                if clean[0].isupper() and not system_tags[norm][0].isupper():
                    # Only overwrite if the current value wasn't explicitly whitelisted
                    mod = modifications.get(norm)
                    if not (mod and mod['action'] == 'whitelist'):
                        system_tags[norm] = clean
                
    all_norms = sorted(system_tags.keys())
    containment_map = defaultdict(set)
    for child in all_norms:
        if len(child.split()) > 1:
            for potential_parent in all_norms:
                if len(potential_parent) >= len(child): continue
                if re.search(r'\b' + re.escape(potential_parent) + r'\b', child):
                    containment_map[child].add(potential_parent)
                    
    tag_lookup = defaultdict(list)
    # Modifications might add tags that should always be searchable
    for norm in modifications:
        if norm not in tag_lookup[norm.split()[0]]:
            tag_lookup[norm.split()[0]].append(norm)

    for norm in all_norms:
        # Standard tags only if length >= 3
        if len(norm) >= 3:
            first_word = norm.split()[0]
            if norm not in tag_lookup[first_word]:
                tag_lookup[first_word].append(norm)
            
    _TAG_CACHE['system_tags'] = system_tags
    _TAG_CACHE['containment_map'] = containment_map
    _TAG_CACHE['tag_lookup'] = tag_lookup
    _TAG_CACHE['modifications'] = modifications
    _TAG_CACHE['last_updated'] = time.time()
    
    if close_conn:
        conn.close()

def get_tag_management_data() -> Dict[str, Any]:
    """Get all tags with frequency and unified modification status"""
    conn = get_db_connection()
    _refresh_tag_cache(conn)
    
    system_tags = _TAG_CACHE['system_tags']
    modifications = _TAG_CACHE['modifications']
    containment_map = _TAG_CACHE['containment_map']
    tag_lookup = _TAG_CACHE['tag_lookup']
    
    counts = defaultdict(int)
    tag_series_names = defaultdict(list)
    
    rows = conn.execute('SELECT id, name, title, genres, tags, demographics, synopsis FROM series').fetchall()
    
    for row in rows:
        combined = []
        try:
            if row['genres']: combined.extend(extract_tags(json.loads(row['genres'])))
            if row['tags']: combined.extend(extract_tags(json.loads(row['tags'])))
            if row['demographics']: combined.extend(extract_tags(json.loads(row['demographics'])))
        except: pass
        
        series_all_norms = set()
        for t in combined:
            n = normalize_tag(t)
            if n:
                # Apply recursive merge redirection
                n = resolve_norm(n, modifications)
                series_all_norms.add(n)
        
        metadata_text = normalize_text(f"{row['title'] or ''} {row['name'] or ''} {row['synopsis'] or ''}")
        # Punctuation-blind metadata for matching
        clean_metadata = re.sub(r'[^a-z0-9]', ' ', metadata_text)
        meta_words = set(clean_metadata.split())
        
        for word in meta_words:
            if word in tag_lookup:
                for potential_tag in tag_lookup[word]:
                    if potential_tag in clean_metadata:
                        if re.search(r'\b' + re.escape(potential_tag) + r'\b', clean_metadata):
                            # Resolve merge for metadata matches
                            actual_norm = resolve_norm(potential_tag, modifications)
                            series_all_norms.add(actual_norm)
                            # Add parents of the RESOLVED norm
                            for parent in containment_map.get(actual_norm, []):
                                series_all_norms.add(resolve_norm(parent, modifications))
        
        for n in series_all_norms:
            counts[n] += 1
            if len(tag_series_names[n]) < 15:
                tag_series_names[n].append(row['title'] or row['name'])
            
    all_tags = []
    processed_norms = set()
    
    # Modified tags list
    modified_tags_list = []
    for norm, mod in modifications.items():
        modified_tags_list.append({
            'norm': norm,
            'action': mod['action'],
            'target_norm': mod['target_norm'],
            'display_name': mod['display_name'],
            'current_display': system_tags.get(norm, norm.title())
        })

    # Active tags (excluding blacklisted or merged-away)
    for norm, display in system_tags.items():
        mod = modifications.get(norm)
        if mod and (mod['action'] == 'blacklist' or (mod['action'] == 'merge' and mod['target_norm'] != norm)):
            continue
            
        processed_norms.add(norm)
        all_tags.append({
            'norm': norm,
            'display': display,
            'count': counts.get(norm, 0),
            'series_names': tag_series_names.get(norm, []),
            'is_whitelisted': mod['action'] == 'whitelist' if mod else False,
            'is_modified': norm in modifications
        })
        
    # Ensure any target of a merge that isn't blacklisted is ALSO in Active Tags
    for mod in modifications.values():
        if mod['action'] == 'merge' and mod['target_norm']:
            t_norm = mod['target_norm']
            if t_norm not in processed_norms:
                # Double check it's not blacklisted
                t_mod = modifications.get(t_norm)
                if t_mod and t_mod['action'] == 'blacklist':
                    continue
                
                processed_norms.add(t_norm)
                all_tags.append({
                    'norm': t_norm,
                    'display': system_tags.get(t_norm, t_norm.title()),
                    'count': counts.get(t_norm, 0),
                    'series_names': tag_series_names.get(t_norm, []),
                    'is_whitelisted': t_mod['action'] == 'whitelist' if t_mod else False,
                    'is_modified': t_norm in modifications
                })
            
    conn.close()
    return {
        'tags': sorted(all_tags, key=lambda x: x['count']),
        'modifications': sorted(modified_tags_list, key=lambda x: x['norm'])
    }

def blacklist_tag(tag: str) -> bool:
    """Add a tag to the modifications as blacklisted"""
    norm = normalize_tag(tag)
    if not norm: return False
    
    conn = get_db_connection()
    try:
        conn.execute("INSERT OR REPLACE INTO tag_modifications (source_norm, action) VALUES (?, 'blacklist')", (norm,))
        conn.commit()
        invalidate_tag_cache()
        return True
    except: return False
    finally: conn.close()

def whitelist_tag(tag: str, display: Optional[str] = None) -> bool:
    """Add/Update a tag modification as whitelist (rename).
    If display name matches an existing tag's norm, it becomes a merge."""
    norm = normalize_tag(tag)
    if not norm: return False
    if not display: display = tag
    
    target_norm = normalize_tag(display)
    if target_norm != norm:
        # Check if target_norm is a known tag (active or whitelisted)
        conn = get_db_connection()
        _refresh_tag_cache(conn)
        system_tags = _TAG_CACHE['system_tags']
        
        if target_norm in system_tags:
            # It matches an existing tag, so let's merge instead
            return merge_tags(tag, target_norm)

    conn = get_db_connection()
    try:
        conn.execute("INSERT OR REPLACE INTO tag_modifications (source_norm, action, display_name) VALUES (?, 'whitelist', ?)", (norm, display))
        conn.commit()
        invalidate_tag_cache()
        return True
    except: return False
    finally: conn.close()

def merge_tags(source_tag: str, target_tag: str) -> bool:
    """Merge source_tag into target_tag"""
    s_norm = normalize_tag(source_tag)
    t_norm = normalize_tag(target_tag)
    
    if not s_norm or not t_norm:
        return False
        
    if s_norm == t_norm:
        # If they already normalize to the same thing, just ensure the display name is updated
        # This effectively merges them logic-wise and canonicalizes the display.
        return whitelist_tag(source_tag, target_tag)
    
    conn = get_db_connection()
    try:
        conn.execute("INSERT OR REPLACE INTO tag_modifications (source_norm, action, target_norm) VALUES (?, 'merge', ?)", (s_norm, t_norm))
        conn.commit()
        invalidate_tag_cache()
        return True
    except: return False
    finally: conn.close()

def remove_tag_modification(norm: str) -> bool:
    """Remove any modification for this tag"""
    conn = get_db_connection()
    try:
        conn.execute("DELETE FROM tag_modifications WHERE source_norm = ?", (norm,))
        conn.commit()
        invalidate_tag_cache()
        return True
    except: return False
    finally: conn.close()

def invalidate_tag_cache() -> None:
    """Invalidate the tag metadata cache to force a refresh on next use"""
    global _TAG_CACHE
    _TAG_CACHE['system_tags'] = None
    _TAG_CACHE['containment_map'] = None
    _TAG_CACHE['tag_lookup'] = None
    _TAG_CACHE['last_updated'] = 0

def warm_up_metadata_cache() -> None:
    """Warm up the tag and search caches on server boot or manual reload"""
    import time
    start = time.time()
    logger.info("Warming up metadata caches...")
    
    # 0. Invalidate existing
    invalidate_tag_cache()
    
    # 1. Rebuild FTS Index
    force_rebuild_fts()
    
    # 2. Warm up Tag Cache (now that it's None)
    _refresh_tag_cache()
    
    elapsed = time.time() - start
    logger.info(f"Metadata caches warmed up in {elapsed:.2f}s")

def force_rebuild_fts() -> bool:
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

def search_series(query: str, limit: int = 50) -> List[Dict[str, Any]]:
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

def add_rating(user_id: int, series_id: int, rating: int) -> None:
    """Add or update a user's rating for a series"""
    conn = get_db_connection()
    conn.execute('''
        INSERT INTO ratings (user_id, series_id, rating)
        VALUES (?, ?, ?)
        ON CONFLICT(user_id, series_id) DO UPDATE SET rating = excluded.rating, created_at = CURRENT_TIMESTAMP
    ''', (user_id, series_id, rating))
    conn.commit()
    conn.close()

def get_series_rating(series_id: int) -> Dict[str, Any]:
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

def get_user_rating(user_id: int, series_id: int) -> Optional[int]:
    """Get a specific user's rating for a series"""
    conn = get_db_connection()
    row = conn.execute('''
        SELECT rating FROM ratings WHERE user_id = ? AND series_id = ?
    ''', (user_id, series_id)).fetchone()
    conn.close()
    return row['rating'] if row else None

def get_series_metadata() -> Dict[str, List[str]]:
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

def get_series_by_tags(selected_tags: Optional[List[str]] = None) -> Dict[str, Any]:
    """Get series stats filtered by tags/genres"""
    if selected_tags is None:
        selected_tags = []
    
    conn = get_db_connection()
    _refresh_tag_cache(conn)
    
    all_system_tags = _TAG_CACHE['system_tags']
    containment_map = _TAG_CACHE['containment_map']
    tag_lookup = _TAG_CACHE['tag_lookup']
    modifications = _TAG_CACHE['modifications']
    
    # Resolve selected tags to their final canonical norms
    selected_norms = [resolve_norm(normalize_tag(t), modifications) for t in selected_tags if normalize_tag(t)]
    
    rows = conn.execute('''
        SELECT s.id, s.name, s.title, s.genres, s.tags, s.demographics, s.synopsis, s.cover_comic_id, s.total_chapters, s.status, s.category,
               (SELECT COUNT(*) FROM comics WHERE series_id = s.id) as actual_count
        FROM series s
    ''').fetchall()
    
    processed_series = []
    for row in rows:
        s_genres = [sanitize_tag(t) for t in extract_tags(json.loads(row['genres']))] if row['genres'] else []
        s_tags = extract_tags(json.loads(row['tags'])) if row['tags'] else []
        s_demographics = extract_tags(json.loads(row['demographics'])) if row['demographics'] else []
        explicit_norms = set(normalize_tag(t) for t in (s_genres + s_tags + s_demographics) if normalize_tag(t))
        
        processed_series.append({
            'id': row['id'], 'name': row['name'], 'title': row['title'],
            'synopsis': row['synopsis'], 'explicit_norms': explicit_norms,
            'cover_comic_id': row['cover_comic_id'], 
            'total_chapters': row['total_chapters'] or 0,
            'actual_count': row['actual_count'],
            'status': row['status'],
            'category': row['category'],
            'genres': s_genres
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
        series_all_norms = set()
        for n in series['explicit_norms']:
            series_all_norms.add(resolve_norm(n, modifications))
            for parent in containment_map.get(n, []):
                series_all_norms.add(resolve_norm(parent, modifications))
        
        metadata_text = normalize_text(f"{series['title'] or ''} {series['name'] or ''} {series['synopsis'] or ''}")
        # Punctuation-blind metadata for matching
        clean_metadata = re.sub(r'[^a-z0-9]', ' ', metadata_text)
        meta_words = set(clean_metadata.split())
        
        for word in meta_words:
            if word in tag_lookup:
                for potential_tag in tag_lookup[word]:
                    if potential_tag in clean_metadata:
                        if re.search(r'\b' + re.escape(potential_tag) + r'\b', clean_metadata):
                            actual_norm = resolve_norm(potential_tag, modifications)
                            series_all_norms.add(actual_norm)
                            for parent in containment_map.get(actual_norm, []):
                                series_all_norms.add(resolve_norm(parent, modifications))
        
        if all(sel in series_all_norms for sel in selected_norms):
            matching_series.append({
                'id': series['id'], 'name': series['name'], 'title': series['title'],
                'cover_comic_id': series['cover_comic_id'], 'count': series['actual_count'],
                'comics': comics_by_series.get(series['id'], []),
                'status': series['status'],
                'category': series['category'],
                'genres': series['genres']
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
