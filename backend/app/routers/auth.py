from datetime import datetime, timedelta, timezone
import json
import logging
import random
import urllib.request
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..config import settings
from ..db import db
from ..deps import get_current_user
from ..models import (
    EmailOtpRequestIn,
    EmailOtpVerifyIn,
    GoogleAuthIn,
    LoginIn,
    PhoneOtpRequestIn,
    PhoneOtpVerifyIn,
    RefreshIn,
    RegisterIn,
)
from ..security import (
    create_access_token,
    create_refresh_token,
    hash_password,
    revoke_refresh_token,
    rotate_refresh_token,
    verify_password,
)
from ..services.email import send_verification_otp_email
from ..services.sms import send_verification_otp_sms
from ..utils import clean_doc, iso_now, now_utc

router = APIRouter(prefix="/api/auth", tags=["auth"])
logger = logging.getLogger(__name__)


@router.post("/register")
async def register(body: RegisterIn):
    if body.role == "dispatcher":
        raise HTTPException(
            status_code=400, detail="dispatcher accounts cannot self-register"
        )

    email = body.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")

    user_id = str(uuid.uuid4())
    doc = {
        "id": user_id,
        "email": email,
        "password_hash": hash_password(body.password),
        "name": body.name,
        "role": body.role,
        "phone": body.phone or "",
        "phone_verified": False,
        "email_verified": False,
        "rating": 5.0,
        "num_ratings": 0,
        "kyc_status": "documents_required" if body.role == "driver" else None,
        "created_at": iso_now(),
    }
    if body.role == "driver":
        doc["vehicle_make"] = body.vehicle_make or "Toyota Camry"
        doc["vehicle_plate"] = body.vehicle_plate or "XYZ-000"
        doc["vehicle_type"] = body.vehicle_type or "economy"
        await db.driver_status.update_one(
            {"driver_id": user_id},
            {
                "$set": {
                    "driver_id": user_id,
                    "online": False,
                    "lat": 0.0,
                    "lng": 0.0,
                    "updated_at": iso_now(),
                }
            },
            upsert=True,
        )

    await db.users.insert_one(doc.copy())

    # Generate and send 6-digit email verification OTP
    otp_code = f"{random.randint(100000, 999999)}"
    expires_at = (now_utc() + timedelta(minutes=10)).isoformat()
    await db.email_verifications.update_one(
        {"email": email},
        {
            "$set": {
                "user_id": user_id,
                "email": email,
                "code": otp_code,
                "verified": False,
                "attempts": 0,
                "expires_at": expires_at,
                "created_at": iso_now(),
            }
        },
        upsert=True,
    )
    # Fire email send
    try:
        await send_verification_otp_email(email, body.name, otp_code)
    except Exception as exc:
        logger.error("Failed to send verification email to %s: %s", email, exc)

    access = create_access_token(user_id, body.role)
    refresh = await create_refresh_token(user_id)
    safe = clean_doc(doc) or {}
    safe.pop("password_hash", None)
    resp = {
        "token": access,
        "access_token": access,
        "refresh_token": refresh,
        "user": safe,
    }
    if settings.env != "production":
        resp["dev_code"] = otp_code
    return resp


