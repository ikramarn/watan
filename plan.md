# Nimbus Rideshare — Production Readiness Plan
> **Target**: Play Store + App Store submission | 500+ concurrent users | Expo Go local testing
> **Date**: May 2026 | **Stack**: FastAPI + MongoDB + Expo SDK 54 (React Native)

---

## Executive Summary

After a deep dive of every file across `backend/`, `passenger_app/`, `driver_app/`, `tests/`, and all config files, the app has a solid architecture but has **27 critical gaps** that must be closed before submitting to either store. The biggest blockers are: a **mocked map** (no real GPS), **no location tracking**, **no push notifications**, **in-memory WebSocket/rate-limit hub** (breaks at 2+ workers), and **missing store compliance** requirements.

---

## 🔴 CRITICAL BLOCKERS (Will Cause Store Rejection or App Failure)

### C1 — Maps & Location (App is non-functional without this)
**Problem**: `MapView.tsx` in all apps is a fake grid drawing — no real map, no real GPS.  
**Fix**: Install `react-native-maps` + `expo-location` + `expo-task-manager` in `passenger_app/` and `driver_app/`.

**Files to change**:
- `passenger_app/app.json` → add `expo-location` config plugin with permissions
- `driver_app/app.json` → add `expo-location` + background location config
- `passenger_app/src/components/MapView.tsx` → replace with `react-native-maps` `<MapView>`
- `driver_app/src/components/MapView.tsx` → same
- `driver_app/app/driver/home.tsx` → add `expo-task-manager` background location task

```bash
# In passenger_app/ and driver_app/
npx expo install react-native-maps expo-location expo-task-manager
```

**app.json additions** (driver_app — needs background location):
```json
{
  "expo": {
    "plugins": [
      ["expo-location", {
        "locationAlwaysAndWhenInUsePermission": "Allow Nimbus to track your location while driving.",
        "isIosBackgroundLocationEnabled": true,
        "isAndroidBackgroundLocationEnabled": true,
        "isAndroidForegroundServiceEnabled": true
      }]
    ],
    "ios": { "infoPlist": { "UIBackgroundModes": ["location"] } }
  }
}
```

**app.json additions** (passenger_app — foreground only):
```json
{
  "expo": {
    "plugins": [
      ["expo-location", {
        "locationWhenInUsePermission": "Allow Nimbus to show your position on the map."
      }]
    ]
  }
}
```

**MapView replacement** (replace `src/components/MapView.tsx` in both apps):
```tsx
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';

// Use Marker for pickup/destination/driver
// Use Polyline for route
// Use PROVIDER_GOOGLE on Android, default (Apple Maps) on iOS
```

> **Note**: Google Maps API key required for Android. Get from Google Cloud Console → Maps SDK for Android.  
> Add to `passenger_app/app.json` and `driver_app/app.json`:
```json
"android": { "config": { "googleMaps": { "apiKey": "YOUR_ANDROID_MAPS_KEY" } } }
```

---

### C2 — Push Notifications (Drivers won't receive ride requests without this)
**Problem**: No `expo-notifications`. Drivers only see rides by polling every N seconds — unreliable for 500 users.  
**Fix**: Install `expo-notifications` and integrate Expo Push Service.

```bash
npx expo install expo-notifications
```

**Backend** — Add push token storage + notification sender:
- `backend/app/models.py` → add `push_token` field to user model
- `backend/app/routers/auth.py` → accept + store push token on register/login
- `backend/app/services/realtime.py` → add `send_push_notification(driver_id, payload)` using Expo Push API
- `backend/app/routers/driver.py` → call push when new ride is available (supplement WebSocket)

**Frontend** (driver_app) — Register token on app start:
```tsx
// In driver_app/app/_layout.tsx
import * as Notifications from 'expo-notifications';
// Register device token → send to backend POST /api/users/push-token
```

**app.json** additions (both apps):
```json
"plugins": [
  ["expo-notifications", {
    "icon": "./assets/images/notification-icon.png",
    "color": "#FACC15",
    "defaultChannel": "default"
  }]
]
```

> **EAS requirement**: You need an EAS project ID for `getExpoPushTokenAsync()` to work.
> Run `eas init` once, add the `projectId` to `app.json` under `extra.eas.projectId`.

---

### C3 — Bundle IDs / Package Names Not Set
**Problem**: Both app.json files have no `android.package` or `ios.bundleIdentifier`. Without these, EAS Build and store submissions fail.

**passenger_app/app.json**:
```json
"ios": { "bundleIdentifier": "com.yourcompany.nimbus.passenger", "supportsTablet": false },
"android": { "package": "com.yourcompany.nimbus.passenger", ... }
```

**driver_app/app.json**:
```json
"ios": { "bundleIdentifier": "com.yourcompany.nimbus.driver", "supportsTablet": false },
"android": { "package": "com.yourcompany.nimbus.driver", ... }
```

> Replace `com.yourcompany` with your actual reverse-domain company name.

---

### C4 — EAS Build Not Configured
**Problem**: No `eas.json` in either app directory. Without EAS, you cannot build for Play Store or App Store.

Create `passenger_app/eas.json` and `driver_app/eas.json`:
```json
{
  "cli": { "version": ">= 12.0.0" },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal",
      "android": { "buildType": "apk" }
    },
    "production": {
      "autoIncrement": true
    }
  },
  "submit": {
    "production": {}
  }
}
```

