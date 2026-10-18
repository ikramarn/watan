import math
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Tuple

from ..utils import haversine_km, now_utc


class SimpleKalmanFilter:
    """1D Kalman filter for GPS coordinate smoothing."""
    def __init__(self, process_noise: float = 0.0001, measurement_noise: float = 0.001):
        self.q = process_noise  # Process variance
        self.r = measurement_noise  # Measurement variance
        self.p = 1.0  # Estimation error covariance
        self.x = 0.0  # Value state
        self.initialized = False

    def update(self, measurement: float) -> float:
        if not self.initialized:
            self.x = measurement
            self.initialized = True
            return measurement

        # Prediction update
        self.p = self.p + self.q

        # Measurement update
        k = self.p / (self.p + self.r)
        self.x = self.x + k * (measurement - self.x)
        self.p = (1.0 - k) * self.p

        return self.x


def smooth_coordinates(
    prev_lat: Optional[float],
    prev_lng: Optional[float],
    new_lat: float,
    new_lng: float,
    smoothing_factor: float = 0.75,
) -> Tuple[float, float]:
    """
    Exponential weighted moving average smoothing to eliminate jitter from raw GPS sensors.
    """
    if prev_lat is None or prev_lng is None:
        return new_lat, new_lng

    smooth_lat = prev_lat * (1.0 - smoothing_factor) + new_lat * smoothing_factor
    smooth_lng = prev_lng * (1.0 - smoothing_factor) + new_lng * smoothing_factor
    return round(smooth_lat, 6), round(smooth_lng, 6)


def validate_telemetry_plausibility(
    prev_lat: Optional[float],
    prev_lng: Optional[float],
    prev_timestamp: Optional[datetime],
    new_lat: float,
    new_lng: float,
    new_timestamp: Optional[datetime] = None,
    max_speed_kmh: float = 200.0,
) -> Dict[str, Any]:
    """
    Anti-fraud and fake GPS detection: checks whether the vehicle moved at an impossible speed
    or teleported between consecutive updates.
    """
    if prev_lat is None or prev_lng is None or prev_timestamp is None:
        return {"valid": True, "speed_kmh": 0.0, "is_mock_suspicious": False}

    if new_timestamp is None:
        new_timestamp = now_utc()

    if prev_timestamp.tzinfo is None:
        prev_timestamp = prev_timestamp.replace(tzinfo=timezone.utc)
    if new_timestamp.tzinfo is None:
        new_timestamp = new_timestamp.replace(tzinfo=timezone.utc)

    delta_sec = max(0.5, (new_timestamp - prev_timestamp).total_seconds())
    distance_km = haversine_km(prev_lat, prev_lng, new_lat, new_lng)
    speed_kmh = (distance_km / (delta_sec / 3600.0))

    is_suspicious = speed_kmh > max_speed_kmh

    return {
        "valid": not is_suspicious,
        "speed_kmh": round(speed_kmh, 1),
        "distance_km": round(distance_km, 4),
        "is_mock_suspicious": is_suspicious,
    }
