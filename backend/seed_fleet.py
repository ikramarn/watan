import asyncio
import os
import sys
import uuid
import bcrypt
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timezone

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')


DEMO_DRIVERS = [
    {
        "email": "driver1@demo.com",
        "password": "Driver123!",
        "name": "David Ross",
        "role": "driver",
        "phone": "+447700900101",
        "vehicle_make": "Skoda Octavia · Silver",
        "vehicle_plate": "SK23 CHM",
        "vehicle_type": "comfort",
        "council_name": "Fife Council",
        "operator_license_number": "PHO-2026-081",
        "phv_badge_number": "PHD-9912",
        "rating": 4.95,
        "num_ratings": 84,
        "lat": 56.1130,
        "lng": -3.1620,  # Near Kirkcaldy Railway Station
    },
    {
        "email": "driver2@demo.com",
        "password": "Driver123!",
        "name": "Sarah Jenkins",
        "role": "driver",
        "phone": "+447700900102",
        "vehicle_make": "Toyota Prius · Hybrid White",
        "vehicle_plate": "SH21 CHM",
        "vehicle_type": "economy",
        "council_name": "Fife Council",
        "operator_license_number": "PHO-2026-082",
        "phv_badge_number": "PHD-8841",
        "rating": 4.90,
        "num_ratings": 61,
        "lat": 56.1280,
        "lng": -3.1590,  # Near Victoria Hospital
    },
    {
        "email": "driver3@demo.com",
        "password": "Driver123!",
        "name": "Mark Miller",
        "role": "driver",
        "phone": "+447700900103",
        "vehicle_make": "Volkswagen Passat · Deep Blue",
        "vehicle_plate": "MK22 CHM",
        "vehicle_type": "comfort",
        "council_name": "Fife Council",
        "operator_license_number": "PHO-2026-083",
        "phv_badge_number": "PHD-7723",
        "rating": 4.88,
        "num_ratings": 39,
        "lat": 56.1085,
        "lng": -3.1550,  # Esplanade / Coastal area
    },
    {
        "email": "driver4@demo.com",
        "password": "Driver123!",
        "name": "Emma Watson",
        "role": "driver",
        "phone": "+447700900104",
        "vehicle_make": "Mercedes-Benz E-Class · Obsidian Black",
        "vehicle_plate": "EM24 CHM",
        "vehicle_type": "executive",
        "council_name": "Fife Council",
        "operator_license_number": "PHO-2026-084",
        "phv_badge_number": "PHD-6650",
        "rating": 4.98,
        "num_ratings": 112,
        "lat": 56.1295,
        "lng": -3.1850,  # Chapel Level / Retail Park
    },
]

DEMO_PASSENGERS = [
    {
        "email": "passenger1@demo.com",
        "password": "Passenger123!",
        "name": "Alex Passenger",
        "role": "passenger",
        "phone": "+447700900201",
        "rating": 5.0,
        "num_ratings": 18,
    },
    {
        "email": "passenger2@demo.com",
        "password": "Passenger123!",
        "name": "Jessica Taylor",
        "role": "passenger",
        "phone": "+447700900202",
        "rating": 4.92,
        "num_ratings": 27,
    },
    {
        "email": "passenger3@demo.com",
        "password": "Passenger123!",
        "name": "John Anderson",
        "role": "passenger",
        "phone": "+447700900203",
        "rating": 5.0,
        "num_ratings": 11,
    },
]

