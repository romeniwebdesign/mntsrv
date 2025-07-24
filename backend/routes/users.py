from fastapi import APIRouter, Depends, HTTPException, Form
from backend.services.user_service import (
    list_users_service,
    create_user_service,
    update_user_service,
    delete_user_service
)
from backend.services.auth_service import require_permission

router = APIRouter()

@router.get("/api/users")
def list_users(user=Depends(require_permission("manage_users"))):
    """List all users - admin only"""
    return list_users_service()

@router.post("/api/users")
def create_user(
    username: str = Form(...),
    password: str = Form(...),
    role: str = Form(default="standard"),
    user=Depends(require_permission("manage_users"))
):
    """Create a new user - admin only"""
    return create_user_service(username, password, role)

@router.put("/api/users/{username}")
def update_user(
    username: str,
    role: str = Form(default=None),
    password: str = Form(default=None),
    user=Depends(require_permission("manage_users"))
):
    """Update user role or password - admin only"""
    return update_user_service(username, role, password)

@router.delete("/api/users/{username}")
def delete_user(
    username: str,
    user=Depends(require_permission("manage_users"))
):
    """Delete a user - admin only"""
    return delete_user_service(username)

@router.get("/api/user/profile")
def get_user_profile(user=Depends(require_permission("browse"))):
    """Get current user's profile"""
    return {
        "username": user["username"],
        "role": user["role"],
        "is_admin": user["is_admin"]
    }
