import asyncio
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from ..db import db
from ..deps import get_current_user, get_optional_user
from ..models import EmergencySosIn, RateIn, RideEstimateIn, RideRequestIn
from ..services.dispatch_engine import dispatch_ride_waterfall
from ..services.fare import calculate_surge_multiplier, compute_fare
from ..services.realtime import hub, send_push_notification
from ..services.routing import get_route_details
from ..services.state_machine import assert_transition
from ..utils import clean_doc, haversine_km, iso_now

router = APIRouter(prefix="/api/rides", tags=["rides"])


@router.post("/estimate")
async def estimate(body: RideEstimateIn, user: Optional[dict] = Depends(get_optional_user)):
    # Calculate realistic road network route & duration
    route_details = get_route_details(body.pickup_lat, body.pickup_lng, body.dest_lat, body.dest_lng)
    distance_km = route_details["distance_km"]
    duration_min = route_details["duration_min"]

    # Calculate local surge multiplier based on active requests vs online drivers
    online_drivers_count = await db.driver_status.count_documents({"online": True})
    pending_rides_count = await db.rides.count_documents({"status": "pending"})
    surge = calculate_surge_multiplier(pending_rides_count, online_drivers_count)

    multimodal_types = [
        "bike",
        "rickshaw",
        "qingqi",
        "car_mini",
        "car_comfort",
        "wagon",
        "coaster",
    ]
    options = [
        compute_fare(
            distance_km=distance_km,
            ride_type=t,
            duration_min=duration_min,
            surge_multiplier=surge,
        )
        for t in multimodal_types
    ]

    return {
        "distance_km": distance_km,
        "duration_min": duration_min,
        "surge_multiplier": surge,
        "polyline": route_details["polyline"],
        "initial_bearing": route_details["initial_bearing"],
        "options": options,
    }


@router.post("/request")
async def request_ride(body: RideRequestIn, user: dict = Depends(get_current_user)):
    if user.get("role") != "passenger":
        raise HTTPException(status_code=403, detail="Requires passenger role")

    active = await db.rides.find_one(
        {
            "passenger_id": user["id"],
            "status": {"$in": ["pending", "accepted", "arrived", "in_progress"]},
        }
    )
    if active:
        raise HTTPException(status_code=400, detail="You already have an active ride")

    # Routing details
    route_details = get_route_details(body.pickup_lat, body.pickup_lng, body.dest_lat, body.dest_lng)
    distance = route_details["distance_km"]
    duration = route_details["duration_min"]

    online_drivers_count = await db.driver_status.count_documents({"online": True})
    pending_rides_count = await db.rides.count_documents({"status": "pending"})
    surge = calculate_surge_multiplier(pending_rides_count, online_drivers_count)

    fare_info = compute_fare(
        distance_km=distance,
        ride_type=body.ride_type,
        duration_min=duration,
        surge_multiplier=surge,
    )

    ride_id = str(uuid.uuid4())
    ride = {
        "id": ride_id,
        "passenger_id": user["id"],
        "passenger_name": user["name"],
        "passenger_phone": user.get("phone", ""),
        "passenger_rating": user.get("rating", 5.0),
        "driver_id": None,
        "driver_name": None,
        "driver_phone": None,
        "driver_rating": None,
        "vehicle_make": None,
        "vehicle_plate": None,
        "vehicle_color": None,
        "pickup": {
            "lat": body.pickup_lat,
            "lng": body.pickup_lng,
            "address": body.pickup_address,
        },
        "destination": {
            "lat": body.dest_lat,
            "lng": body.dest_lng,
            "address": body.dest_address,
        },
        "ride_type": body.ride_type,
        "distance_km": fare_info["distance_km"],
        "duration_min": fare_info["duration_min"],
        "fare": fare_info["fare"],
        "surge_multiplier": fare_info["surge_multiplier"],
        "platform_fee": fare_info["platform_fee"],
        "driver_earnings": fare_info["driver_earnings"],
        "polyline": route_details["polyline"],
        "navigation_steps": route_details["steps"],
        "status": "pending",
        "payment_method": getattr(body, "payment_method", "card") or "card",
        "payment_status": "unpaid",
        "waiting_fee": 0.0,
        "waiting_seconds": 0,
        "passenger_rated_driver": False,
        "driver_rated_passenger": False,
        "sos_triggered": False,
        "created_at": iso_now(),
        "updated_at": iso_now(),
    }
    await db.rides.insert_one(ride.copy())
    await hub.publish_ride(ride_id, {"event": "ride.created", "ride": clean_doc(ride)})
    await hub.publish_dispatch({"event": "ride.created", "ride": clean_doc(ride)})

    # Trigger server-driven waterfall matching immediately
    asyncio.create_task(dispatch_ride_waterfall(ride_id))

    return clean_doc(ride)


