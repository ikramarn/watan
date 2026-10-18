# Implementation Plan: Dispatch Control Room

## Overview

This plan implements the Dispatch Control Room as a strictly additive layer on the existing FastAPI backend, plus a new `control_room/` Vite + React + TypeScript frontend. Backend work proceeds bottom-up: shared models/schema first, then the additive realtime fan-out channel, then dispatcher auth/accounts, then read-only visibility endpoints (with search/filter/sort/aging), then the higher-risk race-sensitive endpoints (manual assignment, active-ride interventions), then audit/analytics, then regression verification. The frontend is built last, wired against the completed backend endpoints. Property-based tests (Hypothesis + pytest) are placed immediately after the implementation they validate, per the design's 15 correctness properties.

## Tasks

- [x] 1. Backend models and schema setup
  - [x] 1.1 Extend `models.py` with the `dispatcher` role and new request models
    - Add `"dispatcher"` to the `Role` literal
    - Add `DispatcherCreateIn`, `ManualAssignIn`, `ReassignIn`, `ForceCancelIn`, `AuditLogQueryIn`, `AnalyticsRangeIn` as new classes, without modifying any existing class
    - _Requirements: 1.7_

  - [x] 1.2 Add new indexes in `db.py`
    - Add `dispatch_action_log` indexes (`id` unique, `created_at desc`, `dispatcher_id + created_at`, `action + created_at`) and one additive `rides` index on `(assignment_type, created_at)` inside `startup_indexes`, without altering any existing index
    - _Requirements: 8.1_

  - [ ]* 1.3 Write unit tests for new model validation
    - Test `DispatcherCreateIn`, `ManualAssignIn`, `ReassignIn`, `ForceCancelIn`, `AuditLogQueryIn`, `AnalyticsRangeIn` field validation (lengths, required fields)
    - _Requirements: 1.7_

- [x] 2. Realtime hub dispatch channel
  - [x] 2.1 Add dispatch channel support to `services/realtime.py`
    - Add `_dispatch_channel` set and `connect_dispatch`, `disconnect_dispatch`, `publish_dispatch`, `_local_broadcast_dispatch` methods to `RealtimeHub`, following the exact resilience shape of the existing ride/driver channel methods
    - Add one `psubscribe` pattern for `"dispatch:events"` and one `elif` branch in `redis_subscriber`, leaving existing `ride:*`/`driver:*` handling untouched
    - _Requirements: 2.2, 2.3, 3.2, 3.4, 4.6, 5.2_

  - [ ]* 2.2 Write property test for local broadcast failure isolation
    - **Property 6: Local broadcast isolates per-connection failures**
    - **Validates: Requirements 3.3**

  - [ ]* 2.3 Write unit tests for dispatch channel connect/disconnect and Redis fallback
    - Test `connect_dispatch`/`disconnect_dispatch` update the connection set correctly and `publish_dispatch` falls back to local broadcast when Redis is unavailable
    - _Requirements: 3.2, 3.4_

- [x] 3. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Dispatcher accounts, auth gating, and router registration
  - [x] 4.1 Reject the `dispatcher` role in `routers/auth.py`'s `register` handler
    - Add an explicit check that rejects `POST /api/auth/register` requests with `role: "dispatcher"`, without changing any other registration behavior
    - _Requirements: 1.8_

  - [ ]* 4.2 Write property test for register endpoint rejecting the dispatcher role
    - **Property 14: Register endpoint rejects the dispatcher role**
    - **Validates: Requirements 1.8**

  - [x] 4.3 Create `backend/app/routers/dispatch.py` with router setup and `POST /api/dispatch/accounts`
    - Mount the new router with `prefix="/api/dispatch"`, gate every route on `require_role("dispatcher")` (reused, unmodified, from `deps.py`) to satisfy Requirements 1.1 and 1.3
    - Implement `POST /api/dispatch/accounts`: create a new `dispatcher`-role user in `db.users`, record `created_by`, and write a `create_dispatcher` entry to `dispatch_action_log`
    - _Requirements: 1.1, 1.3, 1.9, 1.10, 8.1_

  - [x] 4.4 Register the dispatch router in `main.py`
    - Import and `include_router` the new dispatch router without altering existing router registration order
    - _Requirements: 1.9_

  - [ ]* 4.5 Write unit tests for dispatcher account creation
    - Test successful creation records `created_by` correctly, and duplicate-email creation is rejected
    - _Requirements: 1.9, 1.10_

