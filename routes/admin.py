from fastapi import APIRouter, HTTPException, Depends
from database import get_all_users, delete_user
from dependencies import get_admin_user

router = APIRouter(prefix="/api/admin", tags=["admin"])

@router.get("/users")
async def list_users(admin_user: dict = Depends(get_admin_user)):
    """List all users (admin only)"""
    users = get_all_users()
    return users

@router.delete("/users/{user_id}")
async def admin_delete_user(user_id: str, admin_user: dict = Depends(get_admin_user)):
    """Delete a user (admin only)"""
    # Prevent admin from deleting themselves
    if user_id == admin_user['id']:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    
    delete_user(user_id)
    return {"message": "User deleted"}
