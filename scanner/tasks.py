import os
import hashlib
import json
from typing import Optional, Tuple
from concurrent.futures import ThreadPoolExecutor, as_completed
from config import COMICS_DIR
from database import (
    get_db_connection, create_or_update_series,
    update_scan_progress, complete_scan_job, delete_comics_by_ids,
    get_pending_comics, create_scan_job, check_scan_cancellation
)
from .utils import is_cbr_or_cbz, get_file_size_str, parse_filename_info, parse_series_json
from .archives import _process_single_comic
from logger import logger

# Normalize COMICS_DIR for local use
_comics_dir = os.path.normpath(os.path.abspath(COMICS_DIR))

def sync_library_task(job_id: Optional[int] = None) -> Tuple[int, int]:
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
    
    for root, dirs, files in os.walk(_comics_dir):
        abs_root = os.path.abspath(root)
        rel_path = os.path.relpath(abs_root, _comics_dir)
        
        series_json_path = os.path.join(root, "series.json")
        current_metadata = None
        if os.path.exists(series_json_path):
            current_metadata = parse_series_json(series_json_path)
            dir_metadata_cache[abs_root] = current_metadata
        else:
            check_path = abs_root
            while check_path.startswith(_comics_dir):
                if check_path in dir_metadata_cache:
                    current_metadata = dir_metadata_cache[check_path]
                    break
                check_path = os.path.dirname(check_path)
        
        path_parts = [] if rel_path == '.' else rel_path.split(os.sep)
        
        for filename in files:
            if job_id and file_count % 20 == 0:
                if check_scan_cancellation(job_id):
                    logger.warning(f"Scan job {job_id} cancelled during sync phase.")
                    conn.close()
                    complete_scan_job(job_id, status='failed', errors=['Scan cancelled by user'])
                    return 0, 0
            
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
                        current_file=os.path.join(rel_path, filename), phase="Phase 1: Syncing",
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
        batch_size = 50
        for i in range(0, len(update_data), batch_size):
            batch = update_data[i:i+batch_size]
            conn.executemany('''
                UPDATE comics SET 
                    size_str = ?, size_bytes = ?, mtime = ?, pages = NULL, processed = 0, has_thumbnail = 0
                WHERE id = ?
            ''', batch)
            conn.commit()
            if job_id:
                update_scan_progress(
                    job_id, file_count,
                    current_file=f"Updating {min(i+batch_size, len(update_data))}/{len(update_data)} changed comics",
                    phase="Phase 1: Syncing",
                    new_comics=new_count, changed_comics=changed_count,
                    conn=conn
                )
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

