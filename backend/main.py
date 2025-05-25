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
SCAN_ROOT = os.getenv("SCAN_ROOT", "/tmp")
PORT = int(os.getenv("PORT", 8000))
JWT_SECRET = os.getenv("JWT_SECRET", "supersecretjwt")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_MINUTES = 60

app = FastAPI()

# Automatischer Start-Scan bei Backend-Startup
import threading

def run_startup_scan():
    from scan_progress import start_background_scan
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

from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm

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

@app.post("/api/login")
def login(form_data: OAuth2PasswordRequestForm = Depends()):
    user = get_user(form_data.username)
    if not user or not verify_password(form_data.password, user):
        raise HTTPException(status_code=401, detail="Incorrect username or password")
    access_token = create_access_token(data={"sub": user["username"], "is_admin": user["is_admin"]})
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/api/ping")
def ping():
    return {"status": "ok"}

from fastapi import Query, Form
from dirscan import scan_or_cache, invalidate_cache
from search import search_files
from scan_progress import start_background_scan, load_status

def is_safe_path(base, path):
    # Prüft, ob path ein Unterpfad von base ist (keine Ausbrüche!)
    base = os.path.realpath(base)
    target = os.path.realpath(path)
    return os.path.commonpath([base, target]) == base

MAX_ENTRIES = 200