@router.get("/current")
async def current_ride(user: dict = Depends(get_current_user)):
    if user["role"] == "passenger":
        q = {
            "passenger_id": user["id"],
            "status": {"$in": ["pending", "accepted", "arrived", "in_progress"]},
        }
    else:
        q = {
            "driver_id": user["id"],
            "status": {"$in": ["accepted", "arrived", "in_progress"]},
        }
    ride = await db.rides.find_one(q, sort=[("created_at", -1)])
    if not ride:
        return None

    cleaned = clean_doc(ride)
    # If driver is assigned, attach latest driver telemetry location & bearing
    if ride.get("driver_id"):
        status = await db.driver_status.find_one({"driver_id": ride["driver_id"]})
        if status:
            cleaned["driver_location"] = {
                "lat": status.get("lat"),
                "lng": status.get("lng"),
                "bearing": status.get("bearing", 0),
            }

    return cleaned


@router.post("/{ride_id}/cancel")
async def cancel_ride(ride_id: str, user: dict = Depends(get_current_user)):
    ride = await db.rides.find_one({"id": ride_id})
    if not ride:
        raise HTTPException(404, "Ride not found")
    if user["id"] not in (ride.get("passenger_id"), ride.get("driver_id")):
        raise HTTPException(403, "Not allowed to cancel this ride")

    if ride["status"] == "cancelled":
        return {"ok": True, "cancellation_fee": ride.get("cancellation_fee", 0.0), "message": "Ride is already cancelled"}

    assert_transition(ride["status"], "cancelled")

    # Assess cancellation fee if canceled by passenger after driver accepted
    cancel_fee = 0.0
    if ride["status"] in ("accepted", "arrived") and user["id"] == ride.get("passenger_id"):
        cancel_fee = 5.0

    await db.rides.update_one(
        {"id": ride_id},
        {
            "$set": {
                "status": "cancelled",
                "cancellation_fee": cancel_fee,
                "cancelled_by": user["role"],
                "reserved_by": None,
                "reserved_until": None,
                "updated_at": iso_now(),
            }
        },
    )
    # Publish to ride channel and dispatch monitor
    await hub.publish_ride(ride_id, {"event": "ride.cancelled", "ride_id": ride_id, "fee": cancel_fee})
    
    # Also notify candidate or assigned driver directly if any
    target_driver_id = ride.get("driver_id") or ride.get("reserved_by")
    if target_driver_id:
        await hub.publish_driver(target_driver_id, {"event": "ride.cancelled", "ride_id": ride_id})

    ride = await db.rides.find_one({"id": ride_id})
    await hub.publish_dispatch({"event": "ride.updated", "ride": clean_doc(ride)})
    return {"ok": True, "cancellation_fee": cancel_fee}


