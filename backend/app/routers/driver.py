import asyncio
import math
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from ..db import db
from ..deps import get_current_user, require_role
from ..models import DriverKycSubmitIn, DriverModeToggleIn, DriverPayoutIn, DriverStatusIn, LocationIn
from ..services.compliance import verify_driver_compliance
from ..services.dispatch_engine import dispatch_ride_waterfall
from ..services.matching import can_consider, score_ride
from ..services.realtime import hub, send_push_notification
from ..services.routing import calculate_bearing
from ..services.state_machine import assert_transition
from ..services.telemetry import smooth_coordinates, validate_telemetry_plausibility
from ..utils import clean_doc, haversine_km, iso_now, now_utc

router = APIRouter(prefix="/api", tags=["driver"])


@router.post("/driver/kyc")
async def submit_driver_kyc(body: DriverKycSubmitIn, user: dict = Depends(require_role("driver"))):
    kyc_doc = {
        "driver_id": user["id"],
        "license_number": body.license_number,
        "license_expiry": body.license_expiry,
        "council_name": body.council_name or "Fife Council",
        "operator_license_number": body.operator_license_number or "",
        "operator_license_expiry": body.operator_license_expiry or "",
        "phv_badge_number": body.phv_badge_number or "",
        "badge_expiry": body.badge_expiry or "",
        "insurance_policy": body.insurance_policy,
        "insurance_expiry": body.insurance_expiry or "",
        "vehicle_plate": body.vehicle_plate or user.get("vehicle_plate", ""),
        "plate_expiry": body.plate_expiry or "",
        "vehicle_year": body.vehicle_year,
        "vehicle_color": body.vehicle_color,
        "bank_sort_code": body.bank_sort_code or "",
        "bank_account_number": body.bank_account_number or "",
        "document_urls": body.document_urls or [],
        "status": "pending",  # "pending", "verified", "rejected"
        "submitted_at": iso_now(),
        "updated_at": iso_now(),
    }
    await db.driver_kyc.update_one({"driver_id": user["id"]}, {"$set": kyc_doc}, upsert=True)
    await db.users.update_one(
        {"id": user["id"]},
        {
            "$set": {
                "kyc_status": "pending",
                "council_name": body.council_name or "Fife Council",
                "operator_license_number": body.operator_license_number or "",
                "phv_badge_number": body.phv_badge_number or "",
                "badge_expiry": body.badge_expiry or "",
                "insurance_policy": body.insurance_policy,
                "insurance_expiry": body.insurance_expiry or "",
                "vehicle_plate": body.vehicle_plate or user.get("vehicle_plate", ""),
                "plate_expiry": body.plate_expiry or "",
                "vehicle_year": body.vehicle_year,
                "vehicle_color": body.vehicle_color,
                "updated_at": iso_now(),
            }
        },
    )
    await hub.publish_dispatch({"event": "kyc.submitted", "driver_id": user["id"], "name": user["name"]})
    return {"ok": True, "status": "pending", "message": "KYC & Fife Statutory Documents submitted for review"}


@router.get("/driver/kyc")
async def get_driver_kyc(user: dict = Depends(require_role("driver"))):
    doc = await db.driver_kyc.find_one({"driver_id": user["id"]})
    user_doc = await db.users.find_one({"id": user["id"]})
    status = user_doc.get("kyc_status", "documents_required") if user_doc else "documents_required"
    return {
        "status": status,
        "kyc": clean_doc(doc) if doc else None,
    }


