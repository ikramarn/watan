import uuid

from fastapi import APIRouter, Depends, HTTPException

from ..db import db
from ..deps import get_current_user
from ..models import ChatIn
from ..services.realtime import hub
from ..utils import clean_doc, iso_now

router = APIRouter(prefix="/api/rides", tags=["chat"])


@router.get("/{ride_id}/messages")
async def get_messages(ride_id: str, user: dict = Depends(get_current_user)):
    ride = await db.rides.find_one({"id": ride_id})
    if not ride:
        raise HTTPException(404, "Ride not found")
    if user["id"] not in (ride.get("passenger_id"), ride.get("driver_id")):
        raise HTTPException(403, "Not part of this ride")

    cursor = db.chat_messages.find({"ride_id": ride_id}).sort("timestamp", 1)
    return [clean_doc(m) async for m in cursor]


@router.post("/{ride_id}/messages")
async def post_message(ride_id: str, body: ChatIn, user: dict = Depends(get_current_user)):
    ride = await db.rides.find_one({"id": ride_id})
    if not ride:
        raise HTTPException(404, "Ride not found")
    if user["id"] not in (ride.get("passenger_id"), ride.get("driver_id")):
        raise HTTPException(403, "Not part of this ride")

    msg = {
        "id": str(uuid.uuid4()),
        "ride_id": ride_id,
        "sender_id": user["id"],
        "sender_name": user["name"],
        "sender_role": user["role"],
        "text": body.text,
        "timestamp": iso_now(),
    }
    await db.chat_messages.insert_one(msg.copy())
    safe = clean_doc(msg)
    await hub.publish_ride(ride_id, {"event": "chat.message", "message": safe})
    return safe
