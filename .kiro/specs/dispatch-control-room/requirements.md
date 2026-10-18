# Requirements Document

## Introduction

The Dispatch Control Room is a new, privileged, web-based operations surface for the Nimbus rideshare platform. It gives dispatcher/ops staff a real-time view of incoming passenger ride requests and available drivers, and lets them manually match a specific driver to a specific ride request. It also gives dispatchers visibility into, and limited intervention over, rides that are already in progress (force-cancel or reassign).

The Control Room is strictly **additive**: the existing automatic matching system (`backend/app/services/matching.py`), the existing driver polling/reservation/accept flow (`backend/app/routers/driver.py`), and the existing passenger/driver mobile apps must continue to work exactly as they do today, unmodified in their default behavior. Manual dispatch is an alternative path staff can use for VIP handling, edge cases, automatic-matching failures, or fully manual operation, and it must coordinate with the existing reservation mechanism so a ride is never double-assigned to two drivers.

Delivery approach (confirmed with stakeholder): a new, separate web dashboard application (not built with Expo/React Native, distinct from `passenger_app/` and `driver_app/`) intended to run in a desktop browser. It communicates with the existing FastAPI backend via new admin-scoped REST endpoints (e.g. under `/api/dispatch/*`) and a new dispatch-scoped WebSocket channel (e.g. `/ws/dispatch`), reusing the existing JWT-based authentication system with a new `dispatcher` role added to the existing `Role` type and enforced with a `require_role("dispatcher")` dependency, matching the pattern already used for `passenger` and `driver`.

v1 scope includes: real-time monitoring of pending requests and online drivers, manual assignment of pending requests, monitoring and intervention (force-cancel, reassign) on active rides, and analytics/reporting (ride volumes, wait times, dispatcher performance over time). Dispatcher accounts are provisioned only by existing admins/dispatchers via a new admin-only endpoint; there is no public self-registration for the `dispatcher` role.

## Glossary

- **Control_Room**: The new web dashboard application used by Dispatchers to monitor and manually manage ride dispatch.
- **Dispatch_API**: The set of new backend REST endpoints (under `/api/dispatch/*`) that serve the Control_Room.
- **Dispatch_Hub**: The new backend WebSocket channel (`/ws/dispatch`) that streams real-time ride and driver events to connected Control_Room sessions.
- **Dispatcher**: A user account with the `dispatcher` role, authorized to access the Control_Room and Dispatch_API.
- **Automatic_Matching_Service**: The existing backend service (`matching.py`) and driver-polling flow (`driver.py`, endpoint `/api/driver/incoming`) that assigns pending Ride_Requests to drivers without dispatcher involvement.
- **Ride_Request**: A ride document with `status = "pending"` that has not yet been assigned to a driver.
- **Active_Ride**: A ride document with `status` in `accepted`, `arrived`, or `in_progress`.
- **Reservation**: The existing time-limited hold on a pending ride (`reserved_by`, `reserved_until` fields) that prevents a second driver or dispatcher from assigning the same ride while the hold is active.
- **Manual_Assignment**: A Dispatcher-initiated action that reserves a specific pending Ride_Request for a specific driver and notifies that driver to accept or decline it.
- **Driver_Roster**: The set of driver status records (`driver_status` collection) visible to the Control_Room, including online/offline state, last known location, and vehicle type.
- **Dispatch_Action_Log**: A persistent record of dispatcher actions (manual assignments, cancellations, reassignments) with dispatcher identity and timestamp.

## Requirements

### Requirement 1: Dispatcher Authentication and Access Control

**User Story:** As an operations manager, I want the Control Room to be accessible only to authenticated dispatcher accounts, so that this privileged surface cannot be reached by passengers, drivers, or the public.

#### Acceptance Criteria

1. THE Dispatch_API SHALL require a valid access token for every request.
2. WHEN a request to any Dispatch_API endpoint is made by a user whose role is not `dispatcher`, THE Dispatch_API SHALL reject the request with a 403 status.
3. WHEN a request to any Dispatch_API endpoint is made without a valid access token, THE Dispatch_API SHALL reject the request with a 401 status.
4. WHEN a Dispatch_Hub WebSocket connection is opened without a valid access token belonging to a `dispatcher`-role user, THE Dispatch_Hub SHALL close the connection without streaming any ride or driver data.
5. IF a Dispatch_Hub WebSocket connection attempt is made by an authenticated user whose role is not `dispatcher`, THEN THE Dispatch_Hub SHALL reject the connection attempt immediately.
6. THE Control_Room SHALL authenticate Dispatchers using the existing `/api/auth/login` endpoint and the existing access/refresh token mechanism.
7. THE system SHALL add `dispatcher` as a valid value of the existing user `Role` type without altering the existing behavior of the `passenger` and `driver` roles.
8. IF a request to `/api/auth/register` specifies the `dispatcher` role, THEN THE system SHALL reject the request.
9. THE system SHALL provide an endpoint that allows only an authenticated `dispatcher`-role user to create a new `dispatcher`-role account.
10. WHEN a new Dispatcher account is created, THE system SHALL record which existing Dispatcher created it.

