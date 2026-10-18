import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient

import json

async def check_rides():
    client = AsyncIOMotorClient(os.getenv("MONGO_URL"))
    db = client.get_default_database()
    rides = await db.rides.find().sort("created_at", -1).to_list(5)
    print(f"Total rides found: {len(rides)}")
    for r in rides:
        r_clean = {k: v for k, v in r.items() if k != "_id"}
        print(json.dumps(r_clean, indent=2))

if __name__ == "__main__":
    asyncio.run(check_rides())
