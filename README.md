# My_new_taxi_App

Production-oriented rideshare platform with:
- Shared FastAPI backend
- Separate Passenger mobile app (`passenger_app/`)
- Separate Driver mobile app (`driver_app/`)

## What Was Upgraded

### 1) Backend modularization
Backend moved from one monolithic file into modular architecture under `backend/app/`:
- `routers/auth.py`
- `routers/rides.py`
- `routers/public.py`
- `routers/driver.py`
- `routers/chat.py`
- `routers/payments.py`
- `routers/ws.py`
- `services/fare.py`
- `services/matching.py`
- `services/state_machine.py`
- `services/realtime.py`
- `security.py`, `deps.py`, `middleware.py`, `db.py`, `config.py`

Entry point remains compatible:
- `backend/server.py` -> imports `app` from `backend/app/main.py`

### 2) Security hardening
Implemented:
- Restricted CORS via `CORS_ORIGINS` env var (no wildcard defaults)
- Access + refresh token strategy
- Refresh token rotation and revocation endpoints
- In-memory rate limiting middleware for auth/write traffic
- Stronger request validation via Pydantic constraints
- Structured error payloads with request ID

Auth endpoints:
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `GET /api/auth/me`

### 3) Realtime channels (WebSocket)
Implemented WebSocket channels:
- `GET WS /ws/rides/{ride_id}?token=...`
- `GET WS /ws/driver/{driver_id}?token=...`

Used for:
- Ride lifecycle updates
- Driver location updates
- Chat message push
- Driver incoming request notifications

### 4) Matching and lifecycle consistency
Implemented:
- Ride state machine transition enforcement (`services/state_machine.py`)
- Reservation-based incoming assignment window for drivers
- Scored candidate selection (distance + waiting fairness)
- Split rating flags:
  - `passenger_rated_driver`
  - `driver_rated_passenger`

### 5) Observability and error handling
Implemented:
- Request ID middleware (`X-Request-ID`)
- Response-time header (`X-Response-Time-Ms`)
- Validation/HTTP/unhandled exception handlers with uniform payload shape
- Replaced key frontend silent catches with logged diagnostics in critical flows

### 6) Local-first deterministic tests
Added deterministic unit/service tests:
- `backend/tests/test_core_services.py`

Updated integration suite behavior:
- `backend/tests/test_rideshare_api.py` now local-first (`BASE_URL`, defaults to `http://127.0.0.1:8000`)
- Auto-skips when local backend is not reachable

### 7) Two separate mobile apps
Created:
- `passenger_app/` (Passenger-only navigation and role lock)
- `driver_app/` (Driver-only navigation and role lock)

Each app:
- Uses same backend API
- Uses same auth/api library structure
- Has role-locked app entry flow
- Isolated route trees (no cross-role route dependency)

## Current Project Layout

```
My_new_taxi_App/
  backend/
    app/
      routers/
      services/
      main.py
      security.py
      deps.py
      middleware.py
      db.py
      config.py
    server.py
    requirements.txt
    tests/
  passenger_app/
  driver_app/
```

## Environment Variables

Backend (`backend/.env`):
- `MONGO_URL`
- `DB_NAME`
- `JWT_SECRET`
- `STRIPE_API_KEY`
- `CORS_ORIGINS` (comma-separated)
- `APP_ENV` (optional)
- `ACCESS_TTL_MIN` (optional)
- `REFRESH_TTL_DAYS` (optional)
- `RATE_LIMIT_WINDOW_SEC` (optional)
- `RATE_LIMIT_MAX_REQUESTS` (optional)

Mobile apps:
- `EXPO_PUBLIC_BACKEND_URL`

## Run Locally

### 1) Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn server:app --reload --host 0.0.0.0 --port 8000
```

### 2) Passenger app

```bash
cd passenger_app
npm install
npx expo start
```

### 3) Driver app

```bash
cd driver_app
npm install
npx expo start
```

## Test

Deterministic core tests:

```bash
cd backend
pytest tests/test_core_services.py -q
```

Local integration tests (requires backend running):

```bash
cd backend
set BASE_URL=http://127.0.0.1:8000
pytest tests/test_rideshare_api.py -q
```

## Notes

- Both `passenger_app/` and `driver_app/` communicate with the same backend and are now separated for production deployment workflows.
