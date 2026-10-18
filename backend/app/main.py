import asyncio
import logging
import uuid

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import HTMLResponse, JSONResponse
from starlette.middleware.cors import CORSMiddleware

from .config import settings
from .db import db, shutdown_db, startup_indexes
from .middleware import InMemoryRateLimitMiddleware, RequestContextMiddleware
from .routers.addas import router as addas_router
from .routers.auth import router as auth_router
from .routers.chat import router as chat_router
from .routers.dispatch import router as dispatch_router
from .routers.driver import router as driver_router
from .routers.health import router as health_router
from .routers.payments import router as payments_router
from .routers.public import router as public_router
from .routers.rides import router as rides_router
from .routers.seats import router as seats_router
from .routers.ws import router as ws_router
from .security import hash_password
from .utils import iso_now

app = FastAPI(title="Watan Mobility API (وطن)", version="2.0.0")

app.add_middleware(RequestContextMiddleware)
app.add_middleware(InMemoryRateLimitMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=settings.cors_origins,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID", "Accept", "Origin", "x-refresh-token"],
)

app.include_router(health_router)
app.include_router(auth_router)
app.include_router(rides_router)
app.include_router(public_router)
app.include_router(driver_router)
app.include_router(chat_router)
app.include_router(payments_router)
app.include_router(ws_router)
app.include_router(dispatch_router)
app.include_router(addas_router)
app.include_router(seats_router)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={
            "error": "validation_error",
            "request_id": getattr(request.state, "request_id", ""),
            "detail": exc.errors(),
        },
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": "http_error",
            "request_id": getattr(request.state, "request_id", ""),
            "detail": exc.detail,
        },
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logging.exception("Unhandled exception")
    return JSONResponse(
        status_code=500,
        content={
            "error": "internal_error",
            "request_id": getattr(request.state, "request_id", ""),
            "detail": "Internal server error",
        },
    )


async def seed_demo_accounts() -> None:
    if settings.env == "production":
        logging.info("Production mode: skipping demo account seeding")
        return

    demos = [
        {
            "email": "passenger@demo.com",
            "password": "Passenger123!",
            "name": "Alex Rivera",
            "role": "passenger",
            "phone": "+1 555 010 0101",
        },
        {
            "email": "driver@demo.com",
            "password": "Driver123!",
            "name": "Jordan Lee",
            "role": "driver",
            "phone": "+1 555 020 0202",
            "vehicle_make": "Toyota Camry · Black",
            "vehicle_plate": "RIDE-001",
            "vehicle_type": "economy",
        },
    ]

    for demo in demos:
        existing = await db.users.find_one({"email": demo["email"]})
        if existing:
            continue
        user_id = str(uuid.uuid4())
        doc = {
            "id": user_id,
            "email": demo["email"],
            "password_hash": hash_password(demo["password"]),
            "name": demo["name"],
            "role": demo["role"],
            "phone": demo["phone"],
            "rating": 4.9,
            "num_ratings": 23,
            "created_at": iso_now(),
        }
        if demo["role"] == "driver":
            doc["vehicle_make"] = demo["vehicle_make"]
            doc["vehicle_plate"] = demo["vehicle_plate"]
            doc["vehicle_type"] = demo["vehicle_type"]
            doc["kyc_status"] = "verified"
            doc["council_name"] = "Fife Council"
            doc["phv_badge_number"] = "FC-PHD-8821"
            doc["badge_expiry"] = "2028-12-31"
            doc["insurance_policy"] = "Aviva Hire & Reward #AV-99120"
            doc["insurance_expiry"] = "2028-12-31"
            doc["plate_expiry"] = "2028-12-31"
            doc["license_number"] = "LEE880199J99"
            doc["license_expiry"] = "2028-12-31"
            await db.driver_status.update_one(
                {"driver_id": user_id},
                {
                    "$set": {
                        "driver_id": user_id,
                        "online": False,
                        "lat": 37.7749,
                        "lng": -122.4194,
                        "updated_at": iso_now(),
                    }
                },
                upsert=True,
            )
        await db.users.insert_one(doc)

    # Ensure any existing driver@demo.com is marked verified with valid Fife compliance dates
    await db.users.update_one(
        {"email": "driver@demo.com"},
        {
            "$set": {
                "kyc_status": "verified",
                "council_name": "Fife Council",
                "phv_badge_number": "FC-PHD-8821",
                "badge_expiry": "2028-12-31",
                "insurance_policy": "Aviva Hire & Reward #AV-99120",
                "insurance_expiry": "2028-12-31",
                "vehicle_plate": "SK19 FFC",
                "plate_expiry": "2028-12-31",
                "license_number": "LEE880199J99",
                "license_expiry": "2028-12-31",
            }
        },
    )


@app.on_event("startup")
async def on_startup():
    await startup_indexes()
    await seed_demo_accounts()
    # Start Redis pub/sub subscriber in background (fan-out to local WebSocket clients)
    from .services.realtime import redis_subscriber
    asyncio.create_task(redis_subscriber())


@app.on_event("shutdown")
async def on_shutdown():
    await shutdown_db()


# ── Delete Account page (Google Play mandatory) ───────────────────────────────
@app.get("/delete-account", response_class=HTMLResponse, include_in_schema=False)
async def delete_account_page():
    return """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Delete Your GetChum Account</title>
  <style>
    body { font-family: -apple-system, sans-serif; max-width: 600px; margin: 60px auto; padding: 0 20px; color: #1a1a1a; }
    h1 { font-size: 28px; margin-bottom: 12px; }
    p { font-size: 16px; line-height: 1.6; color: #444; }
    .steps { background: #f5f5f5; border-radius: 12px; padding: 20px; margin: 24px 0; }
    .steps li { margin: 8px 0; font-size: 15px; }
    a { color: #FACC15; }
  </style>
</head>
<body>
  <h1>Delete Your GetChum Account</h1>
  <p>You can permanently delete your GetChum account and all associated data directly from the app.</p>
  <div class="steps">
    <strong>Steps:</strong>
    <ol>
      <li>Open the <strong>GetChum</strong> app on your device</li>
      <li>Tap the <strong>Profile</strong> tab</li>
      <li>Scroll down and tap <strong>Delete Account</strong></li>
      <li>Confirm the deletion when prompted</li>
    </ol>
  </div>
  <p>Deleting your account will permanently remove your profile, ride history, and all personal data from our servers. This action cannot be undone.</p>
  <p>Alternatively, email us at <a href="mailto:support@getchum.co.uk">support@getchum.co.uk</a> to request manual deletion.</p>
</body>
</html>"""


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
