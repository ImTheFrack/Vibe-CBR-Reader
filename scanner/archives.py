import os
import zipfile
import rarfile
from typing import Union, Dict, List, Any, Optional, Tuple
from io import BytesIO
from PIL import Image
from config import IMG_EXTENSIONS, get_thumbnail_path
from .utils import natural_sort_key
from logger import logger

def save_thumbnail(f_img: Any, comic_id: str, item_name: str, settings: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Helper to process and save thumbnail. Returns dict with success, ext, size, saved, error."""
    result = {'success': False, 'ext': None, 'size': 0, 'saved': 0, 'error': None}
    try:
        from io import BytesIO
        
        # Default settings
        quality = 70
        width = 300
        fmt = 'webp'
        
        if settings:
            quality = settings.get('quality', 70)
            width = settings.get('width', 300)
            fmt = settings.get('format', 'webp').lower()

        img = Image.open(f_img)
        img.thumbnail((width, width * 2))
        
        # Convert P/RGBA to RGB for JPEG compatibility (and better WebP compatibility)
        if img.mode in ("RGBA", "P"):
            img = img.convert("RGB")
            
        cache_path_no_ext = get_thumbnail_path(comic_id, ext="").rstrip(".")
        if not cache_path_no_ext:
            result['error'] = "Could not determine cache path"
            return result
            
        if fmt == 'best':
            # Generate both WebP and JPEG, save smaller
            buf_webp = BytesIO()
            img.save(buf_webp, format="WEBP", quality=quality, optimize=True)
            size_webp = buf_webp.tell()
            
            buf_jpg = BytesIO()
            img.save(buf_jpg, format="JPEG", quality=quality, optimize=True)
            size_jpg = buf_jpg.tell()
            
            if size_webp <= size_jpg:
                with open(f"{cache_path_no_ext}.webp", "wb") as f:
                    f.write(buf_webp.getvalue())
                result.update({'success': True, 'ext': 'webp', 'size': size_webp, 'saved': 0})
            else:
                with open(f"{cache_path_no_ext}.jpg", "wb") as f:
                    f.write(buf_jpg.getvalue())
                result.update({'success': True, 'ext': 'jpg', 'size': size_jpg, 'saved': size_webp - size_jpg})
                
        elif fmt == 'png':
            img.save(f"{cache_path_no_ext}.png", format="PNG", optimize=True)
            result['success'] = True
            result['ext'] = 'png'
            result['size'] = os.path.getsize(f"{cache_path_no_ext}.png")
        elif fmt in ('jpg', 'jpeg'):
            img.save(f"{cache_path_no_ext}.jpg", format="JPEG", quality=quality, optimize=True)
            result['success'] = True
            result['ext'] = 'jpg'
            result['size'] = os.path.getsize(f"{cache_path_no_ext}.jpg")
        else:
            img.save(f"{cache_path_no_ext}.webp", format="WEBP", quality=quality, optimize=True)
            result['success'] = True
            result['ext'] = 'webp'
            result['size'] = os.path.getsize(f"{cache_path_no_ext}.webp")
            
        return result
    except Exception as e:
        result['error'] = f"Thumbnail error: {item_name} - {e}"
        logger.error(result['error'])
        return result

def extract_cover_image(filepath: str, comic_id: str, settings: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Opens an archive, finds first image, saves to cache. 
    Returns result dict from save_thumbnail.
    """
    result = {'success': False, 'ext': None, 'size': 0, 'saved': 0, 'error': None}
    try:
        file_ext = os.path.splitext(filepath)[1].lower()

        if file_ext == '.cbz':
            with zipfile.ZipFile(filepath, 'r') as z:
                names = sorted([n for n in z.namelist() if n.lower().endswith(IMG_EXTENSIONS)], key=natural_sort_key)
                if names:
                    with z.open(names[0]) as f_img:
                        return save_thumbnail(f_img, comic_id, names[0], settings)
                result['error'] = "No images found in archive"
                return result
        elif file_ext == '.cbr':
            try:
                with rarfile.RarFile(filepath) as r:
                    names = sorted([n for n in r.namelist() if n.lower().endswith(IMG_EXTENSIONS)], key=natural_sort_key)
                    if names:
                        with r.open(names[0]) as f_img:
                            return save_thumbnail(f_img, comic_id, names[0], settings)
                    result['error'] = "No images found in archive"
                    return result
            except Exception as e:
                logger.error(f"Error reading RAR file {filepath}: {e}")
                result['error'] = str(e)
                return result
        
        result['error'] = f"Unsupported archive format: {file_ext}"
        return result

    except Exception as e:
        logger.error(f"Error processing {filepath}: {e}")
        result['error'] = str(e)
        return result

def _process_single_comic(comic_id: str, filepath: str, settings: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Process a single comic archive. Thread-safe — no database access.
    """
    result: Dict[str, Any] = {
        'comic_id': comic_id,
        'filepath': filepath,
        'filename': os.path.basename(filepath),
        'pages': 0,
        'has_thumb': False,
        'thumbnail_ext': None,
        'thumb_size': 0,
        'thumb_saved': 0,
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
                        thumb_result = save_thumbnail(f_img, comic_id, img_names[0], settings)
                        if thumb_result['success']:
                            result['has_thumb'] = True
                            result['thumbnail_ext'] = thumb_result['ext']
                            result['thumb_size'] = thumb_result['size']
                            result['thumb_saved'] = thumb_result['saved']
                        else:
                            result['errors'].append(thumb_result['error'])
                            
        elif file_ext == '.cbr':
            with rarfile.RarFile(filepath) as r:
                img_names = [n for n in r.namelist() if n.lower().endswith(IMG_EXTENSIONS)]
                result['pages'] = len(img_names)
                if img_names:
                    img_names.sort(key=natural_sort_key)
                    with r.open(img_names[0]) as f_img:
                        thumb_result = save_thumbnail(f_img, comic_id, img_names[0], settings)
                        if thumb_result['success']:
                            result['has_thumb'] = True
                            result['thumbnail_ext'] = thumb_result['ext']
                            result['thumb_size'] = thumb_result['size']
                            result['thumb_saved'] = thumb_result['saved']
                        else:
                            result['errors'].append(thumb_result['error'])
    except Exception as e:
        result['errors'].append(f"Error processing {filepath}: {e}")
        logger.error(f"Error processing {filepath}: {e}")
    
    return result
