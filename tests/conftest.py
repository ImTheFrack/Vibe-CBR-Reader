import pytest
import sqlite3
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

os.environ["TESTING"] = "1"

_test_conn = None
_test_wrapper = None

class NonClosingConnection:
    def __init__(self, conn):
        self._conn = conn
    
    def close(self):
        pass
    
    def __getattr__(self, name):
        return getattr(self._conn, name)

def get_test_connection():
    global _test_conn, _test_wrapper
    if _test_conn is None:
        _test_conn = sqlite3.connect(":memory:", check_same_thread=False, timeout=30)
        _test_conn.row_factory = sqlite3.Row
        _test_wrapper = NonClosingConnection(_test_conn)
    return _test_wrapper

import db.connection
db.connection.get_db_connection = get_test_connection

from db.connection import init_db
init_db()

import database
database.get_db_connection = get_test_connection
database.warm_up_metadata_cache = lambda: None

import db.users
db.users.get_db_connection = get_test_connection

import db.series
db.series.get_db_connection = get_test_connection

import db.lists
db.lists.get_db_connection = get_test_connection

@pytest.fixture(scope="function")
def test_db():
    global _test_conn
    _test_conn.execute("DELETE FROM user_list_items")
    _test_conn.execute("DELETE FROM user_lists")
    _test_conn.execute("DELETE FROM bookmarks")
    _test_conn.execute("DELETE FROM reading_progress")
    _test_conn.execute("DELETE FROM ratings")
    _test_conn.execute("DELETE FROM user_preferences")
    _test_conn.execute("DELETE FROM sessions")
    _test_conn.execute("DELETE FROM users")
    _test_conn.execute("DELETE FROM comics")
    _test_conn.execute("DELETE FROM series")
    _test_conn.commit()
    yield _test_conn

@pytest.fixture(scope="function")
def test_client(test_db):
    from fastapi.testclient import TestClient
    from server import app
    
    client = TestClient(app)
    yield client

@pytest.fixture(scope="function")
def test_user(test_db):
    from db.users import create_user
    
    user_id = create_user("testuser", "password123", "test@example.com", "reader")
    return {
        "id": user_id,
        "username": "testuser",
        "password": "password123",
        "email": "test@example.com",
        "role": "reader"
    }

@pytest.fixture(scope="function")
def admin_user(test_db):
    from db.users import create_user
    
    user_id = create_user("adminuser", "admin123", "admin@example.com", "admin")
    return {
        "id": user_id,
        "username": "adminuser",
        "password": "admin123",
        "email": "admin@example.com",
        "role": "admin"
    }
