import os
import json
from datetime import datetime, timezone
from fastapi import HTTPException
from backend.services.auth_service import pwd_context

USERS_FILE = os.path.join(os.path.dirname(__file__), "..", "config", "users.json")

def load_users():
    """Load users from JSON file"""
    try:
        with open(USERS_FILE) as f:
            return json.load(f)
    except Exception:
        return []

def save_users(users):
    """Save users to JSON file"""
    with open(USERS_FILE, "w") as f:
        json.dump(users, f, indent=2)

def list_users_service():
    """List all users (excluding passwords)"""
    users = load_users()
    return [
        {
            "username": user["username"],
            "role": user.get("role", "standard"),
            "created_at": user.get("created_at", "unknown")
        }
        for user in users
    ]

def create_user_service(username, password, role="standard"):
    """Create a new user"""
    if not username or not password:
        raise HTTPException(status_code=400, detail="Username and password are required")
    
    if role not in ["admin", "power", "standard", "readonly"]:
        raise HTTPException(status_code=400, detail="Invalid role")
    
    users = load_users()
    
    # Check if user already exists
    if any(user["username"] == username for user in users):
        raise HTTPException(status_code=400, detail="User already exists")
    
    # Hash password
    password_hash = pwd_context.hash(password)
    
    # Create user
    new_user = {
        "username": username,
        "password_hash": password_hash,
        "role": role,
        "created_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    }
    
    users.append(new_user)
    save_users(users)
    
    return {
        "username": username,
        "role": role,
        "created_at": new_user["created_at"]
    }

def update_user_service(username, role=None, password=None):
    """Update user role or password"""
    users = load_users()
    
    user_index = None
    for i, user in enumerate(users):
        if user["username"] == username:
            user_index = i
            break
    
    if user_index is None:
        raise HTTPException(status_code=404, detail="User not found")
    
    if role and role not in ["admin", "power", "standard", "readonly"]:
        raise HTTPException(status_code=400, detail="Invalid role")
    
    # Update user
    if role:
        users[user_index]["role"] = role
    
    if password:
        users[user_index]["password_hash"] = pwd_context.hash(password)
    
    save_users(users)
    
    return {
        "username": username,
        "role": users[user_index]["role"],
        "updated": True
    }

def delete_user_service(username):
    """Delete a user"""
    users = load_users()
    
    original_count = len(users)
    users = [user for user in users if user["username"] != username]
    
    if len(users) == original_count:
        raise HTTPException(status_code=404, detail="User not found")
    
    save_users(users)
    
    return {"username": username, "deleted": True}
