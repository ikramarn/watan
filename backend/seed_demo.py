import asyncio
import os
import uuid
import bcrypt
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timezone

async def seed_demo():
    mongo_url = os.getenv("MONGO_URL") or os.getenv("MONGODB_URL", "")
    client = AsyncIOMotorClient(mongo_url)
    db = client.get_default_database()
    
    accounts = [
        {
            "email": "driver@demo.com",
            "password": "Driver123!",
            "name": "Chum Driver Demo",
            "role": "driver",
            "phone": "+447700900001",
            "vehicle_make": "Skoda Octavia · Silver",
            "vehicle_plate": "SK23 CHM",
            "vehicle_type": "comfort",
            "kyc_status": "approved",
            "is_active": True,
            "phone_verified": True,
            "rating": 4.95,
            "num_ratings": 42
        },
        {
            "email": "passenger@demo.com",
            "password": "Passenger123!",
            "name": "Alex Chum",
            "role": "passenger",
            "phone": "+447700900002",
            "phone_verified": True,
            "rating": 5.0,
            "num_ratings": 15
        }
    ]
    
    for acc in accounts:
        pw_hash = bcrypt.hashpw(acc["password"].encode(), bcrypt.gensalt()).decode()
        existing = await db.users.find_one({"email": acc["email"]})
        if existing:
            await db.users.update_one(
                {"_id": existing["_id"]},
                {"$set": {
                    "password_hash": pw_hash,
                    "phone_verified": True,
                    "kyc_status": acc.get("kyc_status"),
                    "vehicle_make": acc.get("vehicle_make"),
                    "vehicle_plate": acc.get("vehicle_plate"),
                    "vehicle_type": acc.get("vehicle_type"),
                }}
            )
            print(f"✅ Updated demo user: {acc['email']}")
        else:
            user_id = str(uuid.uuid4())
            doc = {
                "id": user_id,
                "email": acc["email"],
                "password_hash": pw_hash,
                "name": acc["name"],
                "role": acc["role"],
                "phone": acc["phone"],
                "phone_verified": True,
                "rating": acc.get("rating", 5.0),
                "num_ratings": acc.get("num_ratings", 0),
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            if acc["role"] == "driver":
                doc["vehicle_make"] = acc["vehicle_make"]
                doc["vehicle_plate"] = acc["vehicle_plate"]
                doc["vehicle_type"] = acc["vehicle_type"]
                doc["kyc_status"] = "approved"
                await db.driver_status.update_one(
                    {"driver_id": user_id},
                    {"$set": {
                        "driver_id": user_id,
                        "online": True,
                        "lat": 56.1165,
                        "lng": -3.1746,
                        "heading": 0.0,
                        "current_ride_id": None,
                        "updated_at": datetime.now(timezone.utc).isoformat()
                    }},
                    upsert=True
                )
            await db.users.insert_one(doc)
            print(f"✅ Created demo user: {acc['email']}")

if __name__ == "__main__":
    asyncio.run(seed_demo())
