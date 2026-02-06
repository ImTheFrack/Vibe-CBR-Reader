import os
import zipfile
import rarfile
from PIL import Image
from config import IMG_EXTENSIONS, get_thumbnail_path
from .utils import natural_sort_key
from logger import logger

def save_thumbnail(f_img, comic_id, item_name, target_size=300):
    """Helper to process and save thumbnail from an open file handle"""
    try:
        img = Image.open(f_img)
        img.thumbnail((target_size, target_size * 1.5))
        if img.mode in ("RGBA", "P"):
            img = img.convert("RGB")
        cache_path = get_thumbnail_path(comic_id)
        if not cache_path:
            return False
        # Use WebP with 70% quality and optimization for much smaller file sizes
        img.save(cache_path, format="WEBP", quality=70, optimize=True)
        return True
    except Exception as e:
        error_msg = f"Thumbnail error: {item_name} - {e}"
        logger.error(error_msg)
        return error_msg

def extract_cover_image(filepath: str, comic_id: str, target_size: int = 300) -> bool:
    """
    Opens an archive, finds the first image, resizes it to target_size,
    saves it to cache. Returns True if successful.
    """
    try:
        file_ext = os.path.splitext(filepath)[1].lower()
        img = None

        if file_ext == '.cbz':
            with zipfile.ZipFile(filepath, 'r') as z:
                names = sorted([n for n in z.namelist() if n.lower().endswith(IMG_EXTENSIONS)], key=natural_sort_key)
                if names:
                    with z.open(names[0]) as f_img:
                        return save_thumbnail(f_img, comic_id, names[0], target_size)
                return False
        elif file_ext == '.cbr':
            try:
                with rarfile.RarFile(filepath) as r:
                    names = sorted([n for n in r.namelist() if n.lower().endswith(IMG_EXTENSIONS)], key=natural_sort_key)
                    if names:
                        with r.open(names[0]) as f_img:
                            return save_thumbnail(f_img, comic_id, names[0], target_size)
                    return False
            except Exception as e:
                logger.error(f"Error reading RAR file {filepath}: {e}")
                return False
        return False

    except Exception as e:
        logger.error(f"Error processing {filepath}: {e}")
        return False

def _process_single_comic(comic_id, filepath):
    """
    Process a single comic archive. Thread-safe — no database access.
    """
    result = {
        'comic_id': comic_id,
        'filepath': filepath,
        'filename': os.path.basename(filepath),
        'pages': 0,
        'has_thumb': False,
        'errors': [],
        'file_missing': False,
    }
    
    if not os.path.exists(filepath):
        result['errors'].append(f"Comic file not found: {filepath}")
        result['file_missing'] = True
        return result
    
    try:
        file_ext = os.path.splitext(filepath)[1].lower()
        
        if file_ext == '.cbz':
            with zipfile.ZipFile(filepath, 'r') as z:
                img_names = [n for n in z.namelist() if n.lower().endswith(IMG_EXTENSIONS)]
                result['pages'] = len(img_names)
                if img_names:
                    img_names.sort(key=natural_sort_key)
                    with z.open(img_names[0]) as f_img:
                        thumb_result = save_thumbnail(f_img, comic_id, img_names[0])
                        if isinstance(thumb_result, str):
                            result['errors'].append(thumb_result)
                        else:
                            result['has_thumb'] = thumb_result
        elif file_ext == '.cbr':
            with rarfile.RarFile(filepath) as r:
                img_names = [n for n in r.namelist() if n.lower().endswith(IMG_EXTENSIONS)]
                result['pages'] = len(img_names)
                if img_names:
                    img_names.sort(key=natural_sort_key)
                    with r.open(img_names[0]) as f_img:
                        thumb_result = save_thumbnail(f_img, comic_id, img_names[0])
                        if isinstance(thumb_result, str):
                            result['errors'].append(thumb_result)
                        else:
                            result['has_thumb'] = thumb_result
    except Exception as e:
        result['errors'].append(f"Error processing {filepath}: {e}")
        logger.error(f"Error processing {filepath}: {e}")
    
    return result
