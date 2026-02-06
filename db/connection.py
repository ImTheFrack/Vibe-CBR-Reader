import sqlite3
import os
from datetime import datetime
from config import DB_PATH

def get_db_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    # Ensure WAL mode is active for this connection
    conn.execute('PRAGMA journal_mode=WAL')
    return conn

def init_db() -> None:
    conn = get_db_connection()
    
    # Enable WAL mode for better concurrency
    conn.execute('PRAGMA journal_mode=WAL')
    
    # Main comics table
    conn.execute('''
        CREATE TABLE IF NOT EXISTS comics (
            id TEXT PRIMARY KEY,
            path TEXT UNIQUE,
            title TEXT,
            series TEXT,
            category TEXT,
            filename TEXT,
            size_str TEXT,
            size_bytes INTEGER,
            mtime INTEGER,
            pages INTEGER,
            processed BOOLEAN DEFAULT 0,
            volume REAL,
            chapter REAL
        )
    ''')
    
    # Add new columns to comics table if they don't exist
    # Column names are hardcoded (not user input) - safe from SQL injection
    for col, col_type in [('size_bytes', 'INTEGER'), ('mtime', 'INTEGER')]:
        try:
            conn.execute(f'ALTER TABLE comics ADD COLUMN {col} {col_type}')
        except sqlite3.OperationalError:
            pass  # Column already exists
    
    # Users table
    conn.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            email TEXT,
            role TEXT DEFAULT 'reader' CHECK(role IN ('admin', 'reader')),
            must_change_password BOOLEAN DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_login TIMESTAMP
        )
    ''')
    
    # Add must_change_password column to users table if it doesn't exist
    try:
        conn.execute('ALTER TABLE users ADD COLUMN must_change_password BOOLEAN DEFAULT 0')
    except sqlite3.OperationalError:
        pass  # Column already exists
    
    # Reading progress table (per-user, per-comic)
    conn.execute('''
        CREATE TABLE IF NOT EXISTS reading_progress (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            comic_id TEXT NOT NULL,
            current_page INTEGER DEFAULT 0,
            total_pages INTEGER,
            completed BOOLEAN DEFAULT 0,
            last_read TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            reader_display TEXT,
            reader_direction TEXT,
            reader_zoom TEXT,
            seconds_read INTEGER DEFAULT 0,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (comic_id) REFERENCES comics(id) ON DELETE CASCADE,
            UNIQUE(user_id, comic_id)
        )
    ''')
    
    # Add new columns to reading_progress table if they don't exist
    # Column names are hardcoded (not user input) - safe from SQL injection
    for col, col_type, default in [
        ('reader_display', 'TEXT', None),
        ('reader_direction', 'TEXT', None),
        ('reader_zoom', 'TEXT', None),
        ('seconds_read', 'INTEGER', '0')
    ]:
        try:
            default_clause = f" DEFAULT {default}" if default is not None else ""
            conn.execute(f'ALTER TABLE reading_progress ADD COLUMN {col} {col_type}{default_clause}')
        except sqlite3.OperationalError:
            pass  # Column already exists
    
    # User preferences table
    conn.execute('''
        CREATE TABLE IF NOT EXISTS user_preferences (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER UNIQUE NOT NULL,
            theme TEXT DEFAULT 'dark' CHECK(theme IN ('dark', 'light')),
            ereader BOOLEAN DEFAULT 0,
            default_view_mode TEXT DEFAULT 'grid' CHECK(default_view_mode IN ('grid', 'list', 'detailed')),
            default_nav_mode TEXT DEFAULT 'hierarchy' CHECK(default_nav_mode IN ('hierarchy', 'flat')),
            default_sort_by TEXT DEFAULT 'alpha-asc',
            reader_direction TEXT DEFAULT 'ltr' CHECK(reader_direction IN ('ltr', 'rtl')),
            reader_display TEXT DEFAULT 'single' CHECK(reader_display IN ('single', 'double', 'long')),
            reader_zoom TEXT DEFAULT 'fit' CHECK(reader_zoom IN ('fit', 'width', 'height')),
            title_card_style TEXT DEFAULT 'fan' CHECK(title_card_style IN ('fan', 'single')),
            brightness REAL DEFAULT 1.0,
            contrast REAL DEFAULT 1.0,
            saturation REAL DEFAULT 1.0,
            invert REAL DEFAULT 0.0,
            tone_value REAL DEFAULT 0.0,
            tone_mode TEXT DEFAULT 'sepia',
            auto_advance_interval INTEGER DEFAULT 10,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    ''')
    
    # Add title_card_style column if not exists
    try:
        conn.execute("ALTER TABLE user_preferences ADD COLUMN title_card_style TEXT DEFAULT 'fan' CHECK(title_card_style IN ('fan', 'single'))")
    except sqlite3.OperationalError:
        pass

    # Add ereader column if not exists
    try:
        conn.execute("ALTER TABLE user_preferences ADD COLUMN ereader BOOLEAN DEFAULT 0")
    except sqlite3.OperationalError:
        pass

    # Add visual filter columns to user_preferences
    # Column names are hardcoded (not user input) - safe from SQL injection
    filter_cols = [
        ('brightness', 'REAL DEFAULT 1.0'),
        ('contrast', 'REAL DEFAULT 1.0'),
        ('saturation', 'REAL DEFAULT 1.0'),
        ('invert', 'REAL DEFAULT 0.0'),
        ('tone_value', 'REAL DEFAULT 0.0'),
        ('tone_mode', "TEXT DEFAULT 'sepia'"),
        ('auto_advance_interval', 'INTEGER DEFAULT 10')
    ]
    for col, col_def in filter_cols:
        try:
            conn.execute(f'ALTER TABLE user_preferences ADD COLUMN {col} {col_def}')
        except sqlite3.OperationalError:
            pass
    
    # Sessions table for token-based auth
    conn.execute('''
        CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            token TEXT UNIQUE NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            expires_at TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    ''')
    
    # Bookmarks table (per-user, per-comic, per-page)
    conn.execute('''
        CREATE TABLE IF NOT EXISTS bookmarks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            comic_id TEXT NOT NULL,
            page_number INTEGER NOT NULL,
            note TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (comic_id) REFERENCES comics(id) ON DELETE CASCADE,
            UNIQUE(user_id, comic_id, page_number)
        )
    ''')
    
    # Series metadata table
    conn.execute('''
        CREATE TABLE IF NOT EXISTS series (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            title TEXT,
            title_english TEXT,
            title_japanese TEXT,
            synonyms TEXT,
            authors TEXT,
            synopsis TEXT,
            genres TEXT,
            tags TEXT,
            demographics TEXT,
            status TEXT,
            total_volumes INTEGER,
            total_chapters INTEGER,
            release_year INTEGER,
            mal_id INTEGER,
            anilist_id INTEGER,
            cover_comic_id TEXT,
            category TEXT,
            subcategory TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Add series_id to comics table if not exists
    try:
        conn.execute('ALTER TABLE comics ADD COLUMN series_id INTEGER REFERENCES series(id) ON DELETE SET NULL')
    except sqlite3.OperationalError:
        pass  # Column already exists
    
    # Add has_thumbnail column to comics table if not exists
    try:
        conn.execute('ALTER TABLE comics ADD COLUMN has_thumbnail BOOLEAN DEFAULT 0')
    except sqlite3.OperationalError:
        pass  # Column already exists
    
    # Scan jobs table for tracking library scans
    conn.execute('''
        CREATE TABLE IF NOT EXISTS scan_jobs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            completed_at TIMESTAMP,
            status TEXT DEFAULT 'running' CHECK(status IN ('running', 'completed', 'failed')),
            total_comics INTEGER DEFAULT 0,
            processed_comics INTEGER DEFAULT 0,
            current_file TEXT,
            phase TEXT,
            new_comics INTEGER DEFAULT 0,
            deleted_comics INTEGER DEFAULT 0,
            changed_comics INTEGER DEFAULT 0,
            processed_pages INTEGER DEFAULT 0,
            page_errors INTEGER DEFAULT 0,
            processed_thumbnails INTEGER DEFAULT 0,
            thumbnail_errors INTEGER DEFAULT 0,
            errors TEXT,
            scan_type TEXT DEFAULT 'fast'
        )
    ''')
    
    # Add columns if not exists
    metric_cols = [
        ('current_file', 'TEXT'), ('phase', 'TEXT'),
        ('new_comics', 'INTEGER'), ('deleted_comics', 'INTEGER'), ('changed_comics', 'INTEGER'),
        ('processed_pages', 'INTEGER'), ('page_errors', 'INTEGER'),
        ('processed_thumbnails', 'INTEGER'), ('thumbnail_errors', 'INTEGER')
    ]
    for col, col_type in metric_cols:
        try:
            conn.execute(f'ALTER TABLE scan_jobs ADD COLUMN {col} {col_type} DEFAULT 0')
        except sqlite3.OperationalError:
            pass
    
    # Index on scan_jobs.status for fast polling queries
    conn.execute('CREATE INDEX IF NOT EXISTS idx_scan_jobs_status ON scan_jobs(status)')
    
    # Index on comics.series_id for faster joins in tags view
    conn.execute('CREATE INDEX IF NOT EXISTS idx_comics_series_id ON comics(series_id)')
    
    # Index on comics.processed for fast Phase 2 pending queries
    conn.execute('CREATE INDEX IF NOT EXISTS idx_comics_processed ON comics(processed)')
    
    # FTS5 table for series search (Deep metadata search)
    try:
        conn.execute('''
            CREATE VIRTUAL TABLE IF NOT EXISTS series_fts USING fts5(
                name, title, title_english, synonyms, authors, synopsis,
                content='series',
                content_rowid='id'
            )
        ''')
        
        # Triggers to keep FTS index in sync with series table
        conn.execute('''
            CREATE TRIGGER IF NOT EXISTS series_ai AFTER INSERT ON series BEGIN
                INSERT INTO series_fts(rowid, name, title, title_english, synonyms, authors, synopsis)
                VALUES (new.id, new.name, new.title, new.title_english, new.synonyms, new.authors, new.synopsis);
            END;
        ''')
        conn.execute('''
            CREATE TRIGGER IF NOT EXISTS series_ad AFTER DELETE ON series BEGIN
                INSERT INTO series_fts(series_fts, rowid, name, title, title_english, synonyms, authors, synopsis)
                VALUES('delete', old.id, old.name, old.title, old.title_english, old.synonyms, old.authors, old.synopsis);
            END;
        ''')
        conn.execute('''
            CREATE TRIGGER IF NOT EXISTS series_au AFTER UPDATE ON series BEGIN
                INSERT INTO series_fts(series_fts, rowid, name, title, title_english, synonyms, authors, synopsis)
                VALUES('delete', old.id, old.name, old.title, old.title_english, old.synonyms, old.authors, old.synopsis);
                INSERT INTO series_fts(rowid, name, title, title_english, synonyms, authors, synopsis)
                VALUES (new.id, new.name, new.title, new.title_english, new.synonyms, new.authors, new.synopsis);
            END;
        ''')
        
        # Initial population if empty
        fts_count = conn.execute("SELECT COUNT(*) FROM series_fts").fetchone()[0]
        if fts_count == 0:
            conn.execute('''
                INSERT INTO series_fts(rowid, name, title, title_english, synonyms, authors, synopsis)
                SELECT id, name, title, title_english, synonyms, authors, synopsis FROM series
            ''')
    except sqlite3.OperationalError:
        # FTS5 might not be enabled in all SQLite builds
        pass

    # Migrate data: set has_thumbnail = TRUE for already processed comics
    try:
        conn.execute('UPDATE comics SET has_thumbnail = 1 WHERE processed = 1')
    except sqlite3.OperationalError:
        pass  # Migration already done or column doesn't exist yet
    
    # Ratings table
    conn.execute('''
        CREATE TABLE IF NOT EXISTS ratings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            series_id INTEGER NOT NULL,
            rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (series_id) REFERENCES series(id) ON DELETE CASCADE,
            UNIQUE(user_id, series_id)
        )
    ''')
    
    conn.commit()
    conn.close()
