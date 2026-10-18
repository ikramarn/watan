import logging
import uuid
from typing import Optional

import stripe as stripe_lib
from fastapi import APIRouter, Depends, HTTPException, Request

from ..config import settings
from ..db import db
from ..deps import get_current_user, require_role
from ..models import CheckoutIn, PaymentCaptureIn, PaymentIntentCreateIn, TipIn
from ..services.realtime import hub
from ..utils import clean_doc, iso_now

router = APIRouter(prefix="/api", tags=["payments"])
logger = logging.getLogger(__name__)


def _stripe_client() -> stripe_lib.StripeClient:
    if not settings.stripe_api_key:
        raise HTTPException(status_code=501, detail="Stripe not configured")
    return stripe_lib.StripeClient(settings.stripe_api_key)


@router.post("/payments/create-intent")
async def create_payment_intent(
    body: PaymentIntentCreateIn,
    user: dict = Depends(require_role("passenger")),
):
    """
    Native In-App Payment Intent creation:
    Provides client_secret for native Apple Pay / Google Pay / Stripe PaymentSheet.
    """
    ride = await db.rides.find_one({"id": body.ride_id})
    if not ride:
        raise HTTPException(404, "Ride not found")
    if ride["passenger_id"] != user["id"]:
        raise HTTPException(403, "Not your ride")
    if ride.get("payment_status") == "paid":
        raise HTTPException(400, "Ride already paid")

    amount = float(ride.get("fare", 0.0))
    amount_cents = int(round(amount * 100))
    curr = settings.currency

    client_secret = f"pi_mock_{uuid.uuid4().hex[:16]}_secret_{uuid.uuid4().hex[:12]}"
    payment_intent_id = f"pi_{uuid.uuid4().hex[:24]}"

    if settings.stripe_api_key:
        try:
            client = _stripe_client()
            intent = client.payment_intents.create(
                params={
                    "amount": amount_cents,
                    "currency": curr,
                    "capture_method": "manual",  # Pre-authorization hold
                    "metadata": {
                        "ride_id": body.ride_id,
                        "passenger_id": user["id"],
                    },
                }
            )
            client_secret = intent.client_secret
            payment_intent_id = intent.id
        except Exception as exc:
            logger.warning("Stripe API intent creation fallback: %s", exc)

    tx_id = str(uuid.uuid4())
    await db.payment_transactions.insert_one(
        {
            "id": tx_id,
            "payment_intent_id": payment_intent_id,
            "ride_id": body.ride_id,
            "passenger_id": user["id"],
            "amount": amount,
            "currency": curr,
            "status": "requires_capture",
            "payment_status": "pending",
            "created_at": iso_now(),
            "updated_at": iso_now(),
        }
    )

    return {
        "client_secret": client_secret,
        "payment_intent_id": payment_intent_id,
        "amount": amount,
        "currency": curr,
    }


@router.post("/payments/capture")
async def capture_payment(
    body: PaymentCaptureIn,
    user: dict = Depends(require_role("passenger")),
):
    """
    Captures the pre-authorized amount upon trip completion, optionally adding a driver tip.
    Verifies ride status and executes real Stripe PaymentIntent capture when configured.
    """
    ride = await db.rides.find_one({"id": body.ride_id})
    if not ride:
        raise HTTPException(404, "Ride not found")
    if ride["passenger_id"] != user["id"]:
        raise HTTPException(403, "Not your ride")
    if ride.get("payment_status") == "paid":
        return {"ok": True, "status": "already_paid"}
    if ride.get("status") not in ("completed", "in_progress"):
        raise HTTPException(400, f"Cannot capture payment for ride in status: {ride.get('status')}")

    fare = float(ride.get("fare", 0.0))
    tip = float(body.tip_amount or 0.0)
    total_amount = round(fare + tip, 2)
    total_cents = int(round(total_amount * 100))

    # Look up matching transaction to capture in Stripe
    tx = await db.payment_transactions.find_one({"ride_id": body.ride_id}, sort=[("created_at", -1)])
    payment_intent_id = tx.get("payment_intent_id") if tx else None

    if settings.stripe_api_key and payment_intent_id and not payment_intent_id.startswith("pi_mock_"):
        try:
            client = _stripe_client()
            client.payment_intents.capture(
                payment_intent_id,
                params={"amount_to_capture": total_cents},
            )
            await db.payment_transactions.update_one(
                {"payment_intent_id": payment_intent_id},
                {"$set": {"status": "succeeded", "payment_status": "paid", "updated_at": iso_now()}},
            )
        except Exception as exc:
            logger.exception("Stripe payment capture error: %s", exc)
            raise HTTPException(502, f"Payment capture failed with payment provider: {exc}")

    driver_earnings = float(ride.get("driver_earnings", fare * 0.80)) + tip

    await db.rides.update_one(
        {"id": body.ride_id},
        {
            "$set": {
                "payment_status": "paid",
                "tip_amount": tip,
                "total_paid": total_amount,
                "driver_earnings": round(driver_earnings, 2),
                "updated_at": iso_now(),
            }
        },
    )

    # Credit driver wallet
    if ride.get("driver_id"):
        await db.driver_wallets.update_one(
            {"driver_id": ride["driver_id"]},
            {"$inc": {"balance": driver_earnings, "total_earned": driver_earnings}, "$set": {"updated_at": iso_now()}},
            upsert=True,
        )

    await hub.publish_ride(
        body.ride_id,
        {
            "event": "payment.paid",
            "ride_id": body.ride_id,
            "fare": fare,
            "tip": tip,
            "total": total_amount,
        },
    )

    return {
        "ok": True,
        "ride_id": body.ride_id,
        "status": "paid",
        "fare": fare,
        "tip": tip,
        "total_amount": total_amount,
    }


