import pytest


def test_config_endpoint(test_client):
    """Test /api/config returns comics directory"""
    response = test_client.get("/api/config")
    assert response.status_code == 200
    data = response.json()
    assert "comics_dir" in data
    assert isinstance(data["comics_dir"], str)


def test_books_requires_auth(test_client):
    """Test /api/books requires authentication"""
    response = test_client.get("/api/books")
    assert response.status_code == 401


def test_books_returns_list(test_client, test_user):
    """Test /api/books returns comic list for authenticated users"""
    login_response = test_client.post("/api/auth/login", json={
        "username": test_user["username"],
        "password": test_user["password"]
    })
    assert login_response.status_code == 200
    
    response = test_client.get("/api/books")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, dict)
    assert "items" in data
    assert "total" in data
    assert "limit" in data
    assert "offset" in data
    assert "has_more" in data
    assert isinstance(data["items"], list)


def test_books_pagination(test_client, test_user):
    """Test /api/books pagination with limit and offset"""
    login_response = test_client.post("/api/auth/login", json={
        "username": test_user["username"],
        "password": test_user["password"]
    })
    assert login_response.status_code == 200
    
    response1 = test_client.get("/api/books?limit=5&offset=0")
    assert response1.status_code == 200
    data1 = response1.json()
    assert data1["limit"] == 5
    assert data1["offset"] == 0
    assert len(data1["items"]) <= 5
    
    response2 = test_client.get("/api/books?limit=3&offset=2")
    assert response2.status_code == 200
    data2 = response2.json()
    assert data2["limit"] == 3
    assert data2["offset"] == 2
    assert len(data2["items"]) <= 3
    
    response3 = test_client.get("/api/books?limit=1000")
    assert response3.status_code == 200
    data3 = response3.json()
    assert data3["limit"] == 500


def test_scan_requires_admin(test_client, test_user, admin_user):
    """Test /api/scan requires admin role"""
    login_response = test_client.post("/api/auth/login", json={
        "username": test_user["username"],
        "password": test_user["password"]
    })
    assert login_response.status_code == 200
    
    response = test_client.post("/api/scan")
    assert response.status_code == 403
    
    test_client.post("/api/auth/logout")
    login_response = test_client.post("/api/auth/login", json={
        "username": admin_user["username"],
        "password": admin_user["password"]
    })
    assert login_response.status_code == 200
    
    response = test_client.post("/api/scan")
    assert response.status_code in [404, 409]


def test_progress_update_and_retrieve(test_client, test_user):
    """Test updating and retrieving reading progress"""
    login_response = test_client.post("/api/auth/login", json={
        "username": test_user["username"],
        "password": test_user["password"]
    })
    assert login_response.status_code == 200
    
    test_comic_id = "test-comic-123"
    progress_data = {
        "comic_id": test_comic_id,
        "current_page": 10,
        "total_pages": 50,
        "completed": False
    }
    update_response = test_client.post("/api/progress", json=progress_data)
    assert update_response.status_code == 200
    
    get_response = test_client.get(f"/api/progress/{test_comic_id}")
    assert get_response.status_code == 200
    data = get_response.json()
    assert data["comic_id"] == test_comic_id
    assert data["current_page"] == 10
    assert data["total_pages"] == 50
    assert data["completed"] == False


def test_export_start_returns_job_id(test_client, test_user):
    """Test export workflow returns job_id"""
    login_response = test_client.post("/api/auth/login", json={
        "username": test_user["username"],
        "password": test_user["password"]
    })
    assert login_response.status_code == 200
    
    export_data = {
        "comic_ids": ["comic-1", "comic-2"],
        "filename": "test-export.cbz"
    }
    response = test_client.post("/api/export/cbz", json=export_data)
    assert response.status_code == 200
    data = response.json()
    assert "job_id" in data
    assert isinstance(data["job_id"], str)
    assert len(data["job_id"]) > 0


def test_series_rating_roundtrip(test_client, test_user, test_db):
    """Test rating a series and retrieving the rating"""
    login_response = test_client.post("/api/auth/login", json={
        "username": test_user["username"],
        "password": test_user["password"]
    })
    assert login_response.status_code == 200
    
    # Clear any existing series and ratings to ensure clean state
    test_db.execute("DELETE FROM ratings")
    test_db.execute("DELETE FROM series")
    test_db.commit()
    
    test_db.execute("""
        INSERT INTO series (id, name, category, title)
        VALUES (1, 'Test Series', 'Test Category', 'Test Title')
    """)
    test_db.commit()
    
    rating_data = {
        "series_id": 1,
        "rating": 5
    }
    rate_response = test_client.post("/api/series/rating", json=rating_data)
    assert rate_response.status_code == 200
    
    get_response = test_client.get("/api/series/rating/1")
    assert get_response.status_code == 200
    data = get_response.json()
    assert "user_rating" in data
    assert data["user_rating"] == 5
    assert "series" in data
    assert data["series"]["avg_rating"] == 5.0
    assert data["series"]["rating_count"] == 1
