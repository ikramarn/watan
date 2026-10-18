from datetime import datetime, timezone

from ..utils import haversine_km, now_utc


MAX_RADIUS_KM = 10
RESERVATION_SEC = 20


def can_consider(ride: dict, driver_status: dict, driver_vehicle_type: str) -> bool:
    if ride.get("status") != "pending":
        return False
    if ride.get("ride_type") != driver_vehicle_type:
        return False

    reserved_until = ride.get("reserved_until")
    if reserved_until and reserved_until > now_utc().isoformat() and ride.get("reserved_by"):
        return False

    dist = haversine_km(
        driver_status.get("lat", 0.0),
        driver_status.get("lng", 0.0),
        ride["pickup"]["lat"],
        ride["pickup"]["lng"],
    )
    return dist <= MAX_RADIUS_KM


def score_ride(ride: dict, driver_status: dict) -> float:
    dist = haversine_km(
        driver_status.get("lat", 0.0),
        driver_status.get("lng", 0.0),
        ride["pickup"]["lat"],
        ride["pickup"]["lng"],
    )
    created = datetime.fromisoformat(ride["created_at"])
    if created.tzinfo is None:
        created = created.replace(tzinfo=timezone.utc)
    waited_sec = max(1.0, (now_utc() - created).total_seconds())
    # lower is better: prioritize closer pickup and longer wait fairness
    return (dist * 4.0) - (waited_sec / 60.0)