### Requirement 2: Real-Time Visibility into Pending Ride Requests

**User Story:** As a dispatcher, I want to see incoming passenger ride requests as they arrive, so that I can decide which ones need manual attention.

#### Acceptance Criteria

1. WHEN a Dispatcher requests the pending Ride_Request list, THE Dispatch_API SHALL return all rides with `status = "pending"`, including passenger name, pickup location and address, destination location and address, ride type, fare estimate, elapsed wait time, and current reservation state.
2. WHEN a new Ride_Request is created by a passenger, THE Dispatch_Hub SHALL push an event containing the new Ride_Request to all connected Control_Room sessions within 3 seconds.
3. WHEN a Ride_Request transitions out of `pending` status (assigned, cancelled, or expired), THE Dispatch_Hub SHALL push an event to all connected Control_Room sessions indicating the Ride_Request is no longer pending.
4. WHILE a Ride_Request is reserved for a specific driver, THE Dispatch_API SHALL include the reservation holder and reservation expiry in the pending Ride_Request data returned to the Control_Room.
5. THE Control_Room SHALL provide the ability to filter the pending Ride_Request list by ride type and to sort it by wait time or pickup distance from a selected driver.
6. THE Control_Room SHALL provide a search capability to locate a pending Ride_Request by passenger name or pickup address.

### Requirement 3: Real-Time Visibility into Available Drivers

**User Story:** As a dispatcher, I want to see which drivers are online and available, so that I can pick a suitable driver for a manual assignment.

#### Acceptance Criteria

1. WHEN a Dispatcher requests the driver roster, THE Dispatch_API SHALL return all drivers with `online = true`, including current location, vehicle type, rating, and whether the driver currently has an Active_Ride.
2. WHEN a driver's online status changes, THE Dispatch_Hub SHALL push an event containing the updated Driver_Roster entry to all connected Control_Room sessions within 3 seconds.
3. IF a push of a driver status or location update to a connected Control_Room session fails, THEN THE Dispatch_Hub SHALL log the failure and continue operating without retrying that specific update.
4. WHEN a driver's location is updated, THE Dispatch_Hub SHALL push an event containing the updated location to all connected Control_Room sessions.
5. THE Control_Room SHALL visually distinguish drivers who are online and free from drivers who are online but already on an Active_Ride.
6. THE Control_Room SHALL provide a search capability to locate a driver by name or vehicle plate.

### Requirement 4: Manual Assignment of a Pending Ride Request

**User Story:** As a dispatcher, I want to manually assign a specific pending ride request to a specific available driver, so that I can handle VIP requests, edge cases, or situations where automatic matching has not produced a result.

#### Acceptance Criteria

1. WHEN a Dispatcher selects a pending Ride_Request and an online driver without an Active_Ride, THE Dispatch_API SHALL create a valid Reservation on that Ride_Request for the selected driver using the same atomic, conditional update pattern used by the existing reservation mechanism, and SHALL consider the Manual_Assignment successful only when that Reservation is actually and validly created, so that a Ride_Request already reserved or already assigned cannot be reserved again.
2. IF the selected Ride_Request is no longer `pending` or is already validly reserved by another driver at the time of assignment, THEN THE Dispatch_API SHALL reject the Manual_Assignment and return a message indicating the ride is no longer available.
3. WHEN a Manual_Assignment reservation is created, THE Dispatch_API SHALL notify the selected driver's app of the incoming request through the existing driver notification channel (push notification and/or `/ws/driver/{driver_id}`), consistent with how the driver is notified of automatically matched requests.
4. THE Manual_Assignment reservation SHALL be acceptable or declinable by the selected driver through the existing `/api/rides/{ride_id}/accept` endpoint and existing driver app flow, without requiring any change to the driver app's accept behavior.
5. IF the selected driver declines or does not accept a Manual_Assignment before the Reservation expires, THEN THE Ride_Request SHALL return to `pending` status and become eligible again for automatic matching or a new Manual_Assignment.
6. WHEN a Manual_Assignment is accepted by the driver, THE Dispatch_Hub SHALL push an event to all connected Control_Room sessions indicating the Ride_Request is now assigned.
7. THE Dispatch_API SHALL record each Manual_Assignment action, including the Dispatcher identity, ride ID, selected driver ID, and timestamp, in the Dispatch_Action_Log.
8. THE Automatic_Matching_Service SHALL continue to consider only Ride_Requests that are `pending` and not currently subject to a valid Reservation, so that Manual_Assignment reservations are honored by the existing automatic matching flow without modification to its matching logic.

### Requirement 5: Monitoring and Intervention on Active Rides

**User Story:** As a dispatcher, I want to see rides that are already in progress and intervene when necessary, so that I can resolve problems such as a driver going offline mid-ride or an incorrect assignment.

#### Acceptance Criteria

