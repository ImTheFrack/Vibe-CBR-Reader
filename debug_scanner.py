import os
import re
import hashlib

# Mock config
COMICS_DIR = "Z:/ArrData/media/comics/manga"

# Normalize as in scanner.py
NORM_COMICS_DIR = os.path.normpath(os.path.abspath(COMICS_DIR))

print(f"DEBUG: COMICS_DIR = {COMICS_DIR}")
print(f"DEBUG: NORM_COMICS_DIR = {NORM_COMICS_DIR}")

# Test file
test_root = r"Z:\ArrData\media\comics\manga\Action, Adventure & Adrenaline\Battle Shonen & Supernatural Powers\Akashic Records of Bastard Magic Instructor"
test_filename = "Akashic Records of Bastard Magic Instructor v01.cbz"

def test_logic(root, filename):
    print(f"\n--- Testing logic for: {root} ---")
    abs_root = os.path.abspath(root)
    print(f"abs_root: {abs_root}")
    
    rel_path = os.path.relpath(abs_root, NORM_COMICS_DIR)
    print(f"rel_path: {rel_path}")
    
    if rel_path == '.':
        path_parts = []
    else:
        path_parts = rel_path.split(os.sep)
    
    print(f"path_parts: {path_parts}")
    
    if not path_parts:
        category = "Uncategorized"
        subcategory = None
    else:
        category = path_parts[0]
        subcategory = path_parts[1] if len(path_parts) > 1 else None
        
    print(f"RESULT: Category='{category}', Subcategory='{subcategory}'")

# Test with various slash combinations
test_logic(test_root, test_filename)
test_logic(test_root.replace("\\", "/"), test_filename)
test_logic("Z:/ArrData/media/comics/manga/Something", "test.cbz")
test_logic("Z:/ArrData/media/comics/manga", "root.cbz")