```bash
# Setup (run once per app directory)
npm install -g eas-cli
eas login
eas init   # creates projectId, links to Expo account
```

---

### C5 — WebSocket Hub is In-Memory (Breaks at 500 users / 2+ workers)
**Problem**: `backend/app/services/realtime.py` uses a Python dict `hub`. When you run multiple Uvicorn workers (required for 500 users), each process has its own hub — messages from worker A won't reach clients on worker B.

**Fix**: Replace in-memory hub with Redis Pub/Sub.

```bash
pip install redis[asyncio] aioredis
```

**New `backend/app/services/realtime.py`**:
```python
import asyncio, json, redis.asyncio as aioredis
from fastapi import WebSocket
from app.config import settings

# Local connections per worker
_ride_channels: dict[str, set[WebSocket]] = {}
_driver_channels: dict[str, set[WebSocket]] = {}

redis_client: aioredis.Redis = None

async def get_redis():
    global redis_client
    if redis_client is None:
        redis_client = aioredis.from_url(settings.redis_url, decode_responses=True)
    return redis_client

class RealtimeHub:
    async def connect_ride(self, ride_id: str, ws: WebSocket):
        await ws.accept()
        _ride_channels.setdefault(ride_id, set()).add(ws)

    async def disconnect_ride(self, ride_id: str, ws: WebSocket):
        _ride_channels.get(ride_id, set()).discard(ws)

    async def publish_ride(self, ride_id: str, payload: dict):
        r = await get_redis()
        await r.publish(f"ride:{ride_id}", json.dumps(payload))

    async def publish_driver(self, driver_id: str, payload: dict):
        r = await get_redis()
        await r.publish(f"driver:{driver_id}", json.dumps(payload))

    async def local_broadcast_ride(self, ride_id: str, message: str):
        dead = set()
        for ws in list(_ride_channels.get(ride_id, set())):
            try:
                await ws.send_text(message)
            except Exception:
                dead.add(ws)
        _ride_channels.get(ride_id, set()).difference_update(dead)

    async def local_broadcast_driver(self, driver_id: str, message: str):
        dead = set()
        for ws in list(_driver_channels.get(driver_id, set())):
            try:
                await ws.send_text(message)
            except Exception:
                dead.add(ws)
        _driver_channels.get(driver_id, set()).difference_update(dead)

hub = RealtimeHub()

# Subscriber coroutine — run one per worker in background
async def redis_subscriber():
    r = await get_redis()
    pubsub = r.pubsub()
    await pubsub.psubscribe("ride:*", "driver:*")
    async for message in pubsub.listen():
        if message["type"] == "pmessage":
            channel = message["channel"]
            data = message["data"]
            if channel.startswith("ride:"):
                ride_id = channel[5:]
                await hub.local_broadcast_ride(ride_id, data)
            elif channel.startswith("driver:"):
                driver_id = channel[7:]
                await hub.local_broadcast_driver(driver_id, data)
```

**`backend/app/config.py`** — add:
```python
redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
```

**`backend/app/main.py`** — on startup:
```python
import asyncio
from app.services.realtime import redis_subscriber

@app.on_event("startup")
async def startup():
    asyncio.create_task(redis_subscriber())  # subscribe in background
    # ... existing startup code
```

---

### C6 — Rate Limiting is In-Memory Per-Process
**Problem**: `InMemoryRateLimitMiddleware` in `middleware.py` uses a per-process dict. With multiple workers, each worker tracks limits independently — effectively multiplying your limit by worker count.

**Fix**: Use Redis-based rate limiting.

```python
# backend/app/middleware.py — replace InMemoryRateLimitMiddleware
import redis.asyncio as aioredis
from app.config import settings

class RedisRateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if not self._should_limit(request):
            return await call_next(request)
        
        r = aioredis.from_url(settings.redis_url, decode_responses=True)
        ip = request.client.host
        path = request.url.path
        key = f"rl:{ip}:{path}"
        
        count = await r.incr(key)
        if count == 1:
            await r.expire(key, settings.rate_limit_window_sec)
        
        if count > settings.rate_limit_max_requests:
            return JSONResponse(status_code=429, content={"detail": "Too many requests"})
        
        return await call_next(request)
```

---

### C7 — No HTTPS / SSL on Backend
**Problem**: All API calls use plain HTTP. Both stores and Stripe require HTTPS for production.  
**Fix**: Deploy behind Nginx with Let's Encrypt SSL, or use a managed service (Railway, Render, AWS + ALB).

Recommended `nginx.conf` snippet:
```nginx
server {
    listen 443 ssl;
    server_name api.yourdomain.com;
    
    ssl_certificate /etc/letsencrypt/live/api.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.yourdomain.com/privkey.pem;
    
    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    # WebSocket support
    location /ws/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
server {
    listen 80;
    return 301 https://$host$request_uri;
}
```

---

### C8 — Delete Account Endpoint Missing (Play Store MANDATORY)
**Problem**: Google Play rejects apps with user accounts that don't offer account deletion (per their policy since 2023).