1. WHEN a Dispatcher requests the Active_Ride list, THE Dispatch_API SHALL return all rides with `status` in `accepted`, `arrived`, or `in_progress`, including passenger, driver, current status, and current driver location.
2. WHEN an Active_Ride changes status or driver location, THE Dispatch_Hub SHALL push an event with the update to all connected Control_Room sessions.
3. WHEN a Dispatcher force-cancels an Active_Ride, THE Dispatch_API SHALL transition the ride to `cancelled` using the existing ride state machine, notify the passenger and driver through the existing realtime ride channel, and record the action in the Dispatch_Action_Log.
4. WHEN a Dispatcher reassigns an Active_Ride to a different driver, THE Dispatch_API SHALL release the current driver from the ride, create a Manual_Assignment reservation for the newly selected driver, notify both the previous and newly selected drivers, and record the action in the Dispatch_Action_Log.
5. IF the reservation for the newly selected driver cannot be created during a reassignment, THEN THE Dispatch_API SHALL automatically cancel the ride, notify the passenger and previous driver, and record the failed reassignment and resulting cancellation in the Dispatch_Action_Log.
6. IF a Dispatcher attempts to force-cancel or reassign a ride that has already reached `completed` or `cancelled` status, THEN THE Dispatch_API SHALL reject the request with a message indicating the ride is no longer active.

### Requirement 6: Preventing Conflicting Actions Between Dispatchers

**User Story:** As a dispatcher, I want to avoid assigning a ride that a colleague is already assigning, so that we don't create conflicting or duplicate assignments.

#### Acceptance Criteria

1. WHEN two Dispatchers attempt to create a Manual_Assignment for the same Ride_Request at nearly the same time, THE Dispatch_API SHALL grant the Reservation to only one of the two requests and reject the other with a message indicating the ride was just assigned.
2. WHILE a Ride_Request is reserved for a driver by any Dispatcher or by the Automatic_Matching_Service, THE Control_Room SHALL visually indicate to all connected Dispatchers that the Ride_Request is currently reserved and by which mechanism (dispatcher name, or automatic).
3. WHEN two Dispatchers attempt conflicting interventions on the same Active_Ride at nearly the same time — whether both attempt the same action (both force-cancel, or both reassign) or different actions (one force-cancels while the other reassigns) — THE Dispatch_API SHALL apply only the first successful state transition and reject the second with a message indicating the ride state has already changed.

### Requirement 7: Non-Interference with Existing Passenger and Driver Apps

**User Story:** As the platform owner, I want the Control Room to be purely additive, so that existing passenger and driver app behavior and API contracts are not affected.

#### Acceptance Criteria

1. THE Dispatch_API SHALL be implemented as new endpoints and SHALL NOT modify the request or response contract of any existing `/api/rides/*`, `/api/driver/*`, or `/api/auth/*` endpoint used by the passenger and driver apps.
2. THE Automatic_Matching_Service SHALL continue to operate without requiring any dispatcher action, so that rides are matched automatically when no Dispatcher intervenes.
3. THE system SHALL continue to support the existing `passenger` and `driver` login flows without requiring those users to be aware of the `dispatcher` role or the Control_Room.
4. THE Automatic_Matching_Service and existing ride lifecycle endpoints SHALL function identically to their current behavior regardless of whether any Dispatcher is connected to the Dispatch_Hub.

### Requirement 8: Dispatch Action Audit Log

**User Story:** As an operations manager, I want a record of manual dispatch actions, so that I can review what dispatchers did and when.

#### Acceptance Criteria

1. THE system SHALL persist a Dispatch_Action_Log entry for each Manual_Assignment, force-cancel, and reassignment action, containing the acting Dispatcher's identity, the affected ride ID, the action type, and a timestamp.
2. WHEN a Dispatcher requests the Dispatch_Action_Log, THE Dispatch_API SHALL return entries filterable by date range and by acting Dispatcher.

### Requirement 9: Dispatch Analytics and Reporting

**User Story:** As an operations manager, I want reporting on dispatch activity and ride demand, so that I can evaluate operational performance and staffing needs.

#### Acceptance Criteria

1. WHEN a Dispatcher requests ride volume analytics for a given date range, THE Dispatch_API SHALL return the count of Ride_Requests created, grouped by day and by ride type, for that range.
2. WHEN a Dispatcher requests wait time analytics for a given date range, THE Dispatch_API SHALL return the average and 95th-percentile elapsed time between Ride_Request creation and driver acceptance for that range, separated into automatically matched and manually assigned rides.
3. WHEN a Dispatcher requests dispatcher performance analytics for a given date range, THE Dispatch_API SHALL return, per Dispatcher, the count of Manual_Assignment, force-cancel, and reassignment actions taken in that range.
4. THE Control_Room SHALL present ride volume, wait time, and dispatcher performance analytics in a dashboard view accessible to authenticated Dispatchers.

### Requirement 10: Notifications and Alerts for Dispatchers

**User Story:** As a dispatcher, I want to be alerted to new pending requests, so that I don't miss requests that need attention while working in the Control Room.

#### Acceptance Criteria

1. WHEN a new Ride_Request arrives while a Dispatcher session is connected to the Dispatch_Hub, THE Control_Room SHALL display a visible alert for that new request.
2. WHILE a Ride_Request has been pending for a duration greater than or equal to a configurable threshold without being reserved or assigned, THE Control_Room SHALL visually flag the request as aging.
