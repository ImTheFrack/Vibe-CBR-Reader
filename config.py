import os

# --- CONFIGURATION ---
COMICS_DIR = "C:/comics"
CACHE_DIR = "./cache"
DB_PATH = "comics.db"

# Supported Image Extensions
IMG_EXTENSIONS = ('.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp')

# Ensure cache directory exists
os.makedirs(CACHE_DIR, exist_ok=True)