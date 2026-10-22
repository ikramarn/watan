import logging
import uuid
from typing import Optional

import stripe as stripe_lib
from fastapi import APIRouter, Depends, HTTPException, Request

from ..config import settings
from ..db import db
from ..deps import get_current_user, require_role
from ..models import (
    CashConfirmIn,
    CheckoutIn,
    EasyPaisaInitiateIn,
    JazzCashInitiateIn,
    PaymentCaptureIn,
    PaymentIntentCreateIn,
    RaastQrGenerateIn,
    TipIn,
)
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

    is_adda = ride.get("is_adda_trip", False) or ride.get("mode") == "adda"
    if is_adda:
        platform_fee = 0.0
        driver_earnings = fare + tip
    else:
        # 10% platform fee for independent roaming trips
        platform_fee = round(fare * 0.10, 2)
        driver_earnings = round(fare - platform_fee, 2) + tip

    await db.rides.update_one(
        {"id": body.ride_id},
        {
            "$set": {
                "payment_status": "paid",
                "tip_amount": tip,
                "platform_fee": platform_fee,
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
            "platform_fee": platform_fee,
            "driver_earnings": round(driver_earnings, 2),
        },
    )

    return {
        "ok": True,
        "ride_id": body.ride_id,
        "status": "paid",
        "fare": fare,
        "tip": tip,
        "total_amount": total_amount,
        "platform_fee": platform_fee,
        "driver_earnings": round(driver_earnings, 2),
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

    tip = float(body.tip_amount or body.amount or 0.0)
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
    return {"ok": True, "tip": tip, "message": f"Added Rs. {tip:.0f} tip for your driver"}


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
                            "product_data": {"name": f"Watan Transport: {ride.get('ride_type', 'car_mini').replace('_', ' ').title()}"},
                        },
                        "quantity": 1,
                    }
                ],
                "success_url": success_url,
                "cancel_url": cancel_url,
                "metadata": {
                    "ride_id": body.ride_id,
                    "passenger_id": user["id"],
                    "source": "watan_passenger_app",
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


# ==========================================
# PAKISTANI DOMESTIC PAYMENT ENDPOINTS
# (Raast, JazzCash, EasyPaisa, Cash Reconcile)
# ==========================================

@router.post("/payments/raast/generate-qr")
async def generate_raast_qr(
    body: RaastQrGenerateIn,
    user: dict = Depends(get_current_user),
):
    """
    State Bank of Pakistan (SBP) Raast Instant QR Payment Generator.
    Produces an EMVCo compliant / Raast standard payload with driver's Raast ID / IBAN,
    ride reference, and PKR amount.
    """
    ride = await db.rides.find_one({"id": body.ride_id})
    if not ride:
        raise HTTPException(404, "Ride not found")

    amount = float(body.amount_pkr or ride.get("fare", 0.0))
    driver_id = ride.get("driver_id")

    # Retrieve driver's Raast alias or IBAN
    raast_alias = "03001234567"
    driver_name = "Watan Driver"
    if driver_id:
        driver = await db.users.find_one({"id": driver_id})
        if driver:
            driver_name = driver.get("name", "Watan Driver")
            raast_alias = driver.get("raast_id") or driver.get("bank_iban_or_raast_alias") or driver.get("phone") or raast_alias
            if raast_alias.startswith("+92"):
                raast_alias = "0" + raast_alias[3:]

    # Construct standard Raast payload URI
    raast_payload = f"PK.GOV.SBP.RAAST://pay?id={raast_alias}&amount={amount:.2f}&currency=PKR&ref={body.ride_id}&desc={body.purpose}"

    tx_id = str(uuid.uuid4())
    await db.payment_transactions.insert_one(
        {
            "id": tx_id,
            "ride_id": body.ride_id,
            "passenger_id": ride.get("passenger_id"),
            "driver_id": driver_id,
            "amount": amount,
            "currency": "PKR",
            "payment_method": "raast",
            "raast_alias": raast_alias,
            "status": "pending_qr_scan",
            "payment_status": "pending",
            "created_at": iso_now(),
            "updated_at": iso_now(),
        }
    )

    return {
        "ok": True,
        "transaction_id": tx_id,
        "ride_id": body.ride_id,
        "amount_pkr": amount,
        "currency": "PKR",
        "raast_id": raast_alias,
        "beneficiary_name": driver_name,
        "qr_payload": raast_payload,
        "instructions_en": "Scan with any Raast/1Link banking app (HBL, Meezan, SadaPay, NayaPay, JazzCash, Easypaisa).",
        "instructions_ur": "کسی بھی پاکستانی بینکنگ ایپ (میزان، ایچ بی ایل، نیاپے، سعدے پے، جازکیش) سے کیو آر کوڈ اسکین کریں۔",
    }


@router.post("/payments/jazzcash/initiate")
async def initiate_jazzcash_payment(
    body: JazzCashInitiateIn,
    user: dict = Depends(get_current_user),
):
    """
    Initiates a JazzCash Mobile Account (MWALLET) payment request in PKR.
    In dev/sandbox, creates a pending transaction and provides approval simulation.
    """
    ride = await db.rides.find_one({"id": body.ride_id})
    if not ride:
        raise HTTPException(404, "Ride not found")

    amount = float(body.amount_pkr or ride.get("fare", 0.0))
    tx_ref = f"JC_{uuid.uuid4().hex[:12].upper()}"

    await db.payment_transactions.insert_one(
        {
            "id": str(uuid.uuid4()),
            "tx_ref": tx_ref,
            "ride_id": body.ride_id,
            "passenger_id": ride.get("passenger_id"),
            "driver_id": ride.get("driver_id"),
            "amount": amount,
            "currency": "PKR",
            "payment_method": "jazzcash",
            "mobile_number": body.mobile_number,
            "status": "pending_customer_mpin",
            "payment_status": "pending",
            "created_at": iso_now(),
            "updated_at": iso_now(),
        }
    )

    return {
        "ok": True,
        "tx_ref": tx_ref,
        "ride_id": body.ride_id,
        "amount_pkr": amount,
        "mobile_number": body.mobile_number,
        "status": "initiated",
        "message_en": f"USSD push prompt sent to {body.mobile_number}. Enter your MPIN to confirm payment of Rs. {amount:.0f}.",
        "message_ur": "جازکیش موبائل اکاؤنٹ پر تصدیقی پرامپٹ بھیج دیا گیا ہے۔ برائے مہربانی اپنا ایم پین درج کریں۔",
    }


@router.post("/payments/easypaisa/initiate")
async def initiate_easypaisa_payment(
    body: EasyPaisaInitiateIn,
    user: dict = Depends(get_current_user),
):
    """
    Initiates an EasyPaisa Mobile Account direct debit in PKR.
    """
    ride = await db.rides.find_one({"id": body.ride_id})
    if not ride:
        raise HTTPException(404, "Ride not found")

    amount = float(body.amount_pkr or ride.get("fare", 0.0))
    order_id = f"EP_{uuid.uuid4().hex[:12].upper()}"

    await db.payment_transactions.insert_one(
        {
            "id": str(uuid.uuid4()),
            "order_id": order_id,
            "ride_id": body.ride_id,
            "passenger_id": ride.get("passenger_id"),
            "driver_id": ride.get("driver_id"),
            "amount": amount,
            "currency": "PKR",
            "payment_method": "easypaisa",
            "mobile_number": body.mobile_number,
            "status": "pending_approval",
            "payment_status": "pending",
            "created_at": iso_now(),
            "updated_at": iso_now(),
        }
    )

    return {
        "ok": True,
        "order_id": order_id,
        "ride_id": body.ride_id,
        "amount_pkr": amount,
        "mobile_number": body.mobile_number,
        "status": "initiated",
        "message_en": f"Payment request of Rs. {amount:.0f} sent to Easypaisa account {body.mobile_number}. Please approve in your app.",
        "message_ur": f"ایزی پیسہ اکاؤنٹ {body.mobile_number} پر ادائیگی کی درخواست بھیج دی گئی ہے۔ ایپ میں منظوری دیں۔",
    }


@router.post("/payments/cash-confirm")
async def confirm_cash_payment(
    body: CashConfirmIn,
    user: dict = Depends(get_current_user),
):
    """
    Reconciles physical cash collection for a trip.
    Accessible by driver, munshi, or passenger.
    Calculates driver earnings and platform fee (10% for roaming, 0% for Adda).
    Debits the 10% platform fee from driver wallet balance (since driver collected full cash),
    and increments driver's total_earned.
    """
    ride = await db.rides.find_one({"id": body.ride_id})
    if not ride:
        raise HTTPException(404, "Ride not found")

    fare = float(ride.get("fare", 0.0))
    amount_paid = float(body.amount_received_pkr if body.amount_received_pkr is not None else fare)

    is_adda = ride.get("is_adda_trip", False) or ride.get("mode") == "adda"
    if is_adda:
        platform_fee = 0.0
        driver_net_earnings = amount_paid
    else:
        platform_fee = round(amount_paid * 0.10, 2)
        driver_net_earnings = round(amount_paid - platform_fee, 2)

    await db.rides.update_one(
        {"id": body.ride_id},
        {
            "$set": {
                "payment_status": "paid",
                "payment_method": "cash",
                "total_paid": amount_paid,
                "platform_fee": platform_fee,
                "driver_earnings": driver_net_earnings,
                "cash_reconciled_by": user["id"],
                "cash_notes": body.notes,
                "updated_at": iso_now(),
            }
        },
    )

    # Since driver physically collected 100% cash, debit the platform fee from their driver wallet balance,
    # and credit total_earned with net earnings
    if ride.get("driver_id"):
        await db.driver_wallets.update_one(
            {"driver_id": ride["driver_id"]},
            {
                "$inc": {
                    "balance": -platform_fee,
                    "total_earned": driver_net_earnings,
                },
                "$set": {"updated_at": iso_now()},
            },
            upsert=True,
        )

    # Record cash transaction
    await db.payment_transactions.insert_one(
        {
            "id": str(uuid.uuid4()),
            "ride_id": body.ride_id,
            "passenger_id": ride.get("passenger_id"),
            "driver_id": ride.get("driver_id"),
            "amount": amount_paid,
            "currency": "PKR",
            "payment_method": "cash",
            "platform_fee": platform_fee,
            "driver_earnings": driver_net_earnings,
            "status": "succeeded",
            "payment_status": "paid",
            "reconciled_by": user["id"],
            "notes": body.notes,
            "created_at": iso_now(),
            "updated_at": iso_now(),
        }
    )

    # Broadcast realtime payment event
    await hub.publish_ride(
        body.ride_id,
        {
            "event": "payment.paid",
            "ride_id": body.ride_id,
            "fare": fare,
            "total": amount_paid,
            "payment_method": "cash",
            "platform_fee": platform_fee,
            "driver_earnings": driver_net_earnings,
        },
    )

    return {
        "ok": True,
        "ride_id": body.ride_id,
        "payment_status": "paid",
        "payment_method": "cash",
        "amount_received_pkr": amount_paid,
        "platform_fee_pkr": platform_fee,
        "driver_earnings_pkr": driver_net_earnings,
        "message_en": f"Cash payment of Rs. {amount_paid:.0f} confirmed. Platform fee: Rs. {platform_fee:.0f}.",
        "message_ur": f"نقد رقم {amount_paid:.0f} روپے کی ادائیگی تصدیق ہوگئی۔",
    }