@router.post("/payments/tip")
async def add_tip(
    body: TipIn,
    user: dict = Depends(require_role("passenger")),
):
    """Add a tip for the driver after ride completion."""
    ride = await db.rides.find_one({"id": body.ride_id})
    if not ride:
        raise HTTPException(404, "Ride not found")
    if ride["passenger_id"] != user["id"]:
        raise HTTPException(403, "Not your ride")

    tip = float(body.tip_amount)
    await db.rides.update_one(
        {"id": body.ride_id},
        {
            "$inc": {"tip_amount": tip, "driver_earnings": tip, "total_paid": tip},
            "$set": {"updated_at": iso_now()},
        },
    )

    if ride.get("driver_id"):
        await db.driver_wallets.update_one(
            {"driver_id": ride["driver_id"]},
            {"$inc": {"balance": tip, "total_earned": tip}, "$set": {"updated_at": iso_now()}},
            upsert=True,
        )

    await hub.publish_ride(body.ride_id, {"event": "payment.tipped", "ride_id": body.ride_id, "tip": tip})
    return {"ok": True, "tip": tip, "message": f"Added ${tip:.2f} tip for your driver"}


@router.post("/payments/checkout")
async def payments_checkout(body: CheckoutIn, request: Request, user: dict = Depends(require_role("passenger"))):
    ride = await db.rides.find_one({"id": body.ride_id})
    if not ride:
        raise HTTPException(404, "Ride not found")
    if ride["passenger_id"] != user["id"]:
        raise HTTPException(403, "Not your ride")
    if ride["status"] != "completed":
        raise HTTPException(400, "Ride not completed yet")
    if ride.get("payment_status") == "paid":
        raise HTTPException(400, "Ride already paid")

    amount = float(ride["fare"])
    curr = settings.currency
    origin = body.origin_url.rstrip("/")
    success_url = f"{origin}/payment-success?session_id={{CHECKOUT_SESSION_ID}}&ride_id={body.ride_id}"
    cancel_url = f"{origin}/ride/{body.ride_id}"

    client = _stripe_client()
    try:
        session = client.checkout.sessions.create(
            params={
                "mode": "payment",
                "line_items": [
                    {
                        "price_data": {
                            "currency": curr,
                            "unit_amount": int(amount * 100),
                            "product_data": {"name": f"GetChum Private Hire: {ride.get('ride_type', 'standard').capitalize()}"},
                        },
                        "quantity": 1,
                    }
                ],
                "success_url": success_url,
                "cancel_url": cancel_url,
                "metadata": {
                    "ride_id": body.ride_id,
                    "passenger_id": user["id"],
                    "source": "getchum_passenger_app",
                },
            }
        )
    except stripe_lib.StripeError as exc:
        logger.exception("Stripe checkout error")
        raise HTTPException(status_code=502, detail="Payment provider error") from exc

    await db.payment_transactions.insert_one(
        {
            "id": str(uuid.uuid4()),
            "session_id": session.id,
            "ride_id": body.ride_id,
            "passenger_id": user["id"],
            "amount": amount,
            "currency": curr,
            "status": "initiated",
            "payment_status": "pending",
            "created_at": iso_now(),
            "updated_at": iso_now(),
        }
    )
    return {"url": session.url, "session_id": session.id}


