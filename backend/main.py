import os
from fastapi import FastAPI, Depends, HTTPException, status, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from passlib.context import CryptContext
import jwt
import json
from datetime import datetime, timedelta, timezone

# ENV laden
load_dotenv()

ADMIN_USER = os.getenv("ADMIN_USER", "admin")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "supersecret")
PORT = int(os.getenv("PORT", 8000))
JWT_SECRET = os.getenv("JWT_SECRET", "supersecretjwt")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_MINUTES = 60

from backend.utils.path_utils import SCAN_ROOT, is_safe_path

app = FastAPI()

# Automatischer Start-Scan bei Backend-Startup
import threading

def run_startup_scan():
    from backend.services.dirscan_service import invalidate_cache
    from backend.services.scan_service import start_background_scan
    print("Invalidating cache for SCAN_ROOT...")
    invalidate_cache(SCAN_ROOT)
    print("Starte automatischen Hintergrund-Scan von SCAN_ROOT...")
    start_background_scan(SCAN_ROOT)

@app.on_event("startup")
def startup_event():
    t = threading.Thread(target=run_startup_scan, daemon=True)
    t.start()

# CORS für Frontend-Entwicklung
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# StaticFiles für Frontend
frontend_build_path = os.path.join(os.path.dirname(__file__), "../frontend/build")
# (Mount wird ans Ende verschoben)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def verify_password(plain_password, user):
    if user.get("is_admin"):
        return plain_password == ADMIN_PASSWORD
    return pwd_context.verify(plain_password, user["password_hash"])

def get_user(username):
    # Admin aus ENV
    if username == ADMIN_USER:
        return {"username": ADMIN_USER, "password_hash": None, "is_admin": True}
    # User aus users.json
    try:
        with open(os.path.join(os.path.dirname(__file__), "config", "users.json")) as f:
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

from fastapi.security import OAuth2PasswordBearer
from backend.routes.auth import router as auth_router
from backend.routes.share import router as share_router
from backend.routes.users import router as users_router
from backend.services.auth_service import get_user, verify_password, create_access_token, get_current_user, require_permission

app.include_router(auth_router)
app.include_router(share_router)
app.include_router(users_router)

@app.get("/api/ping")
def ping():
    return {"status": "ok"}

from fastapi import Query, Form
from backend.services.dirscan_service import scan_or_cache, invalidate_cache
from backend.services.search_service import search_files
from backend.services.scan_service import start_background_scan, load_status


MAX_ENTRIES = 200

@app.get("/api/folder")
def list_folder(
    path: str = Query(default=None),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=MAX_ENTRIES, le=MAX_ENTRIES),
    user=Depends(get_current_user)
):
    # Root oder Unterordner
    if path in (None, "", "/"):
        rel_path = ""
    else:
        rel_path = path.lstrip("/")
    abs_path = os.path.join(SCAN_ROOT, rel_path)
    if not is_safe_path(SCAN_ROOT, abs_path):
        raise HTTPException(status_code=403, detail="Pfad nicht erlaubt")
    data = scan_or_cache(abs_path)
    if "error" in data:
        raise HTTPException(status_code=400, detail=data["error"])
    entries = data["entries"][offset : offset + limit]
    # has_children für Ordner
    for entry in entries:
        if entry["is_dir"]:
            sub_rel_path = os.path.join(rel_path, entry["name"]) if rel_path else entry["name"]
            sub_abs_path = os.path.join(SCAN_ROOT, sub_rel_path)
            if not is_safe_path(SCAN_ROOT, sub_abs_path):
                entry["has_children"] = False
            else:
                sub = scan_or_cache(sub_abs_path)
                entry["has_children"] = bool(sub.get("entries"))
        else:
            entry["has_children"] = False
    return {
        "path": rel_path,
        "entries": entries,
        "total": len(data["entries"]),
        "offset": offset,
        "limit": limit,
        "has_more": offset + limit < len(data["entries"]),
    }

@app.post("/api/scan")
def rescan_folder(
    path: str = Query(default=None),
    recursive: bool = Query(default=False),
    async_scan: bool = Query(default=True),  # Standardmäßig immer async!
    user=Depends(get_current_user)
):
    folder_path = path or SCAN_ROOT
    if not is_safe_path(SCAN_ROOT, folder_path):
        raise HTTPException(status_code=403, detail="Pfad nicht erlaubt")
    # Immer im Hintergrund-Thread scannen, blockiere nie den Hauptthread!
    start_background_scan(folder_path)
    return {"status": "scan started", "async": True, "path": folder_path}

def count_from_cache(folder_path):
    import glob
    import json
    import os

    # Map all cache files by their "path"
    cache_dir = os.path.join(os.path.dirname(__file__), "cache")
    path_to_cache = {}
    for f in glob.glob(os.path.join(cache_dir, "*.json")):
        try:
            with open(f) as fh:
                data = json.load(fh)
                path_to_cache[data.get("path")] = f
        except Exception:
            continue

    def recurse(path):
        cache_file = path_to_cache.get(path)
        if not cache_file:
            return (0, 0)
        try:
            with open(cache_file) as fh:
                data = json.load(fh)
            folders = 1  # count this folder
            files = 0
            for entry in data.get("entries", []):
                if entry.get("is_dir"):
                    subfolders, subfiles = recurse(os.path.join(path, entry["name"]))
                    folders += subfolders
                    files += subfiles
                else:
                    files += 1
            return (folders, files)
        except Exception:
            return (0, 0)

    return recurse(folder_path)