**Fix**: Add to `backend/app/routers/auth.py`:
```python
@router.delete("/account")
async def delete_account(user=Depends(get_current_user)):
    uid = user["id"]
    db = get_db()
    # Anonymize/delete all user data
    await db.users.delete_one({"id": uid})
    await db.rides.update_many(
        {"passenger_id": uid},
        {"$set": {"passenger_id": "deleted", "passenger_name": "Deleted User"}}
    )
    await db.rides.update_many(
        {"driver_id": uid},
        {"$set": {"driver_id": "deleted", "driver_name": "Deleted User"}}
    )
    await db.driver_status.delete_one({"driver_id": uid})
    await db.chat_messages.delete_many({"sender_id": uid})
    await db.refresh_tokens.delete_many({"user_id": uid})
    return {"status": "deleted"}
```

Also add a **Delete Account HTML page** (for the Play Console URL field):
```python
@app.get("/delete-account", response_class=HTMLResponse)
async def delete_account_page():
    return """<!DOCTYPE html>
    <html><head><title>Delete Your Nimbus Account</title></head>
    <body>
      <h1>Delete Your Nimbus Account</h1>
      <p>To delete your account and all associated data, open the Nimbus app,
         go to Profile → Delete Account. Your data will be permanently removed.</p>
      <p>Alternatively, email us at: <a href="mailto:support@yourdomain.com">support@yourdomain.com</a></p>
    </body></html>"""
```

Add a "Delete Account" button to `passenger_app/app/passenger/profile.tsx` and `driver_app/app/driver/profile.tsx`.

---

### C9 — No Privacy Policy (Both Stores MANDATORY)
**Problem**: Apple requires a privacy policy URL since 2018. Google also requires one. No policy exists.  
**Fix**: 
1. Write a privacy policy (see template below).
2. Host it on your domain or GitHub Pages.
3. Add the URL to both app.json files and in store listings.

**Add to both app.json files**:
```json
"ios": {
  "privacyManifests": {
    "NSPrivacyAccessedAPITypes": [
      { "NSPrivacyAccessedAPIType": "NSPrivacyAccessedAPICategoryUserDefaults",
        "NSPrivacyAccessedAPITypeReasons": ["CA92.1"] }
    ]
  }
}
```

**Minimum privacy policy must cover**:
- What data you collect (name, email, phone, GPS location, payment info)
- Why you collect it (service delivery)
- Who you share it with (Stripe for payments, no others)
- How to request data deletion
- Contact information

---

### C10 — Stripe in Test Mode
**Problem**: `sk_test_...` is a test-mode key. Real payments won't process.  
**Fix**: 
1. Create a real Stripe account at stripe.com
2. Complete KYC/identity verification
3. Set `STRIPE_API_KEY=sk_live_...` in production `.env`
4. Register your Stripe webhook endpoint at `https://api.yourdomain.com/api/webhook/stripe`
5. Set `STRIPE_WEBHOOK_SECRET` env var and verify webhook signatures in `backend/app/routers/payments.py`

**Add webhook signature verification** (currently missing — security risk):
```python
import stripe
from stripe import SignatureVerificationError

@router.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")
    webhook_secret = settings.stripe_webhook_secret
    
    try:
        event = stripe.Webhook.construct_event(payload, sig_header, webhook_secret)
    except (ValueError, SignatureVerificationError):
        raise HTTPException(status_code=400, detail="Invalid signature")
    # ... process event
```

---

## 🟡 HIGH PRIORITY (Required for 500 Users / Store Quality)

### H1 — Backend Cannot Handle 500 Concurrent Users (Single Uvicorn Worker)
**Problem**: `server.py` runs a single Uvicorn instance. One Python process = ~50 concurrent WebSocket connections reliably.

**Fix**: Run with Gunicorn + multiple Uvicorn workers + asyncio event loop:

```bash
# Install
pip install gunicorn

# Production startup command
gunicorn server:app \
  -k uvicorn.workers.UvicornWorker \
  -w 4 \
  --bind 0.0.0.0:8000 \
  --timeout 120 \
  --keepalive 5 \
  --max-requests 1000 \
  --max-requests-jitter 100
```

For 500 users: 4-8 workers on a 2-4 CPU machine. Pair with Redis for C5 and C6 above.

**Create `backend/Dockerfile`**:
```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt gunicorn
COPY . .
EXPOSE 8000
CMD ["gunicorn", "server:app", "-k", "uvicorn.workers.UvicornWorker", \
     "-w", "4", "--bind", "0.0.0.0:8000", "--timeout", "120"]
```

**Create `backend/docker-compose.yml`**:
```yaml
version: '3.9'
services:
  api:
    build: .
    ports: ["8000:8000"]
    environment:
      - MONGO_URL=mongodb://mongo:27017
      - DB_NAME=nimbus
      - JWT_SECRET=${JWT_SECRET}
      - REDIS_URL=redis://redis:6379/0
      - STRIPE_API_KEY=${STRIPE_API_KEY}
      - CORS_ORIGINS=https://yourdomain.com
    depends_on: [mongo, redis]
    restart: always

  mongo:
    image: mongo:7
    volumes: ["mongo_data:/data/db"]
    restart: always

  redis:
    image: redis:7-alpine
    restart: always

volumes:
  mongo_data:
```

---

### H2 — No Structured Logging or Error Tracking
**Problem**: `print()` statements and unhandled exceptions are silently swallowed in production.

