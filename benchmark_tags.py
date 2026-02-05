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

def benchmark_tags():
    conn = get_db_connection()
    start_total = time.time()

    # Pass 1
    t0 = time.time()
    all_series_rows = conn.execute("SELECT id, name, title, genres, tags, demographics, synopsis, cover_comic_id, total_chapters FROM series").fetchall()
    all_system_tags = {}
    processed_series = []
    for row in all_series_rows:
        s_genres = json.loads(row['genres']) if row['genres'] else []
        s_tags = json.loads(row['tags']) if row['tags'] else []
        s_demographics = json.loads(row['demographics']) if row['demographics'] else []
        for t in (s_genres + s_tags + s_demographics):
            if not t: continue
            norm = normalize_tag(t)
            if norm not in all_system_tags: all_system_tags[norm] = t
        processed_series.append({
            'name': row['name'], 'title': row['title'], 'synopsis': row['synopsis'],
            'explicit_norms': set(normalize_tag(t) for t in (s_genres + s_tags + s_demographics) if t)
        })
    print(f"Pass 1 (Fetch/Parse): {time.time()-t0:.4f}s")

    # Pass 2: Optimized Containment
    t0 = time.time()
    all_norms = sorted(all_system_tags.keys())
    containment_map = defaultdict(set)
    for child in all_norms:
        if len(child.split()) > 1:
            for potential_parent in all_norms:
                if len(potential_parent) >= len(child): continue
                if re.search(r'\b' + re.escape(potential_parent) + r'\b', child):
                    containment_map[child].add(potential_parent)
    print(f"Pass 2 (Optimized Containment): {time.time()-t0:.4f}s")

    # Pass 3: Setup Lookup
    t0 = time.time()
    tag_lookup = defaultdict(list)
    for norm in all_norms:
        if len(norm) >= 3:
            first_word = norm.split()[0]
            tag_lookup[first_word].append(norm)
    print(f"Pass 3 (Lookup Build): {time.time()-t0:.4f}s")

    # Pass 4: Optimized Match
    t0 = time.time()
    for series in processed_series:
        series_all_norms = series['explicit_norms'].copy()
        parents = set()
        for t in list(series_all_norms):
            parents.update(containment_map.get(t, []))
        series_all_norms.update(parents)
        
        metadata_text = f"{series['title'] or ''} {series['name'] or ''} {series['synopsis'] or ''}".lower()
        meta_words = re.findall(r'\w+', metadata_text)
        meta_word_set = set(meta_words)
        
        for word in meta_word_set:
            if word in tag_lookup:
                for potential_tag in tag_lookup[word]:
                    if potential_tag in metadata_text:
                        if re.search(r'\b' + re.escape(potential_tag) + r'\b', metadata_text):
                            series_all_norms.add(potential_tag)
                            series_all_norms.update(containment_map.get(potential_tag, []))
    print(f"Pass 4 (Optimized Matching): {time.time()-t0:.4f}s")

    print(f"Total: {time.time()-start_total:.4f}s")
    conn.close()

if __name__ == "__main__":
    benchmark_tags()