import random

from fastapi import APIRouter, Depends

from ..config import settings
from ..db import db
from ..deps import get_optional_user
from ..utils import haversine_km

router = APIRouter(prefix="/api", tags=["public"])


@router.get("/drivers/nearby")
async def nearby_drivers(lat: float, lng: float, user: dict | None = Depends(get_optional_user)):
    cursor = db.driver_status.find({"online": True})
    drivers = []
    async for d in cursor:
        if d.get("lat") is None or d.get("lng") is None:
            continue
        dist = haversine_km(lat, lng, d["lat"], d["lng"])
        if dist <= 8.0:
            drivers.append(
                {
                    "driver_id": d["driver_id"],
                    "lat": d["lat"],
                    "lng": d["lng"],
                    "distance_km": round(dist, 2),
                }
            )

    # Only inject simulated drivers in development mode when explicitly enabled
    if len(drivers) < 3 and settings.simulate_drivers and settings.env != "production":
        random.seed(int(lat * 1000) + int(lng * 1000))
        for i in range(4 - len(drivers)):
            d_lat = lat + random.uniform(-0.01, 0.01)
            d_lng = lng + random.uniform(-0.01, 0.01)
            drivers.append(
                {
                    "driver_id": f"sim-{i}",
                    "lat": d_lat,
                    "lng": d_lng,
                    "distance_km": round(haversine_km(lat, lng, d_lat, d_lng), 2),
                }
            )
    drivers.sort(key=lambda d: d["distance_km"])
    return {"drivers": drivers[:8]}

