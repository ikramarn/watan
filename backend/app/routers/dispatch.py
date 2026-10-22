import csv
import io
import math
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response

from ..db import db
from ..deps import get_current_user, require_role
from ..models import DispatcherCreateIn, ForceCancelIn, ManualAssignIn, ReassignIn
from ..security import hash_password
from ..services.compliance import verify_driver_compliance
from ..services.realtime import hub
from ..services.state_machine import assert_transition
from ..utils import clean_doc, haversine_km, iso_now, now_utc

router = APIRouter(prefix="/api/dispatch", tags=["dispatch"])

RESERVATION_SEC = 20
"""Reservation hold duration in seconds. Matches the reservation window
`driver.py`'s existing automatic-matching reservation step (`driver_incoming`)
uses, so manually and automatically created reservations expire consistently."""


@router.post("/accounts")
async def create_dispatcher_account(
    body: DispatcherCreateIn, dispatcher: dict = Depends(require_role("dispatcher"))
):
    email = body.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")

    user_id = str(uuid.uuid4())
    doc = {
        "id": user_id,
        "email": email,
        "password_hash": hash_password(body.password),
        "name": body.name,
        "role": "dispatcher",
        "phone": "",
        "rating": 5.0,
        "num_ratings": 0,
        "created_at": iso_now(),
        "created_by": dispatcher["id"],
    }
    await db.users.insert_one(doc.copy())

    await db.dispatch_action_log.insert_one(
        {
            "id": str(uuid.uuid4()),
            "dispatcher_id": dispatcher["id"],
            "dispatcher_name": dispatcher.get("name", ""),
            "action": "create_dispatcher",
            "ride_id": None,
            "driver_id": None,
            "previous_driver_id": None,
            "detail": {"created_user_id": user_id, "email": email},
            "created_at": iso_now(),
        }
    )

    safe = clean_doc(doc) or {}
    safe.pop("password_hash", None)
    return {"user": safe}


def _elapsed_seconds(created_at: str) -> float:
    """Elapsed wait time in seconds between `created_at` (ISO string) and now."""
    if not created_at:
        return 0.0
    try:
        created = datetime.fromisoformat(created_at)
    except ValueError:
        return 0.0
    if created.tzinfo is None:
        created = created.replace(tzinfo=timezone.utc)
    return (now_utc() - created).total_seconds()


def _reservation_state(ride: dict) -> dict | None:
    """Current reservation holder + expiry, when present and not expired."""
    reserved_by = ride.get("reserved_by")
    reserved_until = ride.get("reserved_until")
    if not reserved_by or not reserved_until:
        return None
    if reserved_until < iso_now():
        return None
    return {"reserved_by": reserved_by, "reserved_until": reserved_until}


DEFAULT_AGING_THRESHOLD_SECONDS = 120.0
"""Default elapsed-wait threshold (seconds) beyond which a pending, unreserved
ride is flagged as aging. Chosen as a reasonable default for a first pass at
the aging UI (Requirement 10.2); callers may override via the
`aging_threshold_seconds` query param on `GET /api/dispatch/rides/pending`."""


def is_ride_aging(elapsed_seconds: float, threshold_seconds: float, reservation: dict | None) -> bool:
    """Pure aging predicate: true iff `elapsed_seconds` >= `threshold_seconds`
    AND the ride is not currently validly reserved or assigned (`reservation`
    is None, mirroring `_reservation_state`'s "no valid holder" result)."""
    return elapsed_seconds >= threshold_seconds and reservation is None


def _matches_search(query: str, *fields: str) -> bool:
    """Case-insensitive substring match of `query` against any of `fields`."""
    if not query:
        return True
    needle = query.lower()
    return any(needle in (field or "").lower() for field in fields)


def filter_pending_rides_by_type(rides: list[dict], ride_type: Optional[str]) -> list[dict]:
    """Pure filter: keep only rides whose `ride_type` exactly matches, when provided."""
    if not ride_type:
        return rides
    return [r for r in rides if r.get("ride_type") == ride_type]


def search_pending_rides(rides: list[dict], search: Optional[str]) -> list[dict]:
    """Pure filter: case-insensitive substring match against passenger name or pickup address."""
    if not search:
        return rides
    return [
        r
        for r in rides
        if _matches_search(search, r.get("passenger_name", ""), (r.get("pickup") or {}).get("address", ""))
    ]


def sort_pending_rides(
    rides: list[dict],
    sort: Optional[str],
    driver_lat: Optional[float] = None,
    driver_lng: Optional[float] = None,
) -> list[dict]:
    """Pure sort: by wait time (descending, longest-waiting first) or by pickup distance
    from a given driver location (ascending, nearest first). Unknown/absent sort values
    or a missing driver location for a distance sort leave the input order unchanged."""
    if sort == "wait_time":
        return sorted(rides, key=lambda r: r.get("wait_seconds", 0), reverse=True)
    if sort == "distance" and driver_lat is not None and driver_lng is not None:
        def _distance(r: dict) -> float:
            pickup = r.get("pickup") or {}
            lat, lng = pickup.get("lat"), pickup.get("lng")
            if lat is None or lng is None:
                return float("inf")
            return haversine_km(driver_lat, driver_lng, lat, lng)

        return sorted(rides, key=_distance)
    return rides


def search_drivers(drivers: list[dict], search: Optional[str]) -> list[dict]:
    """Pure filter: case-insensitive substring match against driver name or vehicle plate."""
    if not search:
        return drivers
    return [d for d in drivers if _matches_search(search, d.get("name", ""), d.get("vehicle_plate", ""))]


