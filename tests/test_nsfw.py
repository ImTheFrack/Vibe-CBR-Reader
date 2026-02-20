"""
Comprehensive test suite for NSFW content filtering system.

Covers:
- DB schema migration (version 15, is_adult/is_nsfw columns, nsfw_mode preference)
- NSFW engine functions (config loading, tag matching, series detection, bulk recompute)
- API filtering (books, search, series, discovery endpoints)
- User preference persistence (nsfw_mode save/retrieve)
- Admin config endpoints (GET/PUT/load-defaults)
"""

import json
import pytest

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _login(client, username, password):
    resp = client.post("/api/auth/login", json={"username": username, "password": password})
    assert resp.status_code == 200, f"Login failed: {resp.text}"
    return resp


def _insert_series(db, *, name, title=None, category=None, subcategory=None,
                   is_adult=0, is_nsfw=0, tags=None, genres=None):
    """Insert a minimal series row and return its id."""
    db.execute(
        """
        INSERT INTO series (name, title, category, subcategory, is_adult, is_nsfw, tags, genres)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            name,
            title or name,
            category,
            subcategory,
            is_adult,
            is_nsfw,
            json.dumps(tags) if tags else None,
            json.dumps(genres) if genres else None,
        ),
    )
    db.commit()
    return db.execute("SELECT id FROM series WHERE name = ?", (name,)).fetchone()["id"]


def _insert_comic(db, *, comic_id, series_id=None, title="Test Comic"):
    db.execute(
        "INSERT INTO comics (id, path, title, series_id) VALUES (?, ?, ?, ?)",
        (comic_id, f"/path/{comic_id}.cbz", title, series_id),
    )
    db.commit()


# ---------------------------------------------------------------------------
# 1. DB Migration Tests
# ---------------------------------------------------------------------------


def test_schema_version_15(test_db):
    """Schema user_version must be at least 15 after init_db."""
    version = test_db.execute("PRAGMA user_version").fetchone()[0]
    assert version >= 15, f"Expected schema version >= 15, got {version}"


def test_nsfw_columns_exist(test_db):
    """series table must have is_adult and is_nsfw columns."""
    cols = {
        row["name"]
        for row in test_db.execute("PRAGMA table_info(series)").fetchall()
    }
    assert "is_adult" in cols, "is_adult column missing from series table"
    assert "is_nsfw" in cols, "is_nsfw column missing from series table"


def test_nsfw_mode_column_exists(test_db):
    """user_preferences table must have nsfw_mode column."""
    cols = {
        row["name"]
        for row in test_db.execute("PRAGMA table_info(user_preferences)").fetchall()
    }
    assert "nsfw_mode" in cols, "nsfw_mode column missing from user_preferences table"


# ---------------------------------------------------------------------------
# 2. NSFW Engine Tests
# ---------------------------------------------------------------------------


def test_get_nsfw_config(test_db):
    """get_nsfw_config() returns a dict with categories, subcategories, tag_patterns."""
    from db.nsfw import get_nsfw_config

    config = get_nsfw_config()
    assert isinstance(config, dict)
    assert "categories" in config
    assert "subcategories" in config
    assert "tag_patterns" in config
    assert isinstance(config["categories"], list)
    assert isinstance(config["subcategories"], list)
    assert isinstance(config["tag_patterns"], list)


@pytest.mark.parametrize(
    "tags, patterns, expected",
    [
        # Wildcard *breast* matches "large breasts"
        (["large breasts"], ["*breast*"], True),
        # Exact match "ecchi"
        (["ecchi"], ["ecchi"], True),
        # sexual* prefix wildcard
        (["sexuality"], ["sexual*"], True),
        # No match
        (["action", "adventure"], ["ecchi", "*breast*"], False),
        # Empty tags → False
        ([], ["ecchi"], False),
        # Empty patterns → False
        (["ecchi"], [], False),
        # None-like empty list
        (["romance"], ["*breast*", "ecchi"], False),
    ],
)
def test_matches_nsfw_tag_pattern(tags, patterns, expected):
    """matches_nsfw_tag_pattern() correctly applies fnmatch wildcard logic."""
    from db.nsfw import matches_nsfw_tag_pattern

    result = matches_nsfw_tag_pattern(tags, patterns)
    assert result == expected, f"tags={tags}, patterns={patterns}: expected {expected}, got {result}"


def test_determine_series_nsfw_by_adult_flag(test_db):
    """Series with is_adult=1 must be detected as NSFW regardless of other fields."""
    from db.nsfw import determine_series_nsfw

    series_id = _insert_series(test_db, name="adult-series", is_adult=1)
    row = test_db.execute("SELECT * FROM series WHERE id = ?", (series_id,)).fetchone()
    config = {"categories": [], "subcategories": [], "tag_patterns": []}
    assert determine_series_nsfw(row, config) is True


def test_determine_series_nsfw_by_category(test_db):
    """Series whose category contains an NSFW category string must be flagged."""
    from db.nsfw import determine_series_nsfw

    series_id = _insert_series(test_db, name="adult-cat-series", category="Hentai & Adults")
    row = test_db.execute("SELECT * FROM series WHERE id = ?", (series_id,)).fetchone()
    config = {"categories": ["hentai"], "subcategories": [], "tag_patterns": []}
    assert determine_series_nsfw(row, config) is True


def test_determine_series_nsfw_by_category_no_match(test_db):
    """Series with a safe category must NOT be flagged."""
    from db.nsfw import determine_series_nsfw

    series_id = _insert_series(test_db, name="safe-cat-series", category="Action & Adventure")
    row = test_db.execute("SELECT * FROM series WHERE id = ?", (series_id,)).fetchone()
    config = {"categories": ["hentai"], "subcategories": [], "tag_patterns": []}
    assert determine_series_nsfw(row, config) is False


def test_determine_series_nsfw_by_tags(test_db):
    """Series with NSFW tags must be flagged via tag pattern matching."""
    from db.nsfw import determine_series_nsfw

    series_id = _insert_series(
        test_db, name="ecchi-series", tags=["ecchi", "school life"]
    )
    row = test_db.execute("SELECT * FROM series WHERE id = ?", (series_id,)).fetchone()
    config = {"categories": [], "subcategories": [], "tag_patterns": ["ecchi"]}
    assert determine_series_nsfw(row, config) is True


def test_determine_series_nsfw_null_row():
    """determine_series_nsfw() with None row must return False (no crash)."""
    from db.nsfw import determine_series_nsfw

    config = {"categories": ["hentai"], "subcategories": [], "tag_patterns": ["ecchi"]}
    assert determine_series_nsfw(None, config) is False


def test_determine_series_nsfw_empty_tags(test_db):
    """Series with no tags and no adult flag must NOT be flagged."""
    from db.nsfw import determine_series_nsfw

    series_id = _insert_series(test_db, name="clean-series", category="Manga")
    row = test_db.execute("SELECT * FROM series WHERE id = ?", (series_id,)).fetchone()
    config = {"categories": [], "subcategories": [], "tag_patterns": ["ecchi", "*breast*"]}
    assert determine_series_nsfw(row, config) is False


def test_recompute_nsfw_flags(test_db):
    """recompute_nsfw_flags() updates is_nsfw for all series based on current config."""
    from db.nsfw import recompute_nsfw_flags
    from db.settings import set_setting

    # Set up: one NSFW series (is_adult), one clean series
    nsfw_id = _insert_series(test_db, name="recompute-nsfw", is_adult=1)
    clean_id = _insert_series(test_db, name="recompute-clean", category="Manga")

    # Ensure settings are empty so only is_adult drives detection
    set_setting("nsfw_categories", "[]")
    set_setting("nsfw_subcategories", "[]")
    set_setting("nsfw_tag_patterns", "[]")

    recompute_nsfw_flags(conn=test_db)

    nsfw_row = test_db.execute("SELECT is_nsfw FROM series WHERE id = ?", (nsfw_id,)).fetchone()
    clean_row = test_db.execute("SELECT is_nsfw FROM series WHERE id = ?", (clean_id,)).fetchone()

    assert nsfw_row["is_nsfw"] == 1, "NSFW series should have is_nsfw=1 after recompute"
    assert clean_row["is_nsfw"] == 0, "Clean series should have is_nsfw=0 after recompute"


def test_get_default_nsfw_tag_patterns():
    """get_default_nsfw_tag_patterns() returns a non-empty list of strings."""
    from db.nsfw import get_default_nsfw_tag_patterns

    patterns = get_default_nsfw_tag_patterns()
    assert isinstance(patterns, list)
    assert len(patterns) > 0
    # Spot-check a few known patterns
    assert "ecchi" in patterns
    assert "yaoi" in patterns
    assert "*breast*" in patterns


# ---------------------------------------------------------------------------
# 3. API Filtering Tests
# ---------------------------------------------------------------------------


def test_books_endpoint_filters_nsfw(test_client, test_user, test_db):
    """GET /api/books with nsfw_mode=filter must exclude NSFW comics."""
    # Insert NSFW series + comic
    nsfw_series_id = _insert_series(test_db, name="nsfw-books-series", is_nsfw=1)
    _insert_comic(test_db, comic_id="nsfw-comic-001", series_id=nsfw_series_id, title="NSFW Comic")

    # Insert clean series + comic
    clean_series_id = _insert_series(test_db, name="clean-books-series", is_nsfw=0)
    _insert_comic(test_db, comic_id="clean-comic-001", series_id=clean_series_id, title="Clean Comic")

    # Set user nsfw_mode to 'filter'
    test_db.execute(
        "UPDATE user_preferences SET nsfw_mode = 'filter' WHERE user_id = ?",
        (test_user["id"],),
    )
    test_db.commit()

    _login(test_client, test_user["username"], test_user["password"])

    resp = test_client.get("/api/books")
    assert resp.status_code == 200
    items = resp.json()["items"]
    ids = [item["id"] for item in items]

    assert "clean-comic-001" in ids, "Clean comic should appear in filter mode"
    assert "nsfw-comic-001" not in ids, "NSFW comic should be excluded in filter mode"


def test_books_endpoint_off_mode_shows_nsfw(test_client, test_user, test_db):
    """GET /api/books with nsfw_mode=off must include NSFW comics."""
    nsfw_series_id = _insert_series(test_db, name="nsfw-off-series", is_nsfw=1)
    _insert_comic(test_db, comic_id="nsfw-off-comic-001", series_id=nsfw_series_id, title="NSFW Off Comic")

    # Ensure nsfw_mode is 'off'
    test_db.execute(
        "UPDATE user_preferences SET nsfw_mode = 'off' WHERE user_id = ?",
        (test_user["id"],),
    )
    test_db.commit()

    _login(test_client, test_user["username"], test_user["password"])

    resp = test_client.get("/api/books")
    assert resp.status_code == 200
    ids = [item["id"] for item in resp.json()["items"]]
    assert "nsfw-off-comic-001" in ids, "NSFW comic should appear when nsfw_mode=off"


def test_books_endpoint_blur_mode_includes_nsfw_flag(test_client, test_user, test_db):
    """GET /api/books with nsfw_mode=blur must include NSFW comics with is_nsfw field."""
    nsfw_series_id = _insert_series(test_db, name="nsfw-blur-series", is_nsfw=1)
    _insert_comic(test_db, comic_id="nsfw-blur-comic-001", series_id=nsfw_series_id, title="NSFW Blur Comic")

    test_db.execute(
        "UPDATE user_preferences SET nsfw_mode = 'blur' WHERE user_id = ?",
        (test_user["id"],),
    )
    test_db.commit()

    _login(test_client, test_user["username"], test_user["password"])

    resp = test_client.get("/api/books")
    assert resp.status_code == 200
    items = resp.json()["items"]
    nsfw_items = [i for i in items if i.get("id") == "nsfw-blur-comic-001"]
    assert len(nsfw_items) == 1, "NSFW comic should appear in blur mode"
    assert "is_nsfw" in nsfw_items[0], "blur mode should include is_nsfw field"
    assert nsfw_items[0]["is_nsfw"] == 1


def test_search_endpoint_filters_nsfw(test_client, test_user, test_db):
    """GET /api/search with nsfw_mode=filter must exclude NSFW series."""
    _insert_series(test_db, name="nsfw-search-series", title="NSFW Search Title", is_nsfw=1)
    _insert_series(test_db, name="clean-search-series", title="Clean Search Title", is_nsfw=0)

    test_db.execute(
        "UPDATE user_preferences SET nsfw_mode = 'filter' WHERE user_id = ?",
        (test_user["id"],),
    )
    test_db.commit()

    _login(test_client, test_user["username"], test_user["password"])

    resp = test_client.get("/api/search?q=Search")
    assert resp.status_code == 200
    names = [item.get("name") for item in resp.json()]
    assert "clean-search-series" in names, "Clean series should appear in search filter mode"
    assert "nsfw-search-series" not in names, "NSFW series should be excluded in search filter mode"


def test_series_endpoint_returns_404_for_nsfw(test_client, test_user, test_db):
    """GET /api/series/{name} with nsfw_mode=filter must return 404 for NSFW series."""
    _insert_series(test_db, name="nsfw-detail-series", title="NSFW Detail", is_nsfw=1)

    test_db.execute(
        "UPDATE user_preferences SET nsfw_mode = 'filter' WHERE user_id = ?",
        (test_user["id"],),
    )
    test_db.commit()

    _login(test_client, test_user["username"], test_user["password"])

    resp = test_client.get("/api/series/nsfw-detail-series")
    assert resp.status_code == 404, f"Expected 404 for NSFW series in filter mode, got {resp.status_code}"


def test_series_endpoint_returns_data_for_nsfw_in_off_mode(test_client, test_user, test_db):
    """GET /api/series/{name} with nsfw_mode=off must return data for NSFW series."""
    _insert_series(test_db, name="nsfw-off-detail-series", title="NSFW Off Detail", is_nsfw=1)

    test_db.execute(
        "UPDATE user_preferences SET nsfw_mode = 'off' WHERE user_id = ?",
        (test_user["id"],),
    )
    test_db.commit()

    _login(test_client, test_user["username"], test_user["password"])

    resp = test_client.get("/api/series/nsfw-off-detail-series")
    # Should return 200 (series exists and nsfw_mode is off)
    assert resp.status_code == 200, f"Expected 200 for NSFW series in off mode, got {resp.status_code}"


def test_discovery_endpoints_filter_nsfw(test_client, test_user, test_db):
    """GET /api/discovery/new-additions with nsfw_mode=filter must exclude NSFW comics."""
    nsfw_series_id = _insert_series(test_db, name="nsfw-discovery-series", is_nsfw=1)
    _insert_comic(
        test_db,
        comic_id="nsfw-discovery-comic",
        series_id=nsfw_series_id,
        title="NSFW Discovery Comic",
    )
    # Mark as having thumbnail so it appears in new-additions
    test_db.execute(
        "UPDATE comics SET has_thumbnail = 1 WHERE id = ?", ("nsfw-discovery-comic",)
    )
    test_db.commit()

    test_db.execute(
        "UPDATE user_preferences SET nsfw_mode = 'filter' WHERE user_id = ?",
        (test_user["id"],),
    )
    test_db.commit()

    _login(test_client, test_user["username"], test_user["password"])

    resp = test_client.get("/api/discovery/new-additions")
    assert resp.status_code == 200
    data = resp.json()
    # Flatten all comic ids from groups
    all_ids = []
    for group in data:
        for chapter in group.get("chapters", []):
            all_ids.append(chapter.get("id"))
    assert "nsfw-discovery-comic" not in all_ids, "NSFW comic should be excluded from discovery in filter mode"


# ---------------------------------------------------------------------------
# 4. User Preference Tests
# ---------------------------------------------------------------------------


def test_nsfw_mode_save_and_retrieve(test_client, test_user, test_db):
    """PUT /api/preferences with nsfw_mode='blur' must be accepted by the API."""
    _login(test_client, test_user["username"], test_user["password"])

    put_resp = test_client.put("/api/preferences", json={"nsfw_mode": "blur"})
    assert put_resp.status_code == 200
    assert put_resp.json().get("message") == "Preferences updated"


def test_nsfw_mode_filter_value(test_client, test_user, test_db):
    """PUT /api/preferences with nsfw_mode='filter' must be accepted by the API."""
    _login(test_client, test_user["username"], test_user["password"])

    put_resp = test_client.put("/api/preferences", json={"nsfw_mode": "filter"})
    assert put_resp.status_code == 200
    assert put_resp.json().get("message") == "Preferences updated"


def test_nsfw_mode_off_value(test_client, test_user, test_db):
    """PUT /api/preferences with nsfw_mode='off' must be accepted by the API."""
    _login(test_client, test_user["username"], test_user["password"])

    put_resp = test_client.put("/api/preferences", json={"nsfw_mode": "off"})
    assert put_resp.status_code == 200
    assert put_resp.json().get("message") == "Preferences updated"


def test_get_current_user_includes_nsfw_mode(test_client, test_user, test_db):
    """get_current_user dependency must expose nsfw_mode for route-level filtering."""
    test_db.execute(
        "UPDATE user_preferences SET nsfw_mode = 'filter' WHERE user_id = ?",
        (test_user["id"],),
    )
    test_db.commit()

    _login(test_client, test_user["username"], test_user["password"])

    nsfw_series_id = _insert_series(test_db, name="nsfw-me-series", is_nsfw=1)
    _insert_comic(test_db, comic_id="nsfw-me-comic", series_id=nsfw_series_id)

    resp = test_client.get("/api/books")
    assert resp.status_code == 200
    ids = [item["id"] for item in resp.json()["items"]]
    assert "nsfw-me-comic" not in ids, "nsfw_mode=filter from preferences must be applied to /api/books"


# ---------------------------------------------------------------------------
# 5. Admin Config Tests
# ---------------------------------------------------------------------------


def test_admin_nsfw_config_get(test_client, admin_user, test_db):
    """GET /api/admin/nsfw-config must return config structure (admin only)."""
    _login(test_client, admin_user["username"], admin_user["password"])

    resp = test_client.get("/api/admin/nsfw-config")
    assert resp.status_code == 200
    data = resp.json()
    assert "categories" in data
    assert "subcategories" in data
    assert "tag_patterns" in data
    assert "available_categories" in data
    assert "available_subcategories" in data


def test_admin_nsfw_config_requires_admin(test_client, test_user, test_db):
    """GET /api/admin/nsfw-config must return 403 for non-admin users."""
    _login(test_client, test_user["username"], test_user["password"])

    resp = test_client.get("/api/admin/nsfw-config")
    assert resp.status_code == 403


def test_admin_nsfw_config_put(test_client, admin_user, test_db):
    """PUT /api/admin/nsfw-config must save categories, subcategories, tag_patterns."""
    _login(test_client, admin_user["username"], admin_user["password"])

    payload = {
        "categories": ["hentai", "adult"],
        "subcategories": ["explicit"],
        "tag_patterns": ["ecchi", "*breast*"],
    }
    resp = test_client.put("/api/admin/nsfw-config", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert "hentai" in data["categories"]
    assert "adult" in data["categories"]
    assert "explicit" in data["subcategories"]
    assert "ecchi" in data["tag_patterns"]
    assert "*breast*" in data["tag_patterns"]


def test_admin_nsfw_config_put_recomputes_flags(test_client, admin_user, test_db):
    """PUT /api/admin/nsfw-config must trigger recompute of is_nsfw flags."""
    # Insert a series that will become NSFW after config update
    series_id = _insert_series(
        test_db, name="will-become-nsfw", category="Hentai Collection", is_nsfw=0
    )

    _login(test_client, admin_user["username"], admin_user["password"])

    payload = {
        "categories": ["hentai"],
        "subcategories": [],
        "tag_patterns": [],
    }
    resp = test_client.put("/api/admin/nsfw-config", json=payload)
    assert resp.status_code == 200

    # Verify the series was recomputed
    row = test_db.execute("SELECT is_nsfw FROM series WHERE id = ?", (series_id,)).fetchone()
    assert row["is_nsfw"] == 1, "Series should be flagged as NSFW after config update"


def test_load_default_nsfw_patterns(test_client, admin_user, test_db):
    """POST /api/admin/nsfw-config/load-defaults must load default patterns."""
    _login(test_client, admin_user["username"], admin_user["password"])

    resp = test_client.post("/api/admin/nsfw-config/load-defaults")
    assert resp.status_code == 200
    data = resp.json()
    patterns = data.get("tag_patterns", [])
    assert len(patterns) > 0, "Default patterns should be loaded"
    # Spot-check known defaults
    assert "ecchi" in patterns
    assert "yaoi" in patterns


def test_admin_nsfw_config_partial_update(test_client, admin_user, test_db):
    """PUT /api/admin/nsfw-config with only tag_patterns must update only that field."""
    _login(test_client, admin_user["username"], admin_user["password"])

    # First set a known state
    test_client.put(
        "/api/admin/nsfw-config",
        json={"categories": ["hentai"], "subcategories": [], "tag_patterns": []},
    )

    # Now update only tag_patterns
    resp = test_client.put(
        "/api/admin/nsfw-config",
        json={"tag_patterns": ["ecchi", "smut"]},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "ecchi" in data["tag_patterns"]
    assert "smut" in data["tag_patterns"]
