import math
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status

from ..db import db
from ..deps import get_current_user
from ..models import AddaCheckinIn, AddaCreateIn, AddaEnrollDriverIn
from ..utils import clean_doc, iso_now, new_id, now_utc

router = APIRouter(prefix="/api/addas", tags=["addas"])


def haversine_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate the great circle distance in kilometers between two points on Earth."""
    r = 6371.0
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    a = (
        math.sin(d_lat / 2.0) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(d_lon / 2.0) ** 2
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return r * c


@router.get("")
async def list_addas(
    city: Optional[str] = Query(default=None),
    status_filter: Optional[str] = Query(default="active"),
) -> List[Dict[str, Any]]:
    """List registered transport stands (Addas) across Pakistan."""
    query: Dict[str, Any] = {}
    if city:
        query["city"] = {"$regex": city, "$options": "i"}
    if status_filter:
        query["status"] = status_filter

    addas = []
    async for doc in db.addas.find(query):
        # Fetch active bays count for this adda
        active_bays = await db.pari_queues.count_documents(
            {"adda_id": doc.get("id"), "status": {"$in": ["loading", "waiting_in_bay"]}}
        )
        doc["active_bays_count"] = active_bays
        addas.append(clean_doc(doc))
    return addas


@router.get("/nearby")
async def get_nearby_addas(
    lat: float = Query(..., ge=-90, le=90),
    lng: float = Query(..., ge=-180, le=180),
    radius_km: float = Query(default=25.0, ge=0.5, le=100.0),
) -> List[Dict[str, Any]]:
    """Find Addas near user's GPS coordinates, ranked by distance."""
    nearby = []
    async for doc in db.addas.find({"status": "active"}):
        adda_lat = doc.get("lat")
        adda_lng = doc.get("lng")
        if adda_lat is None or adda_lng is None:
            continue
        dist = haversine_distance_km(lat, lng, adda_lat, adda_lng)
        if dist <= radius_km:
            clean = clean_doc(doc)
            clean["distance_km"] = round(dist, 2)
            # Check upcoming departures
            upcoming = []
            async for p in db.pari_queues.find(
                {"adda_id": doc.get("id"), "status": {"$in": ["loading", "waiting_in_bay"]}}
            ).limit(4):
                upcoming.append(clean_doc(p))
            clean["upcoming_departures"] = upcoming
            nearby.append(clean)

    nearby.sort(key=lambda x: x["distance_km"])
    return nearby


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_adda(
    payload: AddaCreateIn,
    current_user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:
    """Register a new Adda (Thekedar/Munshi admin operation)."""
    adda_id = f"adda_{new_id()[:8]}"
    doc = {
        "id": adda_id,
        "name": payload.name,
        "urdu_name": payload.urdu_name or payload.name,
        "watan_code": payload.watan_code.upper(),
        "city": payload.city,
        "district": payload.district,
        "lat": payload.lat,
        "lng": payload.lng,
        "geofence_radius_meters": payload.geofence_radius_meters,
        "allowed_vehicle_types": payload.allowed_vehicle_types,
        "bays_count": payload.bays_count,
        "internal_parchi_rate_fixed_pkr": payload.internal_parchi_rate_fixed_pkr,
        "driver_watan_commission_percent": 0.0,
        "weekly_subscription_fee_pkr": payload.weekly_subscription_fee_pkr,
        "subscription_status": "active",
        "billing_cycle": "weekly",
        "manager_user_id": current_user["id"],
        "manager_phone": payload.manager_phone or current_user.get("phone", ""),
        "status": "active",
        "created_at": iso_now(),
        "updated_at": iso_now(),
    }
    await db.addas.insert_one(doc)
    return clean_doc(doc)


@router.get("/{adda_id}")
async def get_adda_details(adda_id: str) -> Dict[str, Any]:
    """Get single Adda overview including bays, roster, and live Pari turns."""
    adda = await db.addas.find_one({"id": adda_id})
    if not adda:
        raise HTTPException(status_code=404, detail="Adda stand not found")

    clean = clean_doc(adda)
    bays = []
    async for b in db.pari_queues.find({"adda_id": adda_id, "status": {"$ne": "departed"}}).sort("bay_number", 1):
        bays.append(clean_doc(b))
    clean["active_bays"] = bays
    return clean


@router.post("/{adda_id}/enroll-driver")
async def enroll_driver_in_adda(
    adda_id: str,
    payload: AddaEnrollDriverIn,
    current_user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:
    """Munshi/Thekedar adds an independent driver to their stand's official fleet roster."""
    adda = await db.addas.find_one({"id": adda_id})
    if not adda:
        raise HTTPException(status_code=404, detail="Adda stand not found")

    driver = await db.users.find_one({
        "role": "driver",
        "$or": [
            {"id": payload.driver_identifier},
            {"phone": payload.driver_identifier},
            {"cnic": payload.driver_identifier},
        ]
    })
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found with provided phone, CNIC, or ID")

    # Update driver record with adda affiliation
    membership = {
        "adda_id": adda_id,
        "adda_name": adda.get("name"),
        "enrolled_by_munshi_id": current_user["id"],
        "status": "approved",
        "joined_at": iso_now(),
    }
    await db.users.update_one(
        {"id": driver["id"]},
        {"$addToSet": {"adda_memberships": membership}}
    )
    return {
        "status": "enrolled",
        "driver_id": driver["id"],
        "driver_name": driver.get("name"),
        "adda_id": adda_id,
        "adda_name": adda.get("name"),
    }


@router.get("/{adda_id}/pari")
async def get_adda_pari_queue(adda_id: str) -> List[Dict[str, Any]]:
    """Get active Pari turns and bay loading status for an Adda."""
    queue = []
    async for item in db.pari_queues.find(
        {"adda_id": adda_id, "status": {"$in": ["waiting_in_bay", "loading", "ready_to_depart"]}}
    ).sort("pari_position", 1):
        queue.append(clean_doc(item))
    return queue


@router.post("/{adda_id}/pari/checkin")
async def checkin_driver_to_pari(
    adda_id: str,
    payload: AddaCheckinIn,
    current_user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:
    """Check in a driver to a bay inside the Adda Pari queue."""
    adda = await db.addas.find_one({"id": adda_id})
    if not adda:
        raise HTTPException(status_code=404, detail="Adda stand not found")

    existing_count = await db.pari_queues.count_documents(
        {"adda_id": adda_id, "corridor_id": payload.corridor_id, "status": {"$ne": "departed"}}
    )
    pari_position = existing_count + 1

    entry_id = f"pari_{new_id()[:8]}"
    pari_doc = {
        "id": entry_id,
        "adda_id": adda_id,
        "corridor_id": payload.corridor_id,
        "corridor_name": payload.corridor_name,
        "driver_id": payload.driver_id,
        "vehicle_plate": payload.vehicle_plate,
        "vehicle_type": payload.vehicle_type or "wagon",
        "bay_number": payload.bay_number,
        "pari_position": pari_position,
        "status": "loading" if pari_position == 1 else "waiting_in_bay",
        "total_seats": payload.total_seats,
        "booked_seats_count": 0,
        "booked_seat_numbers": [],
        "scheduled_departure": payload.scheduled_departure_time,
        "arrived_at": iso_now(),
        "created_at": iso_now(),
    }
    await db.pari_queues.insert_one(pari_doc)

    # Set driver's active mode to 'adda'
    await db.users.update_one(
        {"id": payload.driver_id},
        {"$set": {"active_mode": "adda", "current_adda_id": adda_id, "geofence_status": "inside_adda"}}
    )

    return clean_doc(pari_doc)


@router.post("/{adda_id}/pari/{pari_id}/depart")
async def depart_pari_vehicle(
    adda_id: str,
    pari_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:
    """Release a loading vehicle for departure from the Adda."""
    pari = await db.pari_queues.find_one({"id": pari_id, "adda_id": adda_id})
    if not pari:
        raise HTTPException(status_code=404, detail="Pari queue entry not found")

    await db.pari_queues.update_one(
        {"id": pari_id},
        {"$set": {"status": "departed", "departed_at": iso_now()}}
    )

    # Promote next vehicle in Pari queue for this corridor
    next_vehicle = await db.pari_queues.find_one(
        {"adda_id": adda_id, "corridor_id": pari["corridor_id"], "status": "waiting_in_bay"},
        sort=[("pari_position", 1)]
    )
    if next_vehicle:
        await db.pari_queues.update_one(
            {"id": next_vehicle["id"]},
            {"$set": {"status": "loading", "pari_position": 1}}
        )

    return {"status": "departed", "pari_id": pari_id, "corridor_id": pari["corridor_id"]}
