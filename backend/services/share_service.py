import os
import json
import secrets
from datetime import datetime, timedelta, timezone
from fastapi import HTTPException
from fastapi.responses import StreamingResponse
from backend.services.auth_service import pwd_context
from backend.utils.path_utils import SCAN_ROOT, is_safe_path
from backend.services.dirscan_service import scan_or_cache
from backend.utils.datetime_utils import format_utc_timestamp
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
    
    # Admin can see all shares, others only see their own
    if user.get("role") == "admin":
        filtered_shares = shares
    else:
        filtered_shares = [s for s in shares if s.get("created_by") == user.get("username")]
    
    return [
        {
            "token": s["token"],
            "path": s["path"],
            "expires_at": s["expires_at"],
            "created_by": s.get("created_by", "unknown"),
        }
        for s in filtered_shares
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
        "created_by": user.get("username"),
        "created_at": format_utc_timestamp(),
    }
    shares = load_shares()
    shares.append(share)
    save_shares(shares)
    return {"share_url": f"/api/share/{token}", "token": token, "expires_at": expires_at}

def delete_share_service(token, user):
    shares = load_shares()
    share_to_delete = next((s for s in shares if s["token"] == token), None)
    
    if not share_to_delete:
        raise HTTPException(status_code=404, detail="Share not found")
    
    # Check if user can delete this share
    if user.get("role") != "admin" and share_to_delete.get("created_by") != user.get("username"):
        raise HTTPException(status_code=403, detail="You can only delete your own shares")
    
    new_shares = [s for s in shares if s["token"] != token]
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

def browse_share_service(token, password, path):
    """
    Browse a subfolder within a shared folder.

    Args:
        token (str): The unique token identifying the shared folder.
        password (str): The password for accessing the shared folder, if required.
        path (str): The relative path within the shared folder to browse.

    Returns:
        dict: A dictionary containing the folder's metadata and its entries. The structure includes:
            - type (str): Always "folder".
            - path (str): The relative path within the share.
            - share_path (str): The base path of the shared folder.
            - entries (list): A list of entries (files and subfolders) in the folder.
            - token (str): The token used for accessing the share.
            - password_required (bool): Whether a password is required to access the share.

    Raises:
        HTTPException: If any of the following conditions occur:
            - 404: The share is not found.
            - 403: The share has expired, or the path is not allowed.
            - 401: The password is required or incorrect.
            - 400: The share is not a folder, or an error occurs during folder scanning.
    """
    shares = load_shares()
    share = next((s for s in shares if s["token"] == token), None)
    if not share:
        raise HTTPException(status_code=404, detail="Share not found")
    
    if datetime.now(timezone.utc) > datetime.fromisoformat(share["expires_at"]):
        raise HTTPException(status_code=403, detail="Share expired")
    
    if share["password_hash"]:
        if not password or not pwd_context.verify(password, share["password_hash"]):
            raise HTTPException(status_code=401, detail="Password required or incorrect")

    # Get the base share path
    abs_share_path = os.path.join(SCAN_ROOT, share["path"].lstrip("/"))
    if not is_safe_path(SCAN_ROOT, abs_share_path):
        raise HTTPException(status_code=403, detail="Path not allowed")
    
    # Only allow browsing if the share is a folder
    if not os.path.isdir(abs_share_path):
        raise HTTPException(status_code=400, detail="Share is not a folder")
    
    # Build the target path within the share
    if path:
        target_path = os.path.join(abs_share_path, path.lstrip("/"))
    else:
        target_path = abs_share_path
    
    # Ensure the target path is within the shared folder
    if not is_safe_path(abs_share_path, target_path):
        raise HTTPException(status_code=403, detail="Path not allowed")
    
    if not os.path.exists(target_path) or not os.path.isdir(target_path):
        raise HTTPException(status_code=404, detail="Folder not found")
    
    # Scan the folder
    data = scan_or_cache(target_path)
    if "error" in data:
        raise HTTPException(status_code=400, detail=data["error"])
    
    return {
        "type": "folder",
        "path": path,
        "share_path": share["path"],
        "entries": data["entries"],
        "token": token,
        "password_required": bool(share["password_hash"]),
    }

def download_folder_service(token, password, path, request):
    """Download an entire folder as a ZIP file"""
    import zipfile
    import tempfile
    import shutil
    from io import BytesIO
    
    shares = load_shares()
    share = next((s for s in shares if s["token"] == token), None)
    if not share:
        raise HTTPException(status_code=404, detail="Share not found")
    
    if datetime.now(timezone.utc) > datetime.fromisoformat(share["expires_at"]):
        raise HTTPException(status_code=403, detail="Share expired")
    
    if share["password_hash"]:
        if not password or not pwd_context.verify(password, share["password_hash"]):
            raise HTTPException(status_code=401, detail="Password required or incorrect")

    # Get the base share path
    abs_share_path = os.path.join(SCAN_ROOT, share["path"].lstrip("/"))
    if not is_safe_path(SCAN_ROOT, abs_share_path):
        raise HTTPException(status_code=403, detail="Path not allowed")
    
    # Build the target path within the share
    if path:
        target_path = os.path.join(abs_share_path, path.lstrip("/"))
        folder_name = os.path.basename(path.rstrip("/")) or "folder"
    else:
        target_path = abs_share_path
        folder_name = os.path.basename(share["path"].rstrip("/")) or "share"
    
    # Ensure the target path is within the shared folder
    if not is_safe_path(abs_share_path, target_path):
        raise HTTPException(status_code=403, detail="Path not allowed")
    
    if not os.path.exists(target_path):
        raise HTTPException(status_code=404, detail="Path not found")
    
    def stream_zip():
        with zipfile.ZipFile(BytesIO(), 'w', zipfile.ZIP_DEFLATED) as zip_file:
            if os.path.isfile(target_path):
                # Single file
                zip_file.write(target_path, os.path.basename(target_path))
            else:
                # Directory - add all files recursively
                for root, dirs, files in os.walk(target_path):
                    for file in files:
                        file_path = os.path.join(root, file)
                        # Create relative path within zip
                        arcname = os.path.relpath(file_path, target_path)
                        zip_file.write(file_path, arcname)
        
        zip_buffer.seek(0)
        return zip_buffer.getvalue()
    
    zip_data = create_zip()
    
    def zip_iterator():
        yield zip_data
    
    return StreamingResponse(
        zip_iterator(),
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{folder_name}.zip"',
            "Content-Length": str(len(zip_data)),
        },
    )
