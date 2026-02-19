import pytest


def test_user_lists_table_exists(test_db):
    """Verify that user_lists table exists with correct schema"""
    # Check table exists
    table = test_db.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='user_lists'"
    ).fetchone()
    assert table is not None, "user_lists table does not exist"
    
    # Check columns exist
    columns = {row[1] for row in test_db.execute("PRAGMA table_info(user_lists)").fetchall()}
    required_columns = {'id', 'user_id', 'name', 'description', 'is_public', 'created_at', 'updated_at'}
    assert required_columns.issubset(columns), f"Missing columns in user_lists: {required_columns - columns}"
    
    # Check unique constraint on (user_id, name)
    indexes = test_db.execute("PRAGMA index_list(user_lists)").fetchall()
    index_cols = set()
    for idx in indexes:
        if idx[2] == 1:  # unique index
            index_info = test_db.execute(f"PRAGMA index_info({idx[1]})").fetchall()
            index_cols = {col[2] for col in index_info}
            break
    assert index_cols == {'user_id', 'name'}, f"Expected unique constraint on (user_id, name), got {index_cols}"
    
    fk = test_db.execute("PRAGMA foreign_key_list(user_lists)").fetchone()
    assert fk is not None, "No foreign key on user_lists"
    assert fk[2] == 'users', f"Foreign key should reference users, got {fk[2]}"
    assert fk[6] == 'CASCADE', f"Foreign key should have ON DELETE CASCADE, got {fk[6]}"


def test_user_list_items_table_exists(test_db):
    """Verify that user_list_items table exists with correct schema"""
    # Check table exists
    table = test_db.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='user_list_items'"
    ).fetchone()
    assert table is not None, "user_list_items table does not exist"
    
    # Check columns exist
    columns = {row[1] for row in test_db.execute("PRAGMA table_info(user_list_items)").fetchall()}
    required_columns = {'id', 'list_id', 'series_id', 'position', 'added_at'}
    assert required_columns.issubset(columns), f"Missing columns in user_list_items: {required_columns - columns}"
    
    # Check unique constraint on (list_id, series_id)
    indexes = test_db.execute("PRAGMA index_list(user_list_items)").fetchall()
    index_cols = set()
    for idx in indexes:
        if idx[2] == 1:  # unique index
            index_info = test_db.execute(f"PRAGMA index_info({idx[1]})").fetchall()
            index_cols = {col[2] for col in index_info}
            break
    assert index_cols == {'list_id', 'series_id'}, f"Expected unique constraint on (list_id, series_id), got {index_cols}"
    
    # Check foreign key to user_lists with CASCADE
    fk = test_db.execute("PRAGMA foreign_key_list(user_list_items)").fetchall()
    fk_dict = {f[3]: f for f in fk}
    assert 'list_id' in fk_dict, "No foreign key for list_id in user_list_items"
    assert fk_dict['list_id'][2] == 'user_lists', f"Foreign key should reference user_lists, got {fk_dict['list_id'][2]}"
    assert fk_dict['list_id'][6] == 'CASCADE', f"Foreign key should have ON DELETE CASCADE, got {fk_dict['list_id'][6]}"
    
    # Check foreign key to series with CASCADE
    assert 'series_id' in fk_dict, "No foreign key for series_id in user_list_items"
    assert fk_dict['series_id'][2] == 'series', f"Foreign key should reference series, got {fk_dict['series_id'][2]}"
    assert fk_dict['series_id'][6] == 'CASCADE', f"Foreign key should have ON DELETE CASCADE, got {fk_dict['series_id'][6]}"


def test_ai_cache_table_exists(test_db):
    """Verify that ai_recommendation_cache table exists with correct schema"""
    # Check table exists
    table = test_db.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='ai_recommendation_cache'"
    ).fetchone()
    assert table is not None, "ai_recommendation_cache table does not exist"
    
    # Check columns exist
    columns = {row[1] for row in test_db.execute("PRAGMA table_info(ai_recommendation_cache)").fetchall()}
    required_columns = {'id', 'user_id', 'request_hash', 'recommendations', 'created_at', 'expires_at'}
    assert required_columns.issubset(columns), f"Missing columns in ai_recommendation_cache: {required_columns - columns}"
    
    # Check foreign key to users with CASCADE
    fk = test_db.execute("PRAGMA foreign_key_list(ai_recommendation_cache)").fetchone()
    assert fk is not None, "No foreign key on ai_recommendation_cache"
    assert fk[2] == 'users', f"Foreign key should reference users, got {fk[2]}"
    assert fk[6] == 'CASCADE', f"Foreign key should have ON DELETE CASCADE, got {fk[6]}"


