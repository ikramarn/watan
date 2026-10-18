"""Optional integration suite.

Run only when a local backend is running.
Example:
    BASE_URL=http://127.0.0.1:8000 pytest backend/tests/test_rideshare_api.py -q
"""
import pytest
import requests
import os
import time

BASE_URL = os.getenv("BASE_URL", "http://127.0.0.1:8000")

# Test data
TEST_PASSENGER = {
    "email": "TEST_passenger_test@example.com",
    "password": "TestPass123!",
    "name": "Test Passenger",
    "role": "passenger",
    "phone": "+1 555 111 2222"
}

TEST_DRIVER = {
    "email": "TEST_driver_test@example.com",
    "password": "TestPass123!",
    "name": "Test Driver",
    "role": "driver",
    "phone": "+1 555 333 4444",
    "vehicle_make": "Honda Accord",
    "vehicle_plate": "TEST-001",
    "vehicle_type": "economy"
}

# Demo credentials from test_credentials.md
DEMO_PASSENGER = {"email": "passenger@demo.com", "password": "Passenger123!", "role": "passenger"}
DEMO_DRIVER = {"email": "driver@demo.com", "password": "Driver123!", "role": "driver"}

# Test locations (SF area)
PICKUP = {"lat": 37.7749, "lng": -122.4194, "address": "Market St, SF"}
DEST = {"lat": 37.6213, "lng": -122.379, "address": "SFO Airport"}


@pytest.fixture
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="session", autouse=True)
def ensure_backend_available():
    try:
        res = requests.get(f"{BASE_URL}/api/", timeout=2)
        if res.status_code != 200:
            pytest.skip(f"Backend not healthy at {BASE_URL}")
    except Exception:
        pytest.skip(f"Backend not reachable at {BASE_URL}")


class TestHealth:
    """Health check endpoint"""
    
    def test_health_check(self, api_client):
        print("\n=== Testing health check ===")
        response = api_client.get(f"{BASE_URL}/api/")
        print(f"Health check status: {response.status_code}")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert data["service"] in ("getchum", "rideshare")
        print("✓ Health check passed")


class TestAuth:
    """Authentication endpoints"""
    
    def test_register_passenger(self, api_client):
        print("\n=== Testing passenger registration ===")
        response = api_client.post(f"{BASE_URL}/api/auth/register", json=TEST_PASSENGER)
        print(f"Register status: {response.status_code}")
        
        if response.status_code == 400 and "already registered" in response.text:
            print("⚠ User already exists, skipping registration")
            pytest.skip("User already exists")
        
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        assert "user" in data
        assert data["user"]["email"] == TEST_PASSENGER["email"].lower()  # Backend lowercases emails
        assert data["user"]["role"] == "passenger"
        assert "_id" not in data["user"]
        print(f"✓ Passenger registered: {data['user']['name']}")
    
    def test_register_driver(self, api_client):
        print("\n=== Testing driver registration ===")
        response = api_client.post(f"{BASE_URL}/api/auth/register", json=TEST_DRIVER)
        print(f"Register status: {response.status_code}")
        
        if response.status_code == 400 and "already registered" in response.text:
            print("⚠ User already exists, skipping registration")
            pytest.skip("User already exists")
        
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        assert "user" in data
        assert data["user"]["role"] == "driver"
        assert data["user"]["vehicle_type"] == "economy"
        print(f"✓ Driver registered: {data['user']['name']}")
    
    def test_login_demo_passenger(self, api_client):
        print("\n=== Testing demo passenger login ===")
        response = api_client.post(f"{BASE_URL}/api/auth/login", json=DEMO_PASSENGER)
        print(f"Login status: {response.status_code}")
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        assert "user" in data
        assert data["user"]["role"] == "passenger"
        assert "_id" not in data["user"]
        print(f"✓ Demo passenger logged in: {data['user']['email']}")
    
    def test_login_demo_driver(self, api_client):
        print("\n=== Testing demo driver login ===")
        response = api_client.post(f"{BASE_URL}/api/auth/login", json=DEMO_DRIVER)
        print(f"Login status: {response.status_code}")
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        assert "user" in data
        assert data["user"]["role"] == "driver"
        print(f"✓ Demo driver logged in: {data['user']['email']}")
    
    def test_login_role_enforcement(self, api_client):
        print("\n=== Testing role enforcement on login ===")
        # Try to login as passenger with driver credentials
        response = api_client.post(f"{BASE_URL}/api/auth/login", json={
            "email": DEMO_DRIVER["email"],
            "password": DEMO_DRIVER["password"],
            "role": "passenger"
        })
        print(f"Role mismatch status: {response.status_code}")
        assert response.status_code == 403
        assert "registered as a driver" in response.text.lower()
        print("✓ Role enforcement working")
    
    def test_auth_me_with_token(self, api_client):
        print("\n=== Testing /auth/me with Bearer token ===")
        # Login first
        login_res = api_client.post(f"{BASE_URL}/api/auth/login", json=DEMO_PASSENGER)
        token = login_res.json()["token"]
        
        # Call /auth/me
        response = api_client.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        print(f"Auth/me status: {response.status_code}")
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == DEMO_PASSENGER["email"]
        assert "_id" not in data
        print(f"✓ Auth/me returned user: {data['name']}")
    
    def test_auth_me_without_token(self, api_client):
        print("\n=== Testing /auth/me without token ===")
        response = api_client.get(f"{BASE_URL}/api/auth/me")
        print(f"Unauthorized status: {response.status_code}")
        assert response.status_code == 401
        print("✓ Unauthorized access blocked")

    # --- Non-interference regression test (dispatch-control-room, Requirement 1.8) ---
    def test_register_dispatcher_role_rejected(self, api_client):
        print("\n=== Testing register rejects dispatcher role ===")
        response = api_client.post(
            f"{BASE_URL}/api/auth/register",
            json={
                "email": "TEST_dispatcher_regression@example.com",
                "password": "TestPass123!",
                "name": "Regression Dispatcher",
                "role": "dispatcher",
            },
        )
        print(f"Register dispatcher status: {response.status_code}")
        assert response.status_code == 400
        print("✓ Self-registration as dispatcher blocked")


