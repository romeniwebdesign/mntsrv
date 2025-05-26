import os
import json
import secrets
from datetime import datetime, timedelta, timezone
from fastapi import HTTPException
from fastapi.responses import StreamingResponse
from backend.services.auth_service import pwd_context
from backend.utils.path_utils import SCAN_ROOT, is_safe_path
from backend.services.dirscan_service import scan_or_cache
import os

SHARE_FILE = os.path.join(os.path.dirname(__file__), "..", "config", "share.json")

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

def list_shares_service(user):
    shares = load_shares()
    return [
        {
            "token": s["token"],
            "path": s["path"],
            "expires_at": s["expires_at"],
        }
        for s in shares
    ]

def create_share_service(path, password, expires_in, user):
    abs_path = os.path.join(SCAN_ROOT, path.lstrip("/"))
    print(f"[DEBUG] create_share_service: path={path}, abs_path={abs_path}")
    if not os.path.exists(abs_path):
        raise HTTPException(status_code=404, detail="Path not found")
    if not is_safe_path(SCAN_ROOT, abs_path):
        raise HTTPException(status_code=403, detail="Pfad nicht erlaubt")
    token = create_share_token()
    expires_at = (datetime.now(timezone.utc) + timedelta(seconds=expires_in)).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    password_hash = None
    if password:
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

def delete_share_service(token, user):
    shares = load_shares()
    new_shares = [s for s in shares if s["token"] != token]
    if len(new_shares) == len(shares):
        raise HTTPException(status_code=404, detail="Share not found")
    save_shares(new_shares)
    return {"status": "deleted", "token": token}

def access_share_service(token, password):
    shares = load_shares()
    share = next((s for s in shares if s["token"] == token), None)
    if not share:
        raise HTTPException(status_code=404, detail="Share not found")
    if datetime.now(timezone.utc) > datetime.fromisoformat(share["expires_at"]):
        raise HTTPException(status_code=403, detail="Share expired")
    if share["password_hash"]:
        valid = False
        try:
            valid = pwd_context.verify(password, share["password_hash"])
        except Exception:
            pass
        if not password or not valid:
            raise HTTPException(status_code=401, detail="Password required or incorrect")
    abs_path = os.path.join(SCAN_ROOT, share["path"].lstrip("/"))
    if not is_safe_path(SCAN_ROOT, abs_path):
        raise HTTPException(status_code=403, detail="Pfad nicht erlaubt")
    if os.path.isdir(abs_path):
        data = scan_or_cache(abs_path)
        if "error" in data:
            raise HTTPException(status_code=400, detail=data["error"])
        return {
            "type": "folder",
            "path": share["path"],
            "entries": data["entries"],
            "token": token,
            "password_required": bool(share["password_hash"]),
        }
    elif os.path.isfile(abs_path):
        return {
            "type": "file",
            "path": share["path"],
            "token": token,
            "password_required": bool(share["password_hash"]),
        }
    else:
        raise HTTPException(status_code=404, detail="Path not found")

def download_share_service(token, password, file, request):
    shares = load_shares()
    share = next((s for s in shares if s["token"] == token), None)
    if not share:
        raise HTTPException(status_code=404, detail="Share not found")
    if datetime.now(timezone.utc) > datetime.fromisoformat(share["expires_at"]):
        raise HTTPException(status_code=403, detail="Share expired")
    if share["password_hash"]:
        if not password or not pwd_context.verify(password, share["password_hash"]):
            raise HTTPException(status_code=401, detail="Password required or incorrect")

    abs_share_path = os.path.join(SCAN_ROOT, share["path"].lstrip("/"))
    if not is_safe_path(SCAN_ROOT, abs_share_path):
        raise HTTPException(status_code=403, detail="Pfad nicht erlaubt")

    if file and os.path.isdir(abs_share_path):
        abs_file = os.path.join(abs_share_path, file)
        if not is_safe_path(abs_share_path, abs_file) or not os.path.isfile(abs_file):
            raise HTTPException(status_code=404, detail="File not found")
        path = abs_file
    elif os.path.isfile(abs_share_path):
        path = abs_share_path
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

    from fastapi.responses import StreamingResponse

    if range_header:
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

    return StreamingResponse(
        file_iterator(0, file_size),
        media_type="application/octet-stream",
        headers={
            "Content-Length": str(file_size),
            "Content-Disposition": f'attachment; filename="{os.path.basename(path)}"',
            "Accept-Ranges": "bytes",
        },
    )
