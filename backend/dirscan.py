import os
import json
import hashlib
from typing import List, Dict, Any

CACHE_DIR = os.path.join(os.path.dirname(__file__), "cache")

def ensure_cache_dir():
    if not os.path.exists(CACHE_DIR):
        os.makedirs(CACHE_DIR)

def get_cache_path(folder_path: str, mtime: float) -> str:
    # Hash basiert auf Pfad + MTime
    key = f"{folder_path}:{mtime}"
    h = hashlib.sha256(key.encode("utf-8")).hexdigest()
    return os.path.join(CACHE_DIR, f"{h}.json")

def scan_folder(folder_path: str) -> Dict[str, Any]:
    """
    Scannt ein Verzeichnis und gibt Dict mit Ordnern/Dateien zurück.
    """
    ensure_cache_dir()
    try:
        entries = []
        with os.scandir(folder_path) as it:
            for entry in it:
                stat = entry.stat(follow_symlinks=False)
                info = {
                    "name": entry.name,
                    "is_dir": entry.is_dir(follow_symlinks=False),
                    "mtime": stat.st_mtime,
                }
                if not entry.is_dir(follow_symlinks=False):
                    info["size"] = stat.st_size
                entries.append(info)
        # Cache schreiben
        mtime = os.stat(folder_path).st_mtime
        cache_path = get_cache_path(folder_path, mtime)
        with open(cache_path, "w") as f:
            json.dump({"path": folder_path, "mtime": mtime, "entries": entries}, f)
        return {"path": folder_path, "mtime": mtime, "entries": entries, "cache": cache_path}
    except Exception as e:
        return {"error": str(e)}

def load_cache(folder_path: str) -> Dict[str, Any]:
    """
    Lädt Cache für ein Verzeichnis, falls vorhanden und gültig.
    """
    try:
        mtime = os.stat(folder_path).st_mtime
        cache_path = get_cache_path(folder_path, mtime)
        if os.path.exists(cache_path):
            with open(cache_path) as f:
                return json.load(f)
    except Exception:
        pass
    return None

def invalidate_cache(folder_path: str):
    """
    Löscht alle Cache-Dateien für ein Verzeichnis (unabhängig von MTime).
    """
    ensure_cache_dir()
    for fname in os.listdir(CACHE_DIR):
        if fname.endswith(".json"):
            fpath = os.path.join(CACHE_DIR, fname)
            try:
                with open(fpath) as f:
                    data = json.load(f)
                    if data.get("path") == folder_path:
                        os.remove(fpath)
            except Exception:
                continue

def scan_or_cache(folder_path: str) -> Dict[str, Any]:
    """
    Gibt Cache zurück, scannt falls nötig.
    """
    cache = load_cache(folder_path)
    if cache:
        return cache
    return scan_folder(folder_path)