@router.post("/driver/status")
async def driver_status(body: DriverStatusIn, user: dict = Depends(require_role("driver"))):
    # Enforce Fife Council Statutory Hard Expiry Block before allowing driver to go online
    if body.online:
        user_doc = await db.users.find_one({"id": user["id"]})
        kyc_doc = await db.driver_kyc.find_one({"driver_id": user["id"]})
        is_compliant, reason, _ = verify_driver_compliance(user_doc or user, kyc_doc)
        if not is_compliant:
            raise HTTPException(
                status_code=403,
                detail=f"Compliance Hard Stop (Fife Council): Cannot go online. {reason}. Please update your statutory documents in the driver portal."
            )

    prev_doc = await db.driver_status.find_one({"driver_id": user["id"]})
    prev_lat = prev_doc.get("lat") if prev_doc else None
    prev_lng = prev_doc.get("lng") if prev_doc else None

    smooth_lat = body.lat
    smooth_lng = body.lng
    bearing = body.bearing

    if body.lat is not None and body.lng is not None:
        smooth_lat, smooth_lng = smooth_coordinates(prev_lat, prev_lng, body.lat, body.lng)
        if prev_lat is not None and prev_lng is not None and (prev_lat != smooth_lat or prev_lng != smooth_lng):
            bearing = calculate_bearing(prev_lat, prev_lng, smooth_lat, smooth_lng)

    update = {
        "online": body.online,
        "lat": smooth_lat,
        "lng": smooth_lng,
        "bearing": bearing or 0.0,
        "updated_at": iso_now(),
    }

    await db.driver_status.update_one({"driver_id": user["id"]}, {"$set": update}, upsert=True)
    doc = await db.driver_status.find_one({"driver_id": user["id"]})
    safe_doc = clean_doc(doc)
    await hub.publish_driver(user["id"], {"event": "driver.status", "status": safe_doc})
    await hub.publish_dispatch({"event": "driver.status", "status": safe_doc})
    return safe_doc


@router.get("/driver/incoming")
async def driver_incoming(user: dict = Depends(require_role("driver"))):
    status = await db.driver_status.find_one({"driver_id": user["id"]})
    if not status or not status.get("online"):
        return {"request": None}

    active = await db.rides.find_one(
        {"driver_id": user["id"], "status": {"$in": ["accepted", "arrived", "in_progress"]}}
    )
    if active:
        return {"request": None}

    # When driver is in Adda Mode (loading in a Pari queue), doorstep rides are paused
    if user.get("active_mode") == "adda":
        return {"request": None, "mode": "adda", "message": "In Adda Pari mode; doorstep hailing paused"}

    # Check if there is an active reservation already assigned to this driver
    reserved = await db.rides.find_one(
        {
            "status": "pending",
            "reserved_by": user["id"],
            "reserved_until": {"$gt": iso_now()},
        }
    )
    if reserved:
        dist = haversine_km(
            status.get("lat", 0.0),
            status.get("lng", 0.0),
            reserved["pickup"]["lat"],
            reserved["pickup"]["lng"],
        )
        r_clean = clean_doc(reserved) or {}
        r_clean["distance_to_pickup_km"] = round(dist, 2)
        return {"request": r_clean}

    vehicle_type = user.get("vehicle_type", "economy")
    candidates = []
    cursor = db.rides.find({"status": "pending", "ride_type": vehicle_type}).sort("created_at", 1).limit(50)
    async for ride in cursor:
        if can_consider(ride, status, vehicle_type):
            candidates.append(ride)

    if not candidates:
        return {"request": None}

    candidates.sort(key=lambda r: score_ride(r, status))
    selected = candidates[0]

    reserve_iso = (now_utc() + timedelta(seconds=20)).isoformat()

    res = await db.rides.update_one(
        {
            "id": selected["id"],
            "status": "pending",
            "$or": [
                {"reserved_until": {"$lt": iso_now()}},
                {"reserved_until": {"$exists": False}},
                {"reserved_by": None},
            ],
        },
        {
            "$set": {
                "reserved_by": user["id"],
                "reserved_until": reserve_iso,
                "assignment_type": "automatic",
                "updated_at": iso_now(),
            }
        },
    )
    if res.modified_count == 0:
        return {"request": None}

    ride = await db.rides.find_one({"id": selected["id"]})
    if not ride:
        return {"request": None}

    dist = haversine_km(status.get("lat", 0.0), status.get("lng", 0.0), ride["pickup"]["lat"], ride["pickup"]["lng"])
    ride_clean = clean_doc(ride) or {}
    ride_clean["distance_to_pickup_km"] = round(dist, 2)
    await hub.publish_driver(user["id"], {"event": "driver.incoming", "request": ride_clean})
    await hub.publish_dispatch({"event": "driver.incoming", "request": ride_clean})
    return {"request": ride_clean}


