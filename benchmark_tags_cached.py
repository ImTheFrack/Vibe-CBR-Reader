import time
import json
import re
from collections import defaultdict
import sqlite3

DB_PATH = "comics.db"

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def normalize_tag(t):
    if not t: return ""
    return " ".join(t.split()).lower()

# --- Global Cache for Tags (Mimicking database.py) ---
_TAG_CACHE = {
    'system_tags': None,
    'containment_map': None,
    'tag_lookup': None
}

def _refresh_tag_cache(conn):
    global _TAG_CACHE
    if _TAG_CACHE['system_tags'] is not None:
        return
        
    t0 = time.time()
    rows = conn.execute("SELECT genres, tags, demographics FROM series").fetchall()
    
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
    print(f"Cache Refresh (Containment + Lookup): {time.time()-t0:.4f}s")

def benchmark_optimized_tags():
    conn = get_db_connection()
    
    # Pass 0: Cache Refresh (simulating the first heavy request or background refresh)
    _refresh_tag_cache(conn)
    
    start_request = time.time()
    
    # Simulating Pass 1 & 4 from get_series_by_tags
    t0 = time.time()
    all_series_rows = conn.execute("SELECT id, name, title, genres, tags, demographics, synopsis, cover_comic_id, total_chapters FROM series").fetchall()
    
    all_system_tags = _TAG_CACHE['system_tags']
    containment_map = _TAG_CACHE['containment_map']
    tag_lookup = _TAG_CACHE['tag_lookup']
    
    processed_series = []
    for row in all_series_rows:
        s_genres = json.loads(row['genres']) if row['genres'] else []
        s_tags = json.loads(row['tags']) if row['tags'] else []
        s_demographics = json.loads(row['demographics']) if row['demographics'] else []
        
        explicit_norms = set(normalize_tag(t) for t in (s_genres + s_tags + s_demographics) if t)
        
        processed_series.append({
            'name': row['name'], 'title': row['title'], 'synopsis': row['synopsis'],
            'explicit_norms': explicit_norms
        })
    print(f"Pass 1 (Fetch/Parse): {time.time()-t0:.4f}s")

    t0 = time.time()
    matching_count = 0
    for series in processed_series:
        series_all_norms = series['explicit_norms'].copy()
        
        # Add parents
        for t in list(series_all_norms):
            series_all_norms.update(containment_map.get(t, []))
        
        # Search metadata
        metadata_text = f"{series['title'] or ''} {series['name'] or ''} {series['synopsis'] or ''}".lower()
        meta_words = set(re.findall(r'\w+', metadata_text))
        
        for word in meta_words:
            if word in tag_lookup:
                for potential_tag in tag_lookup[word]:
                    if potential_tag in metadata_text:
                        if re.search(r'\b' + re.escape(potential_tag) + r'\b', metadata_text):
                            series_all_norms.add(potential_tag)
                            series_all_norms.update(containment_map.get(potential_tag, []))
        
        # Simulating no active filters for tag card generation
        matching_count += 1
        
    print(f"Pass 4 (Optimized Matching & Aggregation): {time.time()-t0:.4f}s")
    print(f"Total Request Time (Cached): {time.time()-start_request:.4f}s")
    
    conn.close()

if __name__ == "__main__":
    benchmark_optimized_tags()
