import os
import json
from typing import List, Dict, Any

from backend.services.dirscan_service import scan_or_cache

def search_files(root: str, query: str, max_results: int = 100) -> List[Dict[str, Any]]:
    """
    Durchsucht rekursiv ab root alle Ordner/Dateien nach query im Namen.
    Nutzt zentrale Indexdatei, falls vorhanden, sonst Cache.
    """
    config_dir = os.path.join(os.path.dirname(__file__), "config")
    index_file = os.path.join(config_dir, "search_index.json")
    query_lower = query.lower()
    results = []

    if os.path.exists(index_file):
        try:
            with open(index_file) as f:
                index = json.load(f)
            for entry in index:
                # Optional: root-Filter (nur Treffer unterhalb root)
                if not entry["path"].startswith(root):
                    continue
                if query_lower in entry["name"].lower():
                    results.append({
                        "name": entry["name"],
                        "path": entry["path"],
                        "is_dir": entry["is_dir"],
                    })
                    if len(results) >= max_results:
                        break
            return results
        except Exception as e:
            print("Fehler beim Lesen von search_index.json:", e)
            # Fallback auf alte Logik

    # Fallback: alte rekursive Suche
    stack = [root]
    seen = set()
    while stack and len(results) < max_results:
        current = stack.pop()
        if current in seen:
            continue
        seen.add(current)
        data = scan_or_cache(current)
        if "entries" not in data:
            continue
        for entry in data["entries"]:
            entry_path = os.path.join(current, entry["name"])
            if query_lower in entry["name"].lower():
                results.append({
                    "name": entry["name"],
                    "path": entry_path,
                    "is_dir": entry["is_dir"],
                })
                if len(results) >= max_results:
                    break
            if entry["is_dir"]:
                stack.append(entry_path)
    return results
