import sqlite3
import hashlib
import secrets
from datetime import datetime
from config import DB_PATH

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    
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
            pages INTEGER,
            processed BOOLEAN DEFAULT 0,
            volume REAL,
            chapter REAL
        )
    ''')
    
    # Users table
    conn.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            email TEXT,
            role TEXT DEFAULT 'reader' CHECK(role IN ('admin', 'reader')),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_login TIMESTAMP
        )
    ''')
    
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
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (comic_id) REFERENCES comics(id) ON DELETE CASCADE,
            UNIQUE(user_id, comic_id)
        )
    ''')
    
    # User preferences table
    conn.execute('''
        CREATE TABLE IF NOT EXISTS user_preferences (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER UNIQUE NOT NULL,
            theme TEXT DEFAULT 'dark' CHECK(theme IN ('dark', 'light')),
            default_view_mode TEXT DEFAULT 'grid' CHECK(default_view_mode IN ('grid', 'list', 'detailed')),
            default_nav_mode TEXT DEFAULT 'hierarchy' CHECK(default_nav_mode IN ('hierarchy', 'flat')),
            default_sort_by TEXT DEFAULT 'alpha-asc',
            reader_direction TEXT DEFAULT 'ltr' CHECK(reader_direction IN ('ltr', 'rtl')),
            reader_display TEXT DEFAULT 'single' CHECK(reader_display IN ('single', 'double', 'long')),
            reader_zoom TEXT DEFAULT 'fit' CHECK(reader_zoom IN ('fit', 'width', 'height')),
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    ''')
    
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
    
    conn.commit()
    conn.close()

# User management functions
def create_user(username, password, email=None, role='reader'):
    """Create a new user with hashed password"""
    conn = get_db_connection()
    password_hash = hashlib.sha256(password.encode()).hexdigest()
    
    try:
        cursor = conn.execute(
            'INSERT INTO users (username, password_hash, email, role) VALUES (?, ?, ?, ?)',
            (username, password_hash, email, role)
        )
        user_id = cursor.lastrowid
        
        # Create default preferences for the user
        conn.execute(
            'INSERT INTO user_preferences (user_id) VALUES (?)',
            (user_id,)
        )
        
        conn.commit()
        return user_id
    except sqlite3.IntegrityError:
        return None
    finally:
        conn.close()

def authenticate_user(username, password):
    """Authenticate user and return user data if valid"""
    conn = get_db_connection()
    password_hash = hashlib.sha256(password.encode()).hexdigest()
    
    user = conn.execute(
        'SELECT * FROM users WHERE username = ? AND password_hash = ?',
        (username, password_hash)
    ).fetchone()
    
    if user:
        # Update last login
        conn.execute(
            'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?',
            (user['id'],)
        )
        conn.commit()
    
    conn.close()
    return dict(user) if user else None

def create_session(user_id, expires_hours=24):
    """Create a new session token"""
    conn = get_db_connection()
    token = secrets.token_urlsafe(32)
    
    conn.execute(
        '''INSERT INTO sessions (user_id, token, expires_at) 
           VALUES (?, ?, datetime('now', '+{} hours'))'''.format(expires_hours),
        (user_id, token)
    )
    conn.commit()
    conn.close()
    return token

def validate_session(token):
    """Validate session token and return user_id if valid"""
    conn = get_db_connection()
    session = conn.execute(
        '''SELECT user_id FROM sessions 
           WHERE token = ? AND expires_at > datetime('now')''',
        (token,)
    ).fetchone()
    conn.close()
    return session['user_id'] if session else None

def delete_session(token):
    """Delete a session (logout)"""
    conn = get_db_connection()
    conn.execute('DELETE FROM sessions WHERE token = ?', (token,))
    conn.commit()
    conn.close()

# Reading progress functions
def get_reading_progress(user_id, comic_id=None):
    """Get reading progress for a user. If comic_id is None, get all progress."""
    conn = get_db_connection()
    
    if comic_id:
        progress = conn.execute(
            '''SELECT comic_id, current_page, total_pages, completed, last_read 
               FROM reading_progress WHERE user_id = ? AND comic_id = ?''',
            (user_id, comic_id)
        ).fetchone()
        conn.close()
        return dict(progress) if progress else None
    else:
        progress_list = conn.execute(
            '''SELECT comic_id, current_page, total_pages, completed, last_read 
               FROM reading_progress WHERE user_id = ? ORDER BY last_read DESC''',
            (user_id,)
        ).fetchall()
        conn.close()
        return {p['comic_id']: dict(p) for p in progress_list}

def update_reading_progress(user_id, comic_id, current_page, total_pages=None, completed=None):
    """Update or insert reading progress"""
    conn = get_db_connection()
    
    # Check if record exists
    existing = conn.execute(
        'SELECT id FROM reading_progress WHERE user_id = ? AND comic_id = ?',
        (user_id, comic_id)
    ).fetchone()
    
    if existing:
        # Update
        if total_pages is not None and completed is not None:
            conn.execute(
                '''UPDATE reading_progress 
                   SET current_page = ?, total_pages = ?, completed = ?, last_read = CURRENT_TIMESTAMP
                   WHERE user_id = ? AND comic_id = ?''',
                (current_page, total_pages, completed, user_id, comic_id)
            )
        else:
            conn.execute(
                '''UPDATE reading_progress 
                   SET current_page = ?, last_read = CURRENT_TIMESTAMP
                   WHERE user_id = ? AND comic_id = ?''',
                (current_page, user_id, comic_id)
            )
    else:
        # Insert
        conn.execute(
            '''INSERT INTO reading_progress (user_id, comic_id, current_page, total_pages, completed)
               VALUES (?, ?, ?, ?, ?)''',
            (user_id, comic_id, current_page, total_pages or 0, completed or False)
        )
    
    conn.commit()
    conn.close()

# User preferences functions
def get_user_preferences(user_id):
    """Get user preferences"""
    conn = get_db_connection()
    prefs = conn.execute(
        'SELECT * FROM user_preferences WHERE user_id = ?',
        (user_id,)
    ).fetchone()
    conn.close()
    return dict(prefs) if prefs else None

def update_user_preferences(user_id, **kwargs):
    """Update user preferences"""
    allowed_fields = ['theme', 'default_view_mode', 'default_nav_mode', 'default_sort_by', 
                      'reader_direction', 'reader_display', 'reader_zoom']
    
    updates = {k: v for k, v in kwargs.items() if k in allowed_fields}
    if not updates:
        return False
    
    conn = get_db_connection()
    set_clause = ', '.join([f"{k} = ?" for k in updates.keys()])
    values = list(updates.values()) + [user_id]
    
    conn.execute(
        f'''UPDATE user_preferences 
            SET {set_clause}, updated_at = CURRENT_TIMESTAMP 
            WHERE user_id = ?''',
        values
    )
    conn.commit()
    conn.close()
    return True

# Bookmark functions
def get_bookmarks(user_id, comic_id=None):
    """Get bookmarks for a user"""
    conn = get_db_connection()
    
    if comic_id:
        bookmarks = conn.execute(
            '''SELECT comic_id, page_number, note, created_at 
               FROM bookmarks WHERE user_id = ? AND comic_id = ? ORDER BY page_number''',
            (user_id, comic_id)
        ).fetchall()
    else:
        bookmarks = conn.execute(
            '''SELECT comic_id, page_number, note, created_at 
               FROM bookmarks WHERE user_id = ? ORDER BY created_at DESC''',
            (user_id,)
        ).fetchall()
    
    conn.close()
    return [dict(b) for b in bookmarks]

def add_bookmark(user_id, comic_id, page_number, note=None):
    """Add a bookmark"""
    conn = get_db_connection()
    try:
        conn.execute(
            'INSERT INTO bookmarks (user_id, comic_id, page_number, note) VALUES (?, ?, ?, ?)',
            (user_id, comic_id, page_number, note)
        )
        conn.commit()
        return True
    except sqlite3.IntegrityError:
        return False
    finally:
        conn.close()

def remove_bookmark(user_id, comic_id, page_number):
    """Remove a bookmark"""
    conn = get_db_connection()
    conn.execute(
        'DELETE FROM bookmarks WHERE user_id = ? AND comic_id = ? AND page_number = ?',
        (user_id, comic_id, page_number)
    )
    conn.commit()
    conn.close()

# Admin functions
def get_all_users():
    """Get all users (admin only)"""
    conn = get_db_connection()
    users = conn.execute(
        'SELECT id, username, email, role, created_at, last_login FROM users ORDER BY created_at DESC'
    ).fetchall()
    conn.close()
    return [dict(u) for u in users]

def delete_user(user_id):
    """Delete a user and all associated data"""
    conn = get_db_connection()
    conn.execute('DELETE FROM users WHERE id = ?', (user_id,))
    conn.commit()
    conn.close()

def user_exists(username):
    """Check if a username exists"""
    conn = get_db_connection()
    result = conn.execute('SELECT 1 FROM users WHERE username = ?', (username,)).fetchone()
    conn.close()
    return result is not None

# Series metadata functions
def create_or_update_series(name, metadata=None, category=None, subcategory=None, cover_comic_id=None):
    """Create or update a series with metadata from series.json"""
    conn = get_db_connection()
    
    if metadata is None:
        metadata = {}
    
    # Convert lists to JSON strings
    def to_json(val):
        if val is None:
            return None
        if isinstance(val, (list, tuple)):
            import json
            return json.dumps(val)
        return val
    
    # Check if series exists
    existing = conn.execute('SELECT id FROM series WHERE name = ?', (name,)).fetchone()
    
    if existing:
        # Update existing series
        conn.execute('''
            UPDATE series SET
                title = COALESCE(?, title),
                title_english = COALESCE(?, title_english),
                title_japanese = COALESCE(?, title_japanese),
                synonyms = COALESCE(?, synonyms),
                authors = COALESCE(?, authors),
                synopsis = COALESCE(?, synopsis),
                genres = COALESCE(?, genres),
                tags = COALESCE(?, tags),
                demographics = COALESCE(?, demographics),
                status = COALESCE(?, status),
                total_volumes = COALESCE(?, total_volumes),
                total_chapters = COALESCE(?, total_chapters),
                release_year = COALESCE(?, release_year),
                mal_id = COALESCE(?, mal_id),
                anilist_id = COALESCE(?, anilist_id),
                cover_comic_id = COALESCE(?, cover_comic_id),
                category = COALESCE(?, category),
                subcategory = COALESCE(?, subcategory),
                updated_at = CURRENT_TIMESTAMP
            WHERE name = ?
        ''', (
            metadata.get('title'),
            metadata.get('title_english'),
            to_json(metadata.get('title_japanese')),
            to_json(metadata.get('synonyms')),
            to_json(metadata.get('authors')),
            metadata.get('synopsis'),
            to_json(metadata.get('genres')),
            to_json(metadata.get('tags')),
            to_json(metadata.get('demographics')),
            metadata.get('status'),
            metadata.get('total_volumes'),
            metadata.get('total_chapters'),
            metadata.get('release_year'),
            metadata.get('mal_id'),
            metadata.get('anilist_id'),
            cover_comic_id,
            category,
            subcategory,
            name
        ))
        series_id = existing['id']
    else:
        # Insert new series
        cursor = conn.execute('''
            INSERT INTO series (
                name, title, title_english, title_japanese, synonyms, authors,
                synopsis, genres, tags, demographics, status, total_volumes,
                total_chapters, release_year, mal_id, anilist_id, cover_comic_id,
                category, subcategory
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            name,
            metadata.get('title'),
            metadata.get('title_english'),
            to_json(metadata.get('title_japanese')),
            to_json(metadata.get('synonyms')),
            to_json(metadata.get('authors')),
            metadata.get('synopsis'),
            to_json(metadata.get('genres')),
            to_json(metadata.get('tags')),
            to_json(metadata.get('demographics')),
            metadata.get('status'),
            metadata.get('total_volumes'),
            metadata.get('total_chapters'),
            metadata.get('release_year'),
            metadata.get('mal_id'),
            metadata.get('anilist_id'),
            cover_comic_id,
            category,
            subcategory
        ))
        series_id = cursor.lastrowid
    
    conn.commit()
    conn.close()
    return series_id