- [x] 5. Ride/driver visibility endpoints with search/filter/sort/aging
  - [x] 5.1 Implement `GET /api/dispatch/rides/pending` and `GET /api/dispatch/drivers`
    - Pending endpoint returns all `status == "pending"` rides with passenger name, pickup/destination, ride type, fare estimate, elapsed wait time, and reservation state (holder + expiry)
    - Drivers endpoint returns all `online == true` drivers with location, vehicle type, rating, and active-ride flag
    - _Requirements: 2.1, 2.4, 3.1_

  - [x] 5.2 Implement `GET /api/dispatch/rides/active`
    - Return all rides with `status` in `accepted`, `arrived`, `in_progress`, including passenger, driver, status, and current driver location
    - _Requirements: 5.1_

  - [x] 5.3 Implement search/filter/sort helpers and wire them into the pending and driver list endpoints
    - Add ride-type filter and wait-time/pickup-distance sort to the pending list; add name/plate search to the driver list; add name/address search to the pending list
    - _Requirements: 2.5, 2.6, 3.6_

  - [x] 5.4 Implement the aging predicate helper and expose it on the pending list response
    - Pure function of elapsed wait time, configurable threshold, and current reservation/assignment state
    - _Requirements: 10.2_

  - [ ]* 5.5 Write property test for status-filtered list projections
    - **Property 4: Status-filtered list projections are correct and complete**
    - **Validates: Requirements 2.1, 2.4, 3.1, 5.1**

  - [ ]* 5.6 Write property test for search and filter predicates
    - **Property 9: Search and filter predicates are correct**
    - **Validates: Requirements 2.5, 2.6, 3.6**

  - [ ]* 5.7 Write property test for the aging predicate
    - **Property 15: Aging predicate is a pure function of wait time and reservation state**
    - **Validates: Requirements 10.2**

- [x] 6. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Manual assignment
  - [x] 7.1 Implement `POST /api/dispatch/rides/{ride_id}/assign`
    - Pre-check driver eligibility (online, no active ride), then perform the atomic conditional `update_one` reservation using the identical filter shape as `driver.py`'s existing reservation pattern, stamping `assignment_type`/`assigned_by`
    - Reject with 409 when `modified_count == 0`; reject with 400 when the driver is not eligible; write a `manual_assign` entry to `dispatch_action_log` on success
    - _Requirements: 4.1, 4.2, 4.3, 4.7, 8.1_

  - [ ]* 7.2 Write property test for race-safe, exclusive manual assignment
    - **Property 2: Manual assignment reservation is race-safe and exclusive**
    - **Validates: Requirements 4.1, 4.2, 6.1**

  - [ ]* 7.3 Write property test for expired/absent reservations not blocking consideration
    - **Property 3: Expired or absent reservations never block consideration**
    - **Validates: Requirements 4.5, 4.8**

  - [ ]* 7.4 Write unit tests for manual assignment error paths
    - Assigning a non-existent ride id; assigning to an offline or already-busy driver
    - _Requirements: 4.2_

- [x] 8. Additive dispatch fan-out on existing endpoints
  - [x] 8.1 Add `publish_dispatch` calls in `routers/rides.py`
    - Add one additional `await hub.publish_dispatch(...)` line immediately after each existing `hub.publish_ride(...)` call in `request_ride` and `cancel_ride`, without changing the existing calls, their arguments, or any other logic
    - _Requirements: 2.2, 2.3_

  - [x] 8.2 Add `publish_dispatch` calls and the `assignment_type` field in `routers/driver.py`
    - Add one additional `await hub.publish_dispatch(...)` line after each existing `hub.publish_driver(...)`/`hub.publish_ride(...)` call (`driver_status`, `driver_incoming`, `accept_ride`, `arrive_ride`, `start_ride`, `complete_ride`, `update_driver_location`)
    - Add `"assignment_type": "automatic"` to `driver_incoming`'s existing reservation `$set` clause, without changing its filter, response shape, or any other field
    - _Requirements: 3.2, 3.4, 4.6, 5.2_

  - [ ]* 8.3 Write property test for dispatch event fan-out on every state change
    - **Property 5: Every ride/driver state change fans out a dispatch event**
    - **Validates: Requirements 2.2, 2.3, 3.2, 3.4, 4.6, 5.2**

- [x] 9. Dispatch WebSocket endpoint
  - [x] 9.1 Implement `/ws/dispatch` in `routers/ws.py`
    - Append a new `ws_dispatch` handler mirroring `ws_driver`'s structure, checking the JWT `role` claim equals `"dispatcher"` before calling `hub.connect_dispatch`, closing with the appropriate code otherwise, without modifying the existing `ws_ride`/`ws_driver` handlers
    - _Requirements: 1.4, 1.5_

  - [ ]* 9.2 Write property test for dispatcher-only authorization across REST and WebSocket
    - **Property 1: Dispatcher-only authorization**
    - **Validates: Requirements 1.2, 1.4, 1.5, 1.9**

  - [ ]* 9.3 Write unit tests for `/ws/dispatch` connection scenarios
    - Valid dispatcher token connects and receives `{"event": "connected", ...}`; missing/invalid token closes with 4401; non-dispatcher role token closes with 4403
    - _Requirements: 1.4, 1.5_

