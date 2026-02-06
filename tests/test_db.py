import pytest
import sqlite3
from db.comics import delete_comics_by_ids
from db.series import create_or_update_series, get_series_by_name, search_series, add_rating, get_series_rating
from db.progress import (
    update_reading_progress, get_reading_progress,
    add_bookmark, get_bookmarks, remove_bookmark,
    get_user_preferences, update_user_preferences
)
from db.users import create_user


def check_fts5_available():
    """Check if FTS5 is available in this SQLite build"""
    try:
        conn = sqlite3.connect(":memory:")
        conn.execute("CREATE VIRTUAL TABLE test_fts USING fts5(content)")
        conn.close()
        return True
    except sqlite3.OperationalError:
        return False


def test_init_db_creates_all_tables(test_db):
    """Verify that init_db creates all required tables (9+ tables)"""
    tables = test_db.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    ).fetchall()
    table_names = [t[0] for t in tables]
    
    expected_tables = [
        'comics', 'users', 'sessions', 'reading_progress', 'user_preferences',
        'bookmarks', 'series', 'scan_jobs', 'ratings'
    ]
    
    for table in expected_tables:
        assert table in table_names, f"Table {table} not found in database"
    
    assert len(table_names) >= 9, f"Expected at least 9 tables, found {len(table_names)}: {table_names}"


def test_create_comic_and_retrieve(test_db):
    """Test creating a comic and retrieving it"""
    test_db.execute('''
        INSERT INTO comics (id, path, title, series, category, filename, pages, processed)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ''', ('comic-001', '/library/test/comic.cbz', 'Test Comic', 'Test Series', 'Manga', 'comic.cbz', 150, 1))
    test_db.commit()
    
    comic = test_db.execute('SELECT * FROM comics WHERE id = ?', ('comic-001',)).fetchone()
    
    assert comic is not None
    assert comic['id'] == 'comic-001'
    assert comic['title'] == 'Test Comic'
    assert comic['series'] == 'Test Series'
    assert comic['pages'] == 150
    assert comic['processed'] == 1


def test_delete_comics_by_ids(test_db):
    """Test batch deletion of comics"""
    comics = [
        ('comic-101', '/path/comic1.cbz', 'Comic 1'),
        ('comic-102', '/path/comic2.cbz', 'Comic 2'),
        ('comic-103', '/path/comic3.cbz', 'Comic 3'),
    ]
    
    for comic_id, path, title in comics:
        test_db.execute(
            'INSERT INTO comics (id, path, title) VALUES (?, ?, ?)',
            (comic_id, path, title)
        )
    test_db.commit()
    
    count_before = test_db.execute('SELECT COUNT(*) FROM comics').fetchone()[0]
    assert count_before == 3
    
    delete_comics_by_ids(['comic-101', 'comic-103'], conn=test_db)
    test_db.commit()
    
    count_after = test_db.execute('SELECT COUNT(*) FROM comics').fetchone()[0]
    assert count_after == 1
    
    remaining = test_db.execute('SELECT id FROM comics').fetchone()
    assert remaining['id'] == 'comic-102'


def test_create_series_with_metadata(test_db):
    """Test creating a series with all metadata fields"""
    metadata = {
        'title': 'My Hero Academia',
        'title_english': 'My Hero Academia',
        'title_japanese': ['僕のヒーローアカデミア'],
        'synonyms': ['Boku no Hero Academia', 'MHA'],
        'authors': ['Kohei Horikoshi'],
        'synopsis': 'A story about heroes and quirks in a world where superpowers are common.',
        'genres': ['Action', 'Shounen', 'Super Power'],
        'tags': ['School Life', 'Superpowers'],
        'demographics': ['Shounen'],
        'status': 'Publishing',
        'total_volumes': 39,
        'total_chapters': 420,
        'release_year': 2014,
        'mal_id': 75989,
        'anilist_id': 85486
    }
    
    series_id = create_or_update_series(
        'my-hero-academia',
        metadata=metadata,
        category='Manga',
        subcategory='Shounen',
        cover_comic_id='comic-mha-01',
        conn=test_db
    )
    test_db.commit()
    
    assert series_id is not None
    
    series = test_db.execute('SELECT * FROM series WHERE name = ?', ('my-hero-academia',)).fetchone()
    assert series is not None
    assert series['title'] == 'My Hero Academia'
    assert series['synopsis'] == metadata['synopsis']
    assert series['status'] == 'Publishing'
    assert series['total_volumes'] == 39
    assert series['total_chapters'] == 420
    assert series['release_year'] == 2014
    assert series['mal_id'] == 75989
    assert series['anilist_id'] == 85486
    assert series['cover_comic_id'] == 'comic-mha-01'
    assert series['category'] == 'Manga'
    assert series['subcategory'] == 'Shounen'


