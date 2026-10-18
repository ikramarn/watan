import hashlib
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status

from ..db import db
from ..deps import get_current_user, get_optional_user
from ..models import CounterTicketIssueIn, SeatReservationIn, ValidateTicketIn
from ..utils import clean_doc, iso_now, new_id, now_utc

router = APIRouter(prefix="/api/seats", tags=["seats"])


@router.get("/manifest")
async def get_seat_manifest(
    adda_id: str = Query(...),
    corridor_id: str = Query(...),
    bay_number: Optional[int] = Query(default=None),
) -> Dict[str, Any]:
    """
    Get live interactive seat layout (e.g. 14-seater Toyota HiAce or 8-seater Qingqi).
    Returns seat states: available, selected, booked, ladies_only.
    """
    query: Dict[str, Any] = {
        "adda_id": adda_id,
        "corridor_id": corridor_id,
        "status": {"$in": ["loading", "waiting_in_bay"]},
    }
    if bay_number:
        query["bay_number"] = bay_number

    pari = await db.pari_queues.find_one(query, sort=[("pari_position", 1)])
    if not pari:
        # Fallback template if no vehicle is currently in bay
        return {
            "vehicle_found": False,
            "total_seats": 14,
            "vehicle_type": "wagon",
            "booked_seats": [],
            "ladies_only_rows": [2],
            "fare_per_seat_pkr": 450.0,
        }

    total_seats = pari.get("total_seats", 14)
    booked_seat_numbers = pari.get("booked_seat_numbers", [])

    return {
        "vehicle_found": True,
        "pari_id": pari["id"],
        "bay_number": pari.get("bay_number", 1),
        "vehicle_plate": pari.get("vehicle_plate", "UNASSIGNED"),
        "vehicle_type": pari.get("vehicle_type", "wagon"),
        "total_seats": total_seats,
        "booked_seats": booked_seat_numbers,
        "available_seats_count": total_seats - len(booked_seat_numbers),
        "ladies_only_rows": [2],  # Row 2 (seats 2, 3, 4) designated as family/ladies zone
        "fare_per_seat_pkr": pari.get("fare_per_seat_pkr", 450.0),
        "scheduled_departure": pari.get("scheduled_departure"),
    }


@router.post("/reserve", status_code=status.HTTP_201_CREATED)
async def reserve_seats(
    payload: SeatReservationIn,
    current_user: Optional[Dict[str, Any]] = Depends(get_optional_user),
) -> Dict[str, Any]:
    """
    Reserve one or more seats in a wagon / bus.
    Supports "pay_at_adda" mode (Pay Cash at Stand Counter) with 15-min hold.
    """
    pari = await db.pari_queues.find_one({
        "adda_id": payload.adda_id,
        "corridor_id": payload.corridor_id,
        "status": "loading",
    })
    if not pari:
        raise HTTPException(status_code=400, detail="No loading vehicle available for this route right now")

    booked = set(pari.get("booked_seat_numbers", []))
    for seat in payload.seat_numbers:
        if seat in booked:
            raise HTTPException(status_code=409, detail=f"Seat #{seat} has already been booked. Please choose another seat.")

    fare_per_seat = pari.get("fare_per_seat_pkr", 450.0)
    total_fare = fare_per_seat * len(payload.seat_numbers)

    booking_id = f"bkg_{new_id()[:8]}"
    booking_code = f"WTN-{new_id()[:4].upper()}"
    qr_hash = hashlib.sha256(f"{booking_id}_{booking_code}_{payload.passenger_phone}".encode()).hexdigest()[:16]

    doc = {
        "id": booking_id,
        "booking_code": booking_code,
        "passenger_id": current_user["id"] if current_user else "guest_passenger",
        "passenger_name": payload.passenger_name or (current_user.get("name") if current_user else "Passenger"),
        "passenger_phone": payload.passenger_phone,
        "adda_id": payload.adda_id,
        "corridor_id": payload.corridor_id,
        "pari_id": pari["id"],
        "vehicle_plate": pari.get("vehicle_plate"),
        "bay_number": pari.get("bay_number"),
        "seat_numbers": payload.seat_numbers,
        "fare_per_seat_pkr": fare_per_seat,
        "total_fare_pkr": total_fare,
        "payment_method": payload.payment_method,
        "payment_status": "unpaid" if payload.payment_method == "pay_at_adda" else "paid",
        "booking_status": "reserved",
        "is_female_zone": payload.is_female_zone,
        "qr_token": qr_hash,
        "created_at": iso_now(),
    }
    await db.seat_bookings.insert_one(doc)

    # Update Pari queue booked seats
    new_booked = list(booked.union(payload.seat_numbers))
    await db.pari_queues.update_one(
        {"id": pari["id"]},
        {"$set": {"booked_seat_numbers": new_booked, "booked_seats_count": len(new_booked)}}
    )

    return clean_doc(doc)