@router.get("/rides/pending")
async def list_pending_rides(
    dispatcher: dict = Depends(require_role("dispatcher")),
    ride_type: Optional[str] = Query(default=None),
    sort: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None),
    driver_lat: Optional[float] = Query(default=None, ge=-90, le=90),
    driver_lng: Optional[float] = Query(default=None, ge=-180, le=180),
    aging_threshold_seconds: float = Query(default=DEFAULT_AGING_THRESHOLD_SECONDS, ge=0),
):
    cursor = db.rides.find({"status": "pending"}).sort("created_at", 1)
    rides = []
    async for ride in cursor:
        safe = clean_doc(ride) or {}
        wait_seconds = _elapsed_seconds(ride.get("created_at", ""))
        reservation = _reservation_state(ride)
        safe["wait_seconds"] = round(wait_seconds, 1)
        safe["reservation"] = reservation
        safe["is_aging"] = is_ride_aging(wait_seconds, aging_threshold_seconds, reservation)
        rides.append(safe)

    rides = filter_pending_rides_by_type(rides, ride_type)
    rides = search_pending_rides(rides, search)
    rides = sort_pending_rides(rides, sort, driver_lat, driver_lng)

    return {"rides": rides}


@router.get("/drivers")
async def list_online_drivers(
    dispatcher: dict = Depends(require_role("dispatcher")),
    search: Optional[str] = Query(default=None),
    pickup_lat: Optional[float] = Query(default=None),
    pickup_lng: Optional[float] = Query(default=None),
    include_offline: bool = Query(default=False),
):
    drivers = []
    seen_ids = set()

    # 1. Fetch Online Drivers
    cursor = db.driver_status.find({"online": True})
    async for status in cursor:
        driver_id = status.get("driver_id")
        user = await db.users.find_one({"id": driver_id})
        if not user:
            continue

        seen_ids.add(driver_id)
        active_ride = await db.rides.find_one(
            {"driver_id": driver_id, "status": {"$in": ["accepted", "arrived", "in_progress"]}}
        )

        # Check Fife Council compliance
        kyc = await db.driver_kyc.find_one({"driver_id": driver_id})
        is_compliant, compliance_reason, comp_details = verify_driver_compliance(user, kyc)

        d_lat = status.get("lat")
        d_lng = status.get("lng")
        distance_km = None
        eta_min = None
        if pickup_lat is not None and pickup_lng is not None and d_lat is not None and d_lng is not None:
            dist = haversine_km(pickup_lat, pickup_lng, d_lat, d_lng)
            distance_km = round(dist, 1)
            eta_min = max(1, round((dist / 30.0) * 60))

        drivers.append(
            {
                "driver_id": driver_id,
                "name": user.get("name", "Unknown Driver"),
                "email": user.get("email", ""),
                "phone": user.get("phone", ""),
                "rating": user.get("rating", 5.0),
                "vehicle_make": user.get("vehicle_make", ""),
                "vehicle_plate": comp_details.get("vehicle_plate") or user.get("vehicle_plate", ""),
                "vehicle_type": user.get("vehicle_type", "economy"),
                "vehicle_color": user.get("vehicle_color", ""),
                "lat": d_lat,
                "lng": d_lng,
                "distance_km": distance_km,
                "eta_min": eta_min,
                "online": True,
                "has_active_ride": active_ride is not None,
                "active_ride_id": active_ride["id"] if active_ride else None,
                "is_compliant": is_compliant,
                "compliance_reason": compliance_reason,
                "phv_badge_number": comp_details.get("badge_number", ""),
                "badge_expiry": comp_details.get("badge_expiry", ""),
                "insurance_policy": comp_details.get("insurance_policy", ""),
                "insurance_expiry": comp_details.get("insurance_expiry", ""),
                "plate_expiry": comp_details.get("plate_expiry", ""),
                "license_number": comp_details.get("license_number", ""),
                "license_expiry": comp_details.get("license_expiry", ""),
                "council_name": comp_details.get("council_name", "Regional Transport Authority (RTA)"),
                "created_at": user.get("created_at", ""),
            }
        )

    # 2. Optionally include offline drivers
    if include_offline:
        offline_users = db.users.find({"role": "driver", "id": {"$nin": list(seen_ids)}})
        async for user in offline_users:
            driver_id = user["id"]
            kyc = await db.driver_kyc.find_one({"driver_id": driver_id})
            is_compliant, compliance_reason, comp_details = verify_driver_compliance(user, kyc)
            drivers.append(
                {
                    "driver_id": driver_id,
                    "name": user.get("name", "Unknown Driver"),
                    "email": user.get("email", ""),
                    "phone": user.get("phone", ""),
                    "rating": user.get("rating", 5.0),
                    "vehicle_make": user.get("vehicle_make", ""),
                    "vehicle_plate": comp_details.get("vehicle_plate") or user.get("vehicle_plate", ""),
                    "vehicle_type": user.get("vehicle_type", "economy"),
                    "vehicle_color": user.get("vehicle_color", ""),
                    "lat": None,
                    "lng": None,
                    "distance_km": None,
                    "eta_min": None,
                    "online": False,
                    "has_active_ride": False,
                    "active_ride_id": None,
                    "is_compliant": is_compliant,
                    "compliance_reason": compliance_reason,
                    "phv_badge_number": comp_details.get("badge_number", ""),
                    "badge_expiry": comp_details.get("badge_expiry", ""),
                    "insurance_policy": comp_details.get("insurance_policy", ""),
                    "insurance_expiry": comp_details.get("insurance_expiry", ""),
                    "plate_expiry": comp_details.get("plate_expiry", ""),
                    "license_number": comp_details.get("license_number", ""),
                    "license_expiry": comp_details.get("license_expiry", ""),
                    "council_name": comp_details.get("council_name", "Regional Transport Authority (RTA)"),
                    "created_at": user.get("created_at", ""),
                }
            )

    drivers = search_drivers(drivers, search)
    if pickup_lat is not None and pickup_lng is not None:
        drivers.sort(key=lambda d: (d["distance_km"] if d["distance_km"] is not None else float("inf")))
    return {"drivers": drivers}


