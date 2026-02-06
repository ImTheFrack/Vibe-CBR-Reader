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
VIBE_ENV = os.environ.get("VIBE_ENV", "development").lower()

# In production, VIBE_SECRET_KEY MUST be set to a strong random value
_secret_key = os.environ.get("VIBE_SECRET_KEY")

# Production guard: refuse to start without a proper SECRET_KEY
if VIBE_ENV == "production":
    if not _secret_key or (isinstance(_secret_key, str) and _secret_key.strip() in ("", "default", "changeme", "secret")):
        raise RuntimeError(
            "FATAL: Running in production mode but VIBE_SECRET_KEY is not set or is using a weak default value.\n"
            "Set a strong random secret key:\n"
            "  export VIBE_SECRET_KEY=$(python -c 'import secrets; print(secrets.token_urlsafe(32))')\n"
            "Then restart the application."
        )
elif not _secret_key:
    # In development, generate a temporary random secret on startup if none is provided
    _secret_key = secrets.token_urlsafe(32)

SECRET_KEY = _secret_key

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

