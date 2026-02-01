import os
import re
import json
import zipfile
import rarfile
import hashlib
from PIL import Image
from config import COMICS_DIR, CACHE_DIR, IMG_EXTENSIONS
from database import (
    get_db_connection, create_or_update_series, update_comic_series_id,
    update_scan_progress, complete_scan_job, delete_comics_by_ids,
    get_pending_comics, update_comic_metadata, create_scan_job
)

# Normalize COMICS_DIR to ensure consistent path handling
COMICS_DIR = os.path.normpath(os.path.abspath(COMICS_DIR))

def is_cbr_or_cbz(filename: str) -> bool:
    return filename.lower().endswith(('.cbz', '.cbr'))

def get_file_size_str(size_bytes: int) -> str:
    for unit in ['B', 'KB', 'MB', 'GB']:
        if size_bytes < 1024.0:
            return f"{size_bytes:.1f} {unit}"
        size_bytes /= 1024.0
    return f"{size_bytes:.1f} TB"

def extract_cover_image(filepath: str, comic_id: str, target_size: int = 300) -> bool:
    """
    Opens an archive, finds the first image, resizes it to target_size,
    saves it to CACHE_DIR/{comic_id}.jpg. Returns True if successful.
    """
    try:
        file_ext = os.path.splitext(filepath)[1].lower()
        img = None

        if file_ext == '.cbz':
            with zipfile.ZipFile(filepath, 'r') as z:
                names = sorted([n for n in z.namelist() if n.lower().endswith(IMG_EXTENSIONS)], key=natural_sort_key)
                if names:
                    with z.open(names[0]) as f_img:
                        img = Image.open(f_img)
                        img.load()
                else:
                    return False
        elif file_ext == '.cbr':
            try:
                with rarfile.RarFile(filepath) as r:
                    names = sorted([n for n in r.namelist() if n.lower().endswith(IMG_EXTENSIONS)], key=natural_sort_key)
                    if names:
                        with r.open(names[0]) as f_img:
                            img = Image.open(f_img)
                            img.load()
                    else:
                        return False
            except Exception as e:
                print(f"Error reading RAR file {filepath}: {e}")
                return False
        else:
            return False

        img.thumbnail((target_size, target_size * 1.5))
        if img.mode in ("RGBA", "P"):
            img = img.convert("RGB")

        cache_path = os.path.join(CACHE_DIR, f"{comic_id}.jpg")
        img.save(cache_path, format="JPEG", quality=85)
        return True

    except Exception as e:
        print(f"Error processing {filepath}: {e}")
        return False

def natural_sort_key(s):
    return [int(text) if text.isdigit() else text.lower()
            for text in re.split(r'(\d+)', s)]

def parse_filename_info(filename):
    name = os.path.splitext(filename)[0]
    vol = None
    ch = None
    
    v_match = re.search(r'\bv(?:ol)?\.?\s*(\d+(?:\.\d+)?)', name, re.IGNORECASE)
    if v_match:
        vol = float(v_match.group(1))
        
    c_match = re.search(r'\b(?:c|ch|chapter|unit)\.?\s*(\d+(?:\.\d+)?)', name, re.IGNORECASE)
    if c_match:
        ch = float(c_match.group(1))
        
    if ch is None and vol is None:
        end_match = re.search(r'\s(\d+(?:\.\d+)?)$', name)
        if end_match:
            ch = float(end_match.group(1))

    return vol, ch

def parse_series_json(filepath):
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"Error parsing {filepath}: {e}")
        return {}