**Fix**: Add structured logging + Sentry:

```bash
pip install sentry-sdk[fastapi] structlog
```

**`backend/app/main.py`** — add:
```python
import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration

sentry_sdk.init(
    dsn=os.getenv("SENTRY_DSN", ""),
    integrations=[FastApiIntegration()],
    traces_sample_rate=0.1,  # 10% of requests
    environment=settings.env
)
```

---

### H3 — CORS Allows Localhost in Production
**Problem**: `cors_origins` defaults to `localhost:8081` — production clients will be rejected.  
**Fix**: Set `CORS_ORIGINS` env var in production to your actual domains:
```
CORS_ORIGINS=https://yourdomain.com,exp://YOUR_EXPO_HOSTNAME
```

For mobile apps using HTTPS backend, the origin is the Expo-generated HTTPS tunnel or your production domain.

---

### H4 — No Password Reset Flow
**Problem**: Users who forget their password are permanently locked out.  
**Fix**: Add email-based password reset.

```bash
pip install fastapi-mail
```

**New endpoints** in `backend/app/routers/auth.py`:
- `POST /auth/forgot-password` — generates a time-limited token (15 min), sends email
- `POST /auth/reset-password` — validates token, updates password hash
- Store reset tokens in `password_reset_tokens` MongoDB collection with TTL index

New frontend screens needed:
- `passenger_app/app/(auth)/forgot-password.tsx`
- `driver_app/app/(auth)/forgot-password.tsx`

---

### H5 — No Email Verification
**Problem**: Anyone can register with a fake email — creates support and fraud risk.  
**Fix**: Send a verification email on registration. Block login until verified OR allow login but show a "Please verify your email" banner.

- Add `email_verified: bool = False` to user document
- Send verification email with a signed token on registration
- Add `GET /auth/verify-email?token=...` endpoint

---

### H6 — No Real Address Search / Geocoding
**Problem**: Passenger home has "popular places" hardcoded. No real address search input.  
**Fix**: Integrate Google Places Autocomplete API or `expo-location` reverse geocoding.

```bash
npx expo install expo-location
```

Options (in order of cost):
1. **Google Places API** (best UX) — requires billing account, ~$0.017 per request
2. **OpenStreetMap Nominatim** (free, rate-limited) — 1 req/sec, not for production
3. **Mapbox Geocoding** (free tier: 100k requests/month) — good middle ground

Add address autocomplete component to `passenger_app/app/passenger/home.tsx`.

---

### H7 — Stripe Deep Link / Return URL Broken
**Problem**: After Stripe checkout, the `origin_url` for redirect is undefined. Deep link scheme `nimbus-passenger://payment-success` is not registered.

**Fix** in `passenger_app/app.json`:
```json
{
  "expo": {
    "scheme": "nimbus-passenger",
    "intentFilters": [
      {
        "action": "VIEW",
        "autoVerify": true,
        "data": [{ "scheme": "nimbus-passenger" }],
        "category": ["BROWSABLE", "DEFAULT"]
      }
    ]
  }
}
```

**Fix** in `passenger_app/app/passenger/ride/[id].tsx` — pass correct return URL to checkout:
```tsx
const origin_url = `nimbus-passenger://payment-success?ride_id=${rideId}`;
```

For iOS, also add Associated Domains entitlement if using universal links.

---

### H8 — App Icons Are Placeholders
**Problem**: Both apps use default Expo icons. Stores require custom, professional icons.

**Requirements**:
- iOS: 1024×1024 PNG, no alpha channel, no rounded corners (iOS clips it)
- Android: 1024×1024 PNG adaptive icon foreground + 1024×1024 background color
- Splash screen: 1284×2778 PNG (iPhone 14 Pro Max)

**Files to replace**:
- `passenger_app/assets/images/icon.png` — 1024×1024
- `passenger_app/assets/images/adaptive-icon.png` — 1024×1024
- `passenger_app/assets/images/splash-icon.png` — centered logo
- Same for `driver_app/`

---

### H9 — Android Target SDK Not Set (Required: API 34+)
**Problem**: No `targetSdkVersion` set. Google Play requires targetSdkVersion 34+ for all new apps as of 2024.

**Fix** in both app.json files:
```json
"android": {
  "targetSdkVersion": 34,
  "minSdkVersion": 24
}
```

---

### H10 — No Database Backup Strategy
**Problem**: MongoDB data has no backup. A single disk failure = total data loss.

**Fix options**:
- **MongoDB Atlas** (recommended): Automatic backups, free tier includes 512MB
- **Self-hosted**: `mongodump` cron job → S3 bucket
- Add `MONGO_URL=mongodb+srv://...` to point to Atlas cluster

---

## 🟢 IMPORTANT (Quality & Store Compliance)

### I1 — iOS Privacy Manifest Required (Apple mandate from May 2024)
Apple now requires a `PrivacyInfo.xcprivacy` file for all apps using certain APIs. `react-native-async-storage` and `expo-updates` trigger this requirement.

EAS Build handles this automatically if you use SDK 50+. Verify by checking build logs for privacy manifest warnings.