def get_series_by_name(name):
    """Get series by name"""
    conn = get_db_connection()
    series = conn.execute('SELECT * FROM series WHERE name = ?', (name,)).fetchone()
    conn.close()
    return dict(series) if series else None

def get_series_with_comics(name, user_id=None):
    """Get series with all its comics, optionally including user progress"""
    conn = get_db_connection()
    
    # Get series info
    series = conn.execute('SELECT * FROM series WHERE name = ?', (name,)).fetchone()
    
    # Fallback: if not found, try to find a comic that has this name as a folder component in its path
    # This handles cases where the folder name (used for navigation) differs from the series name (from metadata)
    # e.g., "Title: Subtitle" (DB) vs "Title： Subtitle" (Folder/Windows)
    if not series:
        # Search for a comic where the path contains the name as a folder
        # We look for /name/ or \name\ to ensure it's a full folder name
        comic_link = conn.execute('''
            SELECT series_id FROM comics 
            WHERE path LIKE ? OR path LIKE ? 
            LIMIT 1
        ''', (f'%/{name}/%', f'%\\{name}\\%')).fetchone()
        
        if comic_link and comic_link['series_id']:
            series = conn.execute('SELECT * FROM series WHERE id = ?', (comic_link['series_id'],)).fetchone()
            
    if not series:
        conn.close()
        return None
    
    series_dict = dict(series)
    
    # Parse JSON fields
    import json
    for field in ['synonyms', 'authors', 'genres', 'tags', 'demographics', 'title_japanese']:
        if series_dict.get(field):
            try:
                series_dict[field] = json.loads(series_dict[field])
            except (json.JSONDecodeError, TypeError):
                pass
    
    # Get all comics for this series
    if series_dict.get('id'):
        comics = conn.execute('''
            SELECT c.* FROM comics c
            WHERE c.series_id = ?
            ORDER BY 
                CASE WHEN c.volume IS NULL OR c.volume = 0 THEN 999999 ELSE c.volume END,
                COALESCE(c.chapter, 0), 
                c.filename
        ''', (series_dict['id'],)).fetchall()
    else:
        # Fallback: match by series name
        comics = conn.execute('''
            SELECT * FROM comics
            WHERE series = ?
            ORDER BY 
                CASE WHEN volume IS NULL OR volume = 0 THEN 999999 ELSE volume END,
                COALESCE(chapter, 0), 
                filename
        ''', (name,)).fetchall()
    
    series_dict['comics'] = [dict(c) for c in comics]
    
    # Add user progress if requested
    if user_id and series_dict['comics']:
        for comic in series_dict['comics']:
            progress = conn.execute('''
                SELECT current_page, completed FROM reading_progress
                WHERE user_id = ? AND comic_id = ?
            ''', (user_id, comic['id'])).fetchone()
            if progress:
                comic['user_progress'] = dict(progress)
    
    conn.close()
    return series_dict