@router.post("/login")
async def login(body: LoginIn):
    email = body.email.lower()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(body.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if body.role and user.get("role") != body.role:
        raise HTTPException(
            status_code=403,
            detail=f"This account is registered as a {user.get('role')}. Please use the {user.get('role')} app.",
        )

    access = create_access_token(user["id"], user["role"])
    refresh = await create_refresh_token(user["id"])
    safe = clean_doc(user) or {}
    safe.pop("password_hash", None)
    return {
        "token": access,
        "access_token": access,
        "refresh_token": refresh,
        "user": safe,
    }


@router.post("/google")
async def google_auth(body: GoogleAuthIn):
    """
    Authenticate or register via Google ID token (Apple/Android/Web Google Sign-In).
    Verifies token with Google and returns standard access and refresh tokens.
    """
    token = body.id_token.strip()
    google_user_info = None

    # Verify ID token with Google's tokeninfo API
    try:
        url = f"https://oauth2.googleapis.com/tokeninfo?id_token={token}"
        req = urllib.request.Request(url, headers={"User-Agent": "Watan-Backend/2.0"})
        with urllib.request.urlopen(req, timeout=5) as response:
            if response.status == 200:
                google_user_info = json.loads(response.read().decode("utf-8"))
    except Exception as exc:
        logger.warning("Google token verification failed: %s", exc)

    # In non-production testing, allow simulated tokens for automated tests
    if not google_user_info and settings.env != "production" and (token.startswith("test_google_token_") or token.startswith("test_apple_token_")):
        test_email = (token.replace("test_google_token_", "").replace("test_apple_token_", "")) + "@example.com"
        google_user_info = {
            "sub": f"google_test_{token}",
            "email": test_email,
            "name": "Google Test User",
            "email_verified": "true",
            "picture": "",
        }

    if not google_user_info or "email" not in google_user_info:
        raise HTTPException(status_code=401, detail="Invalid or expired Google ID token")

    # Optional audience check if configured
    if settings.google_client_id and google_user_info.get("aud") != settings.google_client_id:
        if settings.env == "production":
            raise HTTPException(status_code=401, detail="Google token audience mismatch")

    email = google_user_info["email"].lower()
    google_id = google_user_info.get("sub")
    name = google_user_info.get("name") or email.split("@")[0].capitalize()
    avatar_url = google_user_info.get("picture", "")

    # Check if user already exists by Google ID or email
    user = await db.users.find_one({"$or": [{"google_id": google_id}, {"email": email}]})

    if user:
        # Link google_id if account was originally email-registered
        if not user.get("google_id") and google_id:
            await db.users.update_one({"id": user["id"]}, {"$set": {"google_id": google_id, "avatar_url": avatar_url or user.get("avatar_url")}})
            user = await db.users.find_one({"id": user["id"]})
    else:
        # Create new user via Google
        target_role = body.role if body.role in ("passenger", "driver") else "passenger"
        user_id = str(uuid.uuid4())
        doc = {
            "id": user_id,
            "google_id": google_id,
            "email": email,
            "name": name,
            "avatar_url": avatar_url,
            "role": target_role,
            "phone": "",
            "phone_verified": False,
            "email_verified": True,
            "rating": 5.0,
            "num_ratings": 0,
            "kyc_status": "documents_required" if target_role == "driver" else None,
            "created_at": iso_now(),
        }
        if target_role == "driver":
            doc["vehicle_make"] = body.vehicle_make or "Toyota Camry"
            doc["vehicle_plate"] = body.vehicle_plate or "XYZ-000"
            doc["vehicle_type"] = body.vehicle_type or "economy"
            await db.driver_status.update_one(
                {"driver_id": user_id},
                {
                    "$set": {
                        "driver_id": user_id,
                        "online": False,
                        "lat": 0.0,
                        "lng": 0.0,
                        "updated_at": iso_now(),
                    }
                },
                upsert=True,
            )

        await db.users.insert_one(doc.copy())
        user = doc

    access = create_access_token(user["id"], user["role"])
    refresh = await create_refresh_token(user["id"])
    safe = clean_doc(user) or {}
    safe.pop("password_hash", None)
    return {
        "token": access,
        "access_token": access,
        "refresh_token": refresh,
        "user": safe,
    }


@router.post("/refresh")
async def refresh(body: RefreshIn):
    new_refresh, user_id = await rotate_refresh_token(body.refresh_token)
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    access = create_access_token(user["id"], user["role"])
    return {
        "token": access,
        "access_token": access,
        "refresh_token": new_refresh,
    }


@router.post("/logout")
async def logout(body: RefreshIn):
    await revoke_refresh_token(body.refresh_token)
    return {"ok": True}


@router.get("/me")
async def me(user: dict = Depends(get_current_user)):
    return user


@router.post("/phone/otp")
async def request_phone_otp(body: PhoneOtpRequestIn, user: dict = Depends(get_current_user)):
    """Generate 6-digit SMS verification code (for Twilio/SMS verification) with 10-minute expiry."""
    clean_phone = body.phone.strip()
    otp_code = f"{random.randint(100000, 999999)}"
    expires_at = (now_utc() + timedelta(minutes=10)).isoformat()

    await db.phone_verifications.update_one(
        {"user_id": user["id"]},
        {
            "$set": {
                "phone": clean_phone,
                "code": otp_code,
                "verified": False,
                "attempts": 0,
                "expires_at": expires_at,
                "created_at": iso_now(),
            }
        },
        upsert=True,
    )

    # Fire SMS send via Telecom SMS Gateway
    try:
        await send_verification_otp_sms(clean_phone, otp_code)
    except Exception as exc:
        logger.error("Failed to send SMS to %s: %s", clean_phone, exc)

    resp = {
        "ok": True,
        "message": f"Verification code sent to {clean_phone}",
    }
    # Only return dev_code in non-production environments
    if settings.env != "production":
        resp["dev_code"] = otp_code

    return resp


@router.post("/phone/verify")
async def verify_phone_otp(body: PhoneOtpVerifyIn, user: dict = Depends(get_current_user)):
    record = await db.phone_verifications.find_one({"user_id": user["id"]})
    if not record:
        raise HTTPException(400, "No pending verification request found")

    # Check attempt threshold to prevent brute-force
    attempts = record.get("attempts", 0)
    if attempts >= 5:
        await db.phone_verifications.delete_one({"user_id": user["id"]})
        raise HTTPException(429, "Too many failed attempts. Please request a new verification code.")

    # Check expiry
    expires_at = record.get("expires_at")
    if expires_at and expires_at < iso_now():
        await db.phone_verifications.delete_one({"user_id": user["id"]})
        raise HTTPException(400, "Verification code has expired. Please request a new code.")

    if record.get("code") != body.code.strip():
        await db.phone_verifications.update_one({"user_id": user["id"]}, {"$inc": {"attempts": 1}})
        remaining = 4 - attempts
        raise HTTPException(400, f"Invalid verification code. {remaining} attempts remaining.")

    await db.phone_verifications.update_one(
        {"user_id": user["id"]},
        {"$set": {"verified": True, "updated_at": iso_now()}}
    )
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"phone": body.phone.strip(), "phone_verified": True, "updated_at": iso_now()}},
    )
    return {"ok": True, "message": "Phone number successfully verified"}


