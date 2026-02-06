from fastapi import APIRouter, HTTPException, Depends, Cookie
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional, Dict, Any
import os
from database import create_user, authenticate_user, create_session, delete_session
from dependencies import get_current_user, get_optional_user

router = APIRouter(prefix="/api/auth", tags=["auth"])

class UserCreate(BaseModel):
    username: str
    password: str
    email: Optional[str] = None
    role: str = "reader"

class UserLogin(BaseModel):
    username: str
    password: str

@router.post("/register")
async def register(user_data: UserCreate) -> Dict[str, Any]:
    """Register a new user account"""
    if len(user_data.username) < 3:
        raise HTTPException(status_code=400, detail="Username must be at least 3 characters")
    if len(user_data.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    
    # Force role to 'reader' regardless of input
    user_id = create_user(user_data.username, user_data.password, user_data.email, role="reader")
    
    if not user_id:
        raise HTTPException(status_code=400, detail="Username already exists")
    
    return {"message": "User created successfully", "user_id": user_id}

@router.post("/login")
async def login(user_data: UserLogin) -> JSONResponse:
    """Login and create session"""
    user = authenticate_user(user_data.username, user_data.password)
    
    if not user:
        raise HTTPException(status_code=401, detail="Invalid username or password")
    
    # Create session token
    token = create_session(user['id'], expires_hours=720)  # 30 days
    
    response = JSONResponse({
        "message": "Login successful",
        "user": {
            "id": user['id'],
            "username": user['username'],
            "email": user['email'],
            "role": user['role'],
            "must_change_password": bool(user.get('must_change_password', 0))
        }
    })
    
    # Set session cookie
    # VIBE_COOKIE_SECURE controls whether to require HTTPS (default: False for localhost dev)
    cookie_secure = os.environ.get("VIBE_COOKIE_SECURE", "false").lower() == "true"
    response.set_cookie(
        key="session_token",
        value=token,
        httponly=True,
        secure=cookie_secure,
        max_age=2592000,  # 30 days
        samesite="lax"
    )
    
    return response

@router.post("/logout")
async def logout(token: Optional[str] = Cookie(None, alias="session_token")) -> JSONResponse:
    """Logout and invalidate session"""
    if token:
        delete_session(token)
    
    response = JSONResponse({"message": "Logout successful"})
    response.delete_cookie(key="session_token")
    return response

@router.get("/me")
async def get_me(current_user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    """Get current user info"""
    return {
        "id": current_user['id'],
        "username": current_user['username'],
        "email": current_user['email'],
        "role": current_user['role'],
        "must_change_password": bool(current_user.get('must_change_password', 0))
    }

@router.get("/check")
async def check_auth(current_user: Optional[Dict[str, Any]] = Depends(get_optional_user)) -> Dict[str, Any]:
    """Check if user is authenticated (returns user or null)"""
    if current_user:
        return {
            "authenticated": True,
            "user": {
                "id": current_user['id'],
                "username": current_user['username'],
                "email": current_user['email'],
                "role": current_user['role'],
                "must_change_password": bool(current_user.get('must_change_password', 0))
            }
        }
    return {"authenticated": False, "user": None}