@router.get("/drivers/{driver_id}/profile")
async def get_driver_profile(
    driver_id: str,
    dispatcher: dict = Depends(require_role("dispatcher")),
):
    """Retrieve full profile dossier and compliance credentials for an individual driver."""
    user = await db.users.find_one({"id": driver_id})
    if not user:
        raise HTTPException(404, "Driver not found")

    status = await db.driver_status.find_one({"driver_id": driver_id}) or {}
    kyc = await db.driver_kyc.find_one({"driver_id": driver_id}) or {}
    is_compliant, compliance_reason, comp_details = verify_driver_compliance(user, kyc)

    active_ride = await db.rides.find_one(
        {"driver_id": driver_id, "status": {"$in": ["accepted", "arrived", "in_progress"]}}
    )
    completed_rides = await db.rides.count_documents({"driver_id": driver_id, "status": "completed"})

    return {
        "driver_id": driver_id,
        "name": user.get("name", "Unknown Driver"),
        "email": user.get("email", ""),
        "phone": user.get("phone", ""),
        "rating": user.get("rating", 5.0),
        "vehicle_make": user.get("vehicle_make", ""),
        "vehicle_plate": comp_details.get("vehicle_plate") or user.get("vehicle_plate", ""),
        "vehicle_type": user.get("vehicle_type", "economy"),
        "vehicle_color": user.get("vehicle_color", ""),
        "online": status.get("online", False),
        "lat": status.get("lat"),
        "lng": status.get("lng"),
        "has_active_ride": active_ride is not None,
        "active_ride_id": active_ride["id"] if active_ride else None,
        "is_compliant": is_compliant,
        "compliance_reason": compliance_reason,
        "compliance_details": comp_details,
        "completed_rides_count": completed_rides,
        "created_at": user.get("created_at", ""),
    }


@router.get("/rides/active")
async def list_active_rides(dispatcher: dict = Depends(require_role("dispatcher"))):
    cursor = db.rides.find({"status": {"$in": ["accepted", "arrived", "in_progress"]}}).sort(
        "created_at", 1
    )
    rides = []
    async for ride in cursor:
        safe = clean_doc(ride) or {}
        rides.append(safe)
    return {"rides": rides}


@router.get("/rides/history")
async def list_all_rides_history(
    dispatcher: dict = Depends(require_role("dispatcher")),
    status: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
):
    q = {}
    if status and status != "all":
        q["status"] = status
    cursor = db.rides.find(q).sort("created_at", -1).limit(limit)
    rides = []
    async for ride in cursor:
        safe = clean_doc(ride) or {}
        rides.append(safe)

    if search:
        s = search.lower()
        rides = [
            r
            for r in rides
            if s in (r.get("passenger_name") or "").lower()
            or s in (r.get("driver_name") or "").lower()
            or s in (r.get("id") or "").lower()
            or s in ((r.get("pickup") or {}).get("address") or "").lower()
            or s in ((r.get("destination") or {}).get("address") or "").lower()
        ]
    return {"rides": rides}