@router.post("/email/otp")
async def request_email_otp(body: EmailOtpRequestIn):
    """Generate and send a 6-digit email verification code with 10-minute expiry."""
    email = body.email.strip().lower()
    user = await db.users.find_one({"email": email})
    name = user.get("name", "") if user else "there"

    # Rate limiting: check if code was requested less than 60 seconds ago
    existing = await db.email_verifications.find_one({"email": email})
    if existing:
        created_at_str = existing.get("created_at")
        if created_at_str:
            try:
                created_dt = datetime.fromisoformat(created_at_str)
                if (now_utc() - created_dt).total_seconds() < 60:
                    raise HTTPException(429, "Please wait 60 seconds before requesting another verification code.")
            except (ValueError, TypeError):
                pass

    otp_code = f"{random.randint(100000, 999999)}"
    expires_at = (now_utc() + timedelta(minutes=10)).isoformat()

    await db.email_verifications.update_one(
        {"email": email},
        {
            "$set": {
                "user_id": user.get("id") if user else None,
                "email": email,
                "code": otp_code,
                "verified": False,
                "attempts": 0,
                "expires_at": expires_at,
                "created_at": iso_now(),
            }
        },
        upsert=True,
    )

    try:
        await send_verification_otp_email(email, name, otp_code)
    except Exception as exc:
        logger.error("Failed sending email OTP to %s: %s", email, exc)

    resp = {"ok": True, "message": f"Verification code sent to {email}"}
    if settings.env != "production":
        resp["dev_code"] = otp_code
    return resp