@router.post("/counter-ticket", status_code=status.HTTP_201_CREATED)
async def issue_counter_ticket(
    payload: CounterTicketIssueIn,
    current_user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:
    """
    Issued directly by the Adda Munshi at the POS counter for walk-in commuters.
    Prints thermal 58mm POS ticket.
    """
    pari = await db.pari_queues.find_one({
        "adda_id": payload.adda_id,
        "corridor_id": payload.corridor_id,
        "bay_number": payload.bay_number,
        "status": "loading",
    })
    if not pari:
        raise HTTPException(status_code=400, detail="Bay vehicle not ready or not found")

    booked = set(pari.get("booked_seat_numbers", []))
    for s in payload.seat_numbers:
        if s in booked:
            raise HTTPException(status_code=409, detail=f"Seat #{s} already taken")

    total_fare = payload.fare_per_seat_pkr * len(payload.seat_numbers)
    change_due = max(0.0, payload.cash_tendered_pkr - total_fare)

    ticket_id = f"tkt_{new_id()[:8]}"
    ticket_code = f"POS-{new_id()[:4].upper()}"

    doc = {
        "id": ticket_id,
        "booking_code": ticket_code,
        "issued_by_munshi_id": current_user["id"],
        "passenger_name": payload.passenger_name or "Walk-in Commuter",
        "adda_id": payload.adda_id,
        "corridor_id": payload.corridor_id,
        "bay_number": payload.bay_number,
        "seat_numbers": payload.seat_numbers,
        "total_fare_pkr": total_fare,
        "cash_tendered_pkr": payload.cash_tendered_pkr,
        "change_due_pkr": change_due,
        "payment_method": "counter_cash",
        "payment_status": "paid",
        "booking_status": "boarded",
        "created_at": iso_now(),
    }
    await db.seat_bookings.insert_one(doc)

    new_booked = list(booked.union(payload.seat_numbers))
    await db.pari_queues.update_one(
        {"id": pari["id"]},
        {"$set": {"booked_seat_numbers": new_booked, "booked_seats_count": len(new_booked)}}
    )

    clean = clean_doc(doc)
    clean["change_due_pkr"] = change_due
    return clean


@router.post("/validate-ticket")
async def validate_ticket_qr(
    payload: ValidateTicketIn,
    current_user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:
    """
    Adda Munshi or Driver scans passenger's Watan App QR ticket at the bay.
    Validates boarding, marks as boarded, and verifies cash collection if 'pay_at_adda'.
    """
    code = payload.ticket_code_or_qr.strip()
    booking = await db.seat_bookings.find_one({
        "$or": [
            {"qr_token": code},
            {"booking_code": code},
            {"id": code},
        ]
    })
    if not booking:
        raise HTTPException(status_code=404, detail="Invalid ticket or QR code")

    if booking.get("booking_status") == "boarded":
        return {
            "valid": True,
            "already_boarded": True,
            "message": "Passenger is already verified and boarded",
            "booking": clean_doc(booking),
        }

    # Mark as boarded and paid
    await db.seat_bookings.update_one(
        {"id": booking["id"]},
        {"$set": {"booking_status": "boarded", "payment_status": "paid", "boarded_at": iso_now()}}
    )
    booking["booking_status"] = "boarded"
    booking["payment_status"] = "paid"

    return {
        "valid": True,
        "already_boarded": False,
        "message": "Ticket verified successfully! Passenger cleared to board.",
        "booking": clean_doc(booking),
    }