@router.post("/rides/{ride_id}/decline")
async def decline_ride(ride_id: str, user: dict = Depends(require_role("driver"))):
    """Driver rejects incoming ride offer -> release lock and cascade to next driver."""
    ride = await db.rides.find_one({"id": ride_id, "status": "pending"})
    if not ride:
        return {"ok": True}

    if ride.get("reserved_by") == user["id"]:
        await db.rides.update_one(
            {"id": ride_id},
            {
                "$set": {"reserved_by": None, "reserved_until": None, "updated_at": iso_now()},
                "$addToSet": {"declined_driver_ids": user["id"]},
            },
        )
        # Cascade waterfall to next available driver
        import asyncio
        asyncio.create_task(dispatch_ride_waterfall(ride_id))

    return {"ok": True}


@router.post("/rides/{ride_id}/accept")
async def accept_ride(ride_id: str, user: dict = Depends(require_role("driver"))):
    ride = await db.rides.find_one({"id": ride_id})
    if not ride:
        raise HTTPException(404, "Ride not found")

    # Idempotent return if ride was already accepted by this driver (e.g. via direct manual dispatch)
    if ride.get("status") == "accepted" and ride.get("driver_id") == user["id"]:
        return clean_doc(ride)

    assert_transition(ride["status"], "accepted")

    status = await db.driver_status.find_one({"driver_id": user["id"]})
    kyc = await db.driver_kyc.find_one({"driver_id": user["id"]})
    user_doc = await db.users.find_one({"id": user["id"]})

    # Fife Council Hard Stop: Re-verify compliance at the exact moment of acceptance
    is_compliant, reason, _ = verify_driver_compliance(user_doc or user, kyc)
    if not is_compliant:
        raise HTTPException(
            status_code=403,
            detail=f"Compliance Hard Stop (Fife Council): Ride cannot be accepted because {reason}."
        )

    now = iso_now()
    res = await db.rides.update_one(
        {
            "id": ride_id,
            "status": "pending",
            "$or": [
                {"reserved_by": user["id"]},
                {"reserved_until": {"$lt": now}},
                {"reserved_by": None},
            ],
        },
        {
            "$set": {
                "status": "accepted",
                "driver_id": user["id"],
                "driver_name": user["name"],
                "driver_rating": user.get("rating", 5.0),
                "driver_phone": user.get("phone", ""),
                "driver_lat": status.get("lat") if status else None,
                "driver_lng": status.get("lng") if status else None,
                "vehicle_make": user.get("vehicle_make", ""),
                "vehicle_plate": user.get("vehicle_plate", ""),
                "vehicle_color": user.get("vehicle_color", ""),
                "council_name": (kyc.get("council_name") if kyc else user.get("council_name")) or "UK Licensed Authority",
                "operator_license_number": (kyc.get("operator_license_number") if kyc else user.get("operator_license_number")) or "",
                "phv_badge_number": (kyc.get("phv_badge_number") if kyc else user.get("phv_badge_number")) or "",
                "reserved_by": None,
                "reserved_until": None,
                "updated_at": now,
            }
        },
    )
    if res.modified_count == 0:
        raise HTTPException(400, "Ride no longer available")

    ride = await db.rides.find_one({"id": ride_id})
    safe = clean_doc(ride)
    await hub.publish_ride(ride_id, {"event": "ride.accepted", "ride": safe})
    await hub.publish_dispatch({"event": "ride.updated", "ride": safe})
    return safe