@router.post("/rides/{ride_id}/assign")
async def assign_ride(
    ride_id: str,
    body: ManualAssignIn,
    dispatcher: dict = Depends(require_role("dispatcher")),
):
    driver_id = body.driver_id

    # Fife Council Statutory Hard Expiry Block
    user = await db.users.find_one({"id": driver_id})
    if not user:
        raise HTTPException(status_code=404, detail="Driver not found")

    kyc = await db.driver_kyc.find_one({"driver_id": driver_id})
    is_compliant, reason, comp_details = verify_driver_compliance(user or {}, kyc)
    if not is_compliant:
        raise HTTPException(
            status_code=400,
            detail=f"Compliance Hard Stop (Fife Council): Driver cannot be assigned because {reason}."
        )

    status = await db.driver_status.find_one({"driver_id": driver_id})
    if not status or not status.get("online"):
        raise HTTPException(status_code=400, detail="Selected driver is not available (driver is currently offline)")

    active = await db.rides.find_one(
        {"driver_id": driver_id, "status": {"$in": ["accepted", "arrived", "in_progress"]}}
    )
    if active:
        raise HTTPException(status_code=400, detail="Selected driver is not available (already has an active ride)")

    now = iso_now()
    # In manual dispatching, the control room directly allocates the driver to the job.
    # The ride status transitions from 'pending' directly to 'accepted', setting driver details.
    res = await db.rides.update_one(
        {
            "id": ride_id,
            "status": "pending",
        },
        {
            "$set": {
                "status": "accepted",
                "driver_id": driver_id,
                "driver_name": user.get("name", "Driver"),
                "driver_phone": user.get("phone", ""),
                "driver_rating": user.get("rating", 5.0),
                "driver_lat": status.get("lat"),
                "driver_lng": status.get("lng"),
                "vehicle_make": user.get("vehicle_make", "Saloon"),
                "vehicle_plate": comp_details.get("vehicle_plate") or user.get("vehicle_plate", "CAB-001"),
                "vehicle_color": user.get("vehicle_color", "Silver"),
                "vehicle_type": user.get("vehicle_type", "economy"),
                "council_name": comp_details.get("council_name") or user.get("council_name", "Fife Council"),
                "operator_license_number": comp_details.get("license_number") or user.get("operator_license_number", ""),
                "phv_badge_number": comp_details.get("badge_number") or user.get("phv_badge_number", ""),
                "assignment_type": "manual",
                "assigned_by": dispatcher["id"],
                "assigned_at": now,
                "reserved_by": driver_id,
                "reserved_until": None,
                "updated_at": now,
            }
        },
    )
    if res.modified_count == 0:
        raise HTTPException(status_code=409, detail="Ride is no longer available — it was already accepted or cancelled")

    ride = await db.rides.find_one({"id": ride_id})
    ride_clean = clean_doc(ride) or {}

    driver_notify = dict(ride_clean)
    if status.get("lat") is not None and status.get("lng") is not None:
        pickup = ride.get("pickup") or {}
        if pickup.get("lat") is not None and pickup.get("lng") is not None:
            dist = haversine_km(status["lat"], status["lng"], pickup["lat"], pickup["lng"])
            driver_notify["distance_to_pickup_km"] = round(dist, 2)
            ride_clean["distance_to_pickup_km"] = round(dist, 2)

    # 1. Notify Passenger that ride is accepted with driver details
    await hub.publish_ride(ride_id, {"event": "ride.accepted", "ride": ride_clean})
    # 2. Notify Dispatch that ride is updated (moves to ActiveRides and drops from Pending)
    await hub.publish_dispatch({"event": "ride.updated", "ride": ride_clean})
    await hub.publish_dispatch({"event": "ride.assigned", "ride": ride_clean})
    # 3. Notify Driver that ride was assigned to them
    await hub.publish_driver(driver_id, {"event": "ride.assigned", "ride": driver_notify})
    await hub.publish_driver(driver_id, {"event": "driver.incoming", "request": None})

    await db.dispatch_action_log.insert_one(
        {
            "id": str(uuid.uuid4()),
            "dispatcher_id": dispatcher["id"],
            "dispatcher_name": dispatcher.get("name", ""),
            "action": "manual_assign",
            "ride_id": ride_id,
            "driver_id": driver_id,
            "previous_driver_id": None,
            "detail": {
                "driver_name": user.get("name"),
                "vehicle_plate": comp_details.get("vehicle_plate") or user.get("vehicle_plate"),
            },
            "created_at": now,
        }
    )

    return ride_clean


@router.post("/rides/{ride_id}/reassign")
async def reassign_ride(
    ride_id: str,
    body: ReassignIn,
    dispatcher: dict = Depends(require_role("dispatcher")),
):
    """Reassign an active ride to a new driver directly."""
    new_driver_id = body.driver_id

    ride = await db.rides.find_one({"id": ride_id})
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")
    if ride["status"] in ("completed", "cancelled"):
        raise HTTPException(status_code=409, detail="Ride is no longer active")

    previous_driver_id = ride.get("driver_id")

    # Fife Council Statutory Hard Expiry Block
    user = await db.users.find_one({"id": new_driver_id})
    if not user:
        raise HTTPException(status_code=404, detail="Driver not found")

    kyc = await db.driver_kyc.find_one({"driver_id": new_driver_id})
    is_compliant, reason, comp_details = verify_driver_compliance(user or {}, kyc)
    if not is_compliant:
        raise HTTPException(
            status_code=400,
            detail=f"Compliance Hard Stop (Fife Council): Driver cannot be reassigned because {reason}."
        )

    new_status = await db.driver_status.find_one({"driver_id": new_driver_id})
    if not new_status or not new_status.get("online"):
        raise HTTPException(status_code=400, detail="Selected driver is not available (driver is currently offline)")
    new_driver_active = await db.rides.find_one(
        {"driver_id": new_driver_id, "status": {"$in": ["accepted", "arrived", "in_progress"]}}
    )
    if new_driver_active:
        raise HTTPException(status_code=400, detail="Selected driver is not available (already has an active ride)")

    now = iso_now()
    combined_res = await db.rides.update_one(
        {
            "id": ride_id,
            "status": {"$in": ["accepted", "arrived", "in_progress"]},
            "driver_id": previous_driver_id,
        },
        {
            "$set": {
                "status": "accepted",
                "driver_id": new_driver_id,
                "driver_name": user.get("name", "Driver"),
                "driver_phone": user.get("phone", ""),
                "driver_rating": user.get("rating", 5.0),
                "driver_lat": new_status.get("lat"),
                "driver_lng": new_status.get("lng"),
                "vehicle_make": user.get("vehicle_make", "Saloon"),
                "vehicle_plate": comp_details.get("vehicle_plate") or user.get("vehicle_plate", "CAB-001"),
                "vehicle_color": user.get("vehicle_color", "Silver"),
                "vehicle_type": user.get("vehicle_type", "economy"),
                "council_name": comp_details.get("council_name") or user.get("council_name", "Fife Council"),
                "operator_license_number": comp_details.get("license_number") or user.get("operator_license_number", ""),
                "phv_badge_number": comp_details.get("badge_number") or user.get("phv_badge_number", ""),
                "assignment_type": "manual",
                "assigned_by": dispatcher["id"],
                "assigned_at": now,
                "reserved_by": new_driver_id,
                "reserved_until": None,
                "updated_at": now,
            }
        },
    )
    if combined_res.modified_count == 0:
        raise HTTPException(status_code=409, detail="Ride state has already changed")

    ride_updated = await db.rides.find_one({"id": ride_id})
    ride_clean = clean_doc(ride_updated) or {}

    driver_notify = dict(ride_clean)
    if new_status.get("lat") is not None and new_status.get("lng") is not None:
        pickup = ride_updated.get("pickup") or {}
        if pickup.get("lat") is not None and pickup.get("lng") is not None:
            dist = haversine_km(new_status["lat"], new_status["lng"], pickup["lat"], pickup["lng"])
            driver_notify["distance_to_pickup_km"] = round(dist, 2)
            ride_clean["distance_to_pickup_km"] = round(dist, 2)

    # 1. Inform passenger of driver update
    await hub.publish_ride(ride_id, {"event": "ride.accepted", "ride": ride_clean})
    await hub.publish_ride(ride_id, {"event": "ride.updated", "ride": ride_clean})
    # 2. Inform dispatch
    await hub.publish_dispatch({"event": "ride.updated", "ride": ride_clean})
    await hub.publish_dispatch({"event": "ride.reassigned", "ride": ride_clean})
    # 3. Inform previous driver that trip was reassigned
    if previous_driver_id:
        await hub.publish_driver(previous_driver_id, {"event": "ride.reassigned", "ride_id": ride_id})
    # 4. Inform new driver of new assignment
    await hub.publish_driver(new_driver_id, {"event": "ride.assigned", "ride": driver_notify})
    await hub.publish_driver(new_driver_id, {"event": "driver.incoming", "request": None})

    await db.dispatch_action_log.insert_one(
        {
            "id": str(uuid.uuid4()),
            "dispatcher_id": dispatcher["id"],
            "dispatcher_name": dispatcher.get("name", ""),
            "action": "reassign",
            "ride_id": ride_id,
            "driver_id": new_driver_id,
            "previous_driver_id": previous_driver_id,
            "detail": {
                "driver_name": user.get("name"),
                "vehicle_plate": comp_details.get("vehicle_plate") or user.get("vehicle_plate"),
            },
            "created_at": now,
        }
    )

    return {"outcome": "reassigned", "ride": ride_clean}