class TestPassengerFlow:
    """Passenger ride flow endpoints"""
    
    @pytest.fixture
    def passenger_token(self, api_client):
        """Get passenger auth token"""
        response = api_client.post(f"{BASE_URL}/api/auth/login", json=DEMO_PASSENGER)
        return response.json()["token"]
    
    def test_nearby_drivers(self, api_client, passenger_token):
        print("\n=== Testing nearby drivers ===")
        response = api_client.get(
            f"{BASE_URL}/api/drivers/nearby?lat={PICKUP['lat']}&lng={PICKUP['lng']}",
            headers={"Authorization": f"Bearer {passenger_token}"}
        )
        print(f"Nearby drivers status: {response.status_code}")
        assert response.status_code == 200
        data = response.json()
        assert "drivers" in data
        assert len(data["drivers"]) >= 3  # Should return at least 3 (simulated if needed)
        print(f"✓ Found {len(data['drivers'])} nearby drivers")
    
    def test_ride_estimate(self, api_client, passenger_token):
        print("\n=== Testing ride estimate ===")
        response = api_client.post(
            f"{BASE_URL}/api/rides/estimate",
            json={
                "pickup_lat": PICKUP["lat"],
                "pickup_lng": PICKUP["lng"],
                "dest_lat": DEST["lat"],
                "dest_lng": DEST["lng"]
            },
            headers={"Authorization": f"Bearer {passenger_token}"}
        )
        print(f"Estimate status: {response.status_code}")
        assert response.status_code == 200
        data = response.json()
        assert "options" in data
        assert len(data["options"]) == 3  # economy, premium, xl
        
        # Verify all ride types present
        types = [opt["type"] for opt in data["options"]]
        assert "economy" in types
        assert "premium" in types
        assert "xl" in types
        
        # Verify fare structure
        for opt in data["options"]:
            assert "fare" in opt
            assert "distance_km" in opt
            assert "duration_min" in opt
            assert opt["fare"] > 0
        
        print(f"✓ Got 3 ride options: {types}")
        print(f"  Economy: ${data['options'][0]['fare']}")
    
    def test_request_ride_and_verify(self, api_client, passenger_token):
        print("\n=== Testing ride request + verification ===")
        
        # Request ride
        response = api_client.post(
            f"{BASE_URL}/api/rides/request",
            json={
                "pickup_lat": PICKUP["lat"],
                "pickup_lng": PICKUP["lng"],
                "pickup_address": PICKUP["address"],
                "dest_lat": DEST["lat"],
                "dest_lng": DEST["lng"],
                "dest_address": DEST["address"],
                "ride_type": "economy"
            },
            headers={"Authorization": f"Bearer {passenger_token}"}
        )
        print(f"Request ride status: {response.status_code}")
        
        if response.status_code == 400 and "already have an active ride" in response.text:
            print("⚠ Passenger already has active ride, cancelling first...")
            # Get current ride and cancel it
            current = api_client.get(f"{BASE_URL}/api/rides/current", headers={"Authorization": f"Bearer {passenger_token}"})
            if current.status_code == 200 and current.json():
                ride_id = current.json()["id"]
                api_client.post(f"{BASE_URL}/api/rides/{ride_id}/cancel", json={}, headers={"Authorization": f"Bearer {passenger_token}"})
                time.sleep(1)
                # Retry request
                response = api_client.post(
                    f"{BASE_URL}/api/rides/request",
                    json={
                        "pickup_lat": PICKUP["lat"],
                        "pickup_lng": PICKUP["lng"],
                        "pickup_address": PICKUP["address"],
                        "dest_lat": DEST["lat"],
                        "dest_lng": DEST["lng"],
                        "dest_address": DEST["address"],
                        "ride_type": "economy"
                    },
                    headers={"Authorization": f"Bearer {passenger_token}"}
                )
        
        assert response.status_code == 200
        ride = response.json()
        assert ride["status"] == "pending"
        assert ride["ride_type"] == "economy"
        assert ride["passenger_id"] is not None
        assert ride["driver_id"] is None
        assert "_id" not in ride
        print(f"✓ Ride requested: {ride['id']}")
        
        # Verify persistence with GET
        get_response = api_client.get(
            f"{BASE_URL}/api/rides/{ride['id']}",
            headers={"Authorization": f"Bearer {passenger_token}"}
        )
        assert get_response.status_code == 200
        persisted = get_response.json()
        assert persisted["id"] == ride["id"]
        assert persisted["status"] == "pending"
        print(f"✓ Ride persisted in database")
        
        return ride["id"]
    
    def test_get_current_ride(self, api_client, passenger_token):
        print("\n=== Testing get current ride ===")
        response = api_client.get(
            f"{BASE_URL}/api/rides/current",
            headers={"Authorization": f"Bearer {passenger_token}"}
        )
        print(f"Current ride status: {response.status_code}")
        assert response.status_code == 200
        # May be null or a ride object
        data = response.json()
        if data:
            assert "id" in data
            assert "_id" not in data
            print(f"✓ Current ride: {data.get('status')}")
        else:
            print("✓ No current ride")
    
    def test_cancel_ride(self, api_client, passenger_token):
        print("\n=== Testing ride cancellation ===")
        
        # First create a ride
        create_res = api_client.post(
            f"{BASE_URL}/api/rides/request",
            json={
                "pickup_lat": PICKUP["lat"],
                "pickup_lng": PICKUP["lng"],
                "pickup_address": PICKUP["address"],
                "dest_lat": DEST["lat"],
                "dest_lng": DEST["lng"],
                "dest_address": DEST["address"],
                "ride_type": "economy"
            },
            headers={"Authorization": f"Bearer {passenger_token}"}
        )
        
        if create_res.status_code == 400:
            # Already has active ride, get it
            current = api_client.get(f"{BASE_URL}/api/rides/current", headers={"Authorization": f"Bearer {passenger_token}"})
            if current.status_code == 200 and current.json():
                ride_id = current.json()["id"]
            else:
                pytest.skip("Cannot create or find ride to cancel")
        else:
            ride_id = create_res.json()["id"]
        
        # Cancel it
        response = api_client.post(
            f"{BASE_URL}/api/rides/{ride_id}/cancel",
            json={},
            headers={"Authorization": f"Bearer {passenger_token}"}
        )
        print(f"Cancel status: {response.status_code}")
        assert response.status_code == 200
        assert response.json()["ok"] is True
        
        # Verify cancellation
        get_res = api_client.get(f"{BASE_URL}/api/rides/{ride_id}", headers={"Authorization": f"Bearer {passenger_token}"})
        assert get_res.json()["status"] == "cancelled"
        print(f"✓ Ride cancelled successfully")