- [x] 10. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Active ride interventions
  - [x] 11.1 Implement `POST /api/dispatch/rides/{ride_id}/cancel`
    - Reuse `assert_transition` and the existing `cancel_ride` update shape, conditioning the `update_one` filter on the last-observed status; reject with 409 when the ride is already `completed`/`cancelled` or when the conditional update loses a race; notify via the existing realtime ride channel; write a `force_cancel` entry to `dispatch_action_log`
    - _Requirements: 5.3, 5.6, 8.1_

  - [x] 11.2 Implement `POST /api/dispatch/rides/{ride_id}/reassign`
    - Perform the atomic release-and-re-reserve `update_one` for the new driver in a single write; on `modified_count == 0`, reject with 409; on the "new reservation cannot be created" fallback path, atomically transition the ride to `cancelled`, notify passenger and previous driver, and write both a `reassign_failed` and a `force_cancel` entry to `dispatch_action_log`
    - _Requirements: 5.4, 5.5, 5.6, 8.1_

  - [ ]* 11.3 Write property test for race-safe, exclusive active-ride transitions
    - **Property 7: Active-ride state transitions are race-safe and exclusive**
    - **Validates: Requirements 5.3, 5.5, 5.6, 6.3**

  - [ ]* 11.4 Write property test for audit-log completeness across all dispatcher actions
    - **Property 8: Every successful and failed dispatcher action is audit-logged**
    - **Validates: Requirements 1.10, 4.7, 5.3, 5.4, 5.5, 8.1**

  - [ ]* 11.5 Write unit tests for intervention error paths
    - Force-cancelling or reassigning a ride that is already `completed`/`cancelled`
    - _Requirements: 5.6_

- [x] 12. Audit log and analytics endpoints
  - [x] 12.1 Implement `GET /api/dispatch/audit-log`
    - Return `dispatch_action_log` entries filterable by date range and acting dispatcher
    - _Requirements: 8.2_

  - [x] 12.2 Implement `GET /api/dispatch/analytics/volume`, `GET /api/dispatch/analytics/wait-times`, `GET /api/dispatch/analytics/performance`
    - Volume: ride counts grouped by day and ride type for a date range
    - Wait-times: average and 95th-percentile elapsed time between creation and driver acceptance, split by `assignment_type`
    - Performance: per-dispatcher counts of manual-assign/force-cancel/reassign actions for a date range
    - _Requirements: 9.1, 9.2, 9.3_

  - [ ]* 12.3 Write property test for audit-log query filtering
    - **Property 10: Audit log query filtering is correct**
    - **Validates: Requirements 8.2**

  - [ ]* 12.4 Write property test for ride volume analytics against a reference aggregation
    - **Property 11: Ride volume analytics match a reference aggregation**
    - **Validates: Requirements 9.1**

  - [ ]* 12.5 Write property test for wait-time analytics against a reference computation
    - **Property 12: Wait-time analytics match a reference computation, split by assignment type**
    - **Validates: Requirements 9.2**

  - [ ]* 12.6 Write property test for dispatcher performance analytics against a reference aggregation
    - **Property 13: Dispatcher performance analytics match a reference aggregation**
    - **Validates: Requirements 9.3**

- [x] 13. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 14. Regression and non-interference verification
  - [x] 14.1 Add integration tests confirming existing endpoints are unaffected
    - Confirm the existing `test_core_services.py`/`test_rideshare_api.py` suites pass unmodified, and add assertions that `/api/rides/*`, `/api/driver/*`, `/api/auth/*` response bodies are unchanged aside from the two new additive ride fields
    - _Requirements: 7.1, 7.3_

  - [x] 14.2 Add an integration test for a manually-reserved ride flowing through the existing driver flow
    - Manually assign a ride via the dispatch endpoint, then confirm `GET /api/driver/incoming` and `POST /api/rides/{ride_id}/accept` behave exactly as they do for automatically-matched rides
    - _Requirements: 7.2, 7.4_

- [x] 15. Frontend control_room app foundation
  - [x] 15.1 Scaffold the `control_room/` Vite + React + TypeScript application
    - Set up `package.json`, Vite config, TypeScript config, and a `VITE_API_BASE_URL` env var added to `.env.example` alongside existing backend variables
    - _Requirements: (delivery approach per Introduction)_

  - [x] 15.2 Implement `LoginView` and the auth/token flow
    - Call `POST /api/auth/login`, store tokens, check `user.role === "dispatcher"` before rendering the dashboard shell, and reuse `POST /api/auth/refresh` for token refresh
    - _Requirements: 1.6_

  - [x] 15.3 Implement the WebSocket client wrapper and event bus for `/ws/dispatch`
    - Open `wss://.../ws/dispatch?token={access_token}`, dispatch incoming `{"event": ...}` messages onto a client-side event bus subscribable by individual views
    - _Requirements: (supports 2.2, 2.3, 3.2, 3.4)_