@router.post("/rides/{ride_id}/cancel")
async def force_cancel_ride(
    ride_id: str,
    body: ForceCancelIn,
    dispatcher: dict = Depends(require_role("dispatcher")),
):
    ride = await db.rides.find_one({"id": ride_id})
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")
    if ride["status"] in ("completed", "cancelled"):
        raise HTTPException(status_code=409, detail="Ride is no longer active")

    assert_transition(ride["status"], "cancelled")  # reused, unmodified

    res = await db.rides.update_one(
        {"id": ride_id, "status": ride["status"]},
        {
            "$set": {
                "status": "cancelled",
                "cancelled_by": "dispatcher",
                "cancelled_reason": body.reason or "No available drivers nearby for this route at the moment. Please try requesting again shortly.",
                "reserved_by": None,
                "reserved_until": None,
                "updated_at": iso_now(),
            }
        },
    )
    if res.modified_count == 0:
        raise HTTPException(status_code=409, detail="Ride state has already changed")

    await hub.publish_ride(ride_id, {"event": "ride.cancelled", "ride_id": ride_id})
    target_driver_id = ride.get("driver_id") or ride.get("reserved_by")
    if target_driver_id:
        await hub.publish_driver(target_driver_id, {"event": "ride.cancelled", "ride_id": ride_id})

    ride = await db.rides.find_one({"id": ride_id})
    ride_clean = clean_doc(ride) or {}
    await hub.publish_dispatch({"event": "ride.updated", "ride": ride_clean})

    await db.dispatch_action_log.insert_one(
        {
            "id": str(uuid.uuid4()),
            "dispatcher_id": dispatcher["id"],
            "dispatcher_name": dispatcher.get("name", ""),
            "action": "force_cancel",
            "ride_id": ride_id,
            "driver_id": ride.get("driver_id"),
            "previous_driver_id": None,
            "detail": {"reason": body.reason} if body.reason else {},
            "created_at": iso_now(),
        }
    )

    return ride_clean


@router.get("/audit-log")
async def get_audit_log(
    dispatcher: dict = Depends(require_role("dispatcher")),
    start: Optional[str] = Query(default=None),
    end: Optional[str] = Query(default=None),
    dispatcher_id: Optional[str] = Query(default=None),
):
    """Query `dispatch_action_log`, optionally filtered by a `created_at` date
    range (inclusive on both ends, when provided) and by the acting
    dispatcher's id (exact match, when provided). Sorted by `created_at`
    descending so the most recent action appears first."""
    query: dict = {}

    created_at_filter: dict = {}
    if start:
        created_at_filter["$gte"] = start
    if end:
        created_at_filter["$lte"] = end
    if created_at_filter:
        query["created_at"] = created_at_filter

    if dispatcher_id:
        query["dispatcher_id"] = dispatcher_id

    cursor = db.dispatch_action_log.find(query).sort("created_at", -1)
    entries = []
    async for entry in cursor:
        entries.append(clean_doc(entry))

    return {"entries": entries}


