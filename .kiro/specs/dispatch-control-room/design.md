# Design Document: Dispatch Control Room

## Overview

The Dispatch Control Room adds a privileged, web-based operations surface on top of the existing Nimbus rideshare backend (`backend/app/*`). It is designed to be **strictly additive**: every existing endpoint, WebSocket contract, and background process (`services/matching.py`, `routers/driver.py`, `routers/rides.py`, `routers/ws.py`, `services/realtime.py`) keeps its current request/response shape and behavior unchanged. New capability is layered on through:

- A new `dispatcher` value added to the existing `Role` literal in `models.py`.
- A new router, `backend/app/routers/dispatch.py`, exposing REST endpoints under `/api/dispatch/*`, gated by a `require_role("dispatcher")` dependency reused as-is from `deps.py`.
- A new WebSocket endpoint, `/ws/dispatch`, added in `routers/ws.py` alongside the existing `/ws/rides/{ride_id}` and `/ws/driver/{driver_id}` handlers, backed by a new `dispatch:events` Redis pub/sub channel plumbed through the existing `RealtimeHub` in `services/realtime.py`.
- Two new MongoDB collections: `dispatch_action_log` (audit trail) and no new collection for rides — instead, two new optional fields are added to existing ride documents (`assignment_type`, `assigned_by`) to distinguish manual vs. automatic assignment for analytics (Requirement 9.2), written only at the point of assignment, never read or required by existing code paths.
- A new top-level frontend application, `control_room/`, sibling to `passenger_app/` and `driver_app/`, built with Vite + React + TypeScript (not Expo/React Native, per the confirmed delivery approach), authenticating against the existing `/api/auth/login` endpoint.

The central technical risk this design addresses is **race safety**: a pending ride must never be assigned to two drivers at once, regardless of whether the competing actors are the automatic matching poll (`GET /api/driver/incoming`), a driver's own accept call (`POST /api/rides/{ride_id}/accept`), or a dispatcher's manual assignment. The design resolves this by having manual assignment and reassignment reuse the **exact same atomic conditional-update pattern** already used in `driver.py`, rather than introducing a parallel locking mechanism.

## Architecture

```mermaid
graph TB
    subgraph Existing Apps
        PA[passenger_app]
        DA[driver_app]
    end

    subgraph New
        CR[control_room web app]
    end

    subgraph FastAPI Backend
        AUTH[routers/auth.py]
        RIDES[routers/rides.py]
        DRIVER[routers/driver.py]
        WS[routers/ws.py]
        DISPATCH[routers/dispatch.py - NEW]
        HUB[services/realtime.py RealtimeHub]
        SM[services/state_machine.py]
        MATCH[services/matching.py]
    end

    subgraph Storage
        MONGO[(MongoDB)]
        REDIS[(Redis pub/sub)]
    end

    PA -->|/api/rides/*| RIDES
    PA -->|/ws/rides/{id}| WS
    DA -->|/api/driver/*, /api/rides/*/accept| DRIVER
    DA -->|/ws/driver/{id}| WS
    CR -->|/api/auth/login| AUTH
    CR -->|/api/dispatch/*| DISPATCH
    CR -->|/ws/dispatch| WS

    RIDES --> MONGO
    DRIVER --> MONGO
    DISPATCH --> MONGO
    DRIVER --> SM
    RIDES --> SM
    DISPATCH --> SM
    DRIVER --> MATCH

    RIDES -->|publish_ride| HUB
    DRIVER -->|publish_ride/publish_driver| HUB
    DISPATCH -->|publish_ride/publish_driver + publish_dispatch NEW| HUB
    HUB <--> REDIS
    HUB --> WS
```

Key architectural decisions:

1. **Reuse, don't replace, the reservation mechanism.** `reserved_by` / `reserved_until` on the ride document remain the single source of truth for "who has a hold on this pending ride." Dispatch adds a second *writer* to those fields using the identical conditional-update shape, not a new mechanism.
2. **Reuse, don't replace, the realtime hub.** `RealtimeHub` already knows how to fan out over Redis when available and fall back to local broadcast otherwise. Dispatch gets its own logical channel (`dispatch:events`) and its own in-memory connection set, following the same `connect_X` / `_local_broadcast_X` / `publish_X` shape as the existing `ride` and `driver` channels.
3. **Additive fan-out at existing call sites.** Every place that already calls `hub.publish_ride(...)` or `hub.publish_driver(...)` gets one extra line calling `hub.publish_dispatch(...)` with an analogous payload. The existing call, its arguments, and its behavior are untouched; the new call is purely additional and failure-isolated (a dispatch publish failure must not affect the existing publish).
4. **New router, new collection, new frontend app — no existing file is restructured.** The only existing backend files touched are `models.py` (add literal value), `main.py` (register new router), `db.py` (add index creation for the new collection), and the handful of existing router files that get one additional fan-out line each (see Non-Interference Verification).

## Components and Interfaces

### 1. `models.py` — Role literal extension

```python
Role = Literal["passenger", "driver", "dispatcher"]
```

No other model in `models.py` changes. `RegisterIn.role: Role` will now type-accept `"dispatcher"`, so the register endpoint must explicitly reject it (Requirement 1.8) — this is an explicit check added to `routers/auth.py`'s `register` handler, not a model-level restriction, since Pydantic's `Literal` type has no way to exclude one value only at that one call site. A new `DispatcherCreateIn` model is added for the dispatcher-provisioning endpoint (see below); it deliberately does not use `RegisterIn`, so no shared model is affected.

### 2. `backend/app/routers/dispatch.py` (new)

Mounted with `prefix="/api/dispatch"`, `tags=["dispatch"]`. Every route depends on `require_role("dispatcher")` from `deps.py` (imported, not modified).

