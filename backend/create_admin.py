import asyncio
import os
import uuid
import bcrypt
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timezone

async def seed_dispatch_and_admin_accounts():
    mongo_url = os.getenv("MONGO_URL", "mongodb://localhost:27017")
    db_name = os.getenv("DB_NAME", "watan")
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    
    # Remove any stale legacy UK accounts
    await db.users.delete_many({"email": {"$regex": "getchum"}})

    accounts = [
        {
            "email": "admin@demo.com",
            "password": "Admin123!",
            "name": "Watan Demo Dispatcher",
            "role": "dispatcher",
            "phone": "+923000000001",
        },
        {
            "email": "admin@watan.pk",
            "password": "WatanAdmin2026!",
            "name": "Watan Operations Admin",
            "role": "dispatcher",
            "phone": "+923000000002",
        },
        {
            "email": "dispatcher@watan.pk",
            "password": "WatanDispatch2026!",
            "name": "Watan Dispatch Controller",
            "role": "dispatcher",
            "phone": "+923000000003",
        },
        {
            "email": "munshi@demo.com",
            "password": "Munshi123!",
            "name": "Pirwadhai Stand Munshi",
            "role": "munshi",
            "phone": "+923005554921",
        },
    ]

    for acc in accounts:
        password_hash = bcrypt.hashpw(acc["password"].encode(), bcrypt.gensalt()).decode()
        existing = await db.users.find_one({"email": acc["email"]})
        if existing:
            await db.users.update_one(
                {"_id": existing["_id"]},
                {
                    "$set": {
                        "password_hash": password_hash,
                        "role": acc["role"],
                        "name": acc["name"],
                        "phone": acc["phone"],
                        "phone_verified": True,
                    }
                }
            )
            print(f"[OK] Updated account: {acc['email']} (role: {acc['role']})")
        else:
            user_id = str(uuid.uuid4())
            doc = {
                "id": user_id,
                "email": acc["email"],
                "password_hash": password_hash,
                "name": acc["name"],
                "role": acc["role"],
                "phone": acc["phone"],
                "phone_verified": True,
                "rating": 5.0,
                "num_ratings": 0,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            await db.users.insert_one(doc)
            print(f"[OK] Created account: {acc['email']} (role: {acc['role']})")

if __name__ == "__main__":
    asyncio.run(seed_dispatch_and_admin_accounts())