# Replace your existing scan_status endpoint with this improved version:

from backend.services.scan_service import get_scan_status

@app.get("/api/scan_status")
def scan_status():
    return get_scan_status(SCAN_ROOT)


@app.get("/api/search")
def search_endpoint(
    q: str = Query(..., min_length=2),
    path: str = Query(default=None),
    limit: int = Query(default=100, le=500),
    user=Depends(get_current_user)
):
    root = path or SCAN_ROOT
    if not is_safe_path(SCAN_ROOT, root):
        raise HTTPException(status_code=403, detail="Pfad nicht erlaubt")
    results = search_files(root, q, max_results=limit)
    return {"results": results}

@app.delete("/api/file")
def delete_file(
    path: str = Query(...),
    user=Depends(require_permission("delete"))
):
    """Delete a file or directory"""
    if not path or path in ("", "/"):
        raise HTTPException(status_code=400, detail="Invalid path")
    
    rel_path = path.lstrip("/")
    abs_path = os.path.join(SCAN_ROOT, rel_path)
    
    if not is_safe_path(SCAN_ROOT, abs_path):
        raise HTTPException(status_code=403, detail="Path not allowed")
    
    if not os.path.exists(abs_path):
        raise HTTPException(status_code=404, detail="File or directory not found")
    
    try:
        import shutil
        if os.path.isdir(abs_path):
            shutil.rmtree(abs_path)
        else:
            os.remove(abs_path)
        
        # Invalidate cache for parent directory
        parent_dir = os.path.dirname(abs_path)
        invalidate_cache(parent_dir)
        
        return {"status": "deleted", "path": path}
    except Exception as e:
        import logging
        logging.error(f"Error while deleting file: {str(e)}")
        raise HTTPException(status_code=500, detail="An error occurred while deleting the file.")

@app.put("/api/file/rename")
def rename_file(
    old_path: str = Query(...),
    new_name: str = Query(...),
    user=Depends(require_permission("rename"))
):
    """Rename a file or directory"""
    if not old_path or old_path in ("", "/"):
        raise HTTPException(status_code=400, detail="Invalid path")
    
    if not new_name or "/" in new_name or "\\" in new_name:
        raise HTTPException(status_code=400, detail="Invalid new name")
    
    rel_path = old_path.lstrip("/")
    abs_old_path = os.path.join(SCAN_ROOT, rel_path)
    
    if not is_safe_path(SCAN_ROOT, abs_old_path):
        raise HTTPException(status_code=403, detail="Path not allowed")
    
    if not os.path.exists(abs_old_path):
        raise HTTPException(status_code=404, detail="File or directory not found")
    
    # Create new path
    parent_dir = os.path.dirname(abs_old_path)
    abs_new_path = os.path.join(parent_dir, new_name)
    
    if not is_safe_path(SCAN_ROOT, abs_new_path):
        raise HTTPException(status_code=403, detail="New path not allowed")
    
    if os.path.exists(abs_new_path):
        raise HTTPException(status_code=400, detail="File or directory with new name already exists")
    
    try:
        os.rename(abs_old_path, abs_new_path)
        
        # Invalidate cache for parent directory
        invalidate_cache(parent_dir)
        
        # Calculate new relative path
        new_rel_path = os.path.relpath(abs_new_path, SCAN_ROOT)
        if new_rel_path == ".":
            new_rel_path = ""
        
        return {"status": "renamed", "old_path": old_path, "new_path": new_rel_path, "new_name": new_name}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to rename: {str(e)}")

# StaticFiles für Frontend (nur auf /static mounten)
if os.path.exists(frontend_build_path):
    app.mount("/static", StaticFiles(directory=os.path.join(frontend_build_path, "static")), name="static")

# (Removed /public mount; static files are served from build directory)

# SPA-Catch-All: Liefere index.html für alle unbekannten Routen (außer /api/ und /static/)
from fastapi.responses import FileResponse

@app.get("/mitm.html")
def mitm_html():
    path = os.path.join(frontend_build_path, "mitm.html")
    if os.path.exists(path):
        return FileResponse(path, media_type="text/html")
    raise HTTPException(status_code=404)

@app.get("/mitm.js")
def mitm_js():
    path = os.path.join(frontend_build_path, "mitm.js")
    if os.path.exists(path):
        return FileResponse(path, media_type="application/javascript")
    raise HTTPException(status_code=404)

@app.get("/manifest.json")
def manifest_json():
    path = os.path.join(frontend_build_path, "manifest.json")
    if os.path.exists(path):
        return FileResponse(path, media_type="application/json")
    raise HTTPException(status_code=404)

@app.get("/favicon.ico")
def favicon_ico():
    path = os.path.join(frontend_build_path, "favicon.ico")
    if os.path.exists(path):
        return FileResponse(path, media_type="image/x-icon")
    raise HTTPException(status_code=404)

@app.get("/robots.txt")
def robots_txt():
    path = os.path.join(frontend_build_path, "robots.txt")
    if os.path.exists(path):
        return FileResponse(path, media_type="text/plain")
    raise HTTPException(status_code=404)

@app.api_route("/{full_path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"])
def catch_all(full_path: str, request: Request):
    # Nur wenn kein /api/ und keine statische Datei
    if full_path.startswith("api/") or full_path.startswith("static/"):
        raise HTTPException(status_code=404, detail="Not Found")
    index_path = os.path.join(frontend_build_path, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    raise HTTPException(status_code=404, detail="Not Found")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host="0.0.0.0", port=PORT, reload=True)
