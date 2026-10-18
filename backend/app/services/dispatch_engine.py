import asyncio
import logging
from datetime import timedelta
from typing import Any, Dict, List, Optional

from ..db import db
from ..services.matching import can_consider, score_ride
from ..services.compliance import verify_driver_compliance
from ..services.realtime import hub, send_push_notification
from ..utils import clean_doc, iso_now, now_utc

logger = logging.getLogger(__name__)

OFFER_TIMEOUT_SEC = 15


async def find_matching_drivers(ride: Dict[str, Any], limit: int = 10) -> List[Dict[str, Any]]:
    """
    Query online and available drivers of matching vehicle type,
    filtered by proximity radius and ranked by optimal score.
    Excludes drivers who already declined or timed out for this ride.
    """
    vehicle_type = ride.get("ride_type", "economy")
    declined_ids = set(ride.get("declined_driver_ids") or [])
    status_cursor = db.driver_status.find({"online": True})
    candidates = []

    async for status in status_cursor:
        driver_id = status["driver_id"]
        if driver_id in declined_ids:
            continue

        # Check if driver is already on an active ride
        active = await db.rides.find_one(
            {"driver_id": driver_id, "status": {"$in": ["accepted", "arrived", "in_progress"]}}
        )
        if active:
            continue

        # Enforce Fife Council Statutory Hard Expiry Block
        user = await db.users.find_one({"id": driver_id})
        if not user:
            continue
        kyc = await db.driver_kyc.find_one({"driver_id": driver_id})
        is_compliant, reason, _ = verify_driver_compliance(user, kyc)
        if not is_compliant:
            logger.warning("Driver %s excluded from dispatch due to Fife compliance block: %s", driver_id, reason)
            continue

        d_vehicle_type = user.get("vehicle_type", "economy") if user else "economy"
        if can_consider(ride, status, d_vehicle_type):
            score = score_ride(ride, status)
            candidates.append({"driver": user, "status": status, "score": score})

    candidates.sort(key=lambda c: c["score"])
    return candidates[:limit]


async def _waterfall_timeout_worker(ride_id: str, driver_id: str, timeout_sec: int) -> None:
    """Background task: auto-cascade to next driver if reservation expires without response."""
    await asyncio.sleep(timeout_sec)
    ride = await db.rides.find_one({"id": ride_id, "status": "pending", "reserved_by": driver_id})
    if ride:
        res = await db.rides.update_one(
            {"id": ride_id, "status": "pending", "reserved_by": driver_id},
            {
                "$set": {"reserved_by": None, "reserved_until": None, "updated_at": iso_now()},
                "$addToSet": {"declined_driver_ids": driver_id},
            },
        )
        if res.modified_count > 0:
            logger.info("Driver %s offer timed out for ride %s; advancing waterfall", driver_id, ride_id)
            await dispatch_ride_waterfall(ride_id)


async def dispatch_ride_waterfall(ride_id: str) -> bool:
    """
    Trigger real-time waterfall dispatch:
    Selects top candidate driver, creates atomic reservation lock,
    schedules automatic timeout cascade, and sends WebSocket event + push notification.
    """
    # Check if automatic allocation is enabled in fleet settings
    config = await db.system_settings.find_one({"key": "dispatch_config"})
    if config and not config.get("auto_dispatch", True):
        logger.info("Auto-dispatch is OFF; ride %s held in pending queue for manual assignment", ride_id)
        return False

    ride = await db.rides.find_one({"id": ride_id, "status": "pending"})
    if not ride:
        return False

    candidates = await find_matching_drivers(ride)
    if not candidates:
        logger.info("No matching drivers available for ride %s", ride_id)
        return False

    best_candidate = candidates[0]
    driver_id = best_candidate["status"]["driver_id"]
    reserve_iso = (now_utc() + timedelta(seconds=OFFER_TIMEOUT_SEC)).isoformat()

    # Atomic reservation update
    res = await db.rides.update_one(
        {
            "id": ride_id,
            "status": "pending",
            "$or": [
                {"reserved_until": {"$lt": iso_now()}},
                {"reserved_until": {"$exists": False}},
                {"reserved_by": None},
            ],
        },
        {
            "$set": {
                "reserved_by": driver_id,
                "reserved_until": reserve_iso,
                "assignment_type": "automatic",
                "updated_at": iso_now(),
            }
        },
    )

    if res.modified_count == 0:
        return False

    updated_ride = await db.rides.find_one({"id": ride_id})
    offer_payload = {
        "event": "ride.offer",
        "offer_timeout_sec": OFFER_TIMEOUT_SEC,
        "ride": clean_doc(updated_ride),
    }

    # Real-time WebSocket push to driver
    await hub.publish_driver(driver_id, offer_payload)
    await hub.publish_dispatch({"event": "dispatch.offer_sent", "ride_id": ride_id, "driver_id": driver_id})

    # Schedule automatic timeout cascade
    asyncio.create_task(_waterfall_timeout_worker(ride_id, driver_id, OFFER_TIMEOUT_SEC))

    # Also send Expo high-priority push notification if token exists
    driver_user = best_candidate.get("driver") or {}
    push_token = driver_user.get("push_token")
    if push_token:
        asyncio.create_task(
            send_push_notification(
                push_token,
                "New Ride Request Nearby",
                f"Pickup: {ride.get('pickup', {}).get('address', 'Nearby')}. Est fare: £{ride.get('fare', 0)}",
                {"ride_id": ride_id, "type": "ride_offer"},
            )
        )

    return True