def _percentile(values: list[float], pct: float) -> float:
    """Simple sorted-list percentile using linear interpolation between the two
    nearest ranks (the standard "nearest-rank with interpolation" approach).
    Returns 0.0 for an empty input."""
    if not values:
        return 0.0
    ordered = sorted(values)
    if len(ordered) == 1:
        return ordered[0]
    k = (len(ordered) - 1) * (pct / 100.0)
    lower = math.floor(k)
    upper = math.ceil(k)
    if lower == upper:
        return ordered[int(k)]
    lower_weight = ordered[lower] * (upper - k)
    upper_weight = ordered[upper] * (k - lower)
    return lower_weight + upper_weight


def compute_ride_volume(rides: list[dict]) -> list[dict]:
    """Pure aggregation: group `rides` by day (the date portion of `created_at`,
    i.e. its first 10 characters, `YYYY-MM-DD`) and by `ride_type`, returning a
    count for each (date, ride_type) pair, sorted by date then ride type."""
    counts: dict[tuple[str, str], int] = {}
    for ride in rides:
        created_at = ride.get("created_at") or ""
        date = created_at[:10]
        ride_type = ride.get("ride_type") or "unknown"
        key = (date, ride_type)
        counts[key] = counts.get(key, 0) + 1

    return [
        {"date": date, "ride_type": ride_type, "count": count}
        for (date, ride_type), count in sorted(counts.items())
    ]


ACCEPTANCE_STATUSES = {"accepted", "arrived", "in_progress", "completed"}
"""Ride statuses that indicate a ride has been accepted by a driver at some
point. Rides have no dedicated acceptance-timestamp field, so `updated_at` is
used as a best-effort proxy for the acceptance instant (see `compute_wait_times`)."""