def update_comic_series_id(comic_id, series_id):
    """Update the series_id for a comic"""
    conn = get_db_connection()
    conn.execute('UPDATE comics SET series_id = ? WHERE id = ?', (series_id, comic_id))
    conn.commit()
    conn.close()

def get_all_series(category=None, subcategory=None, limit=100, offset=0):
    """Get all series with optional filtering"""
    conn = get_db_connection()
    
    query = 'SELECT * FROM series WHERE 1=1'
    params = []
    
    if category:
        query += ' AND category = ?'
        params.append(category)
    if subcategory:
        query += ' AND subcategory = ?'
        params.append(subcategory)
    
    query += ' ORDER BY name LIMIT ? OFFSET ?'
    params.extend([limit, offset])
    
    series_list = conn.execute(query, params).fetchall()
    conn.close()
    
    result = []
    import json
    for series in series_list:
        s = dict(series)
        for field in ['synonyms', 'authors', 'genres', 'tags', 'demographics', 'title_japanese']:
            if s.get(field):
                try:
                    s[field] = json.loads(s[field])
                except (json.JSONDecodeError, TypeError):
                    pass
        result.append(s)
    
    return result

def get_series_by_tags(selected_tags=None):
    """
    Get series stats filtered by tags/genres.
    selected_tags: list of strings (tags/genres) that MUST be present.
    Returns: {
        'matching_count': int,
        'related_tags': [{'name': str, 'count': int, 'type': 'mixed'}],
        'series': [dict] (summary of matching series)
    }
    """
    if selected_tags is None:
        selected_tags = []
    
    selected_set = set(t.lower() for t in selected_tags)
    
    conn = get_db_connection()
    # Fetch all series with tags/genres
    all_series = conn.execute('''
        SELECT id, name, title, genres, tags, cover_comic_id, total_chapters 
        FROM series
    ''').fetchall()
    
    matching_series = []
    import json
    
    # Tag aggregation
    tag_counts = {}
    
    for row in all_series:
        s_genres = []
        s_tags = []
        
        if row['genres']:
            try:
                s_genres = json.loads(row['genres'])
            except: pass
            
        if row['tags']:
            try:
                s_tags = json.loads(row['tags'])
            except: pass
            
        # Merge and normalize
        # We keep original casing for display, but use lower for matching
        combined_map = {} # lower -> display
        
        for g in (s_genres or []):
            combined_map[g.lower()] = g
        for t in (s_tags or []):
            combined_map[t.lower()] = t
            
        series_tag_set = set(combined_map.keys())
        
        # Check if series has all selected tags
        if selected_set.issubset(series_tag_set):
            # It's a match!
            
            # Add to matching list
            
            # Fetch up to 3 comics for the fan
            fan_comics = conn.execute('''
                SELECT id, volume, chapter, filename 
                FROM comics 
                WHERE series_id = ? 
                ORDER BY 
                    CASE WHEN volume IS NULL OR volume = 0 THEN 999999 ELSE volume END,
                    COALESCE(chapter, 0), 
                    filename
                LIMIT 3
            ''', (row['id'],)).fetchall()
            
            matching_series.append({
                'id': row['id'],
                'name': row['name'],
                'title': row['title'],
                'cover_comic_id': row['cover_comic_id'],
                'count': row['total_chapters'] or 0,
                'comics': [dict(c) for c in fan_comics]
            })
            
            # Aggregate OTHER tags
            for tag_lower, tag_display in combined_map.items():
                if tag_lower not in selected_set:
                    if tag_display not in tag_counts:
                        tag_counts[tag_display] = {'count': 0, 'covers': [], 'series_names': []}
                    
                    tag_counts[tag_display]['count'] += 1
                    # Collect up to 3 covers for the fan
                    if len(tag_counts[tag_display]['covers']) < 3 and row['cover_comic_id']:
                        tag_counts[tag_display]['covers'].append(row['cover_comic_id'])
                    # Collect up to 3 series names for display
                    if len(tag_counts[tag_display]['series_names']) < 3:
                        tag_counts[tag_display]['series_names'].append(row['title'] or row['name'])
                    
    # Format related tags
    related_tags_list = [
        {'name': name, 'count': data['count'], 'covers': data['covers'], 'series_names': data['series_names']} 
        for name, data in tag_counts.items()
    ]
    # Sort by count desc, then name asc
    related_tags_list.sort(key=lambda x: (-x['count'], x['name']))
    
    conn.close()
    return {
        'matching_count': len(matching_series),
        'related_tags': related_tags_list,
        'series': matching_series
    }
