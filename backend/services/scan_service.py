import os
import threading
import json
import time
import datetime
import concurrent.futures
from backend.services.dirscan_service import scan_folder, ensure_cache_dir

SCAN_STATUS_FILE = os.path.join(os.path.dirname(__file__), "..", "scan_status.json")
lock = threading.RLock()

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

def count_folder_contents(folder_path):
    num_folders = 0
    num_files = 0
    try:
        for dirpath, dirs, files in walk_scandir(folder_path):
            num_folders += len(dirs)
            num_files += len(files)
    except Exception as e:
        print(f"Error counting {folder_path}: {e}")
    return num_folders, num_files

def walk_scandir(top):
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

def scan_folder_with_progress(folder_path, progress_callback=None):
    index_entries = []
    folders_scanned = 0
    files_scanned = 0
    try:
        for dirpath, dirs, files in walk_scandir(folder_path):
            try:
                scan_folder(dirpath)
            except Exception as e:
                print(f"Error caching {dirpath}: {e}")
            # Count this directory as scanned
            folders_scanned += 1
            if progress_callback:
                print(f"Progress: {folders_scanned} folders, {files_scanned} files (current: {dirpath})")
                progress_callback(dirpath, folders_scanned, files_scanned)
            # Add directory entries
            for name in dirs:
                full_path = os.path.join(dirpath, name)
                index_entries.append({
                    "name": name,
                    "path": full_path,
                    "is_dir": True
                })
            for name in files:
                full_path = os.path.join(dirpath, name)
                index_entries.append({
                    "name": name,
                    "path": full_path,
                    "is_dir": False
                })
                files_scanned += 1
                if progress_callback:
                    progress_callback(full_path, folders_scanned, files_scanned)
                time.sleep(0.001)
    except Exception as e:
        print(f"Error scanning {folder_path}: {e}")
    return folders_scanned, files_scanned, index_entries

def background_scan(root):
    start_time = datetime.datetime.now()
    print(f"Starting background scan of {root} at {start_time}")

    # Ensure cache directory exists
    ensure_cache_dir()

    # Step 1: Count everything first (fast pass)
    print("Step 1: Counting total files and folders...")

    # Get top-level directories
    top_level_dirs = []
    root_files_count = 0
    try:
        with os.scandir(root) as it:
            for entry in it:
                if entry.is_dir(follow_symlinks=False):
                    top_level_dirs.append(entry.name)
                else:
                    root_files_count += 1
    except PermissionError:
        print(f"Permission denied accessing {root}")
        return

    # Count contents of each top-level directory
    folder_totals = {}
    total_folders = 1  # Count root itself
    total_files = root_files_count

    for dirname in top_level_dirs:
        dir_path = os.path.join(root, dirname)
        print(f"  Counting {dirname}...")
        dir_folders, dir_files = count_folder_contents(dir_path)
        folder_totals[dirname] = {
            "total_folders": dir_folders,
            "total_files": dir_files,
            "total_items": dir_folders + dir_files,
            "scanned_folders": 0,
            "scanned_files": 0,
            "current_path": "",
            "done": False
        }
        total_folders += dir_folders
        total_files += dir_files

    total_items = total_folders + total_files

    # Initialize status
    status = {
        "status": "scanning",
        "total_folders": total_folders,
        "total_files": total_files,
        "total_items": total_items,
        "scanned_folders": 0,
        "scanned_files": 0,
        "scanned_items": 0,
        "current_path": "",
        "start_time": start_time.isoformat(),
        "end_time": None,
        "folders": folder_totals,
        "done": False
    }
    save_status(status)

    print(f"Total to scan: {total_folders} folders, {total_files} files ({total_items} items)")

    # Step 2: Scan root files first
    print("Step 2: Scanning root files...")
    root_index = []
    try:
        with os.scandir(root) as it:
            for entry in it:
                if entry.is_file(follow_symlinks=False):
                    root_index.append({
                        "name": entry.name,
                        "path": os.path.join(root, entry.name),
                        "is_dir": False
                    })
                    status["scanned_files"] += 1
                    status["scanned_items"] += 1
                    status["current_path"] = entry.name
                    if status["scanned_items"] % 10 == 0:  # Update every 10 items
                        save_status(status)
    except PermissionError:
        pass

    # Create cache for root directory
    try:
        scan_folder(root)
    except Exception as e:
        print(f"Error caching root directory: {e}")

    # Step 3: Scan each top-level directory
    print("Step 3: Scanning directories...")
    all_index_entries = root_index.copy()

    # Use ThreadPoolExecutor for parallel scanning
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
        futures = {}

        for dirname in top_level_dirs:
            dir_path = os.path.join(root, dirname)
            print(f"  Starting scan of {dirname}")

            def make_progress_callback(dir_name):
                def callback(current_path, folders_done, files_done):
                    with lock:
                        # Update folder-specific progress
                        folder_totals[dir_name]["scanned_folders"] = folders_done
                        folder_totals[dir_name]["scanned_files"] = files_done
                        folder_totals[dir_name]["current_path"] = current_path

                        # Update overall progress
                        total_scanned_folders = status["scanned_folders"] + sum(
                            f["scanned_folders"] for f in folder_totals.values()
                        )
                        total_scanned_files = status["scanned_files"] + sum(
                            f["scanned_files"] for f in folder_totals.values()
                        )

                        status["scanned_folders"] = total_scanned_folders
                        status["scanned_files"] = total_scanned_files
                        status["scanned_items"] = total_scanned_folders + total_scanned_files
                        status["current_path"] = current_path
                        status["folders"] = folder_totals.copy()

                        # Save status every 50 items or if it's a directory
                        if (status["scanned_items"] % 50 == 0 or
                            current_path.endswith(os.path.sep) or
                            os.path.isdir(current_path)):
                            save_status(status)

                return callback

            future = executor.submit(
                scan_folder_with_progress,
                dir_path,
                make_progress_callback(dirname)
            )
            futures[dirname] = future

        # Wait for all scans to complete
        for dirname, future in futures.items():
            try:
                folders_scanned, files_scanned, index_entries = future.result()
                all_index_entries.extend(index_entries)
                folder_totals[dirname]["done"] = True
                print(f"  Completed {dirname}: {folders_scanned} folders, {files_scanned} files")
            except Exception as e:
                print(f"Error scanning {dirname}: {e}")
                folder_totals[dirname]["done"] = True

    # Step 4: Save search index
    print("Step 4: Saving search index...")
    config_dir = os.path.join(os.path.dirname(__file__), "..", "config")
    os.makedirs(config_dir, exist_ok=True)
    index_file = os.path.join(config_dir, "search_index.json")

    try:
        with open(index_file, "w") as f:
            json.dump(all_index_entries, f)
        print(f"Search index saved with {len(all_index_entries)} entries")
    except Exception as e:
        print(f"Error saving search index: {e}")

    # Final status update
    end_time = datetime.datetime.now()
    duration = end_time - start_time

    status.update({
        "status": "completed",
        "done": True,
        "end_time": end_time.isoformat(),
        "duration_seconds": duration.total_seconds(),
        "scanned_folders": total_folders,
        "scanned_files": total_files,
        "scanned_items": total_items,
        "current_path": "Scan completed",
        "folders": folder_totals
    })
    save_status(status)

    print(f"Background scan completed in {duration}")
    print(f"Final stats: {total_folders} folders, {total_files} files, {len(all_index_entries)} index entries")

