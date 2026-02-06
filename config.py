import os
import secrets
import logging
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# --- CONFIGURATION ---
# Use environment variables with defaults
COMICS_DIR = os.environ.get("VIBE_COMICS_DIR", "O:/ArrData/media/comics/manga")
BASE_CACHE_DIR = os.environ.get("VIBE_CACHE_DIR", "./cache")
DB_PATH = os.environ.get("VIBE_DB_PATH", "comics.db")

# Logging
LOG_LEVEL_STR = os.environ.get("VIBE_LOG_LEVEL", "INFO").upper()
LOG_LEVEL = getattr(logging, LOG_LEVEL_STR, logging.INFO)

# Security
# In production, this SHOULD be set. If not, we generate a random one for this session.
SECRET_KEY = os.environ.get("VIBE_SECRET_KEY")
if not SECRET_KEY:
    # Generate a temporary random secret on startup if none is provided
    SECRET_KEY = secrets.token_urlsafe(32)
    # We don't print the key for security, but we can log that it's temporary
    # print("Warning: VIBE_SECRET_KEY not set. Using a temporary random key.")

# Supported Image Extensions
IMG_EXTENSIONS = ('.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.jxl')

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
    return os.path.join(thumb_dir, f"{comic_id}.webp")

# Ensure base cache directory exists
os.makedirs(BASE_CACHE_DIR, exist_ok=True)

