import os
import re

def is_cbr_or_cbz(filename: str) -> bool:
    return filename.lower().endswith(('.cbz', '.cbr'))

def get_file_size_str(size_bytes: int) -> str:
    for unit in ['B', 'KB', 'MB', 'GB']:
        if size_bytes < 1024.0:
            return f"{size_bytes:.1f} {unit}"
        size_bytes /= 1024.0
    return f"{size_bytes:.1f} TB"

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
    import json
    from logger import logger
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"Error parsing {filepath}: {e}")
        return {}
