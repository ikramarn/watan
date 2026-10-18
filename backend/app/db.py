from motor.motor_asyncio import AsyncIOMotorClient

from .config import settings

client = AsyncIOMotorClient(settings.mongo_url)
db = client[settings.db_name]


async def startup_indexes() -> None:
    await db.users.create_index("email", unique=True)
    await db.users.create_index("id", unique=True)
    await db.users.create_index("google_id", sparse=True)

    await db.rides.create_index("id", unique=True)
    await db.rides.create_index([("status", 1), ("ride_type", 1), ("created_at", 1)])
    await db.rides.create_index([("passenger_id", 1), ("created_at", -1)])
    await db.rides.create_index([("driver_id", 1), ("created_at", -1)])
    await db.rides.create_index([("assignment_type", 1), ("created_at", 1)])

    await db.driver_status.create_index("driver_id", unique=True)
    await db.driver_status.create_index("online")

    await db.driver_kyc.create_index("driver_id", unique=True)
    await db.driver_kyc.create_index([("status", 1), ("submitted_at", -1)])

    await db.driver_wallets.create_index("driver_id", unique=True)
    await db.driver_payouts.create_index([("driver_id", 1), ("created_at", -1)])

    await db.sos_incidents.create_index("id", unique=True)
    await db.sos_incidents.create_index([("status", 1), ("created_at", -1)])
    await db.sos_incidents.create_index("ride_id")

    await db.phone_verifications.create_index("user_id", unique=True)
    await db.phone_verifications.create_index("expires_at", expireAfterSeconds=0, sparse=True)

    await db.email_verifications.create_index("email", unique=True)
    await db.email_verifications.create_index("expires_at", expireAfterSeconds=0, sparse=True)

    await db.chat_messages.create_index([("ride_id", 1), ("timestamp", 1)])

    await db.payment_transactions.create_index("session_id", unique=True, sparse=True)
    await db.payment_transactions.create_index("payment_intent_id", sparse=True)

    await db.refresh_tokens.create_index("id", unique=True)
    await db.refresh_tokens.create_index("user_id")
    await db.refresh_tokens.create_index("expires_at", expireAfterSeconds=0, sparse=True)

    await db.dispatch_action_log.create_index("id", unique=True)
    await db.dispatch_action_log.create_index([("created_at", -1)])
    await db.dispatch_action_log.create_index([("dispatcher_id", 1), ("created_at", -1)])
    await db.dispatch_action_log.create_index([("action", 1), ("created_at", -1)])


async def shutdown_db() -> None:
    client.close()
