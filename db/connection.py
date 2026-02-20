import sqlite3
import os
from datetime import datetime
from config import DB_PATH

# Schema version for migration tracking
SCHEMA_VERSION = 16

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
    
    current_version = conn.execute('PRAGMA user_version').fetchone()[0]
    
    if current_version < 1:
        # Migration 1: Add size_bytes and mtime columns to comics table
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
    
    if current_version < 1:
        # Migration 1: Add must_change_password column to users table
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
    
    if current_version < 1:
        # Migration 1: Add reader settings and time tracking to reading_progress
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
            nsfw_mode TEXT DEFAULT 'off' CHECK(nsfw_mode IN ('off', 'filter', 'blur')),
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    ''')
    
    if current_version < 2:
        # Migration 2: Add title_card_style column to user_preferences
        try:
            conn.execute("ALTER TABLE user_preferences ADD COLUMN title_card_style TEXT DEFAULT 'fan' CHECK(title_card_style IN ('fan', 'single'))")
        except sqlite3.OperationalError:
            pass

    if current_version < 2:
        # Migration 2: Add ereader column to user_preferences
        try:
            conn.execute("ALTER TABLE user_preferences ADD COLUMN ereader BOOLEAN DEFAULT 0")
        except sqlite3.OperationalError:
            pass

    if current_version < 2:
        # Migration 2: Add visual filter columns to user_preferences
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
            is_adult BOOLEAN DEFAULT 0,
            is_nsfw BOOLEAN DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    if current_version < 3:
        # Migration 3: Add series_id to comics table
        try:
            conn.execute('ALTER TABLE comics ADD COLUMN series_id INTEGER REFERENCES series(id) ON DELETE SET NULL')
        except sqlite3.OperationalError:
            pass  # Column already exists
    
    if current_version < 3:
        # Migration 3: Add has_thumbnail column to comics table
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
            status TEXT DEFAULT 'running' CHECK(status IN ('running', 'completed', 'failed', 'cancelled')),
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
            scan_type TEXT DEFAULT 'fast',
            cancel_requested BOOLEAN DEFAULT 0
        )
    ''')
    
    if current_version < 3:
        # Migration 3: Add metric columns to scan_jobs table
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

    if current_version < 3:
        # Migration 3: Migrate data - set has_thumbnail = TRUE for already processed comics
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
    
    # Page annotations table
    conn.execute('''
        CREATE TABLE IF NOT EXISTS page_annotations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            comic_id TEXT NOT NULL,
            page_number INTEGER NOT NULL,
            note TEXT,
            highlight_text TEXT,
            x REAL,
            y REAL,
            width REAL,
            height REAL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (comic_id) REFERENCES comics(id) ON DELETE CASCADE,
            UNIQUE(user_id, comic_id, page_number, x, y)
        )
    ''')
    
    conn.execute('''
        CREATE TABLE IF NOT EXISTS user_lists (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            description TEXT,
            is_public BOOLEAN DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE(user_id, name)
        )
    ''')
    
    conn.execute('''
        CREATE TABLE IF NOT EXISTS user_list_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            list_id INTEGER NOT NULL,
            series_id INTEGER NOT NULL,
            position INTEGER DEFAULT 0,
            added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (list_id) REFERENCES user_lists(id) ON DELETE CASCADE,
            FOREIGN KEY (series_id) REFERENCES series(id) ON DELETE CASCADE,
            UNIQUE(list_id, series_id)
        )
    ''')
    
    conn.execute('''
        CREATE TABLE IF NOT EXISTS ai_recommendation_cache (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            request_hash TEXT NOT NULL,
            recommendations TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            expires_at TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    ''')
    
    if current_version < 4:
        # Migration 4: Create page_annotations table
        conn.execute('''
            CREATE TABLE IF NOT EXISTS page_annotations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                comic_id TEXT NOT NULL,
                page_number INTEGER NOT NULL,
                note TEXT,
                highlight_text TEXT,
                x REAL,
                y REAL,
                width REAL,
                height REAL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (comic_id) REFERENCES comics(id) ON DELETE CASCADE,
                UNIQUE(user_id, comic_id, page_number, x, y)
            )
        ''')
    
    if current_version < 5:
        # Migration 5: Add file_hash column to comics table
        try:
            conn.execute('ALTER TABLE comics ADD COLUMN file_hash TEXT')
        except sqlite3.OperationalError:
            pass  # Column already exists
    
    if current_version < 6:
        # Migration 6: Multi-library support
        try:
            conn.execute('''
                CREATE TABLE IF NOT EXISTS libraries (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT UNIQUE NOT NULL,
                    path TEXT UNIQUE NOT NULL,
                    is_default BOOLEAN DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')
        except sqlite3.OperationalError:
            pass
        
        try:
            conn.execute('ALTER TABLE comics ADD COLUMN library_id INTEGER REFERENCES libraries(id) ON DELETE SET NULL')
        except sqlite3.OperationalError:
            pass
        
        try:
            from config import COMICS_DIR
            conn.execute(
                'INSERT OR IGNORE INTO libraries (name, path, is_default) VALUES (?, ?, ?)',
                ('Default', COMICS_DIR, 1)
             )
            default_lib = conn.execute('SELECT id FROM libraries WHERE is_default = 1').fetchone()
            if default_lib:
                conn.execute('UPDATE comics SET library_id = ? WHERE library_id IS NULL', (default_lib['id'],))
        except:
            pass
    
    if current_version < 7:
        try:
            conn.execute('''
                CREATE TABLE IF NOT EXISTS admin_settings (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    key TEXT UNIQUE NOT NULL,
                    value TEXT NOT NULL
                )
            ''')
        except sqlite3.OperationalError:
            pass
        
        try:
            conn.execute("ALTER TABLE comics ADD COLUMN thumbnail_ext TEXT DEFAULT 'webp'")
        except sqlite3.OperationalError:
            pass
        
        try:
            conn.execute("ALTER TABLE users ADD COLUMN approved BOOLEAN DEFAULT 1")
        except sqlite3.OperationalError:
            pass
        
        default_settings = [
            ('thumb_quality', '70'),
            ('thumb_ratio', '9:14'),
            ('thumb_width', '225'),
            ('thumb_height', '350'),
            ('thumb_format', 'webp'),
            ('require_approval', '0'),
            ('ai_provider', 'openai'),
            ('ai_model', 'gpt-4o-mini'),
            ('ai_api_key', ''),
            ('ai_base_url', ''),
            ('ai_web_search_default', 'false')
        ]
        for key, value in default_settings:
            conn.execute(
                'INSERT OR IGNORE INTO admin_settings (key, value) VALUES (?, ?)',
                (key, value)
            )

    if current_version < 8:
        try:
            conn.execute('ALTER TABLE scan_jobs ADD COLUMN cancel_requested BOOLEAN DEFAULT 0')
        except sqlite3.OperationalError:
            pass
            
    if current_version < 9:
        # Migration 9: Add thumbnail stats to scan_jobs
        for col in ['thumb_bytes_written', 'thumb_bytes_saved']:
            try:
                conn.execute(f'ALTER TABLE scan_jobs ADD COLUMN {col} INTEGER DEFAULT 0')
            except sqlite3.OperationalError:
                pass

    if current_version < 10:
        # Migration 10: Tag blacklist and whitelist
        conn.execute('''
            CREATE TABLE IF NOT EXISTS tag_blacklist (
                tag_norm TEXT PRIMARY KEY
            )
        ''')
        conn.execute('''
            CREATE TABLE IF NOT EXISTS tag_whitelist (
                tag_norm TEXT PRIMARY KEY,
                tag_display TEXT NOT NULL
            )
        ''')

    if current_version < 11:
        # Migration 11: Unified Tag Modifications (Blacklist, Whitelist/Rename, Merge)
        conn.execute('''
            CREATE TABLE IF NOT EXISTS tag_modifications (
                source_norm TEXT PRIMARY KEY,
                action TEXT NOT NULL CHECK(action IN ('blacklist', 'whitelist', 'merge')),
                target_norm TEXT,
                display_name TEXT
            )
        ''')
        
        # Migrate existing data
        try:
            # Blacklist -> tag_modifications
            conn.execute('''
                INSERT OR IGNORE INTO tag_modifications (source_norm, action)
                SELECT tag_norm, 'blacklist' FROM tag_blacklist
            ''')
            # Whitelist -> tag_modifications
            conn.execute('''
                INSERT OR IGNORE INTO tag_modifications (source_norm, action, display_name)
                SELECT tag_norm, 'whitelist', tag_display FROM tag_whitelist
            ''')
            
            # Clean up old tables
            conn.execute("DROP TABLE IF EXISTS tag_blacklist")
            conn.execute("DROP TABLE IF EXISTS tag_whitelist")
        except sqlite3.OperationalError:
            pass # Tables might not exist if fresh install

    if current_version < 12:
        # Migration 12: Add illumination column to series table
        try:
            conn.execute('ALTER TABLE series ADD COLUMN illumination TEXT')
        except sqlite3.OperationalError:
            pass

    if current_version < 13:
        # Migration 13: Add cover_image and banner_image to series table
        for col in ['cover_image', 'banner_image']:
            try:
                conn.execute(f'ALTER TABLE series ADD COLUMN {col} TEXT')
            except sqlite3.OperationalError:
                pass
    
    if current_version < 14:
        # Migration 14: Add ai_web_search_enabled to user_preferences
        try:
            conn.execute('ALTER TABLE user_preferences ADD COLUMN ai_web_search_enabled BOOLEAN DEFAULT 0')
        except sqlite3.OperationalError:
            pass
    
    if current_version < 15:
        # Migration 15: Add NSFW content filtering schema
        # Add columns to series table
        for col, col_type in [('is_adult', 'BOOLEAN DEFAULT 0'), ('is_nsfw', 'BOOLEAN DEFAULT 0')]:
            try:
                conn.execute(f'ALTER TABLE series ADD COLUMN {col} {col_type}')
            except sqlite3.OperationalError:
                pass  # Column already exists
        
        # Add nsfw_mode to user_preferences
        try:
            conn.execute("ALTER TABLE user_preferences ADD COLUMN nsfw_mode TEXT DEFAULT 'off' CHECK(nsfw_mode IN ('off', 'filter', 'blur'))")
        except sqlite3.OperationalError:
            pass  # Column already exists
        
        # Create index on is_nsfw for efficient filtering
        conn.execute('CREATE INDEX IF NOT EXISTS idx_series_is_nsfw ON series(is_nsfw)')
        
        # Insert default NSFW admin settings
        default_nsfw_settings = [
            ('nsfw_categories', '[]'),
            ('nsfw_subcategories', '[]'),
            ('nsfw_tag_patterns', '[]')
        ]
        for key, value in default_nsfw_settings:
            conn.execute(
                'INSERT OR IGNORE INTO admin_settings (key, value) VALUES (?, ?)',
                (key, value)
            )
     
    if current_version < 16:
        try:
            conn.execute('ALTER TABLE series ADD COLUMN nsfw_override INTEGER DEFAULT NULL')
        except sqlite3.OperationalError:
            pass

    if current_version < SCHEMA_VERSION:
        conn.execute(f'PRAGMA user_version = {SCHEMA_VERSION}')
    
    conn.commit()
    conn.close()
