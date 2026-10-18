"""
GetChum Real-Time Fleet & Customer Simulator
=============================================
Simulates multiple online drivers with real-time GPS tracking and WebSocket connections.
Allows live testing of:
- Control Room Dispatch Dashboard (https://admin.getchum.co.uk)
- Driver incoming offers and auto-dispatch waterfall
- Manual assignment by dispatchers
- Passenger real-time ride tracking and ETAs

Usage:
    python simulate_fleet.py [--url http://localhost:8000] [--auto-accept]
    python simulate_fleet.py --url https://api.getchum.co.uk
"""

import argparse
import asyncio
import json
import functools
import random
import sys
import time
import urllib.request
import urllib.error

# Ensure stdout handles all unicode/emojis safely across Windows and Linux
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

print = functools.partial(print, flush=True)

try:
    import websockets
except ImportError:
    websockets = None

DRIVERS = [
    {
        "email": "driver1@demo.com",
        "password": "Driver123!",
        "name": "David Ross",
        "vehicle": "Skoda Octavia (Silver)",
        "lat": 56.1130,
        "lng": -3.1620,  # Station Area
    },
    {
        "email": "driver2@demo.com",
        "password": "Driver123!",
        "name": "Sarah Jenkins",
        "vehicle": "Toyota Prius (White)",
        "lat": 56.1280,
        "lng": -3.1590,  # Victoria Hospital
    },
    {
        "email": "driver3@demo.com",
        "password": "Driver123!",
        "name": "Mark Miller",
        "vehicle": "VW Passat (Blue)",
        "lat": 56.1085,
        "lng": -3.1550,  # Esplanade / Coast
    },
    {
        "email": "driver4@demo.com",
        "password": "Driver123!",
        "name": "Emma Watson",
        "vehicle": "Mercedes E-Class (Black)",
        "lat": 56.1295,
        "lng": -3.1850,  # Chapel Level / Retail Park
    },
]

PASSENGER = {
    "email": "passenger@demo.com",
    "password": "Passenger123!",
    "name": "Alex Rivera",
}


def http_post(url: str, data: dict, token: str = None) -> dict:
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    body = json.dumps(data).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        err_msg = e.read().decode("utf-8")
        try:
            return {"error": json.loads(err_msg)}
        except Exception:
            return {"error": err_msg, "code": e.code}
    except Exception as ex:
        return {"error": str(ex)}


def http_get(url: str, token: str = None) -> dict:
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, headers=headers, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        err_msg = e.read().decode("utf-8")
        try:
            return {"error": json.loads(err_msg)}
        except Exception:
            return {"error": err_msg, "code": e.code}
    except Exception as ex:
        return {"error": str(ex)}