@pytest.mark.skipif(
    not check_fts5_available(),
    reason="FTS5 not available in this SQLite build"
)
def test_fts5_search_finds_by_synopsis(test_db):
    """Test FTS5 full-text search functionality"""
    metadata = {
        'title': 'One Piece',
        'title_english': 'One Piece',
        'authors': ['Eiichiro Oda'],
        'synopsis': 'A young pirate named Monkey D. Luffy searches for the legendary treasure One Piece to become the Pirate King.'
    }
    
    series_id = create_or_update_series('one-piece', metadata=metadata, conn=test_db)
    test_db.commit()
    
    results = test_db.execute('''
        SELECT s.*, rank
        FROM series_fts f
        JOIN series s ON s.id = f.rowid
        WHERE series_fts MATCH ?
        ORDER BY rank
        LIMIT 10
    ''', ('"pirate"* "treasure"*',)).fetchall()
    
    assert len(results) > 0, "FTS5 search should find the series"
    assert results[0]['name'] == 'one-piece'


def test_reading_progress_upsert(test_db):
    """Test creating and updating reading progress"""
    user_id = create_user('progressuser', 'password123', 'progress@test.com', 'reader')
    
    test_db.execute(
        'INSERT INTO comics (id, path, title, pages) VALUES (?, ?, ?, ?)',
        ('comic-progress', '/path/comic.cbz', 'Progress Comic', 100)
    )
    test_db.commit()
    
    test_db.execute('''
        INSERT INTO reading_progress 
        (user_id, comic_id, current_page, total_pages, completed, reader_display, reader_direction, reader_zoom, seconds_read)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (user_id, 'comic-progress', 10, 100, 0, 'single', 'ltr', 'fit', 300))
    test_db.commit()
    
    progress = test_db.execute(
        'SELECT * FROM reading_progress WHERE user_id = ? AND comic_id = ?',
        (user_id, 'comic-progress')
    ).fetchone()
    assert progress is not None
    assert progress['current_page'] == 10
    assert progress['total_pages'] == 100
    assert progress['completed'] == 0
    assert progress['reader_display'] == 'single'
    assert progress['reader_direction'] == 'ltr'
    assert progress['reader_zoom'] == 'fit'
    assert progress['seconds_read'] == 300
    
    test_db.execute('''
        UPDATE reading_progress 
        SET current_page = ?, seconds_read = seconds_read + ?, last_read = CURRENT_TIMESTAMP
        WHERE user_id = ? AND comic_id = ?
    ''', (50, 600, user_id, 'comic-progress'))
    test_db.commit()
    
    progress_updated = test_db.execute(
        'SELECT * FROM reading_progress WHERE user_id = ? AND comic_id = ?',
        (user_id, 'comic-progress')
    ).fetchone()
    assert progress_updated['current_page'] == 50
    assert progress_updated['seconds_read'] == 900


def test_bookmarks_crud(test_db):
    """Test bookmark create, read, and delete operations"""
    user_id = create_user('bookmarkuser', 'password123', 'bookmark@test.com', 'reader')
    
    test_db.execute(
        'INSERT INTO comics (id, path, title, pages) VALUES (?, ?, ?, ?)',
        ('comic-bookmark', '/path/comic.cbz', 'Bookmark Comic', 200)
    )
    test_db.commit()
    
    test_db.execute(
        'INSERT INTO bookmarks (user_id, comic_id, page_number, note) VALUES (?, ?, ?, ?)',
        (user_id, 'comic-bookmark', 25, 'Interesting scene')
    )
    test_db.execute(
        'INSERT INTO bookmarks (user_id, comic_id, page_number, note) VALUES (?, ?, ?, ?)',
        (user_id, 'comic-bookmark', 75, 'Plot twist')
    )
    test_db.execute(
        'INSERT INTO bookmarks (user_id, comic_id, page_number, note) VALUES (?, ?, ?, ?)',
        (user_id, 'comic-bookmark', 150, None)
    )
    test_db.commit()
    
    try:
        test_db.execute(
            'INSERT INTO bookmarks (user_id, comic_id, page_number, note) VALUES (?, ?, ?, ?)',
            (user_id, 'comic-bookmark', 25, 'Duplicate')
        )
        test_db.commit()
        assert False, "Duplicate bookmark should have failed"
    except sqlite3.IntegrityError:
        pass
    
    bookmarks = test_db.execute(
        'SELECT * FROM bookmarks WHERE user_id = ? AND comic_id = ? ORDER BY page_number',
        (user_id, 'comic-bookmark')
    ).fetchall()
    assert len(bookmarks) == 3
    assert bookmarks[0]['page_number'] == 25
    assert bookmarks[0]['note'] == 'Interesting scene'
    assert bookmarks[1]['page_number'] == 75
    assert bookmarks[2]['page_number'] == 150
    assert bookmarks[2]['note'] is None
    
    test_db.execute(
        'DELETE FROM bookmarks WHERE user_id = ? AND comic_id = ? AND page_number = ?',
        (user_id, 'comic-bookmark', 75)
    )
    test_db.commit()
    
    bookmarks_after = test_db.execute(
        'SELECT * FROM bookmarks WHERE user_id = ? AND comic_id = ?',
        (user_id, 'comic-bookmark')
    ).fetchall()
    assert len(bookmarks_after) == 2
    assert all(b['page_number'] != 75 for b in bookmarks_after)


def test_user_preferences_defaults(test_db):
    """Test user preferences initialization with defaults"""
    user_id = create_user('prefsuser', 'password123', 'prefs@test.com', 'reader')
    
    prefs = test_db.execute('SELECT * FROM user_preferences WHERE user_id = ?', (user_id,)).fetchone()
    
    assert prefs is not None
    assert prefs['theme'] == 'dark'
    assert prefs['ereader'] == 0
    assert prefs['default_view_mode'] == 'grid'
    assert prefs['default_nav_mode'] == 'hierarchy'
    assert prefs['default_sort_by'] == 'alpha-asc'
    assert prefs['reader_direction'] == 'ltr'
    assert prefs['reader_display'] == 'single'
    assert prefs['reader_zoom'] == 'fit'
    assert prefs['title_card_style'] == 'fan'
    assert prefs['brightness'] == 1.0
    assert prefs['contrast'] == 1.0
    assert prefs['saturation'] == 1.0
    assert prefs['invert'] == 0.0
    assert prefs['tone_value'] == 0.0
    assert prefs['tone_mode'] == 'sepia'
    assert prefs['auto_advance_interval'] == 10
    
    test_db.execute('''
        UPDATE user_preferences 
        SET theme = ?, reader_direction = ?, brightness = ?, contrast = ?, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ?
    ''', ('light', 'rtl', 1.2, 0.9, user_id))
    test_db.commit()
    
    prefs_updated = test_db.execute('SELECT * FROM user_preferences WHERE user_id = ?', (user_id,)).fetchone()
    assert prefs_updated['theme'] == 'light'
    assert prefs_updated['reader_direction'] == 'rtl'
    assert prefs_updated['brightness'] == 1.2
    assert prefs_updated['contrast'] == 0.9
    assert prefs_updated['saturation'] == 1.0
