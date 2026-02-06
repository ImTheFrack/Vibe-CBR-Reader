import os
import hashlib
import json
from concurrent.futures import ThreadPoolExecutor, as_completed
from config import COMICS_DIR
from database import (
    get_db_connection, create_or_update_series,
    update_scan_progress, complete_scan_job, delete_comics_by_ids,
    get_pending_comics, create_scan_job
)
from .utils import is_cbr_or_cbz, get_file_size_str, parse_filename_info, parse_series_json
from .archives import _process_single_comic
from logger import logger

# Normalize COMICS_DIR
COMICS_DIR = os.path.normpath(os.path.abspath(COMICS_DIR))

def sync_library_task(job_id=None):
    """PHASE 1: Synchronize file system with database."""
    logger.info("Phase 1: Synchronizing library structure...")
    conn = get_db_connection()
    
    db_comics = conn.execute("SELECT id, path, mtime, size_bytes FROM comics").fetchall()
    db_meta = {row['id']: {'path': row['path'], 'mtime': row['mtime'], 'size': row['size_bytes']} for row in db_comics}
    db_ids = set(db_meta.keys())
    
    on_disk_ids = set()
    new_comics = []
    changed_comics = []
    series_map = {}
    dir_metadata_cache = {}
    
    file_count = 0
    new_count = 0
    changed_count = 0
    
    import re
    
    for root, dirs, files in os.walk(COMICS_DIR):
        abs_root = os.path.abspath(root)
        rel_path = os.path.relpath(abs_root, COMICS_DIR)
        
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
                file_count += 1
                filepath = os.path.join(root, filename)
                comic_id = hashlib.md5(filepath.encode('utf-8')).hexdigest()
                on_disk_ids.add(comic_id)
                
                stat = os.stat(filepath)
                mtime = int(stat.st_mtime)
                size_bytes = stat.st_size
                
                is_new = comic_id not in db_ids
                is_changed = not is_new and (db_meta[comic_id]['mtime'] != mtime or db_meta[comic_id]['size'] != size_bytes)
                
                if is_new or is_changed:
                    if is_new: new_count += 1
                    else: changed_count += 1
                    
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
                
                if job_id and file_count % 50 == 0:
                    update_scan_progress(
                        job_id, file_count, 
                        current_file=filename, phase="Phase 1: Syncing",
                        new_comics=new_count, changed_comics=changed_count,
                        conn=conn
                    )
                    conn.execute("UPDATE scan_jobs SET total_comics = ? WHERE id = ?", (file_count, job_id))
                    conn.commit()

    if job_id:
        conn.execute("UPDATE scan_jobs SET total_comics = ? WHERE id = ?", (file_count, job_id))
        conn.commit()

    missing_ids = db_ids - on_disk_ids
    deleted_count = len(missing_ids)
    if missing_ids:
        delete_comics_by_ids(list(missing_ids), conn=conn)
        if job_id:
            update_scan_progress(job_id, file_count, deleted_comics=deleted_count, conn=conn)
        conn.commit()
    
    if changed_comics:
        update_data = [(c['size_str'], c['size_bytes'], c['mtime'], c['id']) for c in changed_comics]
        conn.executemany('''
            UPDATE comics SET 
                size_str = ?, size_bytes = ?, mtime = ?, pages = NULL, processed = 0, has_thumbnail = 0
            WHERE id = ?
        ''', update_data)
        conn.commit()

    if new_comics:
        series_id_map = {}
        for series_name, s_info in series_map.items():
            series_id = create_or_update_series(
                name=series_name,
                metadata=s_info['metadata'],
                category=s_info['category'],
                subcategory=s_info['subcategory'],
                cover_comic_id=s_info['cover_id'],
                conn=conn
            )
            series_id_map[series_name] = series_id
        conn.commit()
            
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
    
    # Invalidate tag cache so new metadata is reflected immediately
    from database import invalidate_tag_cache
    invalidate_tag_cache()

    conn.close()
    return len(new_comics) + len(changed_comics), deleted_count

