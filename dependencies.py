from fastapi import HTTPException, Cookie, Depends
from database import validate_session, get_db_connection
from typing import Optional, Dict, Any
import logging

logger = logging.getLogger(__name__)

async def get_current_user(token: Optional[str] = Cookie(None, alias="session_token")) -> Dict[str, Any]:
    """Dependency to get current authenticated user"""
    if not token:
        logger.warning("Auth failed: No session token")
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    user_id = validate_session(token)
    if not user_id:
        logger.warning(f"Auth failed: Invalid session token (token={token[:10]}...)")
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    
    conn = get_db_connection()
    user = conn.execute(
        'SELECT u.id, u.username, u.email, u.role, u.must_change_password, COALESCE(up.nsfw_mode, \'off\') as nsfw_mode FROM users u LEFT JOIN user_preferences up ON u.id = up.user_id WHERE u.id = ?',
        (user_id,)
    ).fetchone()
    conn.close()
    
    if not user:
        logger.error(f"Auth failed: User ID {user_id} from valid session not found in DB")
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