@router.post("/email/verify")
async def verify_email_otp(body: EmailOtpVerifyIn):
    """Verify 6-digit email verification code and activate email_verified."""
    email = body.email.strip().lower()
    record = await db.email_verifications.find_one({"email": email})
    if not record:
        raise HTTPException(400, "No pending verification request found for this email")

    attempts = record.get("attempts", 0)
    if attempts >= 5:
        await db.email_verifications.delete_one({"email": email})
        raise HTTPException(429, "Too many failed attempts. Please request a new verification code.")

    expires_at = record.get("expires_at")
    if expires_at and expires_at < iso_now():
        await db.email_verifications.delete_one({"email": email})
        raise HTTPException(400, "Verification code has expired. Please request a new code.")

    if record.get("code") != body.code.strip():
        await db.email_verifications.update_one({"email": email}, {"$inc": {"attempts": 1}})
        remaining = 4 - attempts
        raise HTTPException(400, f"Invalid verification code. {remaining} attempts remaining.")

    await db.email_verifications.update_one(
        {"email": email},
        {"$set": {"verified": True, "updated_at": iso_now()}}
    )
    user = await db.users.find_one({"email": email})
    if user:
        await db.users.update_one(
            {"id": user["id"]},
            {"$set": {"email_verified": True, "updated_at": iso_now()}}
        )
        user = await db.users.find_one({"id": user["id"]})
        safe = clean_doc(user) or {}
        safe.pop("password_hash", None)
        access = create_access_token(user["id"], user["role"])
        refresh = await create_refresh_token(user["id"])
        return {
            "ok": True,
            "message": "Email successfully verified",
            "token": access,
            "access_token": access,
            "refresh_token": refresh,
            "user": safe,
        }

    return {"ok": True, "message": "Email successfully verified", "email": email}


class PushTokenIn(BaseModel):
    push_token: str = Field(min_length=10, max_length=200)


@router.post("/push-token")
async def save_push_token(body: PushTokenIn, user: dict = Depends(get_current_user)):
    """Store the Expo push token for this device so the backend can send push notifications."""
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"push_token": body.push_token, "updated_at": iso_now()}},
    )
    return {"ok": True}


@router.delete("/account")
async def delete_account(user: dict = Depends(get_current_user)):
    """Permanently delete the authenticated user and all their data (Apple App Store / Google Play requirement)."""
    uid = user["id"]
    # Check if there is an active ride in progress
    active = await db.rides.find_one(
        {
            "$or": [{"passenger_id": uid}, {"driver_id": uid}],
            "status": {"$in": ["accepted", "arrived", "in_progress"]},
        }
    )
    if active:
        raise HTTPException(400, "Cannot delete account while an active ride is in progress")

    # Anonymise ride history instead of hard-deleting (preserves accounting records)
    await db.rides.update_many(
        {"passenger_id": uid},
        {"$set": {"passenger_id": "deleted", "passenger_name": "Deleted User"}},
    )
    await db.rides.update_many(
        {"driver_id": uid},
        {"$set": {"driver_id": "deleted", "driver_name": "Deleted User"}},
    )
    await db.driver_status.delete_one({"driver_id": uid})
    await db.driver_kyc.delete_one({"driver_id": uid})
    await db.driver_wallets.delete_one({"driver_id": uid})
    await db.chat_messages.delete_many({"sender_id": uid})
    await db.refresh_tokens.delete_many({"user_id": uid})
    await db.payment_transactions.update_many(
        {"passenger_id": uid},
        {"$set": {"passenger_id": "deleted"}},
    )
    await db.users.delete_one({"id": uid})
    return {"status": "deleted"}
