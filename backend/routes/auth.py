from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from backend.services.auth_service import get_user, verify_password, create_access_token

router = APIRouter()

@router.post("/api/login")
def login(form_data: OAuth2PasswordRequestForm = Depends()):
    user = get_user(form_data.username)
    if not user or not verify_password(form_data.password, user):
        raise HTTPException(status_code=401, detail="Incorrect username or password")
    access_token = create_access_token(data={
        "sub": user["username"], 
        "is_admin": user["is_admin"],
        "role": user["role"]
    })
    return {
        "access_token": access_token, 
        "token_type": "bearer",
        "user": {
            "username": user["username"],
            "role": user["role"],
            "is_admin": user["is_admin"]
        }
    }