class SimulatedDriver:
    def __init__(self, cfg: dict, base_url: str, auto_accept: bool = True):
        self.cfg = cfg
        self.base_url = base_url.rstrip("/")
        self.auto_accept = auto_accept
        self.token = None
        self.driver_id = None
        self.lat = cfg["lat"]
        self.lng = cfg["lng"]
        self.active_ride_id = None
        self.busy = False
        self._lock = None

    def login(self) -> bool:
        res = http_post(
            f"{self.base_url}/api/auth/login",
            {"email": self.cfg["email"], "password": self.cfg["password"]},
        )
        if "access_token" in res:
            self.token = res["access_token"]
            self.driver_id = res.get("user", {}).get("id")
            print(f"  [OK] Logged in {self.cfg['name']} ({self.cfg['vehicle']})")
            return True

        # Fallback: auto-register driver if not yet created in this database
        reg_res = http_post(
            f"{self.base_url}/api/auth/register",
            {
                "email": self.cfg["email"],
                "password": self.cfg["password"],
                "name": self.cfg["name"],
                "role": "driver",
                "phone": "+447700900101",
                "vehicle_make": self.cfg["vehicle"],
                "vehicle_plate": "SK23 CHM",
                "vehicle_type": "economy",
            },
        )
        if "access_token" in reg_res:
            self.token = reg_res["access_token"]
            self.driver_id = reg_res.get("user", {}).get("id")
            print(f"  [OK] Registered & Logged in {self.cfg['name']} ({self.cfg['vehicle']})")
            return True

        print(f"  [FAIL] Failed to log in or register {self.cfg['name']}: {res}")
        return False

    def set_online(self) -> bool:
        if not self.token:
            return False
        res = http_post(
            f"{self.base_url}/api/driver/status",
            {"online": True, "lat": self.lat, "lng": self.lng, "bearing": 0.0},
            token=self.token,
        )
        if "online" in res and res["online"] is True:
            print(f"  [ONLINE] {self.cfg['name']} is ONLINE at [{self.lat:.4f}, {self.lng:.4f}]")
            return True
        print(f"  [WARN] Could not set {self.cfg['name']} online: {res}")
        return False

    def update_location(self, lat: float, lng: float, bearing: float = 0.0):
        self.lat = lat
        self.lng = lng
        http_post(
            f"{self.base_url}/api/driver/status",
            {"online": True, "lat": lat, "lng": lng, "bearing": bearing},
            token=self.token,
        )

    async def handle_ride_lifecycle(self, ride: dict):
        ride_id = ride.get("id")
        if not ride_id:
            return

        if self._lock is None:
            self._lock = asyncio.Lock()

        async with self._lock:
            if self.busy or self.active_ride_id == ride_id:
                return
            self.busy = True
            self.active_ride_id = ride_id

        pickup = ride.get("pickup", {})
        dropoff = ride.get("destination", {}) or ride.get("dropoff", {})
        p_lat = pickup.get("lat", self.lat)
        p_lng = pickup.get("lng", self.lng)
        d_lat = dropoff.get("lat", self.lat + 0.01)
        d_lng = dropoff.get("lng", self.lng + 0.01)

        print(f"\n[TAXI] [{self.cfg['name']}] >>> RIDE OFFER RECEIVED! <<<")
        print(f"     Ride ID: {ride_id}")
        print(f"     Pickup:  {pickup.get('address', 'Unknown')} ({p_lat:.4f}, {p_lng:.4f})")
        print(f"     Dropoff: {dropoff.get('address', 'Unknown')} ({d_lat:.4f}, {d_lng:.4f})")
        print(f"     Fare:    GBP {ride.get('fare', '0.00')}")

        if not self.auto_accept:
            print(f"     (Auto-accept disabled, waiting for manual dispatch or countdown...)")
            self.busy = False
            return

        # 1. Simulate 2.5s driver inspection of offer
        print(f"     Accepting offer in 2.5 seconds...")
        await asyncio.sleep(2.5)

        accept_res = http_post(
            f"{self.base_url}/api/rides/{ride_id}/accept",
            {},
            token=self.token,
        )
        if "error" in accept_res:
            err_str = str(accept_res).lower()
            if "accepted" not in err_str:
                print(f"     [FAIL] Could not accept ride #{ride_id}: {accept_res['error']}")
                self.busy = False
                self.active_ride_id = None
                return

        print(f"  [OK] [{self.cfg['name']}] Ride #{ride_id} ACCEPTED! Driving to pickup...")

        # 2. Simulate driving towards pickup (5 steps)
        steps = 5
        for i in range(1, steps + 1):
            await asyncio.sleep(2)
            cur_lat = self.lat + (p_lat - self.lat) * (i / steps)
            cur_lng = self.lng + (p_lng - self.lng) * (i / steps)
            self.update_location(cur_lat, cur_lng)
            print(f"     [{self.cfg['name']}] En route to pickup... ({i}/{steps})")

        # 3. Arrive at pickup
        await asyncio.sleep(1)
        http_post(f"{self.base_url}/api/rides/{ride_id}/arrive", {}, token=self.token)
        print(f"  [ARRIVED] [{self.cfg['name']}] ARRIVED at pickup! Waiting for rider...")

        # 4. Wait for passenger to board (4 seconds)
        await asyncio.sleep(4)
        http_post(f"{self.base_url}/api/rides/{ride_id}/start", {}, token=self.token)
        print(f"  [STARTED] [{self.cfg['name']}] TRIP STARTED! Heading to destination...")

        # 5. Simulate driving to dropoff (6 steps)
        steps = 6
        for i in range(1, steps + 1):
            await asyncio.sleep(2)
            cur_lat = self.lat + (d_lat - self.lat) * (i / steps)
            cur_lng = self.lng + (d_lng - self.lng) * (i / steps)
            self.update_location(cur_lat, cur_lng)
            print(f"     [{self.cfg['name']}] En route to destination... ({i}/{steps})")

        # 6. Complete trip
        await asyncio.sleep(1)
        http_post(f"{self.base_url}/api/rides/{ride_id}/complete", {}, token=self.token)
        print(f"  [FINISHED] [{self.cfg['name']}] TRIP COMPLETED! Ride #{ride_id} finished.")
        print(f"     [{self.cfg['name']}] Back online and available for next job.\n")

        self.busy = False
        self.active_ride_id = None

    async def run_ws_loop(self):
        """Connect to driver WebSocket to receive real-time push events."""
        if not websockets:
            await self.run_poll_loop()
            return

        ws_url = self.base_url.replace("http://", "ws://").replace("https://", "wss://")
        uri = f"{ws_url}/ws/driver/{self.driver_id}?token={self.token}"

        while True:
            try:
                async with websockets.connect(uri) as ws:
                    print(f"  [WS CONNECTED] [{self.cfg['name']}] WebSocket live.")
                    while True:
                        msg = await ws.recv()
                        data = json.loads(msg)
                        event = data.get("event")
                        if event in ("ride.offer", "driver.incoming"):
                            ride = data.get("ride") or data.get("request") or {}
                            if ride:
                                asyncio.create_task(self.handle_ride_lifecycle(ride))
            except Exception:
                # Fall back to poll loop if connection fails
                await asyncio.sleep(3)
                if not self.busy:
                    res = http_get(f"{self.base_url}/api/driver/incoming", token=self.token)
                    req = res.get("request") if isinstance(res, dict) else None
                    if req and not self.busy:
                        await self.handle_ride_lifecycle(req)

    async def run_poll_loop(self):
        """Fallback polling in case WebSocket is unavailable."""
        while True:
            await asyncio.sleep(3)
            if not self.busy:
                res = http_get(f"{self.base_url}/api/driver/incoming", token=self.token)
                req = res.get("request") if isinstance(res, dict) else None
                if req and not self.busy:
                    await self.handle_ride_lifecycle(req)

    async def run_heartbeat(self):
        """Minor GPS heartbeat to keep radar positions fresh on Control Room map."""
        while True:
            await asyncio.sleep(6)
            if not self.busy and self.token:
                jitter_lat = self.cfg["lat"] + random.uniform(-0.0003, 0.0003)
                jitter_lng = self.cfg["lng"] + random.uniform(-0.0003, 0.0003)
                self.update_location(jitter_lat, jitter_lng)


