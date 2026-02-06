from fastapi import HTTPException, Cookie, Depends
from database import validate_session, get_db_connection
from typing import Optional, Dict, Any

async def get_current_user(token: Optional[str] = Cookie(None, alias="session_token")) -> Dict[str, Any]:
    """Dependency to get current authenticated user"""
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    user_id = validate_session(token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    
    conn = get_db_connection()
    user = conn.execute(
        'SELECT id, username, email, role, must_change_password FROM users WHERE id = ?',
        (user_id,)
    ).fetchone()
    conn.close()
    
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    
    return dict(user)

async def get_admin_user(current_user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    """Dependency to ensure user is admin"""
    if current_user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user

async def get_optional_user(token: Optional[str] = Cookie(None, alias="session_token")) -> Optional[Dict[str, Any]]:
    """Dependency to get user if logged in, but not require it"""
    if not token:
        return None
    
    user_id = validate_session(token)
    if not user_id:
        return None
    
    conn = get_db_connection()
    user = conn.execute(
        'SELECT id, username, email, role, must_change_password FROM users WHERE id = ?',
        (user_id,)
    ).fetchone()
    conn.close()
    
    return dict(user) if user else None
