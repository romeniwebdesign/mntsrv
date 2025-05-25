import os
import threading
import json
import time

def walk_scandir(top):
    """Yields (dirpath, dirs, files) like os.walk, but uses os.scandir for speed."""
    dirs, files = [], []
    try:
        with os.scandir(top) as it:
            for entry in it:
                if entry.is_dir(follow_symlinks=False):
                    dirs.append(entry.name)
                else:
                    files.append(entry.name)
    except PermissionError:
        return
    yield top, dirs, files
    for dirname in dirs:
        new_path = os.path.join(top, dirname)
        yield from walk_scandir(new_path)

SCAN_STATUS_FILE = os.path.join(os.path.dirname(__file__), "scan_status.json")
lock = threading.Lock()

def save_status(status):
    try:
        with lock:
            with open(SCAN_STATUS_FILE, "w") as f:
                json.dump(status, f)
    except Exception as e:
        print("Fehler beim Schreiben von scan_status.json:", e)

def load_status():
    with lock:
        if not os.path.exists(SCAN_STATUS_FILE):
            return None
        with open(SCAN_STATUS_FILE) as f:
            return json.load(f)

def _scan_folder(folder):
    """Scan a single folder tree, return (num_folders, num_files, index_entries)."""
    num_folders = 0
    num_files = 0
    index = []
    for dirpath, dirs, files in walk_scandir(folder):
        num_folders += len(dirs)
        num_files += len(files)
        for name in dirs + files:
            full_path = os.path.join(dirpath, name)
            index.append({
                "name": name,
                "path": full_path,
                "is_dir": os.path.isdir(full_path)
            })
    return num_folders, num_files, index

def background_scan(root):
    import datetime
    import concurrent.futures

    # List top-level folders and files in root
    try:
        with os.scandir(root) as it:
            top_dirs = [entry.name for entry in it if entry.is_dir(follow_symlinks=False)]
    except PermissionError:
        top_dirs = []

    # Scan files and folders recursively, including root
    num_folders = 1  # count root itself
    num_files = 0
    index = []
    try:
        with os.scandir(root) as it:
            for entry in it:
                if entry.is_file(follow_symlinks=False):
                    num_files += 1
                    index.append({
                        "name": entry.name,
                        "path": os.path.join(root, entry.name),
                        "is_dir": False
                    })
    except PermissionError:
        pass

    # Parallel scan of top-level folders
    with concurrent.futures.ThreadPoolExecutor() as executor:
        futures = []
        for dirname in top_dirs:
            full_path = os.path.join(root, dirname)
            futures.append(executor.submit(_scan_folder, full_path))
        for future in concurrent.futures.as_completed(futures):
            res_folders, res_files, res_index = future.result()
            num_folders += res_folders  # already includes all subfolders
            num_files += res_files
            index.extend(res_index)

    total = num_folders + num_files
    scanned = 0
    start_time = datetime.datetime.now().isoformat()
    status = {
        "total": total,
        "num_folders": num_folders,
        "num_files": num_files,
        "scanned": 0,
        "current": "",
        "done": False,
        "start_time": start_time,
        "end_time": None
    }
    save_status(status)

    # Progress update loop
    for entry in index:
        status["scanned"] += 1
        status["current"] = entry["path"]
        # Nur alle 10 Einträge speichern, außer am Ende
        if status["scanned"] % 10 == 0 or status["scanned"] == total:
            save_status(status)
        time.sleep(0.001)  # Simuliere Arbeit, damit Fortschritt sichtbar ist

    # Index speichern
    config_dir = os.path.join(os.path.dirname(__file__), "config")
    os.makedirs(config_dir, exist_ok=True)
    index_file = os.path.join(config_dir, "search_index.json")
    try:
        with open(index_file, "w") as f:
            json.dump(index, f)
    except Exception as e:
        print("Fehler beim Schreiben von search_index.json:", e)

    status["done"] = True
    status["end_time"] = datetime.datetime.now().isoformat()
    save_status(status)

def start_background_scan(root):
    t = threading.Thread(target=background_scan, args=(root,), daemon=True)
    t.start()
