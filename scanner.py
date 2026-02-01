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
    update_scan_progress, complete_scan_job
)

def is_cbr_or_cbz(filename: str) -> bool:
    return filename.lower().endswith(('.cbz', '.cbr'))

def get_file_size(size_bytes: int) -> str:
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

        # Handle CBZ (ZIP) files
        if file_ext == '.cbz':
            with zipfile.ZipFile(filepath, 'r') as z:
                for name in z.namelist():
                    if name.lower().endswith(IMG_EXTENSIONS):
                        with z.open(name) as f_img:
                            img = Image.open(f_img)
                            img.load()
                            break
                else:
                    return False
        # Handle CBR (RAR) files
        elif file_ext == '.cbr':
            try:
                with rarfile.RarFile(filepath) as r:
                    for name in r.namelist():
                        if name.lower().endswith(IMG_EXTENSIONS):
                            with r.open(name) as f_img:
                                img = Image.open(f_img)
                                img.load()
                                break
                    else:
                        return False
            except Exception as e:
                print(f"Error reading RAR file {filepath}: {e}")
                return False
        else:
            return False

        # Resize and Save
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
    """Sorts strings containing numbers naturally (1, 2, 10 instead of 1, 10, 2)"""
    return [int(text) if text.isdigit() else text.lower()
            for text in re.split(r'(\d+)', s)]

def parse_filename_info(filename):
    """Extracts volume and chapter numbers from filename"""
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
    """Parse series.json and return metadata dict"""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
            return data
    except Exception as e:
        print(f"Error parsing {filepath}: {e}")
        return {}

