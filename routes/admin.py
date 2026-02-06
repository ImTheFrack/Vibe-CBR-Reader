from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from database import get_all_users, delete_user, update_user_role, update_user_password
from dependencies import get_admin_user

router = APIRouter(prefix="/api/admin", tags=["admin"])

class RoleUpdate(BaseModel):
    role: str

class PasswordReset(BaseModel):
    new_password: str

@router.get("/users")
async def list_users(admin_user: dict = Depends(get_admin_user)):
    """List all users (admin only)"""
    users = get_all_users()
    return users

@router.put("/users/{user_id}/role")
async def admin_update_user_role(user_id: int, data: RoleUpdate, admin_user: dict = Depends(get_admin_user)):
    """Update user role (admin only)"""
    if data.role not in ['admin', 'reader']:
        raise HTTPException(status_code=400, detail="Invalid role")
    
    # Prevent admin from changing their own role (safety)
    if user_id == admin_user['id'] and data.role != 'admin':
        raise HTTPException(status_code=400, detail="Cannot demote yourself")
    
    success = update_user_role(user_id, data.role)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to update role")
    
    return {"message": "Role updated"}

@router.put("/users/{user_id}/password")
async def admin_reset_password(user_id: int, data: PasswordReset, admin_user: dict = Depends(get_admin_user)):
    """Force reset user password (admin only)"""
    if len(data.new_password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    
    update_user_password(user_id, data.new_password, must_change=True)
    return {"message": "Password reset successful, user must change it on next login"}

@router.delete("/users/{user_id}")
async def admin_delete_user(user_id: int, admin_user: dict = Depends(get_admin_user)):
    """Delete a user (admin only)"""
    # Prevent admin from deleting themselves
    if user_id == admin_user['id']:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    
    delete_user(user_id)
    return {"message": "User deleted"}

@router.get("/gaps")
async def get_all_gaps(admin_user: dict = Depends(get_admin_user)):
    """Identify missing chapters/volumes across all series"""
    from db.series import get_gaps_report
    return get_gaps_report()
