import os
import json
from datetime import datetime, timedelta
from passlib.context import CryptContext
import jwt

ADMIN_USER = os.getenv("ADMIN_USER", "admin")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "supersecret")
JWT_SECRET = os.getenv("JWT_SECRET", "supersecretjwt")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_MINUTES = 60

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def verify_password(plain_password, user):
    if user.get("is_admin"):
        return plain_password == ADMIN_PASSWORD
    return pwd_context.verify(plain_password, user["password_hash"])

def get_user(username):
    # Admin from ENV
    if username == ADMIN_USER:
        return {"username": ADMIN_USER, "password_hash": None, "is_admin": True}
    # User from users.json
    try:
        users_path = os.path.join(os.path.dirname(__file__), "..", "config", "users.json")
        with open(users_path) as f:
            users = json.load(f)
        for user in users:
            if user["username"] == username:
                return {"username": user["username"], "password_hash": user["password_hash"], "is_admin": False}
    except Exception:
        pass
    return None

def create_access_token(data: dict, expires_delta: timedelta = None):
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=JWT_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)

from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/login")

def get_current_user(token: str = Depends(oauth2_scheme)):
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        username = payload.get("sub")
        if username is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        user = get_user(username)
        if user is None:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")
