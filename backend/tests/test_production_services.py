from datetime import datetime, timedelta, timezone

import pytest

from app.services.fare import calculate_surge_multiplier, compute_fare
from app.services.routing import calculate_bearing, generate_navigation_steps, generate_route_geometry, get_route_details
from app.services.telemetry import SimpleKalmanFilter, smooth_coordinates, validate_telemetry_plausibility


def test_routing_and_bearing_calculation():
    # San Francisco: Ferry Building to Golden Gate Park
    lat1, lng1 = 37.7955, -122.3937
    lat2, lng2 = 37.7694, -122.4862

    bearing = calculate_bearing(lat1, lng1, lat2, lng2)
    assert 0 <= bearing <= 360

    details = get_route_details(lat1, lng1, lat2, lng2)
    assert details["distance_km"] > 0
    assert details["duration_min"] >= 3
    assert len(details["polyline"]) >= 2
    assert len(details["steps"]) >= 3


def test_surge_multiplier_computation():
    # 0 requests, 5 drivers -> 1.0x
    assert calculate_surge_multiplier(0, 5) == 1.0
    # 5 requests, 5 drivers -> 1.0x
    assert calculate_surge_multiplier(5, 5) == 1.0
    # 7 requests, 5 drivers -> 1.2x
    assert calculate_surge_multiplier(7, 5) == 1.2
    # 10 requests, 5 drivers -> 1.5x
    assert calculate_surge_multiplier(10, 5) == 1.5
    # 15 requests, 5 drivers -> 1.8x
    assert calculate_surge_multiplier(15, 5) == 1.8
    # 25 requests, 5 drivers -> 2.5x
    assert calculate_surge_multiplier(25, 5) == 2.5
    # 5 requests, 0 drivers -> 1.8x
    assert calculate_surge_multiplier(5, 0) == 1.8


def test_fare_breakdown_and_driver_split():
    fare_data = compute_fare(distance_km=10.0, ride_type="economy", surge_multiplier=1.5, tips=3.0)
    assert fare_data["currency"] in ("PKR", "GBP")
    assert fare_data["currency_symbol"] in ("Rs.", "£")
    assert fare_data["fare"] >= 5.0
    assert fare_data["surge_multiplier"] == 1.5
    assert fare_data["tips"] == 3.0
    assert fare_data["total_amount"] == round(fare_data["fare"] + 3.0, 2)
    assert fare_data["platform_fee"] == round(fare_data["fare"] * 0.10, 2)
    assert fare_data["driver_earnings"] == round((fare_data["fare"] - fare_data["platform_fee"]) + 3.0, 2)


def test_telemetry_smoothing_and_kalman():
    kf = SimpleKalmanFilter()
    m1 = kf.update(37.7749)
    m2 = kf.update(37.7752)
    assert m1 == 37.7749
    assert 37.7749 <= m2 <= 37.7752

    s_lat, s_lng = smooth_coordinates(37.7700, -122.4100, 37.7710, -122.4110)
    assert s_lat != 37.7700
    assert s_lng != -122.4100


def test_anti_spoofing_speed_validation():
    t0 = datetime.now(timezone.utc)
    t1 = t0 + timedelta(seconds=10)

    # Normal speed: moving 100 meters in 10 sec = 36 km/h (Valid)
    normal = validate_telemetry_plausibility(37.7749, -122.4194, t0, 37.7758, -122.4194, t1)
    assert normal["valid"] is True
    assert normal["is_mock_suspicious"] is False

    # Impossible speed: teleporting from SF to NYC in 10 sec (Suspicious fake GPS)
    spoofed = validate_telemetry_plausibility(37.7749, -122.4194, t0, 40.7128, -74.0060, t1)
    assert spoofed["valid"] is False
    assert spoofed["is_mock_suspicious"] is True
