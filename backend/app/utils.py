import math
import uuid
from datetime import datetime, timezone
from typing import Any


def new_id() -> str:
    return uuid.uuid4().hex


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def iso_now() -> str:
    return now_utc().isoformat()


def clean_doc(doc: dict[str, Any] | None) -> dict[str, Any] | None:
    if not doc:
        return doc
    return {k: v for k, v in doc.items() if k != "_id"}


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(
        math.radians(lat2)
    ) * math.sin(dlng / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))
