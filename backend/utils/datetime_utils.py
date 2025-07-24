from datetime import datetime, timezone


def format_utc_timestamp():
    """
    Generate a UTC timestamp in ISO format with Z suffix.
    
    Returns:
        str: UTC timestamp in format "YYYY-MM-DDTHH:MM:SSZ"
    
    Example:
        "2025-01-25T10:30:45Z"
    """
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
