import os

# --- CONFIGURATION ---
COMICS_DIR = "O:/ArrData/media/comics/manga"
#COMICS_DIR = "/mnt/o/arrdata/media/comics/manga"
BASE_CACHE_DIR = "./cache"
DB_PATH = "comics.db"

# Supported Image Extensions
IMG_EXTENSIONS = ('.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp')

def get_thumbnail_path(comic_id: str):
    """
    Returns the full path for a thumbnail, including a subdirectory based on the
    first character of the comic_id to distribute files.
    e.g., ./cache/a/abcdef12345.jpg
    """
    if not comic_id:
        return None
    first_char = comic_id[0]
    thumb_dir = os.path.join(BASE_CACHE_DIR, first_char)
    os.makedirs(thumb_dir, exist_ok=True) # Ensure the subdirectory exists
    return os.path.join(thumb_dir, f"{comic_id}.jpg")

# Ensure base cache directory exists
os.makedirs(BASE_CACHE_DIR, exist_ok=True)

