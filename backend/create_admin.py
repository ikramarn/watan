import asyncio
import os
import uuid
import bcrypt
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timezone

async def create_master_dispatcher():
    mongo_url = os.getenv("MONGO_URL") or os.getenv("MONGODB_URL", "")
    client = AsyncIOMotorClient(mongo_url)
    db = client.get_default_database()
    
    email = "admin@getchum.co.uk"
    password = "ChumAdmin2026!"
    name = "GetChum Dispatch Control"
    role = "dispatcher"
    
    password_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
    
    existing = await db.users.find_one({"email": email})
    if existing:
        await db.users.update_one(
            {"_id": existing["_id"]},
            {
                "$set": {
                    "password_hash": password_hash,
                    "role": role,
                    "name": name,
                    "phone_verified": True
                }
            }
        )
        print(f"✅ Updated existing admin user: {email}")
    else:
        user_id = str(uuid.uuid4())
        doc = {
            "id": user_id,
            "email": email,
            "password_hash": password_hash,
            "name": name,
            "role": role,
            "phone": "+447000000000",
            "phone_verified": True,
            "rating": 5.0,
            "num_ratings": 0,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.users.insert_one(doc)
        print(f"✅ Created new master dispatcher: {email}")

if __name__ == "__main__":
    asyncio.run(create_master_dispatcher())