- [x] 16. Frontend dispatch views
  - [x] 16.1 Implement `PendingRequestsTable`
    - Render `GET /api/dispatch/rides/pending`, live-update from `ride.created`/`ride.updated` dispatch events, support type filter, wait-time/distance sort, name/address search, aging flag, and reservation holder/mechanism display
    - _Requirements: 2.1, 2.4, 2.5, 2.6, 6.2, 10.1, 10.2_

  - [x] 16.2 Implement `DriverRosterView`
    - Render `GET /api/dispatch/drivers` as a list, live-update from `driver.status`/`driver.location` events, visually distinguish free vs. busy drivers, support name/plate search
    - _Requirements: 3.1, 3.5, 3.6_

  - [x] 16.3 Implement `ActiveRidesTable`
    - Render `GET /api/dispatch/rides/active`, live-update from `ride.updated` events, expose force-cancel and reassign row actions
    - _Requirements: 5.1, 5.2_

  - [x] 16.4 Implement `ManualAssignModal`
    - Given a selected pending ride and driver, call `POST /api/dispatch/rides/{id}/assign`, surface 409 "no longer available" responses inline
    - _Requirements: 4.1, 4.2, 4.3, 6.1_

  - [x] 16.5 Implement `ReassignModal`
    - Given a selected active ride and new driver, call `POST /api/dispatch/rides/{id}/reassign`, surface the auto-cancel outcome distinctly from a plain error, surface 409 race-lost responses
    - _Requirements: 5.4, 5.5, 6.3_

  - [x] 16.6 Implement `AuditLogView`
    - Render `GET /api/dispatch/audit-log` with date-range and dispatcher filters
    - _Requirements: 8.2_

  - [x] 16.7 Implement `AnalyticsDashboard`
    - Render the three `/api/dispatch/analytics/*` endpoints as charts/tables (volume by day/type, wait-time avg/p95 by assignment type, per-dispatcher action counts)
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

  - [x] 16.8 Implement `DispatcherAccountsView`
    - Admin-facing form calling `POST /api/dispatch/accounts` to provision new dispatcher accounts
    - _Requirements: 1.9, 1.10_

  - [x] 16.9 Implement `NewRequestAlert`
    - Toast/banner triggered on `ride.created` dispatch events while connected
    - _Requirements: 10.1_

- [x] 17. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP; they are test-only sub-tasks and are not implemented by the coding agent by default.
- Every backend change to an existing file (`models.py`, `db.py`, `main.py`, `services/realtime.py`, `routers/ws.py`, `routers/rides.py`, `routers/driver.py`, `routers/auth.py`) is additive only, per the design's Non-Interference Verification table.
- Property-based tests use Hypothesis (`max_examples=100` minimum) per the design's Testing Strategy, each tagged with a comment referencing its design property number.
- The frontend (`control_room/`) is UI and is out of scope for property-based testing per the design; it receives example-based/manual verification only.
- Checkpoints (tasks 3, 6, 10, 13, 17) are natural points to pause and confirm with the user before proceeding.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "2.1", "4.1", "15.1"] },
    { "id": 1, "tasks": ["1.3", "2.2", "4.2", "4.3", "8.1", "8.2", "9.1", "15.2", "15.3"] },
    { "id": 2, "tasks": ["2.3", "4.4", "4.5", "5.1", "8.3", "9.2", "16.8", "16.9"] },
    { "id": 3, "tasks": ["5.2", "9.3", "16.2"] },
    { "id": 4, "tasks": ["5.3", "5.5"] },
    { "id": 5, "tasks": ["5.4", "5.6"] },
    { "id": 6, "tasks": ["5.7", "7.1", "16.1"] },
    { "id": 7, "tasks": ["7.2", "11.1", "16.4"] },
    { "id": 8, "tasks": ["7.3", "11.2"] },
    { "id": 9, "tasks": ["7.4", "11.3", "12.1", "16.3", "16.5"] },
    { "id": 10, "tasks": ["11.4", "12.2", "12.3", "16.6"] },
    { "id": 11, "tasks": ["11.5", "12.4", "14.1", "16.7"] },
    { "id": 12, "tasks": ["12.5", "14.2"] },
    { "id": 13, "tasks": ["12.6"] }
  ]
}
```
