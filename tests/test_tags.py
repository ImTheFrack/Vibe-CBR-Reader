import pytest
import json
from db.series import create_or_update_series, blacklist_tag, get_series_by_tags, _refresh_tag_cache

def test_blacklist_tag_filtering(test_db):
    # 1. Create a series with tags
    create_or_update_series(
        name="Test Series",
        metadata={
            "title": "Test Series",
            "genres": ["Action"],
            "tags": ["Male Protagonist", "Magic"]
        }
    )
    
    # Refresh cache to ensure tags are indexed
    _refresh_tag_cache()
    
    # 2. Verify tags appear initially
    result = get_series_by_tags([])
    tag_names = [t['name'] for t in result['related_tags']]
    assert "Action" in tag_names
    assert "Male Protagonist" in tag_names
    assert "Magic" in tag_names
    
    # 3. Blacklist "Male Protagonist"
    blacklist_tag("Male Protagonist")
    
    # Refresh cache to apply blacklist
    _refresh_tag_cache()
    
    # 4. Verify blacklisted tag is gone from empty filter
    result = get_series_by_tags([])
    tag_names = [t['name'] for t in result['related_tags']]
    assert "Action" in tag_names
    assert "Male Protagonist" not in tag_names
    assert "male protagonist" not in tag_names # Check for lowercase too
    assert "Magic" in tag_names
    
    # 5. Verify blacklisted tag is gone when filtering by another tag
    result = get_series_by_tags(["Action"])
    tag_names = [t['name'] for t in result['related_tags']]
    # "Action" won't be in related_tags because it's selected
    assert "Male Protagonist" not in tag_names
    assert "Magic" in tag_names