Add to `passenger_app/app.json` and `driver_app/app.json`:
```json
"ios": {
  "privacyManifests": {
    "NSPrivacyAccessedAPITypes": [
      {
        "NSPrivacyAccessedAPIType": "NSPrivacyAccessedAPICategoryUserDefaults",
        "NSPrivacyAccessedAPITypeReasons": ["CA92.1"]
      },
      {
        "NSPrivacyAccessedAPIType": "NSPrivacyAccessedAPICategoryFileTimestamp",
        "NSPrivacyAccessedAPITypeReasons": ["C617.1"]
      }
    ]
  }
}
```

---

### I2 — iOS App Store Connect Metadata
Required before first submission:
- App name (max 30 chars): "Nimbus Passenger" / "Nimbus Driver"
- Subtitle (max 30 chars): "Fast, Safe Rides" / "Drive & Earn"
- Description (max 4000 chars)
- Keywords (max 100 chars): "taxi,rideshare,ride,driver,uber"
- Support URL: `https://yourdomain.com/support`
- Privacy Policy URL: `https://yourdomain.com/privacy`
- Screenshots: Required sizes below
- Age rating: 4+ (no objectionable content)
- Categories: Travel (primary), Navigation (secondary)

**Screenshot sizes required** (can use Expo's screenshot tool or Simulator):
- iPhone 6.9" (1320×2868): 3-10 screenshots
- iPhone 6.5" (1284×2778): 3-10 screenshots  
- iPad Pro 12.9" (2048×2732): 3-10 screenshots

---

### I3 — Google Play Console Metadata
Required before first submission:
- App name (max 50 chars)
- Short description (max 80 chars)
- Full description (max 4000 chars)
- App icon (512×512 PNG)
- Feature graphic (1024×500 PNG) — shown in Play Store header
- Screenshots (minimum 2, max 8): Phone (16:9 or 9:16)
- Privacy policy URL
- Target audience: 18+ (select "Adults" — no special child safety needed)
- Data Safety form (see below)
- Content rating questionnaire (complete for IARC rating)

**Data Safety form answers** (Play Console → Store listing → Data safety):
- Location data: YES (precise location — for map/navigation)
  - Collected, required, not shared with third parties except Stripe
- Personal info (name, email, phone): YES
  - Collected, required, shared with payment processor (Stripe)
- Financial info: YES (payment info via Stripe)
- Delete account URL: `https://yourdomain.com/delete-account`
- Data encrypted in transit: YES
- Users can request data deletion: YES

---

### I4 — Terms of Service
Required by both stores and legally necessary for a payment-taking app.

Add `GET /terms` endpoint in backend returning HTML (same pattern as `/delete-account`).  
Add link in both apps' profile screens and registration screen.

Minimum content:
- Service description
- User eligibility (18+ for payment)
- Acceptable use policy
- Payment terms (Stripe processes payments, platform takes X% fee)
- Dispute resolution
- Governing law

---

### I5 — JWT Secret Must Be Cryptographically Strong
**Problem**: `JWT_SECRET` is pulled from env but may default to a weak value in development.

**Fix** in `backend/app/config.py`:
```python
jwt_secret = os.environ["JWT_SECRET"]  # already required — good

# Add validation in Settings.__init__:
def __post_init__(self):
    if len(self.jwt_secret) < 32:
        raise ValueError("JWT_SECRET must be at least 32 characters")
    if self.env == "production" and "secret" in self.jwt_secret.lower():
        raise ValueError("JWT_SECRET looks like a placeholder — use a strong secret")
```

Generate a production secret:
```bash
python -c "import secrets; print(secrets.token_hex(64))"
```

---

### I6 — MongoDB Connection String Must Use Auth in Production
**Problem**: `MONGO_URL` likely uses no auth for local dev.

**Production MongoDB URL**:
```
mongodb+srv://username:password@cluster.mongodb.net/nimbus?retryWrites=true&w=majority
```

Add connection pool settings in `backend/app/db.py`:
```python
client = AsyncIOMotorClient(
    settings.mongo_url,
    maxPoolSize=50,        # up from default 100 (lower for memory)
    minPoolSize=5,
    connectTimeoutMS=5000,
    socketTimeoutMS=30000,
    serverSelectionTimeoutMS=5000
)
```

---

### I7 — Driver App Chat Directory Is Empty
**Status update**: This finding is outdated. `driver_app/app/driver/chat/[id].tsx` now exists, so the dedicated driver app no longer depends on the removed combined app for chat.

**Fix**: Keep the driver chat implementation inside `driver_app/` and maintain it there.

---

### I8 — Passenger App Screens Incomplete
**Status update**: This finding is outdated. The dedicated passenger app already contains these screens locally:
- `ride/[id].tsx` — active ride tracking
- `chat/[id].tsx` — in-ride chat
- `payment-success.tsx` — Stripe return page

**Fix**: Treat `passenger_app/` as the source of truth for these flows.

---

### I9 — Earnings Screen Has Hardcoded Data
**Problem**: `driver/earnings.tsx` has `"96%"` acceptance rate hardcoded and "Chase account" hardcoded.

**Fix**:
- Backend: Add `acceptance_rate` calculation to `GET /driver/earnings` endpoint
- Frontend: Remove hardcoded values, use real data

---

### I10 — No App-Level Error Boundary
**Problem**: An unhandled JS exception crashes the entire app. On production builds this shows a blank screen.

**Fix** in both `passenger_app/app/_layout.tsx` and `driver_app/app/_layout.tsx`:
```tsx
import * as Sentry from '@sentry/react-native';

// Wrap root layout in error boundary
export default Sentry.wrap(function RootLayout() {
  return <Stack />;
});
```

```bash
npx expo install @sentry/react-native
```

---

## 📋 PHASE-BY-PHASE EXECUTION PLAN

### Phase 1 — Foundation (Week 1-2) — Pre-requisites for any builds
| # | Task | File(s) | Est. Time |
|---|------|---------|-----------|
| 1.1 | Set bundle IDs / package names | `passenger_app/app.json`, `driver_app/app.json` | 30 min |
| 1.2 | Create `eas.json` in both app dirs | new files | 30 min |
| 1.3 | Run `eas init` for both apps | CLI | 30 min |
| 1.4 | Get Google Maps API key (Android) | Google Cloud Console | 1 hr |
| 1.5 | Install expo-location + react-native-maps | both app dirs | 1 hr |
| 1.6 | Replace mock MapView with real one | `src/components/MapView.tsx` × 2 | 4 hr |
| 1.7 | Add location permissions to app.json | both app.json | 1 hr |
| 1.8 | Test Expo Go map rendering (foreground location) | local | 2 hr |

### Phase 2 — Backend Scalability (Week 2-3)
| # | Task | File(s) | Est. Time |
|---|------|---------|-----------|
| 2.1 | Install Redis, add to requirements.txt | `requirements.txt` | 30 min |
| 2.2 | Replace in-memory hub with Redis Pub/Sub | `services/realtime.py` | 4 hr |
| 2.3 | Replace in-memory rate limiter with Redis | `middleware.py` | 2 hr |
| 2.4 | Add Redis URL to config.py | `config.py` | 30 min |
| 2.5 | Create Dockerfile + docker-compose.yml | new files | 2 hr |
| 2.6 | Configure Gunicorn startup command | `Dockerfile`, `server.py` | 1 hr |
| 2.7 | Add MongoDB connection pool settings | `db.py` | 30 min |
| 2.8 | Add Sentry error tracking | `main.py`, requirements | 1 hr |
| 2.9 | Add structured logging (structlog) | `main.py` | 2 hr |
| 2.10 | Deploy to staging server (EC2 / Railway / Render) | DevOps | 4 hr |

### Phase 3 — Store Compliance (Week 3-4)
| # | Task | File(s) | Est. Time |
|---|------|---------|-----------|
| 3.1 | Write privacy policy + host on domain | new HTML | 2 hr |
| 3.2 | Write terms of service + host on domain | new HTML | 2 hr |
| 3.3 | Add delete account endpoint (backend) | `routers/auth.py` | 2 hr |
| 3.4 | Add delete account UI (both apps) | profile screens | 1 hr |
| 3.5 | Add `/delete-account` HTML page (backend) | `main.py` | 30 min |
| 3.6 | Fix Stripe webhook signature verification | `routers/payments.py` | 1 hr |
| 3.7 | Switch Stripe to live mode | `.env` + Stripe dashboard | 1 hr |
| 3.8 | Fix Stripe deep link (scheme registration) | both `app.json` | 1 hr |
| 3.9 | Set Android targetSdkVersion 34 | both `app.json` | 15 min |
| 3.10 | Add iOS privacy manifest | both `app.json` | 30 min |

### Phase 4 — Core Missing Features (Week 4-5)
| # | Task | File(s) | Est. Time |
|---|------|---------|-----------|
| 4.1 | Install expo-notifications, configure FCM | both app dirs | 2 hr |
| 4.2 | Add push token endpoint (backend) | `routers/auth.py` | 1 hr |
| 4.3 | Register push token on app start | `_layout.tsx` × 2 | 1 hr |
| 4.4 | Send push when ride available (backend) | `services/realtime.py` | 2 hr |
| 4.5 | Add background location tracking (driver) | `driver_app` | 3 hr |
| 4.6 | Add address search / geocoding (passenger) | `passenger/home.tsx` | 4 hr |
| 4.7 | Copy missing screens to passenger_app | ride, chat, payment-success | 2 hr |
| 4.8 | Add chat screen to driver_app | `driver/chat/[id].tsx` | 1 hr |
| 4.9 | Fix earnings screen (real acceptance rate) | earnings.tsx + backend | 2 hr |
| 4.10 | Add forgot password flow | backend + both apps | 4 hr |
| 4.11 | Add error boundary + Sentry (mobile apps) | `_layout.tsx` × 2 | 1 hr |

### Phase 5 — Assets & Store Listings (Week 5-6)
| # | Task | File(s) | Est. Time |
|---|------|---------|-----------|
| 5.1 | Design app icon (passenger: blue, driver: yellow) | Design tool | 4 hr |
| 5.2 | Design splash screen for both apps | Design tool | 2 hr |
| 5.3 | Replace placeholder icons/splashes | `assets/images/` × 2 | 1 hr |
| 5.4 | Create store screenshots (10+ per app) | Simulator / real device | 4 hr |
| 5.5 | Create Play Store feature graphic | Design tool | 1 hr |
| 5.6 | Write store descriptions for both apps | copy doc | 2 hr |
| 5.7 | Complete Play Console Data Safety form | Play Console | 1 hr |
| 5.8 | Complete App Store Connect metadata | ASC | 1 hr |
| 5.9 | Complete IARC content rating questionnaire | Both consoles | 30 min |

### Phase 6 — Final Testing & Submission (Week 6-7)
| # | Task | Notes |
|---|------|-------|
| 6.1 | Build EAS production APK/IPA for both apps | `eas build -p all --profile production` |
| 6.2 | Test APK on real Android device | Install via ADB |
| 6.3 | Test IPA on real iPhone via TestFlight | Upload to App Store Connect first |
| 6.4 | Load test backend (500 concurrent users) | Use `locust` or `k6` |
| 6.5 | Security audit (OWASP checklist) | Manual review |
| 6.6 | Submit driver app to Play Store (internal track first) | Play Console |
| 6.7 | Submit passenger app to Play Store | Play Console |
| 6.8 | Submit driver app to App Store (TestFlight) | App Store Connect |
| 6.9 | Submit passenger app to App Store | App Store Connect |

---

## 🔒 Security Checklist (OWASP Top 10)

| Risk | Current Status | Fix |
|------|---------------|-----|
| A01 Broken Access Control | ✅ Good — `require_role()` used | Verify on all endpoints |
| A02 Cryptographic Failures | ⚠️ Stripe webhook unsigned | Implement signature verification (C10) |
| A03 Injection | ✅ Good — Pydantic validates all inputs | No SQL — MongoDB with Motor |
| A04 Insecure Design | ⚠️ Demo credentials in production | Remove demo accounts OR add feature flag |
| A05 Security Misconfiguration | 🔴 CORS allows localhost, HTTP only | Set production CORS + HTTPS (H3, C7) |
| A06 Vulnerable Components | ⚠️ Check `pip-audit` | `pip install pip-audit && pip-audit` |
| A07 Auth Failures | ✅ JWT + bcrypt + refresh token rotation | Strong JWT_SECRET (I5) |
| A08 Software Integrity | ⚠️ No SBOM | Run `pip-audit` + `npm audit` |
| A09 Logging Failures | 🔴 No structured logging | Add structlog + Sentry (H2) |
| A10 SSRF | ✅ No external URL fetching from user input | Check `origin_url` in payments |

**Additional security tasks**:
```bash
# Run these before production launch:
pip install pip-audit
pip-audit  # check Python deps for CVEs

cd passenger_app && npm audit
cd driver_app && npm audit
```

**`origin_url` SSRF check** — add to `backend/app/routers/payments.py`:
```python
from urllib.parse import urlparse

def validate_origin_url(url: str) -> str:
    parsed = urlparse(url)
    allowed_schemes = ("https", "nimbus-passenger", "nimbus-driver", "exp")
    if parsed.scheme not in allowed_schemes:
        raise HTTPException(400, "Invalid origin URL scheme")
    return url
```

---

## ⚡ Scalability: 500 Concurrent Users

### Architecture for 500 users:
```
[Mobile Apps] 
     ↓ HTTPS
[Nginx] ← SSL termination + static files
     ↓
[Gunicorn 4 workers × Uvicorn]  ← API + WebSocket
     ↓
[Redis]        [MongoDB Atlas M10+]
  ↑ pub/sub      ↑ 500 connections
  Rate limit     Connection pooling
  Sessions
```

### Load capacity math:
- 500 users × ~2 WebSocket connections (ride + driver) = 1000 WS connections
- 4 Uvicorn workers × 250 WS each = 1000 capacity ✅
- MongoDB M10 cluster = 1500 connections allowed ✅
- Redis can handle 50,000+ pub/sub ops/sec ✅

### MongoDB indexes to add (missing):
```python
# Add to backend/app/db.py create_indexes()
await db.driver_status.create_index([("location", "2dsphere")])  # geospatial
await db.rides.create_index([("created_at", -1), ("status", 1)])  # common queries
await db.refresh_tokens.create_index("expires_at", expireAfterSeconds=0)  # TTL auto-cleanup
await db.password_reset_tokens.create_index("expires_at", expireAfterSeconds=0)  # TTL
```

### Recommended cloud setup (cheapest production-viable):
| Service | Provider | Cost/month |
|---------|----------|------------|
| Backend API (2 CPU, 4GB) | Railway Starter / Render Starter | $25-35 |
| MongoDB Atlas M10 | MongoDB Atlas | $57 |
| Redis | Upstash (pay-per-use) | $0-10 |
| Domain + SSL | Cloudflare | $10/yr + free SSL |
| **Total** | | **~$100/month** |

---

## 📱 Expo Go vs Production Builds

### What works in Expo Go:
- All UI / navigation
- API calls (HTTP backend)
- WebSocket connections
- Stripe web checkout (opens browser)
- Basic location (`expo-location` foreground)
- Chat, history, profile

### What does NOT work in Expo Go (needs development build):
- Push notifications (`expo-notifications` remote push — Android SDK 53+)
- Background location (driver tracking while app is backgrounded)
- `react-native-maps` with Google Maps provider
- Custom deep link schemes (`nimbus-passenger://`)

### Development build (for Expo Go-like testing with native features):
```bash
# Create development build (installs on physical device, works like Expo Go)
eas build --profile development --platform android
# Install the .apk, then scan QR with your dev server
expo start --dev-client
```

---

## 🗂️ Environment Variables Reference

### Backend `.env` (production):
```env
# Required
MONGO_URL=mongodb+srv://user:pass@cluster.mongodb.net/nimbus?retryWrites=true&w=majority
DB_NAME=nimbus
JWT_SECRET=<64-char-random-hex>
APP_ENV=production

# Optional but important
REDIS_URL=redis://redis:6379/0
STRIPE_API_KEY=sk_live_xxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxx
SENTRY_DSN=https://xxxxx@sentry.io/xxxxx
CORS_ORIGINS=https://yourdomain.com

# Tuning
ACCESS_TTL_MIN=15
REFRESH_TTL_DAYS=14
RATE_LIMIT_WINDOW_SEC=60
RATE_LIMIT_MAX_REQUESTS=120
```

### Mobile apps `.env` (or `app.json` extra):
```env
EXPO_PUBLIC_BACKEND_URL=https://api.yourdomain.com
```

Add to `passenger_app/app.json` and `driver_app/app.json`:
```json
"extra": {
  "eas": { "projectId": "your-eas-project-uuid" },
  "backendUrl": "https://api.yourdomain.com"
}
```

---

## 🧪 Load Testing (Before Production)

Install and run `locust` load test:
```bash
pip install locust
```

Create `backend/tests/locustfile.py`:
```python
from locust import HttpUser, task, between
import json

class RideshareUser(HttpUser):
    wait_time = between(1, 3)
    token = None

    def on_start(self):
        r = self.client.post("/api/auth/login", json={
            "email": "passenger@demo.com",
            "password": "Passenger123!"
        })
        self.token = r.json()["token"]
    
    @task(3)
    def get_nearby_drivers(self):
        self.client.get(
            "/api/drivers/nearby?lat=37.7749&lng=-122.4194",
            headers={"Authorization": f"Bearer {self.token}"}
        )
    
    @task(1)
    def estimate_ride(self):
        self.client.post("/api/rides/estimate", json={
            "pickup_lat": 37.7749, "pickup_lng": -122.4194,
            "dest_lat": 37.7849, "dest_lng": -122.4094
        }, headers={"Authorization": f"Bearer {self.token}"})
```

```bash
# Run load test targeting 500 concurrent users
locust -f backend/tests/locustfile.py --host=http://localhost:8000 \
  --users 500 --spawn-rate 10 --run-time 60s --headless
```

---

## 📝 Summary Checklist

### Blockers (Must fix before store submission):
- [ ] C1 — Real maps + GPS (react-native-maps + expo-location)
- [ ] C2 — Push notifications (expo-notifications)
- [ ] C3 — Bundle IDs / Package names
- [ ] C4 — EAS Build configuration (eas.json)
- [ ] C5 — Redis-based WebSocket hub (multi-worker)
- [ ] C6 — Redis-based rate limiting
- [ ] C7 — HTTPS / SSL on backend
- [ ] C8 — Delete account endpoint + UI
- [ ] C9 — Privacy policy hosted on domain
- [ ] C10 — Stripe live mode + webhook signature verification

### High priority (Strong recommendation before launch):
- [ ] H1 — Gunicorn multi-worker deployment
- [ ] H2 — Sentry error tracking
- [ ] H3 — Production CORS origins
- [ ] H4 — Password reset flow
- [ ] H5 — Email verification
- [ ] H6 — Real address search (Google Places / Mapbox)
- [ ] H7 — Fix Stripe deep link scheme
- [ ] H8 — Custom app icons + splash screens
- [ ] H9 — Android targetSdkVersion 34
- [ ] H10 — MongoDB backup strategy

### Important compliance:
- [ ] I1 — iOS Privacy Manifest
- [ ] I2 — App Store Connect metadata + screenshots
- [ ] I3 — Play Console Data Safety form + screenshots
- [ ] I4 — Terms of Service
- [ ] I5 — Strong JWT_SECRET validation
- [ ] I6 — MongoDB connection pool tuning
- [ ] I7 — Driver app chat screen
- [ ] I8 — Passenger app missing screens (ride, chat, payment-success)
- [ ] I9 — Fix hardcoded earnings data
- [ ] I10 — Error boundary + Sentry (mobile apps)

---

## 💡 Future Enhancements (Post-Launch, From PRD)

These are listed in the PRD as "smart business ideas" — implement after stable v1.0:

1. **Surge pricing** — detect ride/driver ratio per zone, apply multiplier to fare
2. **Ride scheduling** — allow booking 24h in advance
3. **Referral codes** — `POST /auth/register` accepts `referral_code`, credits both users
4. **Driver streak bonuses** — backend cron checks daily completed rides, issues bonus
5. **Multi-currency / localization** — for expansion beyond one market
6. **Driver-to-passenger matching improvement** — use real geospatial queries (MongoDB 2dsphere)
7. **Estimated time of arrival** — integrate Google Maps Directions API for real ETAs
8. **Corporate accounts** — separate billing entity, CSV ride reports
9. **Accessibility** — VoiceOver / TalkBack support, minimum 4.5:1 color contrast

---

*This plan was generated by analyzing all 60+ files in the Nimbus Rideshare codebase. Priority ordering is based on store rejection risk, user-facing functionality, and scalability impact.*