@router.post("/rides/{ride_id}/arrive")
async def arrive_ride(ride_id: str, user: dict = Depends(require_role("driver"))):
    ride = await db.rides.find_one({"id": ride_id, "driver_id": user["id"]})
    if not ride:
        raise HTTPException(404, "Ride not found")
    assert_transition(ride["status"], "arrived")

    now = iso_now()
    grace_ends_at = (now_utc() + timedelta(minutes=2)).isoformat()

    res = await db.rides.update_one(
        {"id": ride_id, "driver_id": user["id"], "status": "accepted"},
        {
            "$set": {
                "status": "arrived",
                "arrived_at": now,
                "grace_period_ends_at": grace_ends_at,
                "waiting_fee": 0.0,
                "updated_at": now,
            }
        },
    )
    if res.modified_count == 0:
        raise HTTPException(400, "Cannot mark arrived")

    # Send High-Priority Push Notification to Passenger
    passenger_id = ride.get("passenger_id")
    if passenger_id:
        passenger_user = await db.users.find_one({"id": passenger_id})
        push_token = passenger_user.get("push_token") if passenger_user else None
        if push_token:
            driver_name = user.get("name", "Your driver")
            vehicle_color = user.get("vehicle_color") or ride.get("vehicle_color") or ""
            vehicle_make = user.get("vehicle_make") or ride.get("vehicle_make") or "vehicle"
            vehicle_plate = user.get("vehicle_plate") or ride.get("vehicle_plate") or ""
            car_desc = f"{vehicle_color} {vehicle_make} ({vehicle_plate})".strip()
            title = "Your driver has arrived! 🚗"
            body = f"{driver_name} is waiting outside in a {car_desc}. Please meet your driver."
            asyncio.create_task(
                send_push_notification(
                    push_token,
                    title,
                    body,
                    data={"ride_id": ride_id, "type": "driver_arrived", "grace_period_ends_at": grace_ends_at},
                )
            )

    await hub.publish_ride(
        ride_id,
        {
            "event": "ride.arrived",
            "ride_id": ride_id,
            "arrived_at": now,
            "grace_period_ends_at": grace_ends_at,
        },
    )
    await hub.publish_dispatch({"event": "ride.updated", "ride_id": ride_id, "status": "arrived"})
    return {"ok": True, "arrived_at": now, "grace_period_ends_at": grace_ends_at}


@router.post("/rides/{ride_id}/start")
async def start_ride(ride_id: str, user: dict = Depends(require_role("driver"))):
    ride = await db.rides.find_one({"id": ride_id, "driver_id": user["id"]})
    if not ride:
        raise HTTPException(404, "Ride not found")
    assert_transition(ride["status"], "in_progress")

    # Uber UK Waiting Time Calculation:
    # 2-minute complimentary grace period. Thereafter: £0.25 per minute.
    now = iso_now()
    arrived_at_str = ride.get("arrived_at")
    waiting_seconds = 0
    waiting_fee = 0.0

    if arrived_at_str:
        try:
            arrived_dt = datetime.fromisoformat(arrived_at_str.replace("Z", "+00:00"))
            if arrived_dt.tzinfo is None:
                arrived_dt = arrived_dt.replace(tzinfo=timezone.utc)
            elapsed = max(0.0, (now_utc() - arrived_dt).total_seconds())
            waiting_seconds = int(elapsed)
            # If waiting exceeded 2-minute grace period (120 seconds)
            if elapsed > 120.0:
                chargeable_sec = elapsed - 120.0
                chargeable_mins = math.ceil(chargeable_sec / 60.0)
                waiting_fee = round(chargeable_mins * 0.25, 2)
        except Exception:
            pass

    current_fare = float(ride.get("fare", 0.0))
    final_fare = round(current_fare + waiting_fee, 2)
    driver_earnings = round(final_fare * 0.80, 2)

    res = await db.rides.update_one(
        {"id": ride_id, "driver_id": user["id"], "status": "arrived"},
        {
            "$set": {
                "status": "in_progress",
                "started_at": now,
                "waiting_seconds": waiting_seconds,
                "waiting_fee": waiting_fee,
                "fare": final_fare,
                "driver_earnings": driver_earnings,
                "updated_at": now,
            }
        },
    )
    if res.modified_count == 0:
        raise HTTPException(400, "Cannot start ride")

    await hub.publish_ride(
        ride_id,
        {
            "event": "ride.started",
            "ride_id": ride_id,
            "fare": final_fare,
            "waiting_fee": waiting_fee,
        },
    )
    await hub.publish_dispatch({"event": "ride.updated", "ride_id": ride_id, "status": "in_progress"})
    return {"ok": True, "fare": final_fare, "waiting_fee": waiting_fee}