class TestDriverFlow:
    """Driver endpoints and ride progression"""
    
    @pytest.fixture
    def driver_token(self, api_client):
        """Get driver auth token"""
        response = api_client.post(f"{BASE_URL}/api/auth/login", json=DEMO_DRIVER)
        return response.json()["token"]
    
    @pytest.fixture
    def passenger_token(self, api_client):
        """Get passenger auth token"""
        response = api_client.post(f"{BASE_URL}/api/auth/login", json=DEMO_PASSENGER)
        return response.json()["token"]
    
    def test_driver_status_toggle(self, api_client, driver_token):
        print("\n=== Testing driver status toggle ===")
        
        # Go online
        response = api_client.post(
            f"{BASE_URL}/api/driver/status",
            json={"online": True, "lat": PICKUP["lat"], "lng": PICKUP["lng"]},
            headers={"Authorization": f"Bearer {driver_token}"}
        )
        print(f"Go online status: {response.status_code}")
        assert response.status_code == 200
        data = response.json()
        assert data["online"] is True
        assert "_id" not in data
        print("✓ Driver is online")
        
        # Go offline
        response = api_client.post(
            f"{BASE_URL}/api/driver/status",
            json={"online": False},
            headers={"Authorization": f"Bearer {driver_token}"}
        )
        assert response.status_code == 200
        assert response.json()["online"] is False
        print("✓ Driver is offline")
    
    def test_driver_incoming_when_offline(self, api_client, driver_token):
        print("\n=== Testing incoming requests when offline ===")
        
        # Ensure offline
        api_client.post(
            f"{BASE_URL}/api/driver/status",
            json={"online": False},
            headers={"Authorization": f"Bearer {driver_token}"}
        )
        
        response = api_client.get(
            f"{BASE_URL}/api/driver/incoming",
            headers={"Authorization": f"Bearer {driver_token}"}
        )
        print(f"Incoming status: {response.status_code}")
        assert response.status_code == 200
        data = response.json()
        assert data["request"] is None
        print("✓ No requests when offline")
    
    def test_driver_incoming_when_online(self, api_client, driver_token, passenger_token):
        print("\n=== Testing incoming requests when online ===")
        
        # Go online
        api_client.post(
            f"{BASE_URL}/api/driver/status",
            json={"online": True, "lat": PICKUP["lat"], "lng": PICKUP["lng"]},
            headers={"Authorization": f"Bearer {driver_token}"}
        )
        
        # Create a pending ride from passenger
        ride_res = api_client.post(
            f"{BASE_URL}/api/rides/request",
            json={
                "pickup_lat": PICKUP["lat"],
                "pickup_lng": PICKUP["lng"],
                "pickup_address": PICKUP["address"],
                "dest_lat": DEST["lat"],
                "dest_lng": DEST["lng"],
                "dest_address": DEST["address"],
                "ride_type": "economy"
            },
            headers={"Authorization": f"Bearer {passenger_token}"}
        )
        
        if ride_res.status_code == 400:
            print("⚠ Passenger has active ride, skipping")
            pytest.skip("Passenger has active ride")
        
        # Check incoming
        response = api_client.get(
            f"{BASE_URL}/api/driver/incoming",
            headers={"Authorization": f"Bearer {driver_token}"}
        )
        print(f"Incoming status: {response.status_code}")
        assert response.status_code == 200
        data = response.json()
        
        if data["request"]:
            assert "id" in data["request"]
            assert data["request"]["status"] == "pending"
            assert data["request"]["ride_type"] == "economy"
            print(f"✓ Got incoming request: {data['request']['id']}")
        else:
            print("⚠ No matching requests (may be distance/vehicle type mismatch)")
    
    def test_driver_incoming_response_contract_unchanged(self, api_client, driver_token, passenger_token):
        print("\n=== Testing driver_incoming response contract is unaffected by additive fields ===")

        # Go online
        api_client.post(
            f"{BASE_URL}/api/driver/status",
            json={"online": True, "lat": PICKUP["lat"], "lng": PICKUP["lng"]},
            headers={"Authorization": f"Bearer {driver_token}"}
        )

        # Create a pending ride from passenger
        ride_res = api_client.post(
            f"{BASE_URL}/api/rides/request",
            json={
                "pickup_lat": PICKUP["lat"],
                "pickup_lng": PICKUP["lng"],
                "pickup_address": PICKUP["address"],
                "dest_lat": DEST["lat"],
                "dest_lng": DEST["lng"],
                "dest_address": DEST["address"],
                "ride_type": "economy"
            },
            headers={"Authorization": f"Bearer {passenger_token}"}
        )
        if ride_res.status_code == 400:
            print("⚠ Passenger has active ride, skipping")
            pytest.skip("Passenger has active ride")

        response = api_client.get(
            f"{BASE_URL}/api/driver/incoming",
            headers={"Authorization": f"Bearer {driver_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "request" in data

        req = data["request"]
        if req is None:
            print("⚠ No matching requests (may be distance/vehicle type mismatch)")
            return

        # Existing documented fields must still be present and correctly typed,
        # regardless of the two new additive fields (assignment_type, assigned_by).
        for field in ("id", "status", "ride_type", "passenger_id", "pickup", "destination"):
            assert field in req, f"existing field '{field}' missing from driver_incoming response"
        assert req["status"] == "pending"
        assert req["ride_type"] == "economy"
        assert isinstance(req["pickup"], dict)
        assert isinstance(req["destination"], dict)
        assert "distance_to_pickup_km" in req  # pre-existing additive field, unrelated to dispatch feature
        print("✓ driver_incoming existing fields unaffected by additive dispatch fields")

        ride_id = req["id"]
        accept_res = api_client.post(
            f"{BASE_URL}/api/rides/{ride_id}/accept",
            json={},
            headers={"Authorization": f"Bearer {driver_token}"}
        )
        assert accept_res.status_code == 200
        accepted = accept_res.json()
        for field in ("id", "status", "driver_id", "driver_name", "passenger_id", "fare"):
            assert field in accepted, f"existing field '{field}' missing from accept_ride response"
        assert accepted["status"] == "accepted"
        assert accepted["driver_id"] is not None
        print("✓ accept_ride existing fields unaffected by additive dispatch fields")

    def test_driver_location_update(self, api_client, driver_token):
        print("\n=== Testing driver location update ===")
        response = api_client.post(
            f"{BASE_URL}/api/driver/location",
            json={"lat": 37.7850, "lng": -122.4100},
            headers={"Authorization": f"Bearer {driver_token}"}
        )
        print(f"Location update status: {response.status_code}")
        assert response.status_code == 200
        assert response.json()["ok"] is True
        print("✓ Location updated")
    
    def test_driver_earnings(self, api_client, driver_token):
        print("\n=== Testing driver earnings ===")
        response = api_client.get(
            f"{BASE_URL}/api/driver/earnings",
            headers={"Authorization": f"Bearer {driver_token}"}
        )
        print(f"Earnings status: {response.status_code}")
        assert response.status_code == 200
        data = response.json()
        assert "total" in data
        assert "today" in data
        assert "week" in data
        assert "total_trips" in data
        assert "today_trips" in data
        print(f"✓ Earnings: Total ${data['total']}, Today ${data['today']}, Trips {data['total_trips']}")


DEMO_DISPATCHER = {
    "email": "TEST_dispatcher_bootstrap@example.com",
    "password": "DispatcherPass123!",
    "role": "dispatcher",
}


class TestManualAssignmentDriverFlow:
    """Non-interference regression test (dispatch-control-room, Requirements 7.2, 7.4).

    Confirms a ride manually reserved by a dispatcher via
    `POST /api/dispatch/rides/{id}/assign` flows through the EXISTING,
    unmodified driver flow (`GET /api/driver/incoming`,
    `POST /api/rides/{id}/accept`) exactly as an automatically-matched ride
    would -- i.e. manual-assignment reservations are honored by the existing
    flow without any modification to it.

    Dispatcher bootstrapping note: `seed_demo_accounts()` in `main.py` does
    not seed a demo dispatcher account (only `passenger@demo.com` and
    `driver@demo.com`), and `POST /api/dispatch/accounts` -- the only API
    endpoint that creates a dispatcher account -- itself requires an existing
    dispatcher token to call (by design: Requirement 1.9 states dispatcher
    accounts are provisioned only by other dispatchers, and there is
    intentionally no public self-registration for the role, Requirement 1.8).
    There is therefore no way to obtain the *first* dispatcher account
    through the HTTP API alone. This suite otherwise talks to the live
    backend exclusively over HTTP; to bootstrap the first dispatcher account
    for testing without modifying the production seed in `main.py`, the
    `dispatcher_token` fixture below falls back to a direct, test-local
    database write that mirrors the exact document shape `seed_demo_accounts`
    and `POST /api/dispatch/accounts` already use. If the test process cannot
    reach the database (e.g. `MONGO_URL`/`DB_NAME` unset or unreachable in the
    environment running pytest), the test skips gracefully instead of failing.
    """

    @pytest.fixture(scope="class")
    def dispatcher_token(self, api_client):
        # Reuse an existing bootstrapped account across test runs, if present.
        login_res = api_client.post(f"{BASE_URL}/api/auth/login", json=DEMO_DISPATCHER)
        if login_res.status_code == 200:
            return login_res.json()["token"]

        try:
            import bcrypt
            from pymongo import MongoClient
        except ImportError:
            pytest.skip("pymongo/bcrypt not available to bootstrap a dispatcher account")

        mongo_url = os.getenv("MONGO_URL", "mongodb://localhost:27017")
        db_name = os.getenv("DB_NAME", "test")
        try:
            mongo_client = MongoClient(mongo_url, serverSelectionTimeoutMS=2000)
            mongo_client.admin.command("ping")
        except Exception:
            pytest.skip(
                f"No demo dispatcher account exists and MongoDB at {mongo_url} is not "
                "reachable from the test process to bootstrap one"
            )

        try:
            mongo_db = mongo_client[db_name]
            if not mongo_db.users.find_one({"email": DEMO_DISPATCHER["email"]}):
                import uuid
                from datetime import datetime, timezone

                mongo_db.users.insert_one(
                    {
                        "id": str(uuid.uuid4()),
                        "email": DEMO_DISPATCHER["email"],
                        "password_hash": bcrypt.hashpw(
                            DEMO_DISPATCHER["password"].encode(), bcrypt.gensalt()
                        ).decode(),
                        "name": "Test Bootstrap Dispatcher",
                        "role": "dispatcher",
                        "phone": "",
                        "rating": 5.0,
                        "num_ratings": 0,
                        "created_at": datetime.now(timezone.utc).isoformat(),
                        "created_by": None,
                    }
                )
        finally:
            mongo_client.close()

        login_res = api_client.post(f"{BASE_URL}/api/auth/login", json=DEMO_DISPATCHER)
        if login_res.status_code != 200:
            pytest.skip("Could not authenticate the bootstrapped dispatcher account")
        return login_res.json()["token"]

    @pytest.fixture
    def passenger_token(self, api_client):
        response = api_client.post(f"{BASE_URL}/api/auth/login", json=DEMO_PASSENGER)
        return response.json()["token"]

    @pytest.fixture
    def driver_token(self, api_client):
        response = api_client.post(f"{BASE_URL}/api/auth/login", json=DEMO_DRIVER)
        return response.json()["token"]

    def test_manually_reserved_ride_flows_through_existing_driver_accept_flow(
        self, api_client, dispatcher_token, passenger_token, driver_token
    ):
        print("\n=== Testing manually-assigned ride through existing driver flow ===")

        # Ensure the driver is online and idle, and capture its id.
        api_client.post(
            f"{BASE_URL}/api/driver/status",
            json={"online": True, "lat": PICKUP["lat"], "lng": PICKUP["lng"]},
            headers={"Authorization": f"Bearer {driver_token}"}
        )
        me_res = api_client.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {driver_token}"})
        assert me_res.status_code == 200
        driver_id = me_res.json()["id"]

        # 1. Passenger creates a pending ride.
        ride_res = api_client.post(
            f"{BASE_URL}/api/rides/request",
            json={
                "pickup_lat": PICKUP["lat"],
                "pickup_lng": PICKUP["lng"],
                "pickup_address": PICKUP["address"],
                "dest_lat": DEST["lat"],
                "dest_lng": DEST["lng"],
                "dest_address": DEST["address"],
                "ride_type": "economy"
            },
            headers={"Authorization": f"Bearer {passenger_token}"}
        )
        if ride_res.status_code == 400:
            current = api_client.get(f"{BASE_URL}/api/rides/current", headers={"Authorization": f"Bearer {passenger_token}"})
            if current.status_code == 200 and current.json():
                api_client.post(
                    f"{BASE_URL}/api/rides/{current.json()['id']}/cancel",
                    json={},
                    headers={"Authorization": f"Bearer {passenger_token}"}
                )
                time.sleep(1)
                ride_res = api_client.post(
                    f"{BASE_URL}/api/rides/request",
                    json={
                        "pickup_lat": PICKUP["lat"],
                        "pickup_lng": PICKUP["lng"],
                        "pickup_address": PICKUP["address"],
                        "dest_lat": DEST["lat"],
                        "dest_lng": DEST["lng"],
                        "dest_address": DEST["address"],
                        "ride_type": "economy"
                    },
                    headers={"Authorization": f"Bearer {passenger_token}"}
                )
        assert ride_res.status_code == 200
        ride = ride_res.json()
        ride_id = ride["id"]
        assert ride["status"] == "pending"
        print(f"✓ Ride requested: {ride_id}")

        # 2. Dispatcher manually assigns the ride to the online, idle driver.
        assign_res = api_client.post(
            f"{BASE_URL}/api/dispatch/rides/{ride_id}/assign",
            json={"driver_id": driver_id},
            headers={"Authorization": f"Bearer {dispatcher_token}"}
        )
        print(f"Manual assign status: {assign_res.status_code}")
        assert assign_res.status_code == 200
        assigned = assign_res.json()
        assert assigned["reserved_by"] == driver_id
        assert assigned["assignment_type"] == "manual"
        assert assigned["assigned_by"] is not None
        assert assigned["status"] in ("accepted", "pending")  # directly accepted or reserved
        print("✓ Manual assignment completed")

        # 3. Confirm the manual assignment succeeded via a subsequent GET.
        get_res = api_client.get(f"{BASE_URL}/api/rides/{ride_id}", headers={"Authorization": f"Bearer {passenger_token}"})
        assert get_res.status_code == 200
        persisted = get_res.json()
        assert persisted["reserved_by"] == driver_id
        assert persisted["assignment_type"] == "manual"
        print("✓ Manual reservation confirmed on subsequent GET")

        # 4. As the assigned driver, the EXISTING /api/driver/incoming endpoint
        # must not be blocked or broken by the manual reservation. `can_consider`
        # excludes any ride with a valid (non-expired) reservation regardless of
        # holder, so this ride is correctly left out of `driver_incoming`'s own
        # re-matching pass -- the driver accepts it directly below instead,
        # exactly as the design intends (Requirement 4.4).
        incoming_res = api_client.get(
            f"{BASE_URL}/api/driver/incoming",
            headers={"Authorization": f"Bearer {driver_token}"}
        )
        assert incoming_res.status_code == 200
        incoming = incoming_res.json()
        assert "request" in incoming
        if incoming["request"] is not None:
            assert incoming["request"]["id"] != ride_id, (
                "driver_incoming should not re-reserve an already validly-reserved ride"
            )
        print("✓ driver_incoming behaves normally alongside the manual reservation")

        # 5. The EXISTING accept endpoint must accept the manually-reserved ride
        # exactly as it would an automatically-matched one, with no modification
        # to that endpoint's own logic.
        accept_res = api_client.post(
            f"{BASE_URL}/api/rides/{ride_id}/accept",
            json={},
            headers={"Authorization": f"Bearer {driver_token}"}
        )
        print(f"Accept status: {accept_res.status_code}")
        assert accept_res.status_code == 200
        accepted = accept_res.json()
        assert accepted["status"] == "accepted"
        assert accepted["driver_id"] == driver_id
        assert accepted["driver_name"] is not None
        print(f"✓ Manually-reserved ride accepted via existing accept flow by {accepted['driver_name']}")

        # 6. Passenger-side visibility of the accepted ride is unaffected: a GET
        # on the ride shows driver info, same as any other accepted ride.
        passenger_view = api_client.get(f"{BASE_URL}/api/rides/{ride_id}", headers={"Authorization": f"Bearer {passenger_token}"})
        assert passenger_view.status_code == 200
        passenger_ride = passenger_view.json()
        assert passenger_ride["status"] == "accepted"
        assert passenger_ride["driver_id"] == driver_id
        assert passenger_ride["driver_name"] is not None
        print(f"✓ Passenger sees accepted ride with driver: {passenger_ride['driver_name']}")

        # Cleanup: bring the ride to a terminal state so it doesn't linger as
        # an active ride for the shared demo passenger/driver accounts.
        api_client.post(f"{BASE_URL}/api/rides/{ride_id}/arrive", json={}, headers={"Authorization": f"Bearer {driver_token}"})
        api_client.post(f"{BASE_URL}/api/rides/{ride_id}/start", json={}, headers={"Authorization": f"Bearer {driver_token}"})
        api_client.post(f"{BASE_URL}/api/rides/{ride_id}/complete", json={}, headers={"Authorization": f"Bearer {driver_token}"})


class TestEndToEndRide:
    """Complete ride flow from request to completion"""
    
    @pytest.fixture
    def passenger_token(self, api_client):
        response = api_client.post(f"{BASE_URL}/api/auth/login", json=DEMO_PASSENGER)
        return response.json()["token"]
    
    @pytest.fixture
    def driver_token(self, api_client):
        response = api_client.post(f"{BASE_URL}/api/auth/login", json=DEMO_DRIVER)
        return response.json()["token"]
    
    def test_complete_ride_flow(self, api_client, passenger_token, driver_token):
        print("\n=== Testing complete ride flow ===")
        
        # 1. Passenger requests ride
        print("Step 1: Passenger requests ride")
        ride_res = api_client.post(
            f"{BASE_URL}/api/rides/request",
            json={
                "pickup_lat": PICKUP["lat"],
                "pickup_lng": PICKUP["lng"],
                "pickup_address": PICKUP["address"],
                "dest_lat": DEST["lat"],
                "dest_lng": DEST["lng"],
                "dest_address": DEST["address"],
                "ride_type": "economy"
            },
            headers={"Authorization": f"Bearer {passenger_token}"}
        )
        
        if ride_res.status_code == 400:
            # Cancel existing ride
            current = api_client.get(f"{BASE_URL}/api/rides/current", headers={"Authorization": f"Bearer {passenger_token}"})
            if current.json():
                api_client.post(f"{BASE_URL}/api/rides/{current.json()['id']}/cancel", json={}, headers={"Authorization": f"Bearer {passenger_token}"})
                time.sleep(1)
                ride_res = api_client.post(
                    f"{BASE_URL}/api/rides/request",
                    json={
                        "pickup_lat": PICKUP["lat"],
                        "pickup_lng": PICKUP["lng"],
                        "pickup_address": PICKUP["address"],
                        "dest_lat": DEST["lat"],
                        "dest_lng": DEST["lng"],
                        "dest_address": DEST["address"],
                        "ride_type": "economy"
                    },
                    headers={"Authorization": f"Bearer {passenger_token}"}
                )
        
        assert ride_res.status_code == 200
        ride = ride_res.json()
        ride_id = ride["id"]
        assert ride["status"] == "pending"
        print(f"✓ Ride requested: {ride_id}")
        
        # 2. Driver goes online
        print("Step 2: Driver goes online")
        api_client.post(
            f"{BASE_URL}/api/driver/status",
            json={"online": True, "lat": PICKUP["lat"], "lng": PICKUP["lng"]},
            headers={"Authorization": f"Bearer {driver_token}"}
        )
        print("✓ Driver online")
        
        # 3. Driver accepts ride
        print("Step 3: Driver accepts ride")
        accept_res = api_client.post(
            f"{BASE_URL}/api/rides/{ride_id}/accept",
            json={},
            headers={"Authorization": f"Bearer {driver_token}"}
        )
        assert accept_res.status_code == 200
        accepted = accept_res.json()
        assert accepted["status"] == "accepted"
        assert accepted["driver_id"] is not None
        assert accepted["driver_name"] is not None
        print(f"✓ Ride accepted by {accepted['driver_name']}")
        
        # Verify passenger can see driver info
        passenger_view = api_client.get(f"{BASE_URL}/api/rides/{ride_id}", headers={"Authorization": f"Bearer {passenger_token}"})
        assert passenger_view.json()["driver_name"] is not None
        print(f"✓ Passenger sees driver: {passenger_view.json()['driver_name']}")
        
        # 4. Driver arrives
        print("Step 4: Driver arrives at pickup")
        arrive_res = api_client.post(
            f"{BASE_URL}/api/rides/{ride_id}/arrive",
            json={},
            headers={"Authorization": f"Bearer {driver_token}"}
        )
        assert arrive_res.status_code == 200
        
        # Verify status
        ride_check = api_client.get(f"{BASE_URL}/api/rides/{ride_id}", headers={"Authorization": f"Bearer {passenger_token}"})
        assert ride_check.json()["status"] == "arrived"
        print("✓ Driver arrived")
        
        # 5. Driver starts trip
        print("Step 5: Driver starts trip")
        start_res = api_client.post(
            f"{BASE_URL}/api/rides/{ride_id}/start",
            json={},
            headers={"Authorization": f"Bearer {driver_token}"}
        )
        assert start_res.status_code == 200
        
        ride_check = api_client.get(f"{BASE_URL}/api/rides/{ride_id}", headers={"Authorization": f"Bearer {passenger_token}"})
        assert ride_check.json()["status"] == "in_progress"
        print("✓ Trip started")
        
        # 6. Driver completes trip
        print("Step 6: Driver completes trip")
        complete_res = api_client.post(
            f"{BASE_URL}/api/rides/{ride_id}/complete",
            json={},
            headers={"Authorization": f"Bearer {driver_token}"}
        )
        assert complete_res.status_code == 200
        completed = complete_res.json()
        assert completed["status"] == "completed"
        print(f"✓ Trip completed, fare: ${completed['fare']}")
        
        return ride_id


class TestChat:
    """In-ride chat functionality"""
    
    @pytest.fixture
    def passenger_token(self, api_client):
        response = api_client.post(f"{BASE_URL}/api/auth/login", json=DEMO_PASSENGER)
        return response.json()["token"]
    
    @pytest.fixture
    def driver_token(self, api_client):
        response = api_client.post(f"{BASE_URL}/api/auth/login", json=DEMO_DRIVER)
        return response.json()["token"]
    
    def test_chat_messages(self, api_client, passenger_token, driver_token):
        print("\n=== Testing chat messages ===")
        
        # Create a ride first
        ride_res = api_client.post(
            f"{BASE_URL}/api/rides/request",
            json={
                "pickup_lat": PICKUP["lat"],
                "pickup_lng": PICKUP["lng"],
                "pickup_address": PICKUP["address"],
                "dest_lat": DEST["lat"],
                "dest_lng": DEST["lng"],
                "dest_address": DEST["address"],
                "ride_type": "economy"
            },
            headers={"Authorization": f"Bearer {passenger_token}"}
        )
        
        if ride_res.status_code == 400:
            current = api_client.get(f"{BASE_URL}/api/rides/current", headers={"Authorization": f"Bearer {passenger_token}"})
            if current.json():
                ride_id = current.json()["id"]
            else:
                pytest.skip("Cannot create ride for chat test")
        else:
            ride_id = ride_res.json()["id"]
            # Accept it so both have access
            api_client.post(f"{BASE_URL}/api/driver/status", json={"online": True, "lat": PICKUP["lat"], "lng": PICKUP["lng"]}, headers={"Authorization": f"Bearer {driver_token}"})
            api_client.post(f"{BASE_URL}/api/rides/{ride_id}/accept", json={}, headers={"Authorization": f"Bearer {driver_token}"})
        
        # Passenger sends message
        print("Passenger sends message")
        msg1_res = api_client.post(
            f"{BASE_URL}/api/rides/{ride_id}/messages",
            json={"text": "I'm wearing a blue jacket"},
            headers={"Authorization": f"Bearer {passenger_token}"}
        )
        assert msg1_res.status_code == 200
        msg1 = msg1_res.json()
        assert msg1["text"] == "I'm wearing a blue jacket"
        assert msg1["sender_role"] == "passenger"
        assert "_id" not in msg1
        print("✓ Passenger message sent")
        
        # Driver sends message
        print("Driver sends message")
        msg2_res = api_client.post(
            f"{BASE_URL}/api/rides/{ride_id}/messages",
            json={"text": "I see you, on my way!"},
            headers={"Authorization": f"Bearer {driver_token}"}
        )
        assert msg2_res.status_code == 200
        msg2 = msg2_res.json()
        assert msg2["sender_role"] == "driver"
        print("✓ Driver message sent")
        
        # Both can read messages
        print("Reading messages")
        msgs_res = api_client.get(
            f"{BASE_URL}/api/rides/{ride_id}/messages",
            headers={"Authorization": f"Bearer {passenger_token}"}
        )
        assert msgs_res.status_code == 200
        msgs = msgs_res.json()
        assert len(msgs) >= 2
        assert all("_id" not in m for m in msgs)
        print(f"✓ Retrieved {len(msgs)} messages")
    
    def test_chat_non_participant_blocked(self, api_client, passenger_token):
        print("\n=== Testing chat access control ===")
        
        # Try to access messages for a ride we're not part of
        fake_ride_id = "00000000-0000-0000-0000-000000000000"
        response = api_client.get(
            f"{BASE_URL}/api/rides/{fake_ride_id}/messages",
            headers={"Authorization": f"Bearer {passenger_token}"}
        )
        print(f"Non-participant access status: {response.status_code}")
        assert response.status_code in [403, 404]
        print("✓ Non-participants blocked from chat")


class TestRating:
    """Rating system after ride completion"""
    
    @pytest.fixture
    def passenger_token(self, api_client):
        response = api_client.post(f"{BASE_URL}/api/auth/login", json=DEMO_PASSENGER)
        return response.json()["token"]
    
    @pytest.fixture
    def driver_token(self, api_client):
        response = api_client.post(f"{BASE_URL}/api/auth/login", json=DEMO_DRIVER)
        return response.json()["token"]
    
    def test_rating_completed_ride(self, api_client, passenger_token, driver_token):
        print("\n=== Testing ride rating ===")
        
        # Create and complete a ride
        ride_res = api_client.post(
            f"{BASE_URL}/api/rides/request",
            json={
                "pickup_lat": PICKUP["lat"],
                "pickup_lng": PICKUP["lng"],
                "pickup_address": PICKUP["address"],
                "dest_lat": DEST["lat"],
                "dest_lng": DEST["lng"],
                "dest_address": DEST["address"],
                "ride_type": "economy"
            },
            headers={"Authorization": f"Bearer {passenger_token}"}
        )
        
        if ride_res.status_code == 400:
            current = api_client.get(f"{BASE_URL}/api/rides/current", headers={"Authorization": f"Bearer {passenger_token}"})
            if current.json() and current.json()["status"] == "completed":
                ride_id = current.json()["id"]
            else:
                pytest.skip("Cannot create completed ride for rating test")
        else:
            ride_id = ride_res.json()["id"]
            # Complete the ride flow
            api_client.post(f"{BASE_URL}/api/driver/status", json={"online": True, "lat": PICKUP["lat"], "lng": PICKUP["lng"]}, headers={"Authorization": f"Bearer {driver_token}"})
            api_client.post(f"{BASE_URL}/api/rides/{ride_id}/accept", json={}, headers={"Authorization": f"Bearer {driver_token}"})
            api_client.post(f"{BASE_URL}/api/rides/{ride_id}/arrive", json={}, headers={"Authorization": f"Bearer {driver_token}"})
            api_client.post(f"{BASE_URL}/api/rides/{ride_id}/start", json={}, headers={"Authorization": f"Bearer {driver_token}"})
            api_client.post(f"{BASE_URL}/api/rides/{ride_id}/complete", json={}, headers={"Authorization": f"Bearer {driver_token}"})
        
        # Rate the ride
        print("Passenger rates driver")
        rate_res = api_client.post(
            f"{BASE_URL}/api/rides/{ride_id}/rate",
            json={"rating": 5, "comment": "Great driver!"},
            headers={"Authorization": f"Bearer {passenger_token}"}
        )
        assert rate_res.status_code == 200
        print("✓ Rating submitted")
        
        # Verify rating was recorded
        ride_check = api_client.get(f"{BASE_URL}/api/rides/{ride_id}", headers={"Authorization": f"Bearer {passenger_token}"})
        ride_data = ride_check.json()
        assert ride_data.get("rating_given") is True
        print("✓ Rating recorded on ride")
    
    def test_rating_non_completed_ride_blocked(self, api_client, passenger_token):
        print("\n=== Testing rating on non-completed ride ===")
        
        # Create pending ride
        ride_res = api_client.post(
            f"{BASE_URL}/api/rides/request",
            json={
                "pickup_lat": PICKUP["lat"],
                "pickup_lng": PICKUP["lng"],
                "pickup_address": PICKUP["address"],
                "dest_lat": DEST["lat"],
                "dest_lng": DEST["lng"],
                "dest_address": DEST["address"],
                "ride_type": "economy"
            },
            headers={"Authorization": f"Bearer {passenger_token}"}
        )
        
        if ride_res.status_code == 400:
            pytest.skip("Cannot create ride for rating test")
        
        ride_id = ride_res.json()["id"]
        
        # Try to rate pending ride
        rate_res = api_client.post(
            f"{BASE_URL}/api/rides/{ride_id}/rate",
            json={"rating": 5},
            headers={"Authorization": f"Bearer {passenger_token}"}
        )
        print(f"Rating pending ride status: {rate_res.status_code}")
        assert rate_res.status_code == 400
        assert "completed" in rate_res.text.lower()
        print("✓ Cannot rate non-completed ride")


class TestPayments:
    """Stripe payment checkout"""
    
    @pytest.fixture
    def passenger_token(self, api_client):
        response = api_client.post(f"{BASE_URL}/api/auth/login", json=DEMO_PASSENGER)
        return response.json()["token"]
    
    @pytest.fixture
    def driver_token(self, api_client):
        response = api_client.post(f"{BASE_URL}/api/auth/login", json=DEMO_DRIVER)
        return response.json()["token"]
    
    def test_checkout_completed_ride(self, api_client, passenger_token, driver_token):
        print("\n=== Testing Stripe checkout ===")
        
        # Create and complete a ride
        ride_res = api_client.post(
            f"{BASE_URL}/api/rides/request",
            json={
                "pickup_lat": PICKUP["lat"],
                "pickup_lng": PICKUP["lng"],
                "pickup_address": PICKUP["address"],
                "dest_lat": DEST["lat"],
                "dest_lng": DEST["lng"],
                "dest_address": DEST["address"],
                "ride_type": "economy"
            },
            headers={"Authorization": f"Bearer {passenger_token}"}
        )
        
        if ride_res.status_code == 400:
            current = api_client.get(f"{BASE_URL}/api/rides/current", headers={"Authorization": f"Bearer {passenger_token}"})
            if current.json() and current.json()["status"] == "completed" and current.json().get("payment_status") != "paid":
                ride_id = current.json()["id"]
            else:
                pytest.skip("Cannot create completed unpaid ride for payment test")
        else:
            ride_id = ride_res.json()["id"]
            # Complete the ride
            api_client.post(f"{BASE_URL}/api/driver/status", json={"online": True, "lat": PICKUP["lat"], "lng": PICKUP["lng"]}, headers={"Authorization": f"Bearer {driver_token}"})
            api_client.post(f"{BASE_URL}/api/rides/{ride_id}/accept", json={}, headers={"Authorization": f"Bearer {driver_token}"})
            api_client.post(f"{BASE_URL}/api/rides/{ride_id}/arrive", json={}, headers={"Authorization": f"Bearer {driver_token}"})
            api_client.post(f"{BASE_URL}/api/rides/{ride_id}/start", json={}, headers={"Authorization": f"Bearer {driver_token}"})
            api_client.post(f"{BASE_URL}/api/rides/{ride_id}/complete", json={}, headers={"Authorization": f"Bearer {driver_token}"})
        
        # Request checkout
        print("Requesting Stripe checkout")
        checkout_res = api_client.post(
            f"{BASE_URL}/api/payments/checkout",
            json={"ride_id": ride_id, "origin_url": BASE_URL},
            headers={"Authorization": f"Bearer {passenger_token}"}
        )
        print(f"Checkout status: {checkout_res.status_code}")
        assert checkout_res.status_code == 200
        data = checkout_res.json()
        assert "url" in data
        assert "session_id" in data
        assert data["url"].startswith("http")
        print(f"✓ Checkout session created: {data['session_id']}")
    
    def test_checkout_non_completed_ride_blocked(self, api_client, passenger_token):
        print("\n=== Testing checkout on non-completed ride ===")
        
        # Create pending ride
        ride_res = api_client.post(
            f"{BASE_URL}/api/rides/request",
            json={
                "pickup_lat": PICKUP["lat"],
                "pickup_lng": PICKUP["lng"],
                "pickup_address": PICKUP["address"],
                "dest_lat": DEST["lat"],
                "dest_lng": DEST["lng"],
                "dest_address": DEST["address"],
                "ride_type": "economy"
            },
            headers={"Authorization": f"Bearer {passenger_token}"}
        )
        
        if ride_res.status_code == 400:
            pytest.skip("Cannot create ride for payment test")
        
        ride_id = ride_res.json()["id"]
        
        # Try to checkout
        checkout_res = api_client.post(
            f"{BASE_URL}/api/payments/checkout",
            json={"ride_id": ride_id, "origin_url": BASE_URL},
            headers={"Authorization": f"Bearer {passenger_token}"}
        )
        print(f"Checkout pending ride status: {checkout_res.status_code}")
        assert checkout_res.status_code == 400
        assert "not completed" in checkout_res.text.lower()
        print("✓ Cannot checkout non-completed ride")


# Cleanup fixture
@pytest.fixture(scope="session", autouse=True)
def cleanup():
    """Cleanup test data after all tests"""
    yield
    print("\n\n=== Cleanup: Cancelling any active test rides ===")
    # This runs after all tests