def _parse_iso(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def compute_wait_times(rides: list[dict]) -> dict:
    """Pure aggregation over ride documents: for each ride whose `status`
    indicates it was accepted by a driver at some point (`accepted`, `arrived`,
    `in_progress`, or `completed`), compute the elapsed seconds between
    `created_at` and `updated_at`, split into `"automatic"`/`"manual"` groups by
    `assignment_type` (absent treated as `"automatic"`, per the Data Models
    section), and return the average and 95th-percentile elapsed seconds for
    each group.

    Note on the acceptance timestamp: ride documents have no dedicated field
    marking the acceptance instant, so `updated_at` is used as a best-effort
    proxy. This is exact for a ride still in `accepted` status, but only an
    upper bound for a ride that has since progressed further (`arrived`,
    `in_progress`, `completed`), since `updated_at` is overwritten by every
    later transition too.
    """
    groups: dict[str, list[float]] = {"automatic": [], "manual": []}
    for ride in rides:
        if ride.get("status") not in ACCEPTANCE_STATUSES:
            continue
        created = _parse_iso(ride.get("created_at"))
        accepted = _parse_iso(ride.get("updated_at"))
        if created is None or accepted is None:
            continue
        elapsed = (accepted - created).total_seconds()
        if elapsed < 0:
            continue
        assignment_type = ride.get("assignment_type") or "automatic"
        if assignment_type not in groups:
            assignment_type = "automatic"
        groups[assignment_type].append(elapsed)

    return {
        key: {
            "avg_seconds": round(sum(values) / len(values), 2) if values else 0.0,
            "p95_seconds": round(_percentile(values, 95), 2) if values else 0.0,
        }
        for key, values in groups.items()
    }


PERFORMANCE_ACTIONS = ("manual_assign", "force_cancel", "reassign")
"""The dispatcher action types counted by performance analytics, per
Requirement 9.3. `reassign_failed` and `create_dispatcher` are intentionally
excluded."""


def compute_dispatcher_performance(entries: list[dict]) -> list[dict]:
    """Pure aggregation over `dispatch_action_log` entries: per dispatcher,
    count `manual_assign`, `force_cancel`, and `reassign` actions, sorted by
    dispatcher id."""
    per_dispatcher: dict[str, dict] = {}
    for entry in entries:
        action = entry.get("action")
        if action not in PERFORMANCE_ACTIONS:
            continue
        dispatcher_id = entry.get("dispatcher_id")
        if dispatcher_id is None:
            continue
        record = per_dispatcher.setdefault(
            dispatcher_id,
            {
                "dispatcher_id": dispatcher_id,
                "dispatcher_name": entry.get("dispatcher_name", ""),
                "manual_assign": 0,
                "force_cancel": 0,
                "reassign": 0,
            },
        )
        record[action] += 1

    return [per_dispatcher[key] for key in sorted(per_dispatcher.keys())]


@router.get("/analytics/volume")
async def get_ride_volume_analytics(
    dispatcher: dict = Depends(require_role("dispatcher")),
    start: str = Query(...),
    end: str = Query(...),
):
    """Ride volume grouped by day and ride type for `[start, end]` (inclusive),
    matched against `created_at` the same way `GET /api/dispatch/audit-log`
    matches its date range. See Requirement 9.1, Property 11."""
    cursor = db.rides.find({"created_at": {"$gte": start, "$lte": end}})
    rides = [clean_doc(doc) async for doc in cursor]
    return {"volume": compute_ride_volume(rides)}


@router.get("/analytics/wait-times")
async def get_wait_time_analytics(
    dispatcher: dict = Depends(require_role("dispatcher")),
    start: str = Query(...),
    end: str = Query(...),
):
    """Average and 95th-percentile elapsed time between ride creation and
    driver acceptance for `[start, end]` (inclusive), split by
    `assignment_type`. See Requirement 9.2, Property 12."""
    cursor = db.rides.find({"created_at": {"$gte": start, "$lte": end}})
    rides = [clean_doc(doc) async for doc in cursor]
    return {"wait_times": compute_wait_times(rides)}


@router.get("/analytics/performance")
async def get_dispatcher_performance_analytics(
    dispatcher: dict = Depends(require_role("dispatcher")),
    start: str = Query(...),
    end: str = Query(...),
):
    """Per-dispatcher counts of manual-assign/force-cancel/reassign actions for
    `[start, end]` (inclusive). See Requirement 9.3, Property 13."""
    cursor = db.dispatch_action_log.find({"created_at": {"$gte": start, "$lte": end}})
    entries = [clean_doc(doc) async for doc in cursor]
    return {"performance": compute_dispatcher_performance(entries)}


@router.get("/drivers/kyc/pending")
async def get_pending_driver_kyc(dispatcher: dict = Depends(require_role("dispatcher"))):
    """List drivers awaiting document/identity verification."""
    cursor = db.driver_kyc.find({"status": "pending"}).sort("submitted_at", -1)
    results = []
    async for kyc in cursor:
        user = await db.users.find_one({"id": kyc["driver_id"]})
        item = clean_doc(kyc) or {}
        item["driver_name"] = user.get("name", "") if user else ""
        item["driver_email"] = user.get("email", "") if user else ""
        item["vehicle_type"] = user.get("vehicle_type", "economy") if user else "economy"
        results.append(item)
    return {"pending_kyc": results}


@router.post("/drivers/kyc/review")
async def review_driver_kyc(body: dict, dispatcher: dict = Depends(require_role("dispatcher"))):
    """Approve or reject a driver's KYC documents."""
    driver_id = body.get("driver_id")
    status = body.get("status")  # "verified" | "rejected"
    reason = body.get("reason", "")

    if not driver_id or status not in ("verified", "rejected"):
        raise HTTPException(400, "Invalid driver_id or status")

    kyc_doc = await db.driver_kyc.find_one({"driver_id": driver_id})
    update_user_fields = {"kyc_status": status, "updated_at": iso_now()}
    if status == "verified" and kyc_doc:
        for f in (
            "phv_badge_number", "badge_expiry", "insurance_policy", "insurance_expiry",
            "vehicle_plate", "plate_expiry", "license_number", "license_expiry", "council_name"
        ):
            if kyc_doc.get(f):
                update_user_fields[f] = kyc_doc[f]

    await db.driver_kyc.update_one(
        {"driver_id": driver_id},
        {"$set": {"status": status, "review_reason": reason, "reviewed_by": dispatcher["id"], "updated_at": iso_now()}},
    )
    await db.users.update_one(
        {"id": driver_id},
        {"$set": update_user_fields},
    )

    await hub.publish_driver(driver_id, {"event": "kyc.status_update", "status": status, "reason": reason})
    return {"ok": True, "driver_id": driver_id, "status": status}


@router.get("/incidents/sos")
async def get_sos_incidents(dispatcher: dict = Depends(require_role("dispatcher"))):
    """List active emergency SOS incidents for control room response."""
    cursor = db.sos_incidents.find().sort("created_at", -1).limit(50)
    incidents = [clean_doc(doc) async for doc in cursor]
    return {"incidents": incidents}


@router.get("/settings")
async def get_dispatch_settings(dispatcher: dict = Depends(require_role("dispatcher"))):
    """Retrieve current fleet dispatch settings (e.g. automatic vs manual allocation)."""
    config = await db.system_settings.find_one({"key": "dispatch_config"})
    auto_dispatch = config.get("auto_dispatch", True) if config else True
    return {"auto_dispatch": auto_dispatch}


@router.post("/settings")
async def update_dispatch_settings(
    body: dict, dispatcher: dict = Depends(require_role("dispatcher"))
):
    """Update fleet dispatch mode (toggle automatic waterfall matching on/off)."""
    auto_dispatch = bool(body.get("auto_dispatch", True))
    await db.system_settings.update_one(
        {"key": "dispatch_config"},
        {
            "$set": {
                "auto_dispatch": auto_dispatch,
                "updated_at": iso_now(),
                "updated_by": dispatcher["id"],
                "updated_by_name": dispatcher.get("name", "Dispatcher"),
            }
        },
        upsert=True,
    )

    # Real-time broadcast to control room WebSockets
    await hub.publish_dispatch(
        {"event": "dispatch.settings_updated", "settings": {"auto_dispatch": auto_dispatch}}
    )

    await db.dispatch_action_log.insert_one(
        {
            "id": str(uuid.uuid4()),
            "dispatcher_id": dispatcher["id"],
            "dispatcher_name": dispatcher.get("name", ""),
            "action": "toggle_auto_dispatch",
            "ride_id": None,
            "driver_id": None,
            "previous_driver_id": None,
            "detail": {"auto_dispatch": auto_dispatch},
            "created_at": iso_now(),
        }
    )

    return {"ok": True, "auto_dispatch": auto_dispatch}



@router.post("/incidents/sos/{incident_id}/resolve")
async def resolve_sos_incident(incident_id: str, body: dict, dispatcher: dict = Depends(require_role("dispatcher"))):
    """Resolve an SOS emergency incident with dispatcher notes."""
    notes = body.get("notes", "Resolved by dispatcher")
    res = await db.sos_incidents.update_one(
        {"id": incident_id},
        {"$set": {"status": "resolved", "resolved_by": dispatcher["id"], "notes": notes, "updated_at": iso_now()}},
    )
    if res.modified_count == 0:
        raise HTTPException(404, "Incident not found")

    await hub.publish_dispatch({"event": "safety.sos_resolved", "incident_id": incident_id, "notes": notes})
    return {"ok": True, "incident_id": incident_id, "status": "resolved"}


@router.get("/compliance/summary")
async def get_compliance_summary(dispatcher: dict = Depends(require_role("dispatcher"))):
    """
    Overview of driver regulatory compliance with Fife Council standards.
    Returns compliant counts, expiring documents, and pending reviews.
    """
    total_drivers = await db.users.count_documents({"role": "driver"})
    drivers_cursor = db.users.find({"role": "driver"})

    compliant_count = 0
    non_compliant_count = 0
    expired_badge_count = 0
    expired_insurance_count = 0
    expired_plate_count = 0
    flagged_drivers = []

    async for user in drivers_cursor:
        kyc = await db.driver_kyc.find_one({"driver_id": user["id"]})
        is_compliant, reason, details = verify_driver_compliance(user, kyc)
        if is_compliant:
            compliant_count += 1
        else:
            non_compliant_count += 1
            if "Badge" in reason:
                expired_badge_count += 1
            if "Insurance" in reason:
                expired_insurance_count += 1
            if "Plate" in reason:
                expired_plate_count += 1
            flagged_drivers.append({
                "driver_id": user["id"],
                "name": user.get("name", "Unknown"),
                "email": user.get("email", ""),
                "reason": reason,
                "badge_expiry": details.get("badge_expiry"),
                "insurance_expiry": details.get("insurance_expiry"),
                "plate_expiry": details.get("plate_expiry"),
            })

    pending_kyc = await db.driver_kyc.count_documents({"status": "pending"})

    return {
        "total_drivers": total_drivers,
        "compliant_count": compliant_count,
        "non_compliant_count": non_compliant_count,
        "expired_badge_count": expired_badge_count,
        "expired_insurance_count": expired_insurance_count,
        "expired_plate_count": expired_plate_count,
        "pending_kyc_count": pending_kyc,
        "flagged_drivers": flagged_drivers,
    }


@router.get("/compliance/fife-audit-export")
async def export_fife_statutory_audit(
    dispatcher: dict = Depends(require_role("dispatcher")),
    start: Optional[str] = Query(default=None, description="Start date filter (YYYY-MM-DD or ISO)"),
    end: Optional[str] = Query(default=None, description="End date filter (YYYY-MM-DD or ISO)"),
    format: str = Query(default="csv", pattern="^(csv|json)$"),
):
    """
    Statutory Inspection Export complying with Provincial Transport Authority
    regulations and Municipal Adda Stand Licensing rules.
    Exports comprehensive booking audit logs required during statutory inspections.
    """
    query: dict = {}
    date_filter: dict = {}
    if start:
        date_filter["$gte"] = start if "T" in start else f"{start}T00:00:00"
    if end:
        date_filter["$lte"] = end if "T" in end else f"{end}T23:59:59.999999"
    if date_filter:
        query["created_at"] = date_filter

    cursor = db.rides.find(query).sort("created_at", -1)
    rides = [clean_doc(doc) async for doc in cursor]

    if format == "json":
        return {"total_records": len(rides), "rides": rides}

    # Generate CSV format
    csv_stream = io.StringIO()
    writer = csv.writer(csv_stream, delimiter=",", quoting=csv.QUOTE_MINIMAL)

    # Statutory CSV Header (matches Fife Council Booking Office Inspection Criteria)
    writer.writerow([
        "Statutory Booking Reference",
        "Booking Date & Time (UTC)",
        "Passenger Name",
        "Passenger Phone",
        "Pickup Address",
        "Pickup Coordinates",
        "Destination Address",
        "Destination Coordinates",
        "Assigned Driver Full Name",
        "Transport Authority / Traffic Police Permit",
        "Licensing Authority",
        "Vehicle Compliance Plate / Registration",
        "Vehicle Make & Model",
        "Vehicle Color",
        "Gross Fare (PKR)",
        "Platform Fee (PKR)",
        "Driver Net Earnings (PKR)",
        "Trip Status",
        "Assignment Method",
        "Booking Created At",
        "Last Status Update",
    ])

    for r in rides:
        pickup = r.get("pickup") or {}
        dest = r.get("destination") or {}
        pickup_coords = f"{pickup.get('lat', '')}, {pickup.get('lng', '')}"
        dest_coords = f"{dest.get('lat', '')}, {dest.get('lng', '')}"

        writer.writerow([
            r.get("id", ""),
            r.get("created_at", ""),
            r.get("passenger_name", "Anonymous Passenger"),
            r.get("passenger_phone", ""),
            pickup.get("address", ""),
            pickup_coords,
            dest.get("address", ""),
            dest_coords,
            r.get("driver_name", "Unassigned"),
            r.get("phv_badge_number", "N/A"),
            r.get("council_name", "Regional Transport Authority (RTA)"),
            r.get("vehicle_plate", "N/A"),
            r.get("vehicle_make", ""),
            r.get("vehicle_color", ""),
            f"{r.get('fare', 0.0):.2f}",
            f"{r.get('platform_fee', 0.0):.2f}",
            f"{r.get('driver_earnings', 0.0):.2f}",
            r.get("status", ""),
            r.get("assignment_type", "auto"),
            r.get("created_at", ""),
            r.get("updated_at", ""),
        ])

    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    filename = f"watan_transport_authority_audit_{today_str}.csv"
    
    return Response(
        content=csv_stream.getvalue(),
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store, no-cache, must-revalidate",
        },
    )

