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

    # Watan Adda & Pari Indexes
    await db.addas.create_index("id", unique=True)
    await db.addas.create_index("watan_code", unique=True, sparse=True)
    await db.addas.create_index([("city", 1), ("status", 1)])

    await db.pari_queues.create_index("id", unique=True)
    await db.pari_queues.create_index([("adda_id", 1), ("corridor_id", 1), ("status", 1)])
    await db.pari_queues.create_index([("driver_id", 1), ("status", 1)])

    await db.seat_bookings.create_index("id", unique=True)
    await db.seat_bookings.create_index("booking_code", unique=True, sparse=True)
    await db.seat_bookings.create_index("qr_token", unique=True, sparse=True)
    await db.seat_bookings.create_index([("pari_id", 1), ("booking_status", 1)])

    # Auto-seed initial Pakistani Addas if collection is empty
    count = await db.addas.count_documents({})
    if count == 0:
        from .utils import iso_now
        seed_addas = [
            {
                "id": "adda_pirwadhai_01",
                "name": "Al-Makkah Wagon Stand, Pirwadhai",
                "urdu_name": "المکہ ویگن اڈہ پیرودھائی",
                "watan_code": "ISB-001",
                "city": "Rawalpindi",
                "district": "Rawalpindi",
                "lat": 33.6261,
                "lng": 73.0479,
                "geofence_radius_meters": 300.0,
                "allowed_vehicle_types": ["wagon", "qingqi", "coaster"],
                "bays_count": 8,
                "internal_parchi_rate_fixed_pkr": 150.0,
                "driver_watan_commission_percent": 0.0,
                "weekly_subscription_fee_pkr": 4500.0,
                "subscription_status": "active",
                "billing_cycle": "weekly",
                "status": "active",
                "created_at": iso_now(),
            },
            {
                "id": "adda_badami_bagh_01",
                "name": "General Bus Stand, Badami Bagh",
                "urdu_name": "جنرل بس اسٹینڈ بادامی باغ",
                "watan_code": "LHR-001",
                "city": "Lahore",
                "district": "Lahore",
                "lat": 31.5925,
                "lng": 74.3186,
                "geofence_radius_meters": 500.0,
                "allowed_vehicle_types": ["wagon", "coaster"],
                "bays_count": 12,
                "internal_parchi_rate_fixed_pkr": 200.0,
                "driver_watan_commission_percent": 0.0,
                "weekly_subscription_fee_pkr": 6000.0,
                "subscription_status": "active",
                "billing_cycle": "weekly",
                "status": "active",
                "created_at": iso_now(),
            },
            {
                "id": "adda_faizabad_01",
                "name": "Faizabad Coaster Terminal",
                "urdu_name": "فیض آباد کوسٹر ٹرمینل",
                "watan_code": "ISB-002",
                "city": "Islamabad",
                "district": "Islamabad",
                "lat": 33.6631,
                "lng": 73.0845,
                "geofence_radius_meters": 350.0,
                "allowed_vehicle_types": ["coaster", "wagon"],
                "bays_count": 6,
                "internal_parchi_rate_fixed_pkr": 180.0,
                "driver_watan_commission_percent": 0.0,
                "weekly_subscription_fee_pkr": 5000.0,
                "subscription_status": "active",
                "billing_cycle": "weekly",
                "status": "active",
                "created_at": iso_now(),
            },
            {
                "id": "adda_sohrab_goth_01",
                "name": "Sohrab Goth Terminal, Super Highway",
                "urdu_name": "سہراب گوٹھ ہائی وے ٹرمینل",
                "watan_code": "KHI-001",
                "city": "Karachi",
                "district": "Karachi",
                "lat": 24.9525,
                "lng": 67.0911,
                "geofence_radius_meters": 600.0,
                "allowed_vehicle_types": ["wagon", "coaster"],
                "bays_count": 16,
                "internal_parchi_rate_fixed_pkr": 250.0,
                "driver_watan_commission_percent": 0.0,
                "weekly_subscription_fee_pkr": 7500.0,
                "subscription_status": "active",
                "billing_cycle": "weekly",
                "status": "active",
                "created_at": iso_now(),
            },
        ]
        await db.addas.insert_many(seed_addas)

        # Seed initial sample Pari bays for Pirwadhai Stand
        seed_pari = [
            {
                "id": "pari_sample_01",
                "adda_id": "adda_pirwadhai_01",
                "corridor_id": "rawalpindi_to_peshawar",
                "corridor_name": "Pirwadhai to Peshawar (پیرودھائی تا پشاور)",
                "driver_id": "driver_sample_tariq",
                "vehicle_plate": "LES-19-4821",
                "vehicle_type": "wagon",
                "bay_number": 2,
                "pari_position": 1,
                "status": "loading",
                "total_seats": 14,
                "fare_per_seat_pkr": 450.0,
                "booked_seats_count": 11,
                "booked_seat_numbers": [1, 2, 5, 6, 7, 8, 9, 10, 11, 12, 13],
                "scheduled_departure": "08:30 PM",
                "arrived_at": iso_now(),
            },
            {
                "id": "pari_sample_02",
                "adda_id": "adda_pirwadhai_01",
                "corridor_id": "rawalpindi_to_lahore",
                "corridor_name": "Pirwadhai to Lahore (پیرودھائی تا لاہور)",
                "driver_id": "driver_sample_rafiq",
                "vehicle_plate": "RIP-21-9921",
                "vehicle_type": "coaster",
                "bay_number": 1,
                "pari_position": 1,
                "status": "loading",
                "total_seats": 28,
                "fare_per_seat_pkr": 850.0,
                "booked_seats_count": 28,
                "booked_seat_numbers": list(range(1, 29)),
                "scheduled_departure": "08:15 PM",
                "arrived_at": iso_now(),
            },
        ]
        await db.pari_queues.insert_many(seed_pari)


async def shutdown_db() -> None:
    client.close()