def start_background_scan(root):
    t = threading.Thread(target=background_scan, args=(root,), daemon=True)
    t.start()
    return t

def get_scan_status(SCAN_ROOT):
    status = load_status()
    if not status:
        # No scan has run yet, provide basic info from cache
        def count_from_cache(folder_path):
            import glob
            import json
            import os

            cache_dir = os.path.join(os.path.dirname(__file__), "..", "cache")
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
                    folders = 1
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

        num_folders, num_files = count_from_cache(SCAN_ROOT)
        return {
            "status": "idle",
            "num_folders": num_folders,
            "num_files": num_files,
            "total": num_folders + num_files,
            "message": "No scan has been performed yet"
        }

    progress_percent = 0
    if status.get("total_items", 0) > 0:
        progress_percent = (status.get("scanned_items", 0) / status["total_items"]) * 100

    folders_with_progress = {}
    for folder_name, folder_data in status.get("folders", {}).items():
        folder_progress = 0
        if folder_data.get("total_items", 0) > 0:
            scanned = folder_data.get("scanned_folders", 0) + folder_data.get("scanned_files", 0)
            folder_progress = (scanned / folder_data["total_items"]) * 100

        folders_with_progress[folder_name] = {
            **folder_data,
            "progress_percent": round(folder_progress, 1),
            "scanned_items": folder_data.get("scanned_folders", 0) + folder_data.get("scanned_files", 0),
            "scanned": folder_data.get("scanned_folders", 0) + folder_data.get("scanned_files", 0),
            "total": folder_data.get("total_items", 0),
            "current": folder_data.get("current_path", ""),
        }

    response = {
        "status": status.get("status", "unknown"),
        "done": status.get("done", False),
        "progress_percent": round(progress_percent, 1),
        "scanned_folders": status.get("scanned_folders", 0),
        "scanned_files": status.get("scanned_files", 0),
        "scanned_items": status.get("scanned_items", 0),
        "total_folders": status.get("total_folders", 0),
        "total_files": status.get("total_files", 0),
        "total_items": status.get("total_items", 0),
        "current_path": status.get("current_path", ""),
        "start_time": status.get("start_time"),
        "end_time": status.get("end_time"),
        "duration_seconds": status.get("duration_seconds"),
        "folders": folders_with_progress,
        "num_folders": status.get("total_folders", 0),
        "num_files": status.get("total_files", 0),
        "total": status.get("total_items", 0)
    }

    if not status.get("done", False) and status.get("start_time"):
        try:
            from datetime import datetime
            start_time = datetime.fromisoformat(status["start_time"])
            elapsed = (datetime.now() - start_time).total_seconds()

            if status.get("scanned_items", 0) > 0 and elapsed > 0:
                items_per_second = status["scanned_items"] / elapsed
                remaining_items = status.get("total_items", 0) - status.get("scanned_items", 0)
                estimated_remaining = remaining_items / items_per_second if items_per_second > 0 else 0

                response["elapsed_seconds"] = round(elapsed, 1)
                response["estimated_remaining_seconds"] = round(estimated_remaining, 1)
                response["items_per_second"] = round(items_per_second, 2)
        except Exception:
            pass

    return response
