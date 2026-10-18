import json
import urllib.request
import urllib.error

BASE_URL = "http://127.0.0.1:8000"

def req(path, method="GET", body=None, token=None):
    url = f"{BASE_URL}{path}"
    data = json.dumps(body).encode("utf-8") if body is not None else None
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request) as resp:
            content = resp.read().decode("utf-8")
            return resp.status, json.loads(content) if content else {}
    except urllib.error.HTTPError as e:
        content = e.read().decode("utf-8")
        try:
            parsed = json.loads(content)
        except Exception:
            parsed = {"detail": content}
        return e.code, parsed

def test_full_pipeline():
    print("=== STEP 1: AUTHENTICATION ===")
    status, d_data = req("/api/auth/login", "POST", {"email": "admin@getchum.co.uk", "password": "ChumAdmin2026!"})
    if status != 200:
        status, d_data = req("/api/auth/login", "POST", {"email": "dispatcher@demo.com", "password": "password123"})
    assert status == 200, f"Dispatcher login failed: {d_data}"
    dispatcher_token = d_data["access_token"]
    print("PASS: Dispatcher authenticated successfully")

    status, p_data = req("/api/auth/login", "POST", {"email": "passenger1@demo.com", "password": "Passenger123!"})
    if status != 200:
        status, p_data = req("/api/auth/login", "POST", {"email": "passenger@demo.com", "password": "password123"})
    assert status == 200, f"Passenger login failed: {p_data}"
    passenger_token = p_data["access_token"]
    print("PASS: Passenger authenticated successfully")

    status, drv_data = req("/api/auth/login", "POST", {"email": "driver1@demo.com", "password": "Driver123!"})
    if status != 200:
        status, drv_data = req("/api/auth/login", "POST", {"email": "driver1@demo.com", "password": "password123"})
    assert status == 200, f"Driver login failed: {drv_data}"
    driver_token = drv_data["access_token"]
    driver_id = drv_data["user"]["id"]
    driver_name = drv_data["user"]["name"]
    print(f"PASS: Driver authenticated: {driver_name} ({driver_id})")

    status, st_data = req("/api/driver/status", "POST", {"online": True, "lat": 56.1165, "lng": -3.1600, "bearing": 90}, driver_token)
    assert status == 200, f"Status update failed: {st_data}"
    print("PASS: Driver status verified ONLINE")

    print("\n=== STEP 2: CREATE PENDING RIDE ===")
    ride_req = {
        "pickup_lat": 56.1105,
        "pickup_lng": -3.1670,
        "pickup_address": "Kirkcaldy Esplanade, Fife",
        "dest_lat": 56.0715,
        "dest_lng": -3.4600,
        "dest_address": "Dunfermline Abbey, Fife",
        "ride_type": "economy"
    }
    status, ride = req("/api/rides/request", "POST", ride_req, passenger_token)
    assert status == 200, f"Ride request failed: {ride}"
    ride_id = ride["id"]
    print(f"PASS: Ride created: {ride_id} (Status: {ride.get('status')})")

    status, pending_res = req("/api/dispatch/rides/pending", "GET", token=dispatcher_token)
    assert status == 200, f"Get pending failed: {pending_res}"
    pending_ids = [r["id"] for r in pending_res.get("rides", [])]
    assert ride_id in pending_ids, "Ride not found in pending dispatch queue!"
    print("PASS: Ride confirmed visible in Pending Dispatch Queue")

    print("\n=== STEP 3: DISPATCHER EXECUTES MANUAL ASSIGN ===")
    status, assigned_data = req(f"/api/dispatch/rides/{ride_id}/assign", "POST", {"driver_id": driver_id}, dispatcher_token)
    assert status == 200, f"Assign failed: {assigned_data}"
    print(f"PASS: Assign endpoint returned 200 OK")
    assert assigned_data.get("status") == "accepted", f"Expected status 'accepted', got {assigned_data.get('status')}"
    assert assigned_data.get("driver_id") == driver_id, "Driver ID mismatch"
    assert assigned_data.get("driver_name") == driver_name, "Driver name mismatch"
    print(f"PASS: Ride successfully bound to driver: {assigned_data.get('driver_name')} [Plate: {assigned_data.get('vehicle_plate')}, Council: {assigned_data.get('council_name')}]")

    print("\n=== STEP 4: VERIFY CONTROL ROOM QUEUES ===")
    status, pending_after = req("/api/dispatch/rides/pending", "GET", token=dispatcher_token)
    assert status == 200
    pending_after_ids = [r["id"] for r in pending_after.get("rides", [])]
    assert ride_id not in pending_after_ids, "ERROR: Assigned ride is still in pending queue!"
    print("PASS: Ride successfully removed from Pending Queue")

    status, active_res = req("/api/dispatch/rides/active", "GET", token=dispatcher_token)
    assert status == 200
    active_rides = {r["id"]: r for r in active_res.get("rides", [])}
    assert ride_id in active_rides, "ERROR: Assigned ride is not in Active Rides list!"
    print(f"PASS: Ride is in Active Rides list with driver: {active_rides[ride_id].get('driver_name')}")

    print("\n=== STEP 5: VERIFY PASSENGER VIEW ===")
    status, pass_ride = req(f"/api/rides/{ride_id}", "GET", token=passenger_token)
    assert status == 200
    assert pass_ride.get("status") == "accepted"
    assert pass_ride.get("driver_id") == driver_id
    print(f"PASS: Passenger screen updated to Accepted: Driver {pass_ride.get('driver_name')} driving {pass_ride.get('vehicle_make')} [{pass_ride.get('vehicle_plate')}]")

    print("\n=== STEP 6: VERIFY DRIVER LIFECYCLE (Arrive -> Start -> Complete) ===")
    status, acc_res = req(f"/api/rides/{ride_id}/accept", "POST", {}, driver_token)
    assert status == 200, f"Driver accept failed: {acc_res}"
    print("PASS: Driver accept endpoint succeeded idempotently")

    status, arr_res = req(f"/api/rides/{ride_id}/arrive", "POST", {}, driver_token)
    assert status == 200, f"Arrive failed: {arr_res}"
    print("PASS: Driver marked arrived at pickup")

    status, start_res = req(f"/api/rides/{ride_id}/start", "POST", {}, driver_token)
    assert status == 200, f"Start trip failed: {start_res}"
    print("PASS: Trip started (in progress)")

    status, comp_res = req(f"/api/rides/{ride_id}/complete", "POST", {}, driver_token)
    assert status == 200, f"Complete trip failed: {comp_res}"
    print("PASS: Trip completed successfully")

    status, final_res = req(f"/api/rides/{ride_id}", "GET", token=passenger_token)
    assert status == 200
    assert final_res.get("status") == "completed"
    print("PASS: Final trip status is COMPLETED")

    print("\n" + "=" * 55)
    print(">>> ALL THOROUGH END-TO-END PIPELINE TESTS PASSED 100%! <<<")
    print("=" * 55)

if __name__ == "__main__":
    test_full_pipeline()