async def seed_fleet():
    mongo_url = os.getenv("MONGO_URL") or os.getenv("MONGODB_URL", "mongodb://localhost:27017")
    db_name = os.getenv("DB_NAME", "getchum")
    client = AsyncIOMotorClient(mongo_url)
    
    # Try default database from URI, fallback to db_name
    try:
        db = client.get_default_database()
    except Exception:
        db = client[db_name]
        
    print(f"🚕 Connecting to database: {db.name} ...")
    
    # 1. Seed Drivers
    for d in DEMO_DRIVERS:
        pw_hash = bcrypt.hashpw(d["password"].encode(), bcrypt.gensalt()).decode()
        existing = await db.users.find_one({"email": d["email"]})
        
        driver_id = existing["id"] if existing else str(uuid.uuid4())
        user_doc = {
            "id": driver_id,
            "email": d["email"],
            "password_hash": pw_hash,
            "name": d["name"],
            "role": "driver",
            "phone": d["phone"],
            "phone_verified": True,
            "kyc_status": "verified",
            "vehicle_make": d["vehicle_make"],
            "vehicle_plate": d["vehicle_plate"],
            "vehicle_type": d["vehicle_type"],
            "council_name": d["council_name"],
            "operator_license_number": d["operator_license_number"],
            "phv_badge_number": d["phv_badge_number"],
            "badge_expiry": "2028-12-31",
            "insurance_policy": "Aviva Hire & Reward Taxi Fleet #AV-8819",
            "insurance_expiry": "2028-12-31",
            "plate_expiry": "2028-12-31",
            "license_number": "SCOT-771928-D",
            "license_expiry": "2028-12-31",
            "rating": d["rating"],
            "num_ratings": d["num_ratings"],
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        
        # Keep driver_kyc record verified with Fife Council dates
        await db.driver_kyc.update_one(
            {"driver_id": driver_id},
            {"$set": {
                "driver_id": driver_id,
                "status": "verified",
                "council_name": d["council_name"],
                "operator_license_number": d["operator_license_number"],
                "phv_badge_number": d["phv_badge_number"],
                "badge_expiry": "2028-12-31",
                "insurance_policy": "Aviva Hire & Reward Taxi Fleet #AV-8819",
                "insurance_expiry": "2028-12-31",
                "vehicle_plate": d["vehicle_plate"],
                "plate_expiry": "2028-12-31",
                "license_number": "SCOT-771928-D",
                "license_expiry": "2028-12-31",
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }},
            upsert=True
        )

        if existing:
            await db.users.update_one({"_id": existing["_id"]}, {"$set": user_doc})
            print(f"  [Driver] Updated: {d['name']} ({d['email']}) · {d['vehicle_make']}")
        else:
            user_doc["created_at"] = datetime.now(timezone.utc).isoformat()
            await db.users.insert_one(user_doc)
            print(f"  [Driver] Created: {d['name']} ({d['email']}) · {d['vehicle_make']}")
            
        # Put driver online with coordinates
        await db.driver_status.update_one(
            {"driver_id": driver_id},
            {"$set": {
                "driver_id": driver_id,
                "online": True,
                "lat": d["lat"],
                "lng": d["lng"],
                "heading": 0.0,
                "bearing": 0.0,
                "current_ride_id": None,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }},
            upsert=True
        )

    # 2. Seed Passengers
    for p in DEMO_PASSENGERS:
        pw_hash = bcrypt.hashpw(p["password"].encode(), bcrypt.gensalt()).decode()
        existing = await db.users.find_one({"email": p["email"]})
        
        p_id = existing["id"] if existing else str(uuid.uuid4())
        user_doc = {
            "id": p_id,
            "email": p["email"],
            "password_hash": pw_hash,
            "name": p["name"],
            "role": "passenger",
            "phone": p["phone"],
            "phone_verified": True,
            "rating": p["rating"],
            "num_ratings": p["num_ratings"],
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        
        if existing:
            await db.users.update_one({"_id": existing["_id"]}, {"$set": user_doc})
            print(f"  [Passenger] Updated: {p['name']} ({p['email']})")
        else:
            user_doc["created_at"] = datetime.now(timezone.utc).isoformat()
            await db.users.insert_one(user_doc)
            print(f"  [Passenger] Created: {p['name']} ({p['email']})")

    print("\n✅ Fleet and test passengers successfully seeded into database!")
    print("---------------------------------------------------------------")
    print("Drivers ready (Password: Driver123!):")
    for d in DEMO_DRIVERS:
        print(f"  • {d['email']} ({d['name']} - {d['vehicle_type'].capitalize()})")
    print("\nPassengers ready (Password: Passenger123!):")
    for p in DEMO_PASSENGERS:
        print(f"  • {p['email']} ({p['name']})")
    print("---------------------------------------------------------------")

if __name__ == "__main__":
    asyncio.run(seed_fleet())
