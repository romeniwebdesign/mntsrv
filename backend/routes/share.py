from fastapi import APIRouter, Depends, HTTPException, Query, Form, Request
from backend.services.share_service import (
    list_shares_service,
    create_share_service,
    delete_share_service,
    access_share_service,
    download_share_service,
)
from backend.services.auth_service import get_current_user, require_permission

router = APIRouter()

@router.get("/api/shares")
def list_shares(user=Depends(get_current_user)):
    return list_shares_service(user)

@router.post("/api/share")
def create_share(
    path: str = Query(...),
    password: str = Query(default=None),
    expires_in: int = Query(default=3600),
    user=Depends(require_permission("share"))
):
    return create_share_service(path, password, expires_in, user)

@router.delete("/api/share/{token}")
def delete_share(token: str, user=Depends(get_current_user)):
    return delete_share_service(token, user)

@router.post("/api/share/{token}")
def access_share(token: str, password: str = Form(default=None)):
    return access_share_service(token, password)

@router.get("/api/share/{token}/download")
def download_share(
    token: str,
    password: str = Query(default=None),
    file: str = Query(default=None),
    request: Request = None,
):
    return download_share_service(token, password, file, request)

@router.post("/api/share/{token}/browse")
def browse_share_folder(
    token: str,
    path: str = Form(default=""),
    password: str = Form(default=None)
):
    from backend.services.share_service import browse_share_service
    return browse_share_service(token, password, path)

@router.get("/api/share/{token}/download-folder")
def download_share_folder(
    token: str,
    password: str = Query(default=None),
    path: str = Query(default=""),
    request: Request = None,
):
    from backend.services.share_service import download_folder_service
    return download_folder_service(token, password, path, request)
