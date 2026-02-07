import hashlib
import secrets
import bcrypt
import sqlite3
from typing import Optional, Dict, Any, List
from .connection import get_db_connection

def create_user(username: str, password: str, email: Optional[str] = None, role: str = 'reader', must_change_password: bool = False) -> Optional[int]:
    """Create a new user with hashed password"""
    conn = get_db_connection()
    # Hash password with bcrypt
    salt = bcrypt.gensalt()
    password_hash = bcrypt.hashpw(password.encode(), salt).decode('utf-8')
    
    try:
        cursor = conn.execute(
            'INSERT INTO users (username, password_hash, email, role, must_change_password) VALUES (?, ?, ?, ?, ?)',
            (username, password_hash, email, role, 1 if must_change_password else 0)
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

def authenticate_user(username: str, password: str) -> Optional[Dict[str, Any]]:
    """Authenticate user and return user data if valid"""
    conn = get_db_connection()
    
    # Fetch user by username first to support lazy migration
    user = conn.execute(
        'SELECT id, username, password_hash, email, role, must_change_password, approved FROM users WHERE username = ?',
        (username,)
    ).fetchone()
    
    if not user:
        conn.close()
        return None
        
    db_hash = user['password_hash']
    authenticated = False
    
    # Check if it's a bcrypt hash (usually starts with $2b$ or $2a$)
    if db_hash.startswith('$2b$') or db_hash.startswith('$2a$'):
        if bcrypt.checkpw(password.encode(), db_hash.encode()):
            authenticated = True
    else:
        # Legacy SHA256 check
        legacy_hash = hashlib.sha256(password.encode()).hexdigest()
        if legacy_hash == db_hash:
            authenticated = True
            # Lazy migration to bcrypt
            salt = bcrypt.gensalt()
            new_hash = bcrypt.hashpw(password.encode(), salt).decode('utf-8')
            conn.execute(
                'UPDATE users SET password_hash = ? WHERE id = ?',
                (new_hash, user['id'])
            )
            conn.commit()
    
    if authenticated:
        # Update last login
        conn.execute(
            'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?',
            (user['id'],)
        )
        conn.commit()
        user_dict = dict(user)
        conn.close()
        return user_dict
    
    conn.close()
    return None

def create_session(user_id: int, expires_hours: int = 24) -> str:
    """Create a new session token"""
    conn = get_db_connection()
    token = secrets.token_urlsafe(32)
    
    conn.execute(
        '''INSERT INTO sessions (user_id, token, expires_at) 
           VALUES (?, ?, datetime('now', ? || ' hours'))''',
        (user_id, token, f"+{expires_hours}")
    )
    conn.commit()
    conn.close()
    return token

def validate_session(token: str) -> Optional[int]:
    """Validate session token and return user_id if valid"""
    conn = get_db_connection()
    session = conn.execute(
        '''SELECT user_id FROM sessions 
           WHERE token = ? AND expires_at > datetime('now')''',
        (token,)
    ).fetchone()
    conn.close()
    return session['user_id'] if session else None

def delete_session(token: str) -> None:
    """Delete a session (logout)"""
    conn = get_db_connection()
    conn.execute('DELETE FROM sessions WHERE token = ?', (token,))
    conn.commit()
    conn.close()

def get_all_users() -> List[Dict[str, Any]]:
    """Get all users (admin only)"""
    conn = get_db_connection()
    users = conn.execute(
        'SELECT id, username, email, role, created_at, last_login FROM users ORDER BY created_at DESC'
    ).fetchall()
    conn.close()
    return [dict(u) for u in users]

def delete_user(user_id: int) -> None:
    """Delete a user and all associated data"""
    conn = get_db_connection()
    conn.execute('DELETE FROM users WHERE id = ?', (user_id,))
    conn.commit()
    conn.close()

def update_user_role(user_id: int, role: str) -> bool:
    """Update a user's role (admin only)"""
    if role not in ['admin', 'reader']:
        return False
    conn = get_db_connection()
    conn.execute('UPDATE users SET role = ? WHERE id = ?', (role, user_id))
    conn.commit()
    conn.close()
    return True

def update_user_password(user_id: int, new_password: str, must_change: bool = False) -> bool:
    """Update a user's password (admin force reset or user change)"""
    conn = get_db_connection()
    salt = bcrypt.gensalt()
    password_hash = bcrypt.hashpw(new_password.encode(), salt).decode('utf-8')
    
    conn.execute(
        'UPDATE users SET password_hash = ?, must_change_password = ? WHERE id = ?',
        (password_hash, 1 if must_change else 0, user_id)
    )
    conn.commit()
    conn.close()
    return True

def user_exists(username: str) -> bool:
    """Check if a username exists"""
    conn = get_db_connection()
    result = conn.execute('SELECT 1 FROM users WHERE username = ?', (username,)).fetchone()
    conn.close()
    return result is not None

def approve_user(user_id: int) -> bool:
    """Approve a user account (admin only)"""
    conn = get_db_connection()
    conn.execute('UPDATE users SET approved = 1 WHERE id = ?', (user_id,))
    conn.commit()
    conn.close()
    return True
