import os

SCAN_ROOT = os.getenv("SCAN_ROOT", "/tmp")

def is_safe_path(base, path):
    # Prüft, ob path ein Unterpfad von base ist (keine Ausbrüche!)
    base = os.path.realpath(base)
    target = os.path.realpath(path)
    return os.path.commonpath([base, target]) == base