@app.get("/api/folder")
def list_folder(
    path: str = Query(default=None),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=MAX_ENTRIES, le=MAX_ENTRIES),
    user=Depends(get_current_user)
):
    # Root oder Unterordner
    folder_path = path or SCAN_ROOT
    if not is_safe_path(SCAN_ROOT, folder_path):
        raise HTTPException(status_code=403, detail="Pfad nicht erlaubt")
    data = scan_or_cache(folder_path)
    if "error" in data:
        raise HTTPException(status_code=400, detail=data["error"])
    entries = data["entries"][offset : offset + limit]
    # has_children für Ordner
    for entry in entries:
        if entry["is_dir"]:
            sub_path = os.path.join(folder_path, entry["name"])
            if not is_safe_path(SCAN_ROOT, sub_path):
                entry["has_children"] = False
            else:
                sub = scan_or_cache(sub_path)
                entry["has_children"] = bool(sub.get("entries"))
        else:
            entry["has_children"] = False
    return {
        "path": folder_path,
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

@app.get("/api/scan_status")
def scan_status():
    status = load_status()
    if not status:
        status = {"status": "idle"}
    # Use cache for stats
    num_folders, num_files = count_from_cache(SCAN_ROOT)
    total = num_folders + num_files
    status["num_folders"] = num_folders
    status["num_files"] = num_files
    status["total"] = total
    return status

import secrets

SHARE_FILE = os.path.join(os.path.dirname(__file__), "config", "share.json")

def load_shares():
    try:
        with open(SHARE_FILE) as f:
            return json.load(f)
    except Exception:
        return []

def save_shares(shares):
    with open(SHARE_FILE, "w") as f:
        json.dump(shares, f)

def create_share_token():
    return secrets.token_urlsafe(16)

@app.get("/api/shares")
def list_shares(user=Depends(get_current_user)):
    shares = load_shares()
    # Keine Passwort-Hashes ausgeben
    return [
        {
            "token": s["token"],
            "path": s["path"],
            "expires_at": s["expires_at"],
        }
        for s in shares
    ]

@app.post("/api/share")
def create_share(
    path: str = Query(...),
    password: str = Query(default=None),
    expires_in: int = Query(default=3600),  # Ablaufzeit in Sekunden (Frontend rechnet Minuten in Sekunden um)
    user=Depends(get_current_user)
):
    # Existenz und Sicherheit prüfen
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Path not found")
    if not is_safe_path(SCAN_ROOT, path):
        raise HTTPException(status_code=403, detail="Pfad nicht erlaubt")
    token = create_share_token()
    expires_at = (datetime.now(timezone.utc) + timedelta(seconds=expires_in)).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    password_hash = None
    if password:
        # Immer korrekt hashen, niemals Klartext speichern!
        password_hash = pwd_context.hash(password)
    share = {
        "token": token,
        "path": path,
        "expires_at": expires_at,
        "password_hash": password_hash,
        "password_plain": password if password else None,
    }
    shares = load_shares()
    shares.append(share)
    save_shares(shares)
    return {"share_url": f"/api/share/{token}", "token": token, "expires_at": expires_at}

@app.delete("/api/share/{token}")
def delete_share(token: str, user=Depends(get_current_user)):
    shares = load_shares()
    new_shares = [s for s in shares if s["token"] != token]
    if len(new_shares) == len(shares):
        raise HTTPException(status_code=404, detail="Share not found")
    save_shares(new_shares)
    return {"status": "deleted", "token": token}

@app.post("/api/share/{token}")
def access_share(token: str, password: str = Form(default=None)):
    shares = load_shares()
    share = next((s for s in shares if s["token"] == token), None)
    print("DEBUG SHARE ACCESS: token =", token, "password =", password, "hash =", share["password_hash"] if share else None)
    if not share:
        print("DEBUG SHARE ACCESS: share not found")
        raise HTTPException(status_code=404, detail="Share not found")
    if datetime.now(timezone.utc) > datetime.fromisoformat(share["expires_at"]):
        print("DEBUG SHARE ACCESS: share expired")
        raise HTTPException(status_code=403, detail="Share expired")
    if share["password_hash"]:
        valid = False
        try:
            valid = pwd_context.verify(password, share["password_hash"])
        except Exception as e:
            print("DEBUG SHARE ACCESS: verify error", e)
        print("DEBUG SHARE ACCESS: verify result =", valid)
        if not password or not valid:
            print("DEBUG SHARE ACCESS: password required or incorrect")
            raise HTTPException(status_code=401, detail="Password required or incorrect")
    # Sicherheit: Nur Zugriff innerhalb SCAN_ROOT
    if not is_safe_path(SCAN_ROOT, share["path"]):
        raise HTTPException(status_code=403, detail="Pfad nicht erlaubt")
    # Ordner oder Datei-Listing
    if os.path.isdir(share["path"]):
        data = scan_or_cache(share["path"])
        if "error" in data:
            raise HTTPException(status_code=400, detail=data["error"])
        return {
            "type": "folder",
            "path": share["path"],
            "entries": data["entries"],
            "token": token,
            "password_required": bool(share["password_hash"]),
        }
    elif os.path.isfile(share["path"]):
        # Einzeldatei: Gib JSON zurück, Download erfolgt über dedizierten Endpunkt
        return {
            "type": "file",
            "path": share["path"],
            "token": token,
            "password_required": bool(share["password_hash"]),
        }
    else:
        raise HTTPException(status_code=404, detail="Path not found")

from fastapi.responses import StreamingResponse

@app.get("/api/share/{token}/download")
def download_share(
    token: str,
    password: str = Query(default=None),
    file: str = Query(default=None),
    request: Request = None,
):
    shares = load_shares()
    share = next((s for s in shares if s["token"] == token), None)
    if not share:
        raise HTTPException(status_code=404, detail="Share not found")
    if datetime.now(timezone.utc) > datetime.fromisoformat(share["expires_at"]):
        raise HTTPException(status_code=403, detail="Share expired")
    if share["password_hash"]:
        if not password or not pwd_context.verify(password, share["password_hash"]):
            raise HTTPException(status_code=401, detail="Password required or incorrect")
    if not is_safe_path(SCAN_ROOT, share["path"]):
        raise HTTPException(status_code=403, detail="Pfad nicht erlaubt")

    # Einzeldatei in Ordnerfreigabe
    if file and os.path.isdir(share["path"]):
        abs_file = os.path.join(share["path"], file)
        if not is_safe_path(share["path"], abs_file) or not os.path.isfile(abs_file):
            raise HTTPException(status_code=404, detail="File not found")
        path = abs_file
    # Einzeldatei-Freigabe
    elif os.path.isfile(share["path"]):
        path = share["path"]
    else:
        raise HTTPException(status_code=404, detail="File not found")

    file_size = os.path.getsize(path)
    range_header = request.headers.get("range") if request else None

    def file_iterator(start, end):
        with open(path, "rb") as f:
            f.seek(start)
            while start < end:
                chunk_size = min(1024 * 1024, end - start)
                data = f.read(chunk_size)
                if not data:
                    break
                start += len(data)
                yield data

    if range_header:
        # Beispiel: "bytes=1000-"
        try:
            _, range_spec = range_header.split("=")
            start_str, end_str = range_spec.split("-")
            start = int(start_str)
            end = int(end_str) if end_str else file_size - 1
            end = min(end, file_size - 1)
            length = end - start + 1
        except Exception:
            raise HTTPException(status_code=416, detail="Invalid Range header")

        return StreamingResponse(
            file_iterator(start, end + 1),
            status_code=206,
            media_type="application/octet-stream",
            headers={
                "Content-Range": f"bytes {start}-{end}/{file_size}",
                "Accept-Ranges": "bytes",
                "Content-Length": str(length),
                "Content-Disposition": f'attachment; filename="{os.path.basename(path)}"',
            },
        )

    # Kein Range-Header → vollständiger Download (mit Content-Length!)
    return StreamingResponse(
        file_iterator(0, file_size),
        media_type="application/octet-stream",
        headers={
            "Content-Length": str(file_size),
            "Content-Disposition": f'attachment; filename="{os.path.basename(path)}"',
            "Accept-Ranges": "bytes",
        },
    )

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
    uvicorn.run("main:app", host="0.0.0.0", port=PORT, reload=True)