def test_user_preferences_ai_web_search_enabled(test_db):
    """Verify that user_preferences has ai_web_search_enabled column"""
    columns = {row[1] for row in test_db.execute("PRAGMA table_info(user_preferences)").fetchall()}
    assert 'ai_web_search_enabled' in columns, "ai_web_search_enabled column not found in user_preferences"


def test_schema_version_is_14(test_db):
    """Verify that database schema version is 14"""
    version = test_db.execute("PRAGMA user_version").fetchone()[0]
    assert version == 14, f"Expected schema version 14, got {version}"


def test_create_list(test_db, test_user):
    """Test creating a list returns the list ID"""
    import db.lists
    
    list_id = db.lists.create_list(test_user['id'], "My Favorites", "A list of favorites", False)
    assert list_id is not None
    assert isinstance(list_id, int)
    
    row = test_db.execute("SELECT * FROM user_lists WHERE id = ?", (list_id,)).fetchone()
    assert row is not None
    assert row['name'] == "My Favorites"
    assert row['description'] == "A list of favorites"
    assert row['is_public'] == 0


def test_get_user_lists(test_db, test_user):
    """Test getting user lists returns only user's lists"""
    import db.lists
    
    list_id1 = db.lists.create_list(test_user['id'], "List 1", None, False)
    list_id2 = db.lists.create_list(test_user['id'], "List 2", None, True)
    
    lists = db.lists.get_user_lists(test_user['id'])
    assert len(lists) == 2
    
    list_names = [l['name'] for l in lists]
    assert "List 1" in list_names
    assert "List 2" in list_names


def test_add_series_to_list(test_db, test_user):
    """Test adding series to a list with position"""
    import db.lists
    
    list_id = db.lists.create_list(test_user['id'], "My List", None, False)
    
    series_id = test_db.execute(
        "INSERT INTO series (name) VALUES (?) RETURNING id",
        ("Test Series",)
    ).fetchone()['id']
    
    result = db.lists.add_series_to_list(list_id, series_id, position=0)
    assert result is True
    
    items = db.lists.get_list_items(list_id)
    assert len(items) == 1
    assert items[0]['series_id'] == series_id
    assert items[0]['position'] == 0


def test_public_lists_excludes_private(test_db, test_user):
    """Test public lists excludes private lists"""
    import db.lists
    
    db.lists.create_list(test_user['id'], "Private List", None, False)
    db.lists.create_list(test_user['id'], "Public List", None, True)
    
    public_lists = db.lists.get_public_lists()
    
    public_names = [l['name'] for l in public_lists]
    assert "Public List" in public_names
    assert "Private List" not in public_names


def test_delete_list_cascades_items(test_db, test_user):
    """Test deleting a list cascades to delete items"""
    import db.lists
    
    list_id = db.lists.create_list(test_user['id'], "To Delete", None, False)
    
    series_id = test_db.execute(
        "INSERT INTO series (name) VALUES (?) RETURNING id",
        ("Test Series",)
    ).fetchone()['id']
    
    db.lists.add_series_to_list(list_id, series_id)
    
    item_count_before = test_db.execute("SELECT COUNT(*) FROM user_list_items WHERE list_id = ?", (list_id,)).fetchone()[0]
    assert item_count_before == 1
    
    result = db.lists.delete_list(list_id, test_user['id'])
    assert result is True
    
    list_exists = test_db.execute("SELECT id FROM user_lists WHERE id = ?", (list_id,)).fetchone()
    assert list_exists is None
    
    item_count_after = test_db.execute("SELECT COUNT(*) FROM user_list_items WHERE list_id = ?", (list_id,)).fetchone()[0]
    assert item_count_after == 0


def test_reorder_list_items(test_db, test_user):
    """Test reordering list items works correctly"""
    import db.lists
    
    list_id = db.lists.create_list(test_user['id'], "Reorder Test", None, False)
    
    series_ids = []
    for i in range(3):
        sid = test_db.execute("INSERT INTO series (name) VALUES (?) RETURNING id", (f"Series {i}",)).fetchone()['id']
        series_ids.append(sid)
        db.lists.add_series_to_list(list_id, sid)
    
    item_ids = [row['id'] for row in test_db.execute("SELECT id FROM user_list_items WHERE list_id = ? ORDER BY id", (list_id,)).fetchall()]
    
    new_order = [item_ids[2], item_ids[0], item_ids[1]]
    result = db.lists.reorder_list_items(list_id, new_order)
    assert result is True
    
    items = db.lists.get_list_items(list_id)
    assert items[0]['series_id'] == series_ids[2]
    assert items[1]['series_id'] == series_ids[0]
    assert items[2]['series_id'] == series_ids[1]