def process_library_task(job_id: Optional[int] = None) -> None:
    """PHASE 2: Background processing of pending items."""
    from db.settings import get_thumbnail_settings
    logger.info("Phase 2: Processing metadata and thumbnails...")
    conn = get_db_connection()
    
    settings = get_thumbnail_settings()
    
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
    thumb_bytes_written = 0
    thumb_bytes_saved = 0
    all_scan_errors = []
    
    try:
        while True:
            if job_id and check_scan_cancellation(job_id):
                logger.warning(f"Scan job {job_id} cancelled during processing phase.")
                if all_scan_errors is None: all_scan_errors = []
                all_scan_errors.append({'error': 'Scan cancelled by user'})
                complete_scan_job(job_id, status='failed', errors=all_scan_errors, conn=conn)
                conn.commit()
                return

            pending = get_pending_comics(limit=batch_size, conn=conn)
            if not pending: break
            
            update_buffer = []
            with ThreadPoolExecutor(max_workers=max_workers) as executor:
                futures = {executor.submit(_process_single_comic, comic['id'], comic['path'], settings): comic for comic in pending}
                for future in as_completed(futures):
                    try:
                        result = future.result()
                    except Exception as e:
                        comic = futures[future]
                        logger.error(f"Failed to process comic {comic['id']}: {e}", exc_info=True)
                        processed_count += 1
                        pages_err += 1
                        thumb_err += 1
                        update_buffer.append((0, 1, 0, None, comic['id']))
                        if len(all_scan_errors) < 100:
                            all_scan_errors.append({'comic_id': comic['id'], 'filepath': comic['path'], 'errors': [str(e)]})
                        continue
                    
                    processed_count += 1
                    if result['file_missing'] or (result['errors'] and result['pages'] == 0):
                        pages_err += 1
                        thumb_err += 1
                        update_buffer.append((0, 1, 0, None, result['comic_id']))
                    else:
                        if result['pages'] > 0: pages_done += 1
                        else: pages_err += 1
                        if result['has_thumb']: 
                            thumb_done += 1
                            thumb_bytes_written += result.get('thumb_size', 0)
                            thumb_bytes_saved += result.get('thumb_saved', 0)
                        else: thumb_err += 1
                        update_buffer.append((result['pages'], 1, 1 if result['has_thumb'] else 0, result.get('thumbnail_ext'), result['comic_id']))
                    
                    if result['errors'] and len(all_scan_errors) < 100:
                        all_scan_errors.append({'comic_id': result['comic_id'], 'filepath': result['filepath'], 'errors': result['errors']})
            
            if update_buffer:
                conn.executemany('UPDATE comics SET pages = ?, processed = ?, has_thumbnail = ?, thumbnail_ext = ? WHERE id = ?', update_buffer)
                if job_id:
                    last_path = pending[-1]['path']
                    try:
                        last_rel_path = os.path.relpath(last_path, _comics_dir)
                    except ValueError:
                        last_rel_path = os.path.basename(last_path)
                        
                    conn.execute('''
                        UPDATE scan_jobs SET 
                            processed_comics = ?, current_file = ?, phase = ?,
                            processed_pages = ?, page_errors = ?, 
                            processed_thumbnails = ?, thumbnail_errors = ?,
                            thumb_bytes_written = ?, thumb_bytes_saved = ?,
                            errors = ?
                        WHERE id = ?
                    ''', (processed_count, last_rel_path, "Phase 2: Processing",
                          pages_done, pages_err, thumb_done, thumb_err,
                          thumb_bytes_written, thumb_bytes_saved,
                          json.dumps(all_scan_errors) if all_scan_errors else None, job_id))
                    
                    if processed_count % 50 == 0 and thumb_bytes_saved > 0:
                        saved_mb = thumb_bytes_saved / (1024 * 1024)
                        logger.info(f"Scan progress: Saved {saved_mb:.2f} MB so far via 'Pick Best'")
                conn.commit()
    finally:
        conn.close()
    
    if job_id:
        complete_scan_job(job_id, status='completed', errors=all_scan_errors if all_scan_errors else None)

def full_scan_library_task(job_id: Optional[int] = None) -> None:
    from database import get_running_scan_job
    if job_id is None:
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
        complete_scan_job(job_id, status='failed', errors=[str(e)])

def rescan_library_task(job_id: Optional[int] = None) -> None:
    from config import BASE_CACHE_DIR
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
    
    # Clear thumbnail cache to remove orphans
    logger.info("Clearing thumbnail cache...")
    if os.path.exists(BASE_CACHE_DIR):
        for root, dirs, files in os.walk(BASE_CACHE_DIR):
            for file in files:
                if file != '_placeholder.webp':
                    filepath = os.path.join(root, file)
                    try:
                        os.remove(filepath)
                    except Exception as e:
                        logger.warning(f"Failed to delete {filepath}: {e}")

    full_scan_library_task(job_id)

def thumbnail_rescan_task(job_id: Optional[int] = None) -> None:
    """Regenerate all thumbnails: clear cache, reset flags, reprocess all comics."""
    from database import get_running_scan_job
    from config import BASE_CACHE_DIR
    
    if job_id is None:
        if get_running_scan_job():
            logger.warning("Thumbnail rescan aborted: scan already running")
            return
        job_id = create_scan_job(scan_type='thumbnails', total_comics=0)
    
    logger.info("Starting thumbnail rescan...")
    
    try:
        logger.info("Clearing thumbnail cache...")
        if os.path.exists(BASE_CACHE_DIR):
            for root, dirs, files in os.walk(BASE_CACHE_DIR):
                for file in files:
                    if file != '_placeholder.webp':
                        filepath = os.path.join(root, file)
                        try:
                            os.remove(filepath)
                        except Exception as e:
                            logger.warning(f"Failed to delete {filepath}: {e}")
        
        conn = get_db_connection()
        total = conn.execute("SELECT COUNT(*) FROM comics").fetchone()[0]
        conn.execute("UPDATE comics SET has_thumbnail = 0, thumbnail_ext = NULL, processed = 0")
        conn.commit()
        conn.execute("UPDATE scan_jobs SET total_comics = ? WHERE id = ?", (total, job_id))
        conn.commit()
        conn.close()
        
        logger.info(f"Thumbnail flags reset for {total} comics. Starting regeneration...")
        
        if check_scan_cancellation(job_id):
            logger.warning(f"Thumbnail rescan job {job_id} cancelled.")
            complete_scan_job(job_id, status='failed', errors=['Scan cancelled by user'])
            return

        process_library_task(job_id)
    except Exception as e:
        logger.error(f"Thumbnail rescan failed: {e}", exc_info=True)
        complete_scan_job(job_id, status='failed', errors=[str(e)])