def fast_scan_library_task():
    """Fast directory-only scan without opening archives"""
    from database import create_scan_job, get_running_scan_job
    
    print("Starting fast background scan...")
    
    # Check for running scan (scan lock)
    running_scan = get_running_scan_job()
    if running_scan:
        print(f"Scan already in progress (job_id: {running_scan['id']})")
        return
    
    # First pass: count total comics
    total_comics = 0
    for root, dirs, files in os.walk(COMICS_DIR):
        total_comics += sum(1 for f in files if is_cbr_or_cbz(f))
    
    # Create scan job entry
    job_id = create_scan_job(scan_type='fast', total_comics=total_comics)
    print(f"Created scan job {job_id}, total comics: {total_comics}")
    
    try:
        conn = get_db_connection()
        
        # Track series info: { series_name: { 'metadata': {...}, 'category': ..., 'subcategory': ..., 'comics': [] } }
        series_info = {}
        
        # Cache metadata by directory path to support nested folders
        dir_metadata = {}
        
        processed_count = 0
        batch_buffer = []  # Buffer for batch inserts
        BATCH_SIZE = 1000
        PROGRESS_UPDATE_INTERVAL = 100
        
        for root, dirs, files in os.walk(COMICS_DIR):
            # Check for series.json in current directory
            series_json_path = os.path.join(root, "series.json")
            series_metadata = None
            series_name_from_json = None
            
            if os.path.exists(series_json_path):
                series_metadata = parse_series_json(series_json_path)
                series_name_from_json = series_metadata.get('series') or series_metadata.get('title')
                print(f"Found series.json: {series_json_path}")
                # Cache metadata for this directory
                dir_metadata[os.path.abspath(root)] = series_metadata
            
            # Process comics in this directory
            for filename in files:
                if is_cbr_or_cbz(filename):
                    filepath = os.path.join(root, filename)
                    comic_id = hashlib.md5(filepath.encode('utf-8')).hexdigest()
                    
                    # Check if comic already exists
                    existing = conn.execute("SELECT id FROM comics WHERE id = ?", (comic_id,)).fetchone()
                    if existing:
                        processed_count += 1
                        continue

                    rel_path = os.path.relpath(root, COMICS_DIR)
                    path_parts = rel_path.split(os.sep)
                    
                    category = path_parts[0] if len(path_parts) > 0 else "Uncategorized"
                    subcategory = path_parts[1] if len(path_parts) > 1 else None
                    
                    # Determine series name based on folder depth
                    if len(path_parts) >= 3:
                        # Structure: category/subcategory/title/comic
                        series = path_parts[2] if len(path_parts) > 2 else path_parts[-1]
                    elif len(path_parts) == 2:
                        # Structure: category/subcategory/comic (no title folder)
                        series = os.path.splitext(filename)[0]
                        series = re.sub(r'\s*(v|c|vol|chapter|ch)\s*\.?\s*\d+.*$', '', series, flags=re.IGNORECASE).strip()
                    else:
                        # Structure: category/comic (directly in category)
                        series = os.path.splitext(filename)[0]
                        series = re.sub(r'\s*(v|c|vol|chapter|ch)\s*\.?\s*\d+.*$', '', series, flags=re.IGNORECASE).strip()
                    
                    # If we don't have direct metadata, look in parent folders
                    current_metadata = series_metadata
                    if not current_metadata:
                        # Traverse up the directory tree to find metadata
                        check_path = os.path.abspath(root)
                        while check_path.startswith(os.path.abspath(COMICS_DIR)):
                            if check_path in dir_metadata:
                                current_metadata = dir_metadata[check_path]
                                break
                            check_path = os.path.dirname(check_path)

                    # Use series name from metadata if available
                    if current_metadata:
                        meta_name = current_metadata.get('series') or current_metadata.get('title')
                        if meta_name:
                            series = meta_name
                    
                    vol, ch = parse_filename_info(filename)
                    size_bytes = os.path.getsize(filepath)
                    file_size = get_file_size(size_bytes)

                    # Skip page counting and thumbnail generation (fast scan)
                    pages = None  # Will be NULL in database
                    has_thumbnail = False
                    
                    # Track series info
                    if series not in series_info:
                        series_info[series] = {
                            'metadata': current_metadata,
                            'category': category,
                            'subcategory': subcategory,
                            'comics': [],
                            'first_comic_id': None
                        }
                    
                    # Update metadata if we found it later
                    if current_metadata and not series_info[series]['metadata']:
                         series_info[series]['metadata'] = current_metadata
                    
                    # Store the first comic ID as potential cover
                    if series_info[series]['first_comic_id'] is None:
                        series_info[series]['first_comic_id'] = comic_id
                    
                    series_info[series]['comics'].append({
                        'id': comic_id,
                        'path': filepath,
                        'title': series,
                        'series': series,
                        'category': category,
                        'filename': filename,
                        'size_str': file_size,
                        'pages': pages,
                        'has_thumbnail': has_thumbnail,
                        'volume': vol,
                        'chapter': ch
                    })
                    
                    processed_count += 1
                    
                    # Update progress every 100 comics
                    if processed_count % PROGRESS_UPDATE_INTERVAL == 0:
                        update_scan_progress(job_id, processed_count)
                        print(f"Progress: {processed_count}/{total_comics} comics")
        
        # Now create series records and insert comics with batch inserts
        print("Creating series records and inserting comics...")
        for series_name, info in series_info.items():
            # Create or update series in database
            series_id = create_or_update_series(
                name=series_name,
                metadata=info['metadata'],
                category=info['category'],
                subcategory=info['subcategory'],
                cover_comic_id=info['first_comic_id']
            )
            
            # Insert comics in batches
            for comic in info['comics']:
                batch_buffer.append((
                    comic['id'], comic['path'], comic['title'], comic['series'],
                    comic['category'], comic['filename'], comic['size_str'],
                    comic['pages'], False, comic['volume'], comic['chapter'],
                    series_id, comic['has_thumbnail']
                ))
                
                # Execute batch insert when buffer is full
                if len(batch_buffer) >= BATCH_SIZE:
                    conn.executemany('''
                        INSERT INTO comics (id, path, title, series, category, filename, size_str, pages, processed, volume, chapter, series_id, has_thumbnail)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ''', batch_buffer)
                    conn.commit()
                    batch_buffer = []
                    print(f"Inserted batch of {BATCH_SIZE} comics")
        
        # Insert remaining comics in buffer
        if batch_buffer:
            conn.executemany('''
                INSERT INTO comics (id, path, title, series, category, filename, size_str, pages, processed, volume, chapter, series_id, has_thumbnail)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', batch_buffer)
            conn.commit()
            print(f"Inserted final batch of {len(batch_buffer)} comics")
        
        conn.close()
        
        # Mark scan job as completed
        complete_scan_job(job_id, status='completed')
        print(f"Fast scan complete. Processed {processed_count} comics.")
        
    except Exception as e:
        print(f"Error during fast scan: {e}")
        complete_scan_job(job_id, status='failed', errors=str(e))
        raise

def scan_library_task(job_id=None):
    print("Starting background scan...")
    conn = get_db_connection()
    
    # Track series info: { series_name: { 'metadata': {...}, 'category': ..., 'subcategory': ..., 'comics': [] } }
    series_info = {}
    
    # Cache metadata by directory path to support nested folders
    dir_metadata = {}
    
    processed_count = 0
    
    try:
        for root, dirs, files in os.walk(COMICS_DIR):
            # Check for series.json in current directory
            series_json_path = os.path.join(root, "series.json")
            series_metadata = None
            series_name_from_json = None
            
            if os.path.exists(series_json_path):
                series_metadata = parse_series_json(series_json_path)
                series_name_from_json = series_metadata.get('series') or series_metadata.get('title')
                print(f"Found series.json: {series_json_path}")
                # Cache metadata for this directory
                dir_metadata[os.path.abspath(root)] = series_metadata
            
            # Process comics in this directory
            for filename in files:
                if is_cbr_or_cbz(filename):
                    filepath = os.path.join(root, filename)
                    comic_id = hashlib.md5(filepath.encode('utf-8')).hexdigest()
                    
                    # Check if comic already exists
                    existing = conn.execute("SELECT id FROM comics WHERE id = ?", (comic_id,)).fetchone()
                    if existing:
                        continue
                    
                    processed_count += 1
                    
                    # Update progress every 100 comics
                    if job_id and processed_count % 100 == 0:
                        update_scan_progress(job_id, processed_count)

                    rel_path = os.path.relpath(root, COMICS_DIR)
                    path_parts = rel_path.split(os.sep)
                    
                    category = path_parts[0] if len(path_parts) > 0 else "Uncategorized"
                    subcategory = path_parts[1] if len(path_parts) > 1 else None
                    
                    # Determine series name based on folder depth
                    if len(path_parts) >= 3:
                        # Structure: category/subcategory/title/comic
                        series = path_parts[2] if len(path_parts) > 2 else path_parts[-1]
                    elif len(path_parts) == 2:
                        # Structure: category/subcategory/comic (no title folder)
                        series = os.path.splitext(filename)[0]
                        series = re.sub(r'\s*(v|c|vol|chapter|ch)\s*\.?\s*\d+.*$', '', series, flags=re.IGNORECASE).strip()
                    else:
                        # Structure: category/comic (directly in category)
                        series = os.path.splitext(filename)[0]
                        series = re.sub(r'\s*(v|c|vol|chapter|ch)\s*\.?\s*\d+.*$', '', series, flags=re.IGNORECASE).strip()
                    
                    # If we don't have direct metadata, look in parent folders
                    current_metadata = series_metadata
                    if not current_metadata:
                        # Traverse up the directory tree to find metadata
                        check_path = os.path.abspath(root)
                        while check_path.startswith(os.path.abspath(COMICS_DIR)):
                            if check_path in dir_metadata:
                                current_metadata = dir_metadata[check_path]
                                # Check if this metadata belongs to the series we found
                                meta_name = current_metadata.get('series') or current_metadata.get('title')
                                # If metadata has a name, and it matches our derived series name (or if we are in a subfolder of it)
                                # Simple heuristic: if we found metadata in a parent folder, use it.
                                break
                            check_path = os.path.dirname(check_path)

                    # Use series name from metadata if available and we are using that metadata
                    if current_metadata:
                        meta_name = current_metadata.get('series') or current_metadata.get('title')
                        if meta_name:
                            series = meta_name
                    
                    vol, ch = parse_filename_info(filename)
                    size_bytes = os.path.getsize(filepath)
                    file_size = get_file_size(size_bytes)

                    # Count pages
                    pages = 0
                    try:
                        if filename.lower().endswith('.cbz'):
                            with zipfile.ZipFile(filepath, 'r') as z:
                                pages = len([n for n in z.namelist() if n.lower().endswith(IMG_EXTENSIONS)])
                        elif filename.lower().endswith('.cbr'):
                            with rarfile.RarFile(filepath) as r:
                                pages = len([n for n in r.namelist() if n.lower().endswith(IMG_EXTENSIONS)])
                    except Exception:
                        pass

                    has_cover = extract_cover_image(filepath, comic_id)
                    
                    # Track series info
                    if series not in series_info:
                        series_info[series] = {
                            'metadata': current_metadata,
                            'category': category,
                            'subcategory': subcategory,
                            'comics': [],
                            'first_comic_id': None
                        }
                    
                    # Update metadata if we found it later (e.g. processing files in root then files in subfolder with metadata)
                    if current_metadata and not series_info[series]['metadata']:
                         series_info[series]['metadata'] = current_metadata
                    
                    # Store the first comic ID as potential cover
                    if series_info[series]['first_comic_id'] is None:
                        series_info[series]['first_comic_id'] = comic_id
                    
                    series_info[series]['comics'].append({
                        'id': comic_id,
                        'path': filepath,
                        'title': series,
                        'series': series,
                        'category': category,
                        'filename': filename,
                        'size_str': file_size,
                        'pages': pages,
                        'processed': has_cover,
                        'volume': vol,
                        'chapter': ch
                    })
        
        # Now create series records and insert comics
        for series_name, info in series_info.items():
            # Create or update series in database
            series_id = create_or_update_series(
                name=series_name,
                metadata=info['metadata'],
                category=info['category'],
                subcategory=info['subcategory'],
                cover_comic_id=info['first_comic_id']
            )
            
            # Insert comics and link to series
            for comic in info['comics']:
                conn.execute('''
                    INSERT INTO comics (id, path, title, series, category, filename, size_str, pages, processed, volume, chapter, series_id)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    comic['id'], comic['path'], comic['title'], comic['series'],
                    comic['category'], comic['filename'], comic['size_str'],
                    comic['pages'], comic['processed'], comic['volume'], comic['chapter'],
                    series_id
                ))
                conn.commit()
                print(f"Added: {comic['filename']} (Series: {series_name})")
        
        # Mark scan as completed
        if job_id:
            complete_scan_job(job_id, status='completed')
        
        print("Scan complete.")
    
    except Exception as e:
        print(f"Error during scan: {e}")
        if job_id:
            complete_scan_job(job_id, status='failed', errors=[str(e)])
    finally:
        conn.close()

# For backwards compatibility, keep the old function name
scan_library = scan_library_task

def rescan_library_task():
    """Clears the library and performs a full rescan."""
    print("Starting full library rescan (wiping database)...")
    conn = get_db_connection()
    try:
        # Delete all comics and series. 
        # Note: cascaded deletions (progress, bookmarks) happen if foreign keys are enabled.
        # SQLite foreign keys are disabled by default in some connections unless PRAGMA foreign_keys = ON is run.
        # But we want to wipe anyway.
        conn.execute("PRAGMA foreign_keys = ON") 
        conn.execute("DELETE FROM comics")
        conn.execute("DELETE FROM series")
        conn.commit()
        print("Library cleared.")
    except Exception as e:
        print(f"Error clearing library: {e}")
    finally:
        conn.close()
    
    scan_library_task()