@router.post("/rides/{ride_id}/no-show")
async def no_show_ride(ride_id: str, user: dict = Depends(require_role("driver"))):
    """
    Uber UK Standard: Driver can cancel for Passenger No-Show after waiting 5 minutes total
    (2-minute grace + 3-minute paid waiting). A standard £5.00 cancellation fee is applied.
    """
    ride = await db.rides.find_one({"id": ride_id, "driver_id": user["id"]})
    if not ride:
        raise HTTPException(404, "Ride not found")
    if ride["status"] != "arrived":
        raise HTTPException(400, "Can only declare no-show after arriving at pickup")

    arrived_at_str = ride.get("arrived_at")
    if arrived_at_str:
        try:
            arrived_dt = datetime.fromisoformat(arrived_at_str.replace("Z", "+00:00"))
            if arrived_dt.tzinfo is None:
                arrived_dt = arrived_dt.replace(tzinfo=timezone.utc)
            elapsed = (now_utc() - arrived_dt).total_seconds()
            # In production, require at least 300 seconds (5 minutes)
            if settings.env == "production" and elapsed < 300:
                remaining_sec = int(300 - elapsed)
                raise HTTPException(
                    400,
                    f"Must wait at least 5 minutes before declaring passenger no-show. {remaining_sec}s remaining.",
                )
        except HTTPException:
            raise
        except Exception:
            pass

    now = iso_now()
    cancellation_fee = 5.00
    driver_share = 4.00  # 80% credited to driver for lost time and fuel

    res = await db.rides.update_one(
        {"id": ride_id, "driver_id": user["id"], "status": "arrived"},
        {
            "$set": {
                "status": "cancelled",
                "cancelled_by": "driver",
                "cancelled_reason": "Passenger No-Show",
                "cancellation_fee": cancellation_fee,
                "driver_earnings": driver_share,
                "updated_at": now,
            }
        },
    )
    if res.modified_count == 0:
        raise HTTPException(400, "Ride state has already changed")

    # Credit driver wallet
    await db.driver_wallets.update_one(
        {"driver_id": user["id"]},
        {"$inc": {"balance": driver_share, "total_earned": driver_share}, "$set": {"updated_at": now}},
        upsert=True,
    )

    # Notify passenger via WebSocket and push
    await hub.publish_ride(
        ride_id,
        {
            "event": "ride.cancelled",
            "ride_id": ride_id,
            "reason": "Passenger No-Show",
            "fee": cancellation_fee,
        },
    )
    await hub.publish_dispatch({"event": "ride.updated", "ride_id": ride_id, "status": "cancelled"})

    # Send Push Notification to passenger
    passenger_id = ride.get("passenger_id")
    if passenger_id:
        p_user = await db.users.find_one({"id": passenger_id})
        p_token = p_user.get("push_token") if p_user else None
        if p_token:
            asyncio.create_task(
                send_push_notification(
                    p_token,
                    "Ride Cancelled: Passenger No-Show",
                    "Your driver waited outside over 5 minutes. A £5.00 cancellation fee has been applied.",
                    data={"ride_id": ride_id, "type": "ride_cancelled", "reason": "no_show"},
                )
            )

    return {"ok": True, "cancellation_fee": cancellation_fee, "driver_share": driver_share}


@router.post("/rides/{ride_id}/complete")
async def complete_ride(ride_id: str, user: dict = Depends(require_role("driver"))):
    ride = await db.rides.find_one({"id": ride_id, "driver_id": user["id"]})
    if not ride:
        raise HTTPException(404, "Ride not found")
    assert_transition(ride["status"], "completed")

    fare = float(ride.get("fare", 0.0))
    driver_earnings = ride.get("driver_earnings")
    if driver_earnings is None:
        driver_earnings = round(fare * 0.80, 2)

    payment_method = ride.get("payment_method", "card")
    platform_fee = round(fare - driver_earnings, 2)
    now = iso_now()

    res = await db.rides.update_one(
        {"id": ride_id, "driver_id": user["id"], "status": "in_progress"},
        {
            "$set": {
                "status": "completed",
                "fare": fare,
                "driver_earnings": driver_earnings,
                "platform_fee": platform_fee,
                "cash_collected": True if payment_method == "cash" else False,
                "completed_at": now,
                "updated_at": now,
            }
        },
    )
    if res.modified_count == 0:
        raise HTTPException(400, "Cannot complete ride")

    # Update driver wallet balance:
    # If cash: Driver already collected the full physical cash, so debit the platform's 20% commission.
    # If card: Driver receives 80% earnings credit.
    if payment_method == "cash":
        await db.driver_wallets.update_one(
            {"driver_id": user["id"]},
            {"$inc": {"balance": -platform_fee, "total_earned": driver_earnings}, "$set": {"updated_at": now}},
            upsert=True,
        )
    else:
        await db.driver_wallets.update_one(
            {"driver_id": user["id"]},
            {"$inc": {"balance": driver_earnings, "total_earned": driver_earnings}, "$set": {"updated_at": now}},
            upsert=True,
        )

    ride = await db.rides.find_one({"id": ride_id})
    safe = clean_doc(ride)
    await hub.publish_ride(ride_id, {"event": "ride.completed", "ride": safe})
    await hub.publish_dispatch({"event": "ride.updated", "ride": safe})
    return safe