| Method & Path | Purpose | Requirement |
|---|---|---|
| `POST /api/dispatch/accounts` | Create a new dispatcher account (dispatcher-only, records creator) | 1.9, 1.10 |
| `GET /api/dispatch/rides/pending` | List pending ride requests with reservation state | 2.1, 2.4 |
| `GET /api/dispatch/drivers` | List online drivers with roster info | 3.1 |
| `POST /api/dispatch/rides/{ride_id}/assign` | Manual assignment: reserve ride for a driver | 4.1–4.3, 4.7 |
| `GET /api/dispatch/rides/active` | List active rides (accepted/arrived/in_progress) | 5.1 |
| `POST /api/dispatch/rides/{ride_id}/cancel` | Force-cancel an active ride | 5.3, 5.6 |
| `POST /api/dispatch/rides/{ride_id}/reassign` | Reassign an active ride to a new driver | 5.4, 5.5, 5.6 |
| `GET /api/dispatch/audit-log` | Query the audit log, filterable | 8.2 |
| `GET /api/dispatch/analytics/volume` | Ride volume by day and ride type | 9.1 |
| `GET /api/dispatch/analytics/wait-times` | Avg/p95 wait time, split by assignment type | 9.2 |
| `GET /api/dispatch/analytics/performance` | Per-dispatcher action counts | 9.3 |

All handlers import `db` from `..db`, `hub` from `..services.realtime`, `assert_transition` from `..services.state_machine`, `require_role`/`get_current_user` from `..deps`, and `clean_doc`/`iso_now`/`now_utc`/`haversine_km` from `..utils` — the same imports already used by `rides.py` and `driver.py`. No new database access layer is introduced.

### 3. `backend/app/routers/ws.py` — `/ws/dispatch` extension

A new handler is appended to the existing file (existing `ws_ride` and `ws_driver` handlers are untouched):

```python
@router.websocket("/ws/dispatch")
async def ws_dispatch(websocket: WebSocket):
    try:
        token = _token_from_query(websocket)
        payload = decode_access_token(token)
        if payload.get("role") != "dispatcher":
            await websocket.close(code=4403)
            return
        await hub.connect_dispatch(websocket)
        await websocket.send_json({"event": "connected", "channel": "dispatch"})
        while True:
            await websocket.receive_text()
    except (ValueError, KeyError):
        await websocket.close(code=4401)
    except WebSocketDisconnect:
        hub.disconnect_dispatch(websocket)
    except Exception:
        hub.disconnect_dispatch(websocket)
```