def sync_library_task(job_id=None):
    """
    PHASE 1: Synchronize file system with database.
    - Detect new files.
    - Detect deleted files.
    - Detect CHANGED files (mtime/size).
    """
    print("Phase 1: Synchronizing library structure...")
    conn = get_db_connection()
    
    # 1. Get current files metadata from DB
    db_comics = conn.execute("SELECT id, path, mtime, size_bytes FROM comics").fetchall()
    db_meta = {row['id']: {'path': row['path'], 'mtime': row['mtime'], 'size': row['size_bytes']} for row in db_comics}
    db_ids = set(db_meta.keys())
    
    # 2. Count for progress
    print("Counting files on disk...")
    total_on_disk = 0
    for root, dirs, files in os.walk(COMICS_DIR):
        total_on_disk += sum(1 for f in files if is_cbr_or_cbz(f))
    
    if job_id:
        conn.execute("UPDATE scan_jobs SET total_comics = ? WHERE id = ?", (total_on_disk, job_id))
        conn.commit()

    on_disk_ids = set()
    new_comics = [] 
    changed_comics = []
    series_map = {} 
    dir_metadata_cache = {}
    processed_sync_count = 0
    
    new_count = 0
    changed_count = 0
    deleted_count = 0
    
    for root, dirs, files in os.walk(COMICS_DIR):
        # ... (skipping metadata logic) ...
        abs_root = os.path.abspath(root)
        rel_path = os.path.relpath(abs_root, COMICS_DIR)
        
        # Metadata cache
        series_json_path = os.path.join(root, "series.json")
        current_metadata = None
        if os.path.exists(series_json_path):
            current_metadata = parse_series_json(series_json_path)
            dir_metadata_cache[abs_root] = current_metadata
        else:
            check_path = abs_root
            while check_path.startswith(COMICS_DIR):
                if check_path in dir_metadata_cache:
                    current_metadata = dir_metadata_cache[check_path]
                    break
                check_path = os.path.dirname(check_path)
        
        path_parts = [] if rel_path == '.' else rel_path.split(os.sep)
        
        for filename in files:
            if is_cbr_or_cbz(filename):
                filepath = os.path.join(root, filename)
                comic_id = hashlib.md5(filepath.encode('utf-8')).hexdigest()
                on_disk_ids.add(comic_id)
                processed_sync_count += 1
                
                # Get file stats
                stat = os.stat(filepath)
                mtime = int(stat.st_mtime)
                size_bytes = stat.st_size
                
                is_new = comic_id not in db_ids
                is_changed = not is_new and (db_meta[comic_id]['mtime'] != mtime or db_meta[comic_id]['size'] != size_bytes)
                
                if is_new or is_changed:
                    if is_new: new_count += 1
                    else: changed_count += 1
                    
                    # Deriving Metadata
                    category = path_parts[0] if len(path_parts) > 0 else "Uncategorized"
                    subcategory = path_parts[1] if len(path_parts) > 1 else None
                    if len(path_parts) >= 3: series = path_parts[2]
                    else:
                        series = os.path.splitext(filename)[0]
                        series = re.sub(r'\s*(v|c|vol|chapter|ch)\s*\.?\s*\d+.*$', '', series, flags=re.IGNORECASE).strip()
                    
                    if current_metadata:
                        series = current_metadata.get('series') or current_metadata.get('title') or series
                    
                    vol, ch = parse_filename_info(filename)
                    
                    comic_data = {
                        'id': comic_id, 'path': filepath, 'title': series, 'series': series,
                        'category': category, 'filename': filename, 'size_str': get_file_size_str(size_bytes),
                        'size_bytes': size_bytes, 'mtime': mtime, 'volume': vol, 'chapter': ch,
                        'metadata': current_metadata, 'subcategory': subcategory
                    }
                    
                    if is_new: new_comics.append(comic_data)
                    else: changed_comics.append(comic_data)
                    
                    if series not in series_map:
                        series_map[series] = {
                            'metadata': current_metadata, 'category': category,
                            'subcategory': subcategory, 'cover_id': comic_id
                        }
                
                if job_id and processed_sync_count % 50 == 0:
                    update_scan_progress(
                        job_id, processed_sync_count, 
                        current_file=filename, phase="Phase 1: Syncing",
                        new_comics=new_count, changed_comics=changed_count
                    )

    # 3. Handle Deletions
    missing_ids = db_ids - on_disk_ids
    deleted_count = len(missing_ids)
    if missing_ids:
        print(f"Removing {deleted_count} missing comics.")
        delete_comics_by_ids(list(missing_ids))
        if job_id:
            update_scan_progress(job_id, processed_sync_count, deleted_comics=deleted_count)
    
    # 4. Handle Changes (Reset processed/pages so Phase 2 picks them up)
    if changed_comics:
        print(f"Updating {len(changed_comics)} changed comics.")
        for comic in changed_comics:
            conn.execute('''
                UPDATE comics SET 
                    size_str = ?, size_bytes = ?, mtime = ?, pages = NULL, processed = 0, has_thumbnail = 0
                WHERE id = ?
            ''', (comic['size_str'], comic['size_bytes'], comic['mtime'], comic['id']))
        conn.commit()

    # 5. Add New Comics
    if new_comics:
        print(f"Inserting {len(new_comics)} new comics.")
        series_id_map = {}
        for series_name, s_info in series_map.items():
            series_id = create_or_update_series(
                name=series_name,
                metadata=s_info['metadata'],
                category=s_info['category'],
                subcategory=s_info['subcategory'],
                cover_comic_id=s_info['cover_id']
            )
            series_id_map[series_name] = series_id
            
        batch = []
        for comic in new_comics:
            series_id = series_id_map.get(comic['series'])
            batch.append((
                comic['id'], comic['path'], comic['title'], comic['series'],
                comic['category'], comic['filename'], comic['size_str'],
                comic['size_bytes'], comic['mtime'], comic['volume'], comic['chapter'], series_id
            ))
            
            if len(batch) >= 500:
                conn.executemany('''
                    INSERT INTO comics (id, path, title, series, category, filename, size_str, size_bytes, mtime, pages, processed, volume, chapter, series_id)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, ?, ?, ?)
                ''', batch)
                conn.commit()
                batch = []
        
        if batch:
            conn.executemany('''
                INSERT INTO comics (id, path, title, series, category, filename, size_str, size_bytes, mtime, pages, processed, volume, chapter, series_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, ?, ?, ?)
            ''', batch)
            conn.commit()
    
    conn.close()
    print(f"Phase 1 complete. New: {len(new_comics)}, Changed: {len(changed_comics)}, Deleted: {len(missing_ids)}")
    return len(new_comics) + len(changed_comics), len(missing_ids)