async def simulate_passenger_request(base_url: str):
    """Helper to simulate a passenger booking a ride via API."""
    print(f"\n[USER] Logging in passenger ({PASSENGER['email']})...")
    res = http_post(
        f"{base_url}/api/auth/login",
        {"email": PASSENGER["email"], "password": PASSENGER["password"]},
    )
    if "access_token" not in res:
        # Fallback to register
        res = http_post(
            f"{base_url}/api/auth/register",
            {
                "email": PASSENGER["email"],
                "password": PASSENGER["password"],
                "name": PASSENGER["name"],
                "role": "passenger",
                "phone": "+447700900201",
            },
        )
    if "access_token" not in res:
        print(f"[FAIL] Could not login or register passenger: {res}")
        return

    p_token = res["access_token"]

    # Clear any stale ride if exists so new test ride is guaranteed to succeed
    cur_res = http_get(f"{base_url}/api/rides/current", token=p_token)
    if isinstance(cur_res, dict) and cur_res.get("id"):
        http_post(f"{base_url}/api/rides/{cur_res['id']}/cancel", {}, token=p_token)

    print("[OK] Passenger logged in! Requesting a ride from Kirkcaldy High St to Victoria Hospital...")

    ride_body = {
        "pickup_lat": 56.1118,
        "pickup_lng": -3.1580,
        "pickup_address": "124 High Street, Kirkcaldy, KY1 1HQ",
        "dest_lat": 56.1285,
        "dest_lng": -3.1600,
        "dest_address": "Victoria Hospital, Hayfield Road, Kirkcaldy, KY2 5AH",
        "ride_type": "economy",
    }

    create_res = http_post(f"{base_url}/api/rides/request", ride_body, token=p_token)
    if "id" in create_res:
        print(f"[BOOKED] Ride created! ID: {create_res['id']} | Fare: GBP {create_res.get('fare')}")
        print("   Watch the drivers below or your Control Room dashboard auto-dispatch!")
    else:
        print(f"[FAIL] Failed to request ride: {create_res}")


