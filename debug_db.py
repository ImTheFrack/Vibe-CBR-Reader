import sqlite3
import json
import os

# Database Path
DB_PATH = "comics.db" 

def inspect_db():
    if not os.path.exists(DB_PATH):
        print(f"Error: {DB_PATH} not found")
        return

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    
    print("--- RANMA SEARCH ---")
    rows = conn.execute("SELECT name, title, synopsis FROM series WHERE name LIKE '%Ranma%' OR title LIKE '%Ranma%'").fetchall()
    if not rows:
        print("No series found matching 'Ranma'")
    for row in rows:
        print(f"Name: {row['name']}")
        print(f"Title: {row['title']}")
        syn = row['synopsis'] or ""
        print(f"Synopsis Snippet: {syn[:150]}...")
        print(f"Contains 'tendou' (case-insensitive): {'tendou' in syn.lower()}")
        print("-" * 20)
        
    print("\n--- FTS5 SEARCH FOR 'tendou' ---")
    try:
        fts_rows = conn.execute('''
            SELECT s.name, s.title, rank
            FROM series_fts f
            JOIN series s ON s.id = f.rowid
            WHERE series_fts MATCH '"tendou"*'
            ORDER BY rank
        ''').fetchall()
        if not fts_rows:
            print("No FTS5 results for 'tendou'")
        for row in fts_rows:
            print(f"Match: {row['name']} (Rank: {row['rank']})")
    except Exception as e:
        print(f"FTS5 Error: {e}")
        
    print("\n--- LIKE SEARCH FOR 'tendou' ---")
    like_rows = conn.execute("SELECT name FROM series WHERE (synopsis LIKE '%tendou%' OR title LIKE '%tendou%' OR name LIKE '%tendou%')").fetchall()
    if not like_rows:
        print("No LIKE results for 'tendou'")
    for row in like_rows:
        print(f"Like Match: {row['name']}")

    # Check if FTS table is populated
    count = conn.execute("SELECT COUNT(*) FROM series_fts").fetchone()[0]
    s_count = conn.execute("SELECT COUNT(*) FROM series").fetchone()[0]
    print(f"\n--- POPULATION ---")
    print(f"Series count: {s_count}")
    print(f"FTS5 count: {count}")

    conn.close()

if __name__ == "__main__":
    inspect_db()