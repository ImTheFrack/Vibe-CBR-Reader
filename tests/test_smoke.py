import pytest

def test_server_starts(test_client):
    response = test_client.get("/api/config")
    assert response.status_code in [200, 404]

def test_auth_flow(test_client, test_user):
    register_response = test_client.post("/api/auth/register", json={
        "username": "newuser",
        "password": "password123",
        "email": "newuser@example.com"
    })
    assert register_response.status_code == 200
    
    login_response = test_client.post("/api/auth/login", json={
        "username": "newuser",
        "password": "password123"
    })
    assert login_response.status_code == 200
    assert "user" in login_response.json()
    
    me_response = test_client.get("/api/auth/me")
    assert me_response.status_code == 200
    user_data = me_response.json()
    assert user_data["username"] == "newuser"
    assert user_data["role"] == "reader"