async def main():
    parser = argparse.ArgumentParser(description="GetChum Real-Time Fleet Simulator")
    parser.add_argument("--url", default="http://localhost:8000", help="Backend API URL (e.g. https://api.getchum.co.uk)")
    parser.add_argument("--no-auto-accept", action="store_true", help="Do not auto-accept offers (test manual dispatch)")
    parser.add_argument("--request-ride", action="store_true", help="Also immediately trigger a simulated passenger ride request")
    args = parser.parse_args()

    base_url = args.url.rstrip("/")
    auto_accept = not args.no_auto_accept

    print("==================================================================")
    print("         GetChum Real-Time Fleet & Dispatch Simulator             ")
    print("==================================================================")
    print(f"Target API:   {base_url}")
    print(f"Auto-Accept:  {'ENABLED (Drivers accept & drive)' if auto_accept else 'DISABLED (Manual dispatch mode)'}")
    print("------------------------------------------------------------------")

    drivers = [SimulatedDriver(d, base_url, auto_accept=auto_accept) for d in DRIVERS]

    # Step 0: Login admin to approve driver KYC status
    admin_token = None
    admin_login = http_post(
        f"{base_url}/api/auth/login",
        {"email": "admin@getchum.co.uk", "password": "ChumAdmin2026!"},
    )
    if "access_token" in admin_login:
        admin_token = admin_login["access_token"]
        print("[ADMIN] Logged in Dispatch Control Room to verify driver fleet.")

    print("Step 1: Logging in and placing 4 drivers online...")
    for d in drivers:
        if d.login():
            # If admin is logged in, ensure driver KYC is verified for dispatch eligibility
            if admin_token and d.driver_id:
                http_post(
                    f"{base_url}/api/dispatch/drivers/kyc/review",
                    {"driver_id": d.driver_id, "status": "verified"},
                    token=admin_token,
                )
            d.set_online()

    tasks = []
    for d in drivers:
        tasks.append(asyncio.create_task(d.run_ws_loop()))
        tasks.append(asyncio.create_task(d.run_heartbeat()))

    print("\n------------------------------------------------------------------")
    print("[ONLINE] All 4 drivers are now active and broadcasting live GPS!")
    print("   Open Control Room:  https://admin.getchum.co.uk")
    print("   Open Passenger App: https://getchum.co.uk")
    print("   Press Ctrl+C at any time to stop the simulator.")
    print("------------------------------------------------------------------\n")

    if args.request_ride:
        await asyncio.sleep(2)
        await simulate_passenger_request(base_url)

    await asyncio.gather(*tasks)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n[STOPPED] Simulator stopped. Drivers went offline.")
