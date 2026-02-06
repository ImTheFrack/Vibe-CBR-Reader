import pytest
import hashlib
import bcrypt
from db.users import create_user, authenticate_user, create_session, validate_session, delete_session


def test_register_success(test_client):
    """Test successful user registration"""
    response = test_client.post("/api/auth/register", json={
        "username": "newuser",
        "password": "testpass123"
    })
    assert response.status_code == 200
    data = response.json()
    assert "user_id" in data
    assert data["message"] == "User created successfully"


def test_register_duplicate_username(test_client, test_user):
    """Test that duplicate username returns error"""
    response = test_client.post("/api/auth/register", json={
        "username": "testuser",
        "password": "differentpass"
    })
    assert response.status_code == 400
    assert "already exists" in response.json()["detail"].lower()


def test_register_ignores_role_field(test_client):
    """Test that users cannot self-promote to admin during registration"""
    response = test_client.post("/api/auth/register", json={
        "username": "hacker",
        "password": "hackpass123",
        "role": "admin"
    })
    assert response.status_code == 200
    
    login_response = test_client.post("/api/auth/login", json={
        "username": "hacker",
        "password": "hackpass123"
    })
    assert login_response.status_code == 200
    user_data = login_response.json()["user"]
    assert user_data["role"] == "reader"


def test_login_success_returns_cookie(test_client, test_user):
    """Test that successful login sets session cookie"""
    response = test_client.post("/api/auth/login", json={
        "username": "testuser",
        "password": "password123"
    })
    assert response.status_code == 200
    
    data = response.json()
    assert data["message"] == "Login successful"
    assert data["user"]["username"] == "testuser"
    assert data["user"]["role"] == "reader"
    
    assert "session_token" in response.cookies
    assert response.cookies["session_token"] != ""


def test_login_wrong_password(test_client, test_user):
    """Test that wrong password is rejected"""
    response = test_client.post("/api/auth/login", json={
        "username": "testuser",
        "password": "wrongpassword"
    })
    assert response.status_code == 401
    assert "invalid" in response.json()["detail"].lower()


def test_bcrypt_hash_verified(test_client, test_db):
    """Test that modern bcrypt authentication works"""
    user_id = create_user("bcryptuser", "securepass123", "bcrypt@test.com", "reader")
    assert user_id is not None
    
    user = authenticate_user("bcryptuser", "securepass123")
    assert user is not None
    assert user["username"] == "bcryptuser"
    assert user["password_hash"].startswith("$2b$")
    
    wrong_user = authenticate_user("bcryptuser", "wrongpass")
    assert wrong_user is None


def test_legacy_sha256_migrated(test_client, test_db):
    """Test that legacy SHA256 hashes are migrated to bcrypt on login"""
    legacy_password = "legacypass123"
    legacy_hash = hashlib.sha256(legacy_password.encode()).hexdigest()
    
    cursor = test_db.execute(
        'INSERT INTO users (username, password_hash, email, role) VALUES (?, ?, ?, ?)',
        ("legacyuser", legacy_hash, "legacy@test.com", "reader")
    )
    user_id = cursor.lastrowid
    test_db.commit()
    
    user_row = test_db.execute('SELECT password_hash FROM users WHERE id = ?', (user_id,)).fetchone()
    assert len(user_row["password_hash"]) == 64
    assert not user_row["password_hash"].startswith("$2b$")
    
    user = authenticate_user("legacyuser", legacy_password)
    assert user is not None
    assert user["username"] == "legacyuser"
    
    migrated_row = test_db.execute('SELECT password_hash FROM users WHERE id = ?', (user_id,)).fetchone()
    assert migrated_row["password_hash"].startswith("$2b$")
    
    user2 = authenticate_user("legacyuser", legacy_password)
    assert user2 is not None


def test_session_token_created(test_client, test_db):
    """Test that session token is created and stored on login"""
    user_id = create_user("sessionuser", "sessionpass", "session@test.com", "reader")
    
    response = test_client.post("/api/auth/login", json={
        "username": "sessionuser",
        "password": "sessionpass"
    })
    assert response.status_code == 200
    
    session_token = response.cookies.get("session_token")
    assert session_token is not None
    
    session_row = test_db.execute(
        'SELECT user_id, expires_at FROM sessions WHERE token = ?',
        (session_token,)
    ).fetchone()
    assert session_row is not None
    assert session_row["user_id"] == user_id
    
    validated_user_id = validate_session(session_token)
    assert validated_user_id == user_id


def test_logout_clears_session(test_client, test_user):
    """Test that logout invalidates session"""
    login_response = test_client.post("/api/auth/login", json={
        "username": "testuser",
        "password": "password123"
    })
    session_token = login_response.cookies.get("session_token")
    assert session_token is not None
    
    assert validate_session(session_token) == test_user["id"]
    
    logout_response = test_client.post("/api/auth/logout")
    assert logout_response.status_code == 200
    
    assert validate_session(session_token) is None
    
    me_response = test_client.get("/api/auth/me")
    assert me_response.status_code == 401


def test_admin_routes_reject_readers(test_client, test_user, admin_user):
    """Test that admin-only routes reject reader users"""
    reader_login = test_client.post("/api/auth/login", json={
        "username": "testuser",
        "password": "password123"
    })
    assert reader_login.status_code == 200
    
    users_response = test_client.get("/api/admin/users")
    assert users_response.status_code == 403
    assert "admin" in users_response.json()["detail"].lower()
    
    test_client.post("/api/auth/logout")
    
    admin_login = test_client.post("/api/auth/login", json={
        "username": "adminuser",
        "password": "admin123"
    })
    assert admin_login.status_code == 200
    
    users_response = test_client.get("/api/admin/users")
    assert users_response.status_code == 200