def process_library_task(job_id=None):
    """PHASE 2: Background processing of pending items."""
    logger.info("Phase 2: Processing metadata and thumbnails...")
    conn = get_db_connection()
    total_pending = conn.execute("SELECT COUNT(*) FROM comics WHERE processed = 0").fetchone()[0]
    
    if total_pending == 0:
        logger.info("No pending comics to process.")
        conn.close()
        if job_id: complete_scan_job(job_id, status='completed', errors=None)
        return

    if job_id:
        conn.execute("UPDATE scan_jobs SET total_comics = ?, processed_comics = 0 WHERE id = ?", (total_pending, job_id))
        conn.commit()

    batch_size = 100
    max_workers = 4
    processed_count = 0
    pages_done = 0
    pages_err = 0
    thumb_done = 0
    thumb_err = 0
    all_scan_errors = []
    
    try:
        while True:
            pending = get_pending_comics(limit=batch_size, conn=conn)
            if not pending: break
            
            update_buffer = []
            with ThreadPoolExecutor(max_workers=max_workers) as executor:
                futures = {executor.submit(_process_single_comic, comic['id'], comic['path']): comic for comic in pending}
                for future in as_completed(futures):
                    result = future.result()
                    processed_count += 1
                    if result['file_missing'] or (result['errors'] and result['pages'] == 0):
                        pages_err += 1
                        thumb_err += 1
                        update_buffer.append((0, 1, 0, result['comic_id']))
                    else:
                        if result['pages'] > 0: pages_done += 1
                        else: pages_err += 1
                        if result['has_thumb']: thumb_done += 1
                        else: thumb_err += 1
                        update_buffer.append((result['pages'], 1, 1 if result['has_thumb'] else 0, result['comic_id']))
                    
                    if result['errors']:
                        all_scan_errors.append({'comic_id': result['comic_id'], 'filepath': result['filepath'], 'errors': result['errors']})
            
            if update_buffer:
                conn.executemany('UPDATE comics SET pages = ?, processed = ?, has_thumbnail = ? WHERE id = ?', update_buffer)
                if job_id:
                    last_filename = pending[-1]['path'].split(os.sep)[-1] if pending else ''
                    conn.execute('''
                        UPDATE scan_jobs SET 
                            processed_comics = ?, current_file = ?, phase = ?,
                            processed_pages = ?, page_errors = ?, 
                            processed_thumbnails = ?, thumbnail_errors = ?,
                            errors = ?
                        WHERE id = ?
                    ''', (processed_count, last_filename, "Phase 2: Processing",
                          pages_done, pages_err, thumb_done, thumb_err,
                          json.dumps(all_scan_errors) if all_scan_errors else None, job_id))
                conn.commit()
    finally:
        conn.close()
    
    if job_id:
        complete_scan_job(job_id, status='completed', errors=json.dumps(all_scan_errors) if all_scan_errors else None)

def full_scan_library_task():
    from database import get_running_scan_job
    if get_running_scan_job(): return
    job_id = create_scan_job(scan_type='full', total_comics=0)
    conn = get_db_connection()
    conn.execute("UPDATE comics SET processed = 0 WHERE processed = 1 AND (pages IS NULL OR pages = 0)")
    conn.commit()
    conn.close()
    try:
        sync_library_task(job_id)
        process_library_task(job_id)
    except Exception as e:
        logger.error(f"Scan failed: {e}", exc_info=True)
        complete_scan_job(job_id, status='failed', errors=str(e))

def rescan_library_task():
    logger.info("Starting full library rescan...")
    conn = get_db_connection()
    try:
        conn.execute("PRAGMA foreign_keys = ON") 
        conn.execute("DELETE FROM comics")
        conn.execute("DELETE FROM series")
        conn.commit()
    except Exception as e:
        logger.error(f"Error clearing library: {e}")
    finally:
        conn.close()
    full_scan_library_task()