@router.post("/driver/location")
async def update_driver_location(body: LocationIn, user: dict = Depends(require_role("driver"))):
    prev = await db.driver_status.find_one({"driver_id": user["id"]})
    prev_lat = prev.get("lat") if prev else None
    prev_lng = prev.get("lng") if prev else None

    smooth_lat, smooth_lng = smooth_coordinates(prev_lat, prev_lng, body.lat, body.lng)
    bearing = body.bearing
    if bearing is None and prev_lat is not None and prev_lng is not None:
        bearing = calculate_bearing(prev_lat, prev_lng, smooth_lat, smooth_lng)

    await db.driver_status.update_one(
        {"driver_id": user["id"]},
        {
            "$set": {
                "lat": smooth_lat,
                "lng": smooth_lng,
                "bearing": bearing or 0.0,
                "updated_at": iso_now(),
            }
        },
        upsert=True,
    )
    await db.rides.update_one(
        {"driver_id": user["id"], "status": {"$in": ["accepted", "arrived", "in_progress"]}},
        {
            "$set": {
                "driver_lat": smooth_lat,
                "driver_lng": smooth_lng,
                "driver_bearing": bearing or 0.0,
                "updated_at": iso_now(),
            }
        },
    )

    active = await db.rides.find_one(
        {"driver_id": user["id"], "status": {"$in": ["accepted", "arrived", "in_progress"]}}
    )
    if active:
        await hub.publish_ride(
            active["id"],
            {"event": "driver.location", "lat": smooth_lat, "lng": smooth_lng, "bearing": bearing or 0.0},
        )
        await hub.publish_dispatch(
            {
                "event": "driver.location",
                "ride_id": active["id"],
                "lat": smooth_lat,
                "lng": smooth_lng,
                "bearing": bearing or 0.0,
            }
        )
    return {"ok": True, "lat": smooth_lat, "lng": smooth_lng, "bearing": bearing or 0.0}


@router.get("/driver/earnings")
async def driver_earnings(user: dict = Depends(require_role("driver"))):
    cursor = db.rides.find({"driver_id": user["id"], "status": "completed"}).sort("completed_at", -1)
    total_fare = 0.0
    total_tips = 0.0
    total_net = 0.0
    today_net = 0.0
    week_net = 0.0
    count = 0
    today_count = 0
    today_str = now_utc().strftime("%Y-%m-%d")
    week_ago = now_utc() - timedelta(days=7)

    async for r in cursor:
        fare = float(r.get("fare", 0) or 0)
        tips = float(r.get("tip_amount", 0) or 0)
        driver_earnings_val = float(r.get("driver_earnings", fare * 0.8) or 0) + tips

        total_fare += fare
        total_tips += tips
        total_net += driver_earnings_val
        count += 1

        completed_at = r.get("completed_at", "")
        if completed_at.startswith(today_str):
            today_net += driver_earnings_val
            today_count += 1
        if completed_at:
            dt = datetime.fromisoformat(completed_at)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            if dt >= week_ago:
                week_net += driver_earnings_val

    wallet = await db.driver_wallets.find_one({"driver_id": user["id"]})
    available_balance = wallet.get("balance", total_net) if wallet else total_net

    return {
        "total": round(total_net, 2),
        "total_gross_fares": round(total_fare, 2),
        "total_tips": round(total_tips, 2),
        "today": round(today_net, 2),
        "week": round(week_net, 2),
        "available_balance": round(available_balance, 2),
        "total_trips": count,
        "today_trips": today_count,
    }