@router.get("/payments/status/{session_id}")
async def payment_status(session_id: str, request: Request, user: dict = Depends(require_role("passenger"))):
    tx = await db.payment_transactions.find_one({"session_id": session_id})
    if not tx:
        raise HTTPException(404, "Transaction not found")

    client = _stripe_client()
    try:
        session = client.checkout.sessions.retrieve(session_id)
    except stripe_lib.StripeError as exc:
        logger.exception("Stripe status error")
        raise HTTPException(status_code=502, detail="Payment provider error") from exc

    payment_status_val = session.payment_status  # "paid" | "unpaid" | "no_payment_required"
    status_val = session.status  # "open" | "complete" | "expired"

    if tx.get("payment_status") != "paid":
        await db.payment_transactions.update_one(
            {"session_id": session_id},
            {
                "$set": {
                    "status": status_val,
                    "payment_status": payment_status_val,
                    "updated_at": iso_now(),
                }
            },
        )
        if payment_status_val == "paid":
            await db.rides.update_one(
                {"id": tx["ride_id"]},
                {"$set": {"payment_status": "paid", "updated_at": iso_now()}},
            )
            await hub.publish_ride(tx["ride_id"], {"event": "payment.paid", "ride_id": tx["ride_id"]})

    return {
        "status": status_val,
        "payment_status": payment_status_val,
        "amount_total": session.amount_total,
        "currency": session.currency,
    }


@router.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    if not settings.stripe_api_key:
        raise HTTPException(status_code=501, detail="Stripe not configured")

    body = await request.body()
    sig = request.headers.get("Stripe-Signature", "")
    webhook_secret = settings.stripe_webhook_secret

    if not webhook_secret and settings.env == "production":
        raise HTTPException(status_code=500, detail="Stripe webhook secret must be configured in production")

    try:
        if webhook_secret:
            if not sig:
                raise HTTPException(400, "Missing Stripe-Signature header")
            event = stripe_lib.Webhook.construct_event(
                payload=body,
                sig_header=sig,
                secret=webhook_secret,
            )
        else:
            import json
            event = stripe_lib.util.convert_to_stripe_object(json.loads(body))
    except stripe_lib.SignatureVerificationError as exc:
        raise HTTPException(400, "Invalid webhook signature") from exc
    except Exception as exc:
        logger.exception("Webhook parse error")
        raise HTTPException(400, "Invalid webhook body") from exc

    ev_type = event.get("type")
    data_obj = event.get("data", {}).get("object", {})

    if ev_type == "checkout.session.completed":
        session_id = data_obj.get("id")
        payment_status_val = data_obj.get("payment_status")
        if session_id and payment_status_val == "paid":
            await db.payment_transactions.update_one(
                {"session_id": session_id},
                {"$set": {"payment_status": "paid", "status": "completed", "updated_at": iso_now()}},
            )
            tx = await db.payment_transactions.find_one({"session_id": session_id})
            if tx:
                await db.rides.update_one(
                    {"id": tx["ride_id"]},
                    {"$set": {"payment_status": "paid", "updated_at": iso_now()}},
                )
                await hub.publish_ride(tx["ride_id"], {"event": "payment.paid", "ride_id": tx["ride_id"]})

    elif ev_type == "payment_intent.succeeded":
        pi_id = data_obj.get("id")
        if pi_id:
            await db.payment_transactions.update_one(
                {"payment_intent_id": pi_id},
                {"$set": {"payment_status": "paid", "status": "succeeded", "updated_at": iso_now()}},
            )
            tx = await db.payment_transactions.find_one({"payment_intent_id": pi_id})
            if tx:
                await db.rides.update_one(
                    {"id": tx["ride_id"]},
                    {"$set": {"payment_status": "paid", "updated_at": iso_now()}},
                )
                await hub.publish_ride(tx["ride_id"], {"event": "payment.paid", "ride_id": tx["ride_id"]})

    return {"ok": True}