def metadata_rescan_task(job_id: Optional[int] = None) -> None:
    """Re-parse all series.json files and update series metadata."""
    from database import get_running_scan_job
    
    if job_id is None:
        if get_running_scan_job():
            logger.warning("Metadata rescan aborted: scan already running")
            return
        job_id = create_scan_job(scan_type='metadata', total_comics=0)
    
    logger.info("Starting metadata rescan...")
    
    try:
        conn = get_db_connection()
        series_json_files = []
        
        # Walk _comics_dir to find all series.json files
        for root, dirs, files in os.walk(_comics_dir):
            if 'series.json' in files:
                series_json_path = os.path.join(root, 'series.json')
                series_json_files.append(series_json_path)
        
        total_files = len(series_json_files)
        conn.execute("UPDATE scan_jobs SET total_comics = ? WHERE id = ?", (total_files, job_id))
        conn.commit()
        
        logger.info(f"Found {total_files} series.json files to process")
        
        processed = 0
        for series_json_path in series_json_files:
            if check_scan_cancellation(job_id):
                logger.warning(f"Metadata rescan job {job_id} cancelled.")
                complete_scan_job(job_id, status='failed', errors=['Scan cancelled by user'], conn=conn)
                conn.commit()
                conn.close()
                return

            try:
                metadata = parse_series_json(series_json_path)
                if not metadata:
                    continue
                
                # Extract series name from metadata or directory
                series_name = metadata.get('series') or metadata.get('title')
                if not series_name:
                    # Use directory name as fallback
                    series_name = os.path.basename(os.path.dirname(series_json_path))
                
                # Update series table with new metadata
                # Find series by name
                series_row = conn.execute(
                    "SELECT id FROM series WHERE name = ?", 
                    (series_name,)
                ).fetchone()
                
                if series_row:
                    # Update existing series with fresh metadata
                    metadata_json = json.dumps(metadata)
                    conn.execute('''
                        UPDATE series SET 
                            synopsis = ?,
                            authors = ?,
                            genres = ?,
                            tags = ?,
                            status = ?,
                            alt_titles = ?,
                            external_links = ?
                        WHERE id = ?
                    ''', (
                        metadata.get('synopsis'),
                        metadata.get('authors'),
                        metadata.get('genres'),
                        metadata.get('tags'),
                        metadata.get('status'),
                        metadata.get('alt_titles'),
                        json.dumps(metadata.get('external_links', {})),
                        series_row['id']
                    ))
                    logger.debug(f"Updated metadata for series: {series_name}")
                
                processed += 1
                if processed % 10 == 0:
                    update_scan_progress(
                        job_id, processed,
                        current_file=os.path.basename(series_json_path),
                        phase="Updating metadata",
                        conn=conn
                    )
                    conn.commit()
                    
            except Exception as e:
                logger.error(f"Failed to process {series_json_path}: {e}", exc_info=True)
        
        # Invalidate tag cache so new metadata is reflected immediately
        from database import invalidate_tag_cache
        invalidate_tag_cache()
        
        conn.commit()
        conn.close()
        
        logger.info(f"Metadata rescan completed: {processed}/{total_files} files processed")
        complete_scan_job(job_id, status='completed', errors=None)
        
    except Exception as e:
        logger.error(f"Metadata rescan failed: {e}", exc_info=True)
        complete_scan_job(job_id, status='failed', errors=[str(e)])
