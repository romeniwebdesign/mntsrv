import os
import threading
import json
import time

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

def background_scan(root):
    # Zähle alle Ordner/Dateien (für total)
    total = 0
    for _, dirs, files in os.walk(root):
        total += len(dirs) + len(files)
    scanned = 0
    status = {"total": total, "scanned": 0, "current": "", "done": False}
    save_status(status)

    # Index für Suche
    index = []

    for dirpath, dirs, files in os.walk(root):
        for name in dirs + files:
            full_path = os.path.join(dirpath, name)
            status["scanned"] += 1
            status["current"] = full_path
            # Index-Eintrag hinzufügen
            index.append({
                "name": name,
                "path": full_path,
                "is_dir": os.path.isdir(full_path)
            })
            # Nur alle 10 Einträge speichern, außer am Ende
            if status["scanned"] % 10 == 0 or status["scanned"] == total:
                save_status(status)
            time.sleep(0.001)  # Simuliere Arbeit, damit Fortschritt sichtbar ist
        # Optional: hier könnte der eigentliche Scan/Caching-Code laufen

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
    save_status(status)

def start_background_scan(root):
    t = threading.Thread(target=background_scan, args=(root,), daemon=True)
    t.start()