This mirrors `ws_driver` exactly, substituting the role check (`payload.get("role") != "dispatcher"`) for the identity check (`payload.get("sub") != driver_id`) since there is no per-resource ID in the path — any authenticated dispatcher may connect to the single shared dispatch channel. Note the role claim is already embedded in the JWT payload by `create_access_token(user_id, role)` in `security.py`, so no extra DB lookup is required to enforce Requirement 1.5, though a DB lookup is still performed downstream by REST endpoints via `get_current_user`/`require_role` for defense in depth (a token's role claim is trusted for the fast WS-connect check, consistent with how `ws_driver`/`ws_ride` already trust the `sub` claim without a fresh DB read).

### 4. `services/realtime.py` — `RealtimeHub` extension

New module-level state and methods, added alongside the existing `_ride_channels`/`_driver_channels`:

```python
_dispatch_channel: Set[WebSocket] = set()
```

New `RealtimeHub` methods (added to the existing class, existing methods unchanged):

- `connect_dispatch(ws)` — `await ws.accept()`; add to `_dispatch_channel`.
- `disconnect_dispatch(ws)` — discard from `_dispatch_channel`.
- `publish_dispatch(payload: dict)` — same shape as `publish_ride`/`publish_driver`: publish to Redis channel `"dispatch:events"` if available, else `_local_broadcast_dispatch`.
- `_local_broadcast_dispatch(message: str)` — iterate `_dispatch_channel`, `send_text`, catch per-connection exceptions and discard dead sockets (identical resilience pattern to `_local_broadcast_ride`/`_local_broadcast_driver`, satisfying Requirement 3.3).

`redis_subscriber()` gains one more `psubscribe` pattern, `"dispatch:events"`, and one more `elif channel.startswith("dispatch:")` branch that calls `_local_broadcast_dispatch`. The existing `"ride:*"` / `"driver:*"` subscriptions and branches are unchanged.

**Fan-out call sites (additive only).** Every existing call to `hub.publish_ride(...)` or `hub.publish_driver(...)` in `rides.py` and `driver.py` gets exactly one additional line immediately after it, calling `hub.publish_dispatch(...)` with an event name in the `ride.*` / `driver.*` namespace described below. The existing call's arguments and position are not changed. Example (in `rides.py`, `request_ride`):

```python
await hub.publish_ride(ride_id, {"event": "ride.created", "ride": clean_doc(ride)})
await hub.publish_dispatch({"event": "ride.created", "ride": clean_doc(ride)})   # NEW, additive
```

To keep this systematic rather than ad hoc, a tiny helper is added to `dispatch.py` (not to `realtime.py`, to avoid touching the existing module's public surface beyond the four additions above) — actually, since the fan-out lines live *inside* `rides.py`/`driver.py`, no helper module is needed; the payload is simply the same `clean_doc(...)` dict already computed for the primary publish call, so the additional line is a one-liner with no new computation.

| Trigger (existing code location) | Existing publish (unchanged) | New dispatch fan-out event |
|---|---|---|
| `rides.py: request_ride` | `hub.publish_ride(ride_id, {"event":"ride.created", ...})` | `ride.created` |
| `driver.py: accept_ride` | `hub.publish_ride(ride_id, {"event":"ride.accepted", ...})` | `ride.updated` (status: pending→accepted) |
| `rides.py: cancel_ride` | `hub.publish_ride(ride_id, {"event":"ride.cancelled", ...})` | `ride.updated` (status: →cancelled) |
| `driver.py: arrive_ride` | `hub.publish_ride(ride_id, {"event":"ride.arrived"})` | `ride.updated` (status: →arrived) |
| `driver.py: start_ride` | `hub.publish_ride(ride_id, {"event":"ride.started"})` | `ride.updated` (status: →in_progress) |
| `driver.py: complete_ride` | `hub.publish_ride(ride_id, {"event":"ride.completed", ...})` | `ride.updated` (status: →completed) |
| `driver.py: driver_status` | `hub.publish_driver(user["id"], {"event":"driver.status", ...})` | `driver.status` |
| `driver.py: update_driver_location` | `hub.publish_ride(active["id"], {"event":"driver.location", ...})` | `driver.location` |
| `dispatch.py: assign_ride` (new) | n/a | `ride.assigned` |
| `dispatch.py: force_cancel` (new) | n/a (calls the same update+publish shape as `cancel_ride`) | `ride.updated` (status: →cancelled) + audit |
| `dispatch.py: reassign` (new) | n/a | `ride.reassigned` |

`ride.created` and the `ride.updated` variants together satisfy Requirement 2.2 (new pending request pushed) and 2.3 (ride leaving pending pushed) without any change to `rides.py`/`driver.py` beyond the one additive line per site.

### 5. Reservation coordination — exact Mongo shape reused

`driver.py`'s existing reservation pattern (`GET /api/driver/incoming`) is:

```python
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
    {"$set": {"reserved_by": user["id"], "reserved_until": reserve_iso, "updated_at": iso_now()}},
)
if res.modified_count == 0:
    return {"request": None}
```

**Manual assignment (`POST /api/dispatch/rides/{ride_id}/assign`) uses the identical filter shape**, substituting the dispatcher-selected `driver_id` for `user["id"]`:

```python
reserve_iso = (now_utc() + timedelta(seconds=RESERVATION_SEC)).isoformat()
res = await db.rides.update_one(
    {
        "id": ride_id,
        "status": "pending",
        "$or": [
            {"reserved_until": {"$lt": iso_now()}},
            {"reserved_until": {"$exists": False}},
            {"reserved_by": None},
        ],
    },
    {"$set": {
        "reserved_by": driver_id,
        "reserved_until": reserve_iso,
        "assignment_type": "manual",
        "assigned_by": dispatcher["id"],
        "updated_at": iso_now(),
    }},
)
if res.modified_count == 0:
    raise HTTPException(status_code=409, detail="Ride is no longer available")
```

Because MongoDB's `update_one` with a filter+set is atomic at the document level, this is the same guarantee `driver.py` already relies on: whichever caller's `update_one` call is the one whose filter matches at the instant Mongo evaluates it wins, and every other concurrent caller (another dispatcher's `assign`, or the automatic-matching poll racing on the same ride) necessarily sees `modified_count == 0` and fails cleanly. No new locking primitive, distributed lock, or transaction is introduced — this directly satisfies Requirement 4.1's instruction to use "the same atomic, conditional update pattern," and Requirement 6.1's exactly-one-winner guarantee.

The two new fields `assignment_type` (`"manual" | "automatic"`) and `assigned_by` (dispatcher user id, or `None` for automatic) are set only by this new code path and by the acceptance path (see below); `driver.py`'s `accept_ride` continues to work exactly as before and simply inherits whatever `assignment_type`/`assigned_by` were already stamped onto the document by the reservation step (manual assignment stamps them at reservation time so they are already present when `accept_ride`'s conditional update — unmodified — later flips `status` to `accepted`). For rides reserved by the automatic flow (`driver_incoming`), `assignment_type` defaults to `"automatic"` and `assigned_by` to `None`; this requires one additive `"assignment_type": "automatic"` key added to `driver_incoming`'s existing `$set` clause, which does not change that endpoint's response shape or behavior, only enriches the stored document for later analytics (Requirement 9.2).

**Reassignment (`POST /api/dispatch/rides/{ride_id}/reassign`)** composes two atomic steps against an *active* ride (not pending):

1. Release: `update_one({"id": ride_id, "status": {"$in": ["accepted","arrived","in_progress"]}, "driver_id": current_driver_id}, {"$set": {"status": "pending", "driver_id": None, "reserved_by": new_driver_id, "reserved_until": reserve_iso, "assignment_type": "manual", "assigned_by": dispatcher["id"], "updated_at": iso_now()}})`. This single atomic update both releases the ride back toward pending and immediately re-reserves it for the new driver in the same document write, so there is no window where the ride is pending-and-unreserved (which would let the automatic matcher or another dispatcher grab it away from the intended reassignment target).
2. If step 1's `modified_count == 0` (ride was concurrently changed, e.g. driver already completed/cancelled it), reassignment fails with 409 and no further action is taken.
3. If step 1 succeeds but the caller wants to double-check driver eligibility (online, no other active ride) — that check is performed *before* step 1 as a normal read, same as `assign_ride`'s pre-check; because the actual reservation is still guarded by the atomic update, a stale read cannot cause a double-assignment, only a false rejection in the rare case the driver became busy between the read and the write, in which case Requirement 5.5's fallback path applies: the endpoint re-attempts to atomically transition the ride straight to `cancelled` (`update_one({"id": ride_id, "status": {"$in": [...]}}, {"$set": {"status": "cancelled", ...}})`), publishes `ride.cancelled` via the existing `hub.publish_ride`, and writes two audit log entries (`reassign_failed`, `force_cancel`).

**Force-cancel (`POST /api/dispatch/rides/{ride_id}/cancel`)** reuses the exact update shape of `rides.py: cancel_ride`, adding the current status to the filter so a concurrent force-cancel/reassign race (Requirement 6.3) also resolves via `modified_count`:

```python
ride = await db.rides.find_one({"id": ride_id})
if not ride: raise HTTPException(404, ...)
if ride["status"] in ("completed", "cancelled"):
    raise HTTPException(409, "Ride is no longer active")
assert_transition(ride["status"], "cancelled")   # reused, unmodified
res = await db.rides.update_one(
    {"id": ride_id, "status": ride["status"]},
    {"$set": {"status": "cancelled", "updated_at": iso_now()}},
)
if res.modified_count == 0:
    raise HTTPException(409, "Ride state already changed")
```

The `{"id": ride_id, "status": ride["status"]}` filter is the mechanism that makes two concurrent interventions (both force-cancel, or force-cancel vs. reassign's release step) resolve to exactly one winner: both operations condition their write on the ride still being in the status they last observed, so the second writer's `update_one` matches zero documents once the first writer's update has landed.

### 6. Frontend: `control_room/` web application

**Stack.** Vite + React + TypeScript. This is a plain browser-targeted SPA, not Expo/React Native — appropriate since the requirements explicitly call for a desktop-browser dashboard distinct from `passenger_app/`/`driver_app/`, and Vite/React is the lightest-weight standard choice for a data-table/dashboard-heavy admin UI (fast dev server, no native build tooling needed, easy to deploy as static assets behind the same reverse proxy as the API).

**Location.** New top-level directory `control_room/`, sibling to `passenger_app/` and `driver_app/`, with its own `package.json`, independent of both existing app builds. It talks to the same backend, configured via an env var (e.g. `VITE_API_BASE_URL`), added to `.env.example` alongside the existing backend variables — no existing app's env configuration is touched.

**Auth flow.** Reuses `POST /api/auth/login` exactly as the existing apps do (`{email, password}` → `{access_token, refresh_token, user}`), storing tokens in memory + `localStorage` (browser-appropriate; existing apps use device-appropriate storage such as `SecureStore`/`AsyncStorage`, which the control room does not need to touch). After login, the `user.role` field (unchanged shape) is checked client-side to confirm `"dispatcher"` before rendering the dashboard shell; the real enforcement is server-side (`require_role("dispatcher")`), this is only a UX guard. Token refresh reuses `POST /api/auth/refresh` the same way the existing apps do.

**WebSocket client.** A thin wrapper opens `wss://.../ws/dispatch?token={access_token}`, mirroring the query-param token pattern already used by `passenger_app`/`driver_app` for `/ws/rides/{id}` and `/ws/driver/{id}` (see `_token_from_query` in `ws.py`). Incoming `{"event": ..., ...}` messages are dispatched into a small client-side event bus that individual views subscribe to (pending list, active list, roster), so a single socket connection feeds all views — consistent with the single shared `/ws/dispatch` channel design.

**Key views/components:**

| View | Responsibility |
|---|---|
| `LoginView` | Calls `/api/auth/login`; redirects to dashboard on dispatcher-role success. |
| `PendingRequestsTable` | Renders `GET /api/dispatch/rides/pending`; live-updates from `ride.created`/`ride.updated` dispatch events; supports type filter, wait-time/distance sort, name/address search (Property 9); visually flags aging requests (Property 15) and shows reservation holder/mechanism (dispatcher name or "automatic") per Requirement 6.2. |
| `DriverRosterView` | Renders `GET /api/dispatch/drivers` as a list (a full map view is a reasonable v1.1 enhancement, not required by the acceptance criteria, which only ask for location/vehicle/rating/active-ride-flag data); live-updates from `driver.status`/`driver.location` events; distinguishes free vs. busy drivers; supports name/plate search. |
| `ActiveRidesTable` | Renders `GET /api/dispatch/rides/active`; live-updates from `ride.updated` events; exposes force-cancel and reassign actions per row. |
| `ManualAssignModal` | Given a selected pending ride and a selected online/free driver, calls `POST /api/dispatch/rides/{id}/assign`; surfaces 409 "no longer available" responses inline. |
| `ReassignModal` | Given a selected active ride and a new driver, calls `POST /api/dispatch/rides/{id}/reassign`; surfaces the auto-cancel outcome (Requirement 5.5) distinctly from a plain error. |
| `AuditLogView` | Renders `GET /api/dispatch/audit-log` with date-range and dispatcher filters (Property 10). |
| `AnalyticsDashboard` | Renders the three `/api/dispatch/analytics/*` endpoints as charts/tables (volume by day/type, wait-time avg/p95 split by assignment type, per-dispatcher action counts). |
| `DispatcherAccountsView` | Admin-facing form calling `POST /api/dispatch/accounts` to provision new dispatcher accounts (Requirement 1.9/1.10). |
| `NewRequestAlert` | Toast/banner triggered on `ride.created` dispatch events while connected (Requirement 10.1) — purely client-side UI, not backend-testable. |

## Data Models

### `models.py` additions

```python
Role = Literal["passenger", "driver", "dispatcher"]

class DispatcherCreateIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    name: str = Field(min_length=2, max_length=80)

class ManualAssignIn(BaseModel):
    driver_id: str = Field(min_length=1, max_length=80)

class ReassignIn(BaseModel):
    driver_id: str = Field(min_length=1, max_length=80)

class ForceCancelIn(BaseModel):
    reason: Optional[str] = Field(default="", max_length=300)

class AuditLogQueryIn(BaseModel):
    start: Optional[str] = None   # ISO date
    end: Optional[str] = None     # ISO date
    dispatcher_id: Optional[str] = None

class AnalyticsRangeIn(BaseModel):
    start: str   # ISO date
    end: str     # ISO date
```

These are new classes appended to the existing `models.py`; no existing class (`RegisterIn`, `LoginIn`, `RideRequestIn`, etc.) is modified.

### Ride document — additive fields

Existing ride documents (`db.rides`) gain two optional fields, set at reservation/assignment time, read only by dispatch analytics and dispatch list endpoints:

| Field | Type | Set by | Notes |
|---|---|---|---|
| `assignment_type` | `"automatic" \| "manual"` | `driver_incoming` (automatic), `dispatch.assign_ride`/`reassign` (manual) | Absent on legacy documents created before this feature ships; treated as `"automatic"` when absent for analytics purposes. |
| `assigned_by` | `str \| None` (dispatcher user id) | `dispatch.assign_ride`/`reassign` | `None` for automatic assignment. |

No existing field is renamed, retyped, or removed. `accept_ride`, `arrive_ride`, `start_ride`, `complete_ride`, `cancel_ride` read/write the same fields they always have; they simply pass these two extra fields through untouched since MongoDB updates are field-scoped (`$set` only touches the keys named).

### New collection: `dispatch_action_log`

```python
{
    "id": str,                # uuid4
    "dispatcher_id": str,      # acting dispatcher's user id
    "dispatcher_name": str,    # denormalized for fast audit-log display
    "action": str,             # "manual_assign" | "force_cancel" | "reassign" | "reassign_failed" | "create_dispatcher"
    "ride_id": Optional[str],
    "driver_id": Optional[str],       # target driver, when applicable
    "previous_driver_id": Optional[str],  # for reassign
    "detail": dict,            # free-form extra context (e.g. reason, error)
    "created_at": str,         # iso_now()
}
```

Indexes (added in `db.py: startup_indexes`, additive):

```python
await db.dispatch_action_log.create_index("id", unique=True)
await db.dispatch_action_log.create_index([("created_at", -1)])
await db.dispatch_action_log.create_index([("dispatcher_id", 1), ("created_at", -1)])
await db.dispatch_action_log.create_index([("action", 1), ("created_at", -1)])
```

An additional supporting index on `rides` is added to speed up analytics grouping by assignment type and date range, additive alongside the existing ride indexes:

```python
await db.rides.create_index([("assignment_type", 1), ("created_at", 1)])
```

No existing index is dropped or altered.

### Dispatcher account documents

Dispatcher accounts are stored in the existing `db.users` collection with `role: "dispatcher"`, using the same document shape as passenger/driver users (`id`, `email`, `password_hash`, `name`, `role`, `phone`, `rating`, `num_ratings`, `created_at`), plus one additive field:

| Field | Type | Notes |
|---|---|---|
| `created_by` | `Optional[str]` | id of the dispatcher who created this account; `None` for any seed/bootstrap dispatcher created outside the API. |

This reuses `db.users` rather than introducing a separate collection, consistent with how `passenger`/`driver` share the same collection today, differentiated only by `role`.

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

**Property reflection.** The prework identified many properties with the same underlying shape:

- Role-gate rejection (1.2, and the authorization half of 1.5/1.9) all reduce to one property about `require_role("dispatcher")`/the WS role check rejecting any non-dispatcher role — consolidated into **Property 1**.
- "An event is published to the dispatch channel when X happens" (2.2, 2.3, 3.2, 3.4, 4.6, 5.2) all reduce to one property about the additive fan-out wrapper being invoked alongside every existing `publish_ride`/`publish_driver` call and reflecting the ride/driver's new state — consolidated into **Property 5**.
- List/projection properties (2.1, 3.1, 5.1) all reduce to one property about status-filtered projections including the required fields — consolidated into **Property 4**.
- Search/filter pure-function properties (2.5, 2.6, 3.6) consolidate into **Property 9** (one property parameterized over field/query).
- The reservation race property (4.1, 6.1) and the state-transition race property (5.3's conflict half, 6.3) are two distinct underlying mechanisms (conditional `update_one` on a reservation field vs. on a status field) and are kept as separate properties, **Property 2** and **Property 7**.
- Audit logging (4.7, 5.3's log half, 5.4's log half, 5.5's two-entry log half, 8.1) consolidate into one property about every dispatcher action producing a matching log entry — **Property 8**.
- 4.5 and 4.8 both reduce to "an expired or absent reservation does not block consideration," already the existing `can_consider`/accept-filter behavior extended with dispatcher-created reservations — consolidated into **Property 3**.

### Property 1: Dispatcher-only authorization

*For any* user whose role is not `"dispatcher"` (including `"passenger"`, `"driver"`, and arbitrary other role-like strings), and for any Dispatch_API request or `/ws/dispatch` connection attempt authenticated as that user, the system SHALL reject the request or connection (403 for REST, immediate close for WebSocket) without performing the requested action or streaming any ride/driver data. Conversely, for any user whose role is `"dispatcher"`, the request SHALL be permitted to proceed to its handler logic.

**Validates: Requirements 1.2, 1.4, 1.5, 1.9**

### Property 2: Manual assignment reservation is race-safe and exclusive

*For any* pending ride and *for any* set of N ≥ 1 concurrent attempts to reserve it — where each attempt is one of: a manual assignment by a dispatcher, the automatic-matching reservation step (`driver_incoming`), or another manual assignment by a different dispatcher — exactly one attempt SHALL succeed in setting `reserved_by`/`reserved_until` (and, for manual attempts, `assignment_type`/`assigned_by`), and every other attempt SHALL observe `modified_count == 0` and fail without modifying the ride document in any way (no partial writes).

**Validates: Requirements 4.1, 4.2, 6.1**

### Property 3: Expired or absent reservations never block consideration

*For any* ride whose `reserved_until` is either absent, `null`/`reserved_by = None`, or in the past relative to the current time, the ride SHALL be treated as available for reservation by both the automatic-matching flow (`can_consider`) and a new manual assignment attempt, regardless of whether the expired reservation was originally created manually or automatically.

**Validates: Requirements 4.5, 4.8**

### Property 4: Status-filtered list projections are correct and complete

*For any* set of ride documents with randomly generated statuses and fields, the pending-list endpoint (`GET /api/dispatch/rides/pending`) SHALL return exactly the subset with `status == "pending"`, each including passenger name, pickup/destination, ride type, fare, elapsed wait time, and reservation state (holder + expiry, when present); and the active-list endpoint (`GET /api/dispatch/rides/active`) SHALL return exactly the subset with `status` in `{accepted, arrived, in_progress}`, each including passenger, driver, status, and driver location. *For any* set of driver_status documents, the roster endpoint (`GET /api/dispatch/drivers`) SHALL return exactly the subset with `online == true`, each including location, vehicle type, rating, and active-ride flag.

**Validates: Requirements 2.1, 2.4, 3.1, 5.1**

### Property 5: Every ride/driver state change fans out a dispatch event

*For any* ride creation, ride status transition, driver status change, or driver location update handled by the existing `rides.py`/`driver.py` endpoints, or by the new `dispatch.py` endpoints, a corresponding event SHALL be published on the `dispatch:events` channel whose payload reflects the new state (ride id/status or driver id/status/location), in addition to — and without altering — the existing `publish_ride`/`publish_driver` call for that same state change.

**Validates: Requirements 2.2, 2.3, 3.2, 3.4, 4.6, 5.2**

### Property 6: Local broadcast isolates per-connection failures

*For any* set of connected dispatch WebSocket sessions where an arbitrary non-empty subset raise an exception on `send_text`, `_local_broadcast_dispatch` SHALL still deliver the message to every connection not in that subset, SHALL remove the failing connections from the channel's connection set, and SHALL NOT raise an exception out of the broadcast call.

**Validates: Requirements 3.3**

### Property 7: Active-ride state transitions are race-safe and exclusive

*For any* active ride and *for any* set of N ≥ 2 concurrent intervention attempts on it — where each attempt is a force-cancel or a reassign (same action repeated, or different actions mixed) — exactly one attempt SHALL succeed in transitioning the ride's status, and every other attempt SHALL observe `modified_count == 0` on its conditional update and be rejected with a 409-style response indicating the ride state already changed, without corrupting the ride document.

**Validates: Requirements 5.3, 5.5, 5.6, 6.3**

### Property 8: Every successful and failed dispatcher action is audit-logged

*For any* dispatcher action — manual assignment, force-cancel, reassignment (success or failure path), or dispatcher-account creation — attempted by any dispatcher against any ride/driver/account, a `dispatch_action_log` entry SHALL be created containing the acting dispatcher's id, the affected ride id (when applicable), the action type, and a timestamp; for a reassignment whose new reservation fails and triggers auto-cancellation, exactly two entries SHALL be created (`reassign_failed` and `force_cancel`).

**Validates: Requirements 1.10, 4.7, 5.3, 5.4, 5.5, 8.1**

### Property 9: Search and filter predicates are correct

*For any* set of pending rides and any substring query, the pending-request search SHALL return exactly those rides whose passenger name or pickup address contains the query (case-insensitive). *For any* set of online drivers and any substring query, the driver search SHALL return exactly those drivers whose name or vehicle plate contains the query (case-insensitive). *For any* set of rides and a `ride_type` filter, the filtered pending list SHALL contain exactly the rides matching that type, sorted consistently by wait time or by pickup distance from a given point when that sort is requested.

**Validates: Requirements 2.5, 2.6, 3.6**

### Property 10: Audit log query filtering is correct

*For any* set of `dispatch_action_log` entries and any combination of a date range and a `dispatcher_id` filter, the audit-log query endpoint SHALL return exactly the entries whose `created_at` falls within the range (inclusive) and whose `dispatcher_id` matches the filter when one is supplied.

**Validates: Requirements 8.2**

### Property 11: Ride volume analytics match a reference aggregation

*For any* set of ride documents with randomly generated `created_at` timestamps and `ride_type` values, the ride-volume analytics endpoint's grouped counts (by day and ride type) SHALL exactly match the counts produced by a straightforward reference implementation (Python `groupby` over the same input) restricted to the requested date range.

**Validates: Requirements 9.1**

### Property 12: Wait-time analytics match a reference computation, split by assignment type

*For any* set of rides with randomly generated `created_at`, driver-acceptance timestamps, and `assignment_type` (`"automatic"`/`"manual"`), the wait-time analytics endpoint's average and 95th-percentile elapsed times, computed separately per `assignment_type`, SHALL exactly match a reference implementation computed directly over the same input data.

**Validates: Requirements 9.2**

### Property 13: Dispatcher performance analytics match a reference aggregation

*For any* set of randomly generated `dispatch_action_log` entries across multiple dispatchers and action types, the dispatcher-performance analytics endpoint's per-dispatcher, per-action-type counts for a given date range SHALL exactly match a reference `groupby` computation over the same entries restricted to that range.

**Validates: Requirements 9.3**

### Property 14: Register endpoint rejects the dispatcher role

*For any* otherwise-valid registration payload with `role` set to `"dispatcher"`, `POST /api/auth/register` SHALL reject the request (400/403) and SHALL NOT create a user document, regardless of the values of the other fields (email, password, name, phone).

**Validates: Requirements 1.8**

### Property 15: Aging predicate is a pure function of wait time and reservation state

*For any* pending ride and any configured aging threshold, the aging predicate SHALL return true if and only if the elapsed time since `created_at` is greater than or equal to the threshold AND the ride is not currently validly reserved or assigned.

**Validates: Requirements 10.2**

## Error Handling

All new endpoints follow the existing global exception-handling pattern already registered in `main.py` (`http_exception_handler`, `validation_exception_handler`, `unhandled_exception_handler`) — no new exception handler is added. Handlers raise `fastapi.HTTPException` with the same status/detail shape used throughout `rides.py`/`driver.py`.

| Scenario | Status | Detail message |
|---|---|---|
| Missing/invalid access token on `/api/dispatch/*` | 401 | `"Not authenticated"` / `"Invalid token"` (unchanged, from `security.py`/`deps.py`) |
| Authenticated but role != `dispatcher` | 403 | `"Requires dispatcher role"` (unchanged message format from `require_role`) |
| `/ws/dispatch` opened without valid dispatcher token | WS close code 4401 (bad/missing token) or 4403 (wrong role) | mirrors existing `ws_driver`/`ws_ride` close codes |
| Manual assignment: ride not pending or already reserved | 409 | `"Ride is no longer available"` |
| Manual assignment: target driver not online or already has an active ride | 400 | `"Selected driver is not available"` |
| Force-cancel/reassign on `completed`/`cancelled` ride | 409 | `"Ride is no longer active"` |
| Force-cancel/reassign loses a state-transition race | 409 | `"Ride state has already changed"` |
| Reassign: new reservation fails after release (Requirement 5.5) | 200 with `{"cancelled": true, "reason": "reassignment_failed"}` — the ride ends up cancelled as designed, not an error from the dispatcher's perspective, but the audit log records the failure | n/a |
| `POST /api/auth/register` with `role: "dispatcher"` | 400 | `"dispatcher accounts cannot self-register"` |
| Dispatcher-account creation with duplicate email | 400 | `"Email already registered"` (reuses existing check pattern from `auth.py`'s `register`) |
| Analytics endpoints with invalid/missing date range | 422 | handled automatically by Pydantic validation on `AnalyticsRangeIn` (existing `validation_exception_handler`) |

All 409 responses represent "the race was lost, not a client error" — consistent with Requirement 6's intent that losers get a clear, actionable message rather than a generic 400/500. Every conditional `update_one` that can return `modified_count == 0` due to a race is followed by exactly one `HTTPException(409, ...)`, never a silent no-op or a 500.

## Testing Strategy

**Dual approach.** Unit/example tests cover specific scenarios, regression of existing behavior, and error paths. Property-based tests (PBT) cover the universal correctness properties above, especially the race-prevention logic, which is the highest-risk part of this feature.

**PBT applicability.** This feature is a strong fit for PBT: the reservation/reassignment/cancellation logic is pure conditional-update logic over ride documents with a large, well-defined input space (statuses, timestamps, reservation fields), and the race-prevention properties are exactly the kind of "for all inputs / for all interleavings" statement PBT is built for. The Control_Room frontend itself (React views, tables, maps) is UI and is explicitly out of scope for PBT — those get example-based/snapshot tests instead.

**Library.** The backend already uses `pytest` (see `requirements.txt`, `backend/tests/`). Add `hypothesis>=6.100.0` (pinned) as a property-based testing library for Python — it is the standard choice for this ecosystem and integrates directly with `pytest`. No property-based testing is implemented from scratch.

**Test environment.** Existing tests (`test_core_services.py`, `test_rideshare_api.py`) run against the real `motor`/MongoDB driver per `db.py`. New property tests for the race-prevention properties (Property 2, Property 7) run against a real (test) MongoDB instance — or `mongomock`-async if already available in the environment — and use `asyncio.gather` to fire concurrent `update_one` calls, asserting on the aggregate `modified_count` values across all attempts rather than on timing. This validates the atomicity guarantee that MongoDB itself provides at the single-document level, matching how the existing `driver_incoming`/`accept_ride` race safety already relies on that guarantee.

**Configuration.** Each property test runs a minimum of 100 iterations (Hypothesis default `max_examples=100` or higher via `@settings(max_examples=100)`), and each is tagged with a comment referencing its design property, e.g.:

```python
# Feature: dispatch-control-room, Property 2: Manual assignment reservation is race-safe and exclusive
@settings(max_examples=100)
@given(...)
async def test_manual_assignment_race_exclusive(...):
    ...
```

**Property → test mapping** (one property-based test per property):

| Property | Test focus |
|---|---|
| 1 | Generate random role strings (including `"dispatcher"`); assert `require_role("dispatcher")` and the `/ws/dispatch` role check accept only `"dispatcher"`. |
| 2 | Generate N concurrent reservation attempts (mix of manual/automatic) against one pending ride; assert exactly one `modified_count == 1`. |
| 3 | Generate random `reserved_until` values (past/absent/future) and assert `can_consider`/manual-assign eligibility matches expectation. |
| 4 | Generate random ride/driver-status document sets; assert list endpoints return exactly the expected filtered/projected subset. |
| 5 | Spy/mock `hub.publish_dispatch`; drive each existing endpoint through a state change; assert it was called with a matching payload, without asserting on timing. |
| 6 | Generate a set of fake WebSocket doubles where a random subset raise on `send_text`; assert delivery to the rest and no exception propagates. |
| 7 | Generate N concurrent force-cancel/reassign attempts against one active ride; assert exactly one status transition lands. |
| 8 | Generate random dispatcher actions (including the reassignment-failure path); assert matching log entdocument(s) exist with correct fields. |
| 9 | Generate random ride/driver sets and query substrings; assert search/filter/sort output against a reference filter implementation. |
| 10 | Generate random log entries and date-range/dispatcher filters; assert query output against a reference filter. |
| 11–13 | Generate random ride/log datasets; assert each analytics endpoint's output against a plain-Python reference aggregation over the same dataset (model-based testing). |
| 14 | Generate random valid `RegisterIn`-shaped payloads with `role="dispatcher"`; assert rejection and no user created. |
| 15 | Generate random `(created_at, threshold, reservation-state)` tuples; assert the aging predicate matches the boolean formula directly. |

**Unit/example tests** (not property-based) cover:
- Regression: existing `test_core_services.py` and `test_rideshare_api.py` continue to pass unmodified, proving Requirement 7.1/7.3.
- Happy-path examples: one successful manual assignment end-to-end (assign → driver accepts via existing `/api/rides/{id}/accept` → dispatch event observed), one successful force-cancel, one successful reassignment, one dispatcher-account creation.
- Error-path examples: assigning a non-existent ride id, assigning to an offline driver, force-cancelling an already-completed ride, registering with `role="dispatcher"` (also covered by Property 14, kept here as a concrete smoke example too).
- `/ws/dispatch` connection examples: valid dispatcher token connects and receives `{"event": "connected", ...}`; missing token closes with 4401; passenger-role token closes with 4403.

## Non-Interference Verification

Existing files touched, and exactly what changes in each (everything else in `backend/app/*` is untouched):

| File | Change | Why it's safe |
|---|---|---|
| `models.py` | Add `"dispatcher"` to `Role` literal; append new request models (`DispatcherCreateIn`, `ManualAssignIn`, `ReassignIn`, `ForceCancelIn`, `AuditLogQueryIn`, `AnalyticsRangeIn`) | Widening a `Literal` type only adds an accepted value; no existing model, field, or validator is modified. New classes are additive. |
| `deps.py` | No change — `get_current_user` and `require_role` are reused as-is via `require_role("dispatcher")` | Zero modification; the function already takes an arbitrary role string. |
| `main.py` | Add `from .routers.dispatch import router as dispatch_router` and `app.include_router(dispatch_router)` | Registering an additional router does not affect existing routes, middleware order, or exception handlers. |
| `db.py` | Append index-creation calls for `dispatch_action_log` and one additive index on `rides` (`assignment_type`, `created_at`) inside `startup_indexes` | Adding indexes never changes query results or existing index behavior; `create_index` on an unrelated field/collection is side-effect-free for existing queries. |
| `services/realtime.py` | Add `_dispatch_channel`, `connect_dispatch`, `disconnect_dispatch`, `publish_dispatch`, `_local_broadcast_dispatch` methods to `RealtimeHub`; add one `psubscribe` pattern and one `elif` branch in `redis_subscriber` | Purely additive members/branches; existing `_ride_channels`/`_driver_channels` state, `connect_ride`/`connect_driver`/`publish_ride`/`publish_driver`, and the existing `ride:*`/`driver:*` subscription branches are untouched. |
| `routers/ws.py` | Append new `ws_dispatch` handler function | Existing `ws_ride`/`ws_driver` handlers and the module's imports/router object are untouched aside from the new function. |
| `routers/rides.py` | Add one `await hub.publish_dispatch(...)` line immediately after each of the 3 existing `hub.publish_ride(...)` calls (`request_ride`, `cancel_ride`, and optionally `rate` if desired for completeness — not required by any requirement, so omitted) | The existing `hub.publish_ride` calls, their arguments, and all other logic (validation, DB writes, response bodies) are unchanged. The added line's own failure is isolated by the same try/except-per-connection resilience already inside `RealtimeHub`, and a failure to publish to the dispatch channel cannot raise back into the request handler because `publish_dispatch` follows the exact same "log and continue" pattern already used by `publish_ride`/`publish_driver`. |
| `routers/driver.py` | Add one `await hub.publish_dispatch(...)` line after each of the existing `hub.publish_driver(...)`/`hub.publish_ride(...)` calls (`driver_status`, `driver_incoming`, `accept_ride`, `arrive_ride`, `start_ride`, `complete_ride`, `update_driver_location`); add `"assignment_type": "automatic"` key to `driver_incoming`'s existing reservation `$set` clause | Same additive-fan-out reasoning as above. The one non-fan-out change — adding `assignment_type: "automatic"` to the `$set` — only adds a new key to the document; it does not alter the filter, the `modified_count` semantics, the response shape (`ride_clean` dict, still built from `clean_doc(ride)` the same way), or any existing field's value. |

**New files, zero risk to existing behavior:** `routers/dispatch.py`, `control_room/*` (entire new frontend app), and the `dispatch_action_log` collection (new collection, no existing code reads or writes it).

**Verification plan:**
1. Run the existing test suite (`test_core_services.py`, `test_rideshare_api.py`) unmodified after implementation — all must continue to pass with no changes to the tests themselves, directly demonstrating Requirement 7.1/7.3.
2. Diff the request/response bodies of every existing `/api/rides/*`, `/api/driver/*`, `/api/auth/*` endpoint before and after the change (e.g. via existing integration tests' assertions) to confirm no field was added, renamed, or removed from any response the passenger/driver apps depend on. The two additive ride fields (`assignment_type`, `assigned_by`) are new keys `clean_doc` already passes through automatically; passenger/driver apps that don't know about these keys simply ignore them, same as any other additive JSON field.
3. Run the full test suite with Redis unavailable (falls back to local broadcast, exercising the `except Exception` path already in `_get_redis`) to confirm the new dispatch channel degrades the same way the existing ride/driver channels already do, and does not throw during startup or during any publish call.
4. Manually confirm (or via a smoke test) that `GET /api/driver/incoming` and `POST /api/rides/{ride_id}/accept` continue to function correctly against rides that were reserved via the new manual-assignment path — i.e., a manually-reserved ride is a normal ride document as far as the existing driver flow is concerned, with two extra harmless fields.