@router.post("/driver/payout")
async def driver_instant_payout(body: DriverPayoutIn, user: dict = Depends(require_role("driver"))):
    wallet = await db.driver_wallets.find_one({"driver_id": user["id"]})
    current_balance = wallet.get("balance", 0.0) if wallet else 0.0

    amount = body.amount if body.amount is not None else current_balance
    if amount <= 0:
        raise HTTPException(400, "No funds available for payout")
    if amount > current_balance:
        raise HTTPException(400, f"Requested amount ${amount:.2f} exceeds balance ${current_balance:.2f}")

    payout_record = {
        "id": str(uuid.uuid4()),
        "driver_id": user["id"],
        "amount": amount,
        "fee": 0.50,  # $0.50 instant transfer fee
        "net_payout": round(amount - 0.50, 2),
        "status": "paid",
        "destination": "Connected Bank Account / Debit Card (Stripe Instant Payout)",
        "created_at": iso_now(),
    }
    await db.driver_payouts.insert_one(payout_record.copy())
    await db.driver_wallets.update_one(
        {"driver_id": user["id"]},
        {"$inc": {"balance": -amount}, "$set": {"updated_at": iso_now()}},
        upsert=True,
    )

    return {
        "ok": True,
        "payout": clean_doc(payout_record),
        "remaining_balance": round(current_balance - amount, 2),
        "message": f"Successfully initiated instant payout of ${amount:.2f}",
    }


@router.post("/driver/mode")
async def toggle_driver_mode(body: DriverModeToggleIn, user: dict = Depends(require_role("driver"))):
    """
    Switch between 'roaming' (Uber/Bykea style freelance doorstep hailing)
    and 'adda' (Pari turn-based stand loading with 0% Watan commission).
    """
    mode = body.mode
    adda_id = body.adda_id if mode == "adda" else None

    update_fields = {
        "active_mode": mode,
        "current_adda_id": adda_id,
        "geofence_status": "inside_adda" if mode == "adda" else "outside",
        "updated_at": iso_now(),
    }
    await db.users.update_one({"id": user["id"]}, {"$set": update_fields})
    await db.driver_status.update_one({"driver_id": user["id"]}, {"$set": update_fields})

    await hub.publish_driver(user["id"], {"event": "driver.mode_changed", "mode": mode, "adda_id": adda_id})

    return {
        "ok": True,
        "active_mode": mode,
        "current_adda_id": adda_id,
        "message": f"Switched to {'Adda Pari Mode (0% Platform Fee)' if mode == 'adda' else 'Independent Roaming Mode'}",
    }


@router.get("/driver/adda-status")
async def get_driver_adda_status(user: dict = Depends(require_role("driver"))):
    """
    Returns the driver's current Pari queue position, bay assignment, and passenger manifest
    when operating in Adda Mode.
    """
    driver = await db.users.find_one({"id": user["id"]})
    active_mode = driver.get("active_mode", "roaming") if driver else "roaming"

    if active_mode != "adda":
        return {
            "active_mode": "roaming",
            "in_adda": False,
            "message": "Driver is currently in Independent Roaming Mode",
        }

    adda_id = driver.get("current_adda_id")
    pari_entry = await db.pari_queues.find_one(
        {"driver_id": user["id"], "status": {"$in": ["waiting_in_bay", "loading", "ready_to_depart"]}}
    )

    manifest = []
    if pari_entry:
        async for booking in db.seat_bookings.find({"pari_id": pari_entry["id"]}):
            manifest.append(clean_doc(booking))

    adda_info = None
    if adda_id:
        adda_info = await db.addas.find_one({"id": adda_id})

    return {
        "active_mode": "adda",
        "in_adda": True,
        "adda": clean_doc(adda_info) if adda_info else None,
        "pari": clean_doc(pari_entry) if pari_entry else None,
        "passenger_manifest": manifest,
        "commission_rate": "0% (Adda Fleet Member - Keep 100% of Fares)",
    }