@router.post("/{ride_id}/sos")
async def trigger_emergency_sos(ride_id: str, body: EmergencySosIn, user: dict = Depends(get_current_user)):
    ride = await db.rides.find_one({"id": ride_id})
    if not ride:
        raise HTTPException(404, "Ride not found")
    if user["id"] not in (ride.get("passenger_id"), ride.get("driver_id")):
        raise HTTPException(403, "Not authorized for this ride")

    sos_incident = {
        "id": str(uuid.uuid4()),
        "ride_id": ride_id,
        "triggered_by_user_id": user["id"],
        "triggered_by_role": user["role"],
        "triggered_by_name": user["name"],
        "lat": body.lat,
        "lng": body.lng,
        "reason": body.reason,
        "status": "active_emergency",
        "created_at": iso_now(),
    }
    await db.sos_incidents.insert_one(sos_incident.copy())
    await db.rides.update_one(
        {"id": ride_id},
        {"$set": {"sos_triggered": True, "last_sos_id": sos_incident["id"], "updated_at": iso_now()}},
    )

    # Real-time alert to dispatch control room and both participants
    alert_payload = {
        "event": "safety.emergency_sos",
        "incident": clean_doc(sos_incident),
        "ride": clean_doc(ride),
    }
    await hub.publish_dispatch(alert_payload)
    await hub.publish_ride(ride_id, alert_payload)

    return {"ok": True, "incident_id": sos_incident["id"], "message": "Emergency broadcast dispatched"}


@router.get("/history/list")
async def history(user: dict = Depends(get_current_user)):
    q = {"passenger_id": user["id"]} if user["role"] == "passenger" else {"driver_id": user["id"]}
    cursor = db.rides.find(q).sort("created_at", -1).limit(100)
    return [clean_doc(r) async for r in cursor]


@router.get("/{ride_id}")
async def get_ride(ride_id: str, user: dict = Depends(get_current_user)):
    ride = await db.rides.find_one({"id": ride_id})
    if not ride:
        raise HTTPException(404, "Ride not found")
    if user["id"] not in (ride.get("passenger_id"), ride.get("driver_id")) and user.get("role") != "dispatcher":
        raise HTTPException(403, "Not authorized for this ride")

    cleaned = clean_doc(ride)
    if ride.get("driver_id"):
        status = await db.driver_status.find_one({"driver_id": ride["driver_id"]})
        if status:
            cleaned["driver_location"] = {
                "lat": status.get("lat"),
                "lng": status.get("lng"),
                "bearing": status.get("bearing", 0),
            }
    return cleaned


@router.post("/{ride_id}/rate")
async def rate(ride_id: str, body: RateIn, user: dict = Depends(get_current_user)):
    ride = await db.rides.find_one({"id": ride_id})
    if not ride:
        raise HTTPException(404, "Ride not found")
    if ride["status"] != "completed":
        raise HTTPException(400, "Can only rate completed rides")

    rating = body.rating
    if user["role"] == "passenger" and ride.get("passenger_id") == user["id"]:
        if ride.get("passenger_rated_driver"):
            raise HTTPException(400, "Already rated")
        await db.rides.update_one(
            {"id": ride_id},
            {
                "$set": {
                    "passenger_to_driver_rating": rating,
                    "passenger_comment": body.comment,
                    "passenger_rated_driver": True,
                    "updated_at": iso_now(),
                }
            },
        )
        driver = await db.users.find_one({"id": ride.get("driver_id")})
        if driver:
            n = driver.get("num_ratings", 0)
            avg = (driver.get("rating", 5.0) * n + rating) / (n + 1)
            await db.users.update_one(
                {"id": ride["driver_id"]},
                {"$set": {"rating": round(avg, 2), "num_ratings": n + 1}},
            )

    elif user["role"] == "driver" and ride.get("driver_id") == user["id"]:
        if ride.get("driver_rated_passenger"):
            raise HTTPException(400, "Already rated")
        await db.rides.update_one(
            {"id": ride_id},
            {
                "$set": {
                    "driver_to_passenger_rating": rating,
                    "driver_comment": body.comment,
                    "driver_rated_passenger": True,
                    "updated_at": iso_now(),
                }
            },
        )
        passenger = await db.users.find_one({"id": ride.get("passenger_id")})
        if passenger:
            n = passenger.get("num_ratings", 0)
            avg = (passenger.get("rating", 5.0) * n + rating) / (n + 1)
            await db.users.update_one(
                {"id": ride["passenger_id"]},
                {"$set": {"rating": round(avg, 2), "num_ratings": n + 1}},
            )
    else:
        raise HTTPException(403, "Not part of this ride")

    await hub.publish_ride(ride_id, {"event": "ride.rated", "ride_id": ride_id})
    return {"ok": True}
