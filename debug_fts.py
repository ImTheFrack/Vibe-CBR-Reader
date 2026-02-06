import sqlite3
import os

DB_PATH = "comics.db"

def test_fts():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    
    print("--- POST-REBUILD MATCHES FOR 'tendou' ---")
    
    try:
        rows = conn.execute('''
            SELECT s.name, s.title, rank
            FROM series_fts f
            JOIN series s ON s.id = f.rowid
            WHERE series_fts MATCH 'tendou'
            ORDER BY rank
        ''').fetchall()
        for row in rows:
            print(f"Match: {row['name']}")
    except Exception as e:
        print(f"Error: {e}")

    conn.close()

if __name__ == "__main__":
    test_fts()