def process_library_task(job_id=None):
    """
    PHASE 2: Background processing of pending items.
    """
    print("Phase 2: Processing metadata and thumbnails...")
    
    conn = get_db_connection()
    total_pending = conn.execute("SELECT COUNT(*) FROM comics WHERE pages IS NULL OR pages = 0 OR processed = 0").fetchone()[0]
    conn.close()
    
    if total_pending == 0:
        print("No pending comics to process.")
        if job_id: complete_scan_job(job_id, status='completed')
        return

    if job_id:
        conn = get_db_connection()
        conn.execute("UPDATE scan_jobs SET total_comics = ?, processed_comics = 0 WHERE id = ?", (total_pending, job_id))
        conn.commit()
        conn.close()

    batch_size = 100
    processed_count = 0
    
    pages_done = 0
    pages_err = 0
    thumb_done = 0
    thumb_err = 0
    
    conn = get_db_connection()
    try:
        while True:
            pending = get_pending_comics(limit=batch_size)
            if not pending: break
                
            update_buffer = []
            for comic in pending:
                comic_id = comic['id']
                filepath = comic['path']
                filename = os.path.basename(filepath)
                
                if not os.path.exists(filepath):
                    update_buffer.append((0, 0, 0, comic_id))
                    processed_count += 1
                    continue
                    
                try:
                    pages = 0
                    file_ext = os.path.splitext(filepath)[1].lower()
                    if file_ext == '.cbz':
                        with zipfile.ZipFile(filepath, 'r') as z:
                            pages = len([n for n in z.namelist() if n.lower().endswith(IMG_EXTENSIONS)])
                    elif file_ext == '.cbr':
                        with rarfile.RarFile(filepath) as r:
                            pages = len([n for n in r.namelist() if n.lower().endswith(IMG_EXTENSIONS)])
                    
                    if pages > 0: pages_done += 1
                    else: pages_err += 1
                    
                    processed = extract_cover_image(filepath, comic_id)
                    if processed: thumb_done += 1
                    else: thumb_err += 1
                    
                    update_buffer.append((pages, 1 if processed else 0, 1 if processed else 0, comic_id))
                    
                except Exception as e:
                    print(f"Error processing {filepath}: {e}")
                    pages_err += 1
                    thumb_err += 1
                    update_buffer.append((0, 0, 0, comic_id))
                
                processed_count += 1
                
                if len(update_buffer) >= 20: 
                    conn.executemany('UPDATE comics SET pages = ?, processed = ?, has_thumbnail = ? WHERE id = ?', update_buffer)
                    conn.commit()
                    update_buffer = []
                    if job_id:
                        conn.execute('''
                            UPDATE scan_jobs SET 
                                processed_comics = ?, current_file = ?, phase = ?,
                                processed_pages = ?, page_errors = ?, 
                                processed_thumbnails = ?, thumbnail_errors = ?
                            WHERE id = ?
                        ''', (processed_count, filename, "Phase 2: Processing", pages_done, pages_err, thumb_done, thumb_err, job_id))
                        conn.commit()

            if update_buffer:
                conn.executemany('UPDATE comics SET pages = ?, processed = ?, has_thumbnail = ? WHERE id = ?', update_buffer)
                conn.commit()
                if job_id:
                    conn.execute('''
                        UPDATE scan_jobs SET 
                            processed_comics = ?, current_file = ?, phase = ?,
                            processed_pages = ?, page_errors = ?, 
                            processed_thumbnails = ?, thumbnail_errors = ?
                        WHERE id = ?
                    ''', (processed_count, filename, "Phase 2: Processing", pages_done, pages_err, thumb_done, thumb_err, job_id))
                    conn.commit()
                    
    finally:
        conn.close()
    
    if job_id: complete_scan_job(job_id, status='completed')
    print(f"Phase 2 complete. Processed {processed_count} items.")

def full_scan_library_task():
    from database import get_running_scan_job
    running = get_running_scan_job()
    if running: return
        
    job_id = create_scan_job(scan_type='full', total_comics=0)
    try:
        sync_library_task(job_id)
        process_library_task(job_id)
    except Exception as e:
        print(f"Scan failed: {e}")
        import traceback
        traceback.print_exc()
        complete_scan_job(job_id, status='failed', errors=str(e))

def rescan_library_task():
    print("Starting full library rescan...")
    conn = get_db_connection()
    try:
        conn.execute("PRAGMA foreign_keys = ON") 
        conn.execute("DELETE FROM comics")
        conn.execute("DELETE FROM series")
        conn.commit()
    except Exception as e:
        print(f"Error clearing library: {e}")
    finally:
        conn.close()
    full_scan_library_task()

# Compatibility exports
scan_library_task = full_scan_library_task
fast_scan_library_task = full_scan_library_task 
