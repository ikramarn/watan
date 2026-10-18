import math
from typing import Any, Dict, List, Tuple

from ..utils import haversine_km


def calculate_bearing(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Calculate forward azimuth / compass bearing in degrees (0..360) from point 1 to point 2."""
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    diff_lng = math.radians(lng2 - lng1)

    x = math.sin(diff_lng) * math.cos(lat2_rad)
    y = math.cos(lat1_rad) * math.sin(lat2_rad) - (
        math.sin(lat1_rad) * math.cos(lat2_rad) * math.cos(diff_lng)
    )
    initial_bearing = math.atan2(x, y)
    initial_bearing = math.degrees(initial_bearing)
    compass_bearing = (initial_bearing + 360) % 360
    return round(compass_bearing, 1)


def generate_route_geometry(
    start_lat: float, start_lng: float, end_lat: float, end_lng: float, num_waypoints: int = 8
) -> List[Dict[str, float]]:
    """
    Generate realistic multi-point polyline following street grid curvature
    between start and end coordinates.
    """
    points: List[Dict[str, float]] = [{"lat": start_lat, "lng": start_lng}]

    # Street-grid simulation with mid-point doglegs to mimic urban road grid
    for i in range(1, num_waypoints):
        t = i / float(num_waypoints)
        # S-curve ease interpolation
        ease_t = t * t * (3.0 - 2.0 * t)
        lat = start_lat + (end_lat - start_lat) * ease_t
        # Add slight realistic Manhattan/curvilinear orthogonal deflection
        deflection = math.sin(t * math.pi) * 0.0015 * ((i % 2) * 2 - 1)
        lng = start_lng + (end_lng - start_lng) * ease_t + deflection
        points.append({"lat": round(lat, 6), "lng": round(lng, 6)})

    points.append({"lat": end_lat, "lng": end_lng})
    return points


def generate_navigation_steps(
    start_lat: float, start_lng: float, end_lat: float, end_lng: float, total_distance_km: float
) -> List[Dict[str, Any]]:
    """
    Generate turn-by-turn navigation instructions for in-app driver HUD.
    """
    bearing = calculate_bearing(start_lat, start_lng, end_lat, end_lng)

    steps: List[Dict[str, Any]] = [
        {
            "step_index": 0,
            "instruction": "Head toward destination",
            "maneuver": "depart",
            "distance_m": int(min(300, total_distance_km * 1000 * 0.15)),
            "bearing": bearing,
        },
        {
            "step_index": 1,
            "instruction": "Continue along main corridor",
            "maneuver": "straight",
            "distance_m": int(total_distance_km * 1000 * 0.55),
            "bearing": bearing,
        },
        {
            "step_index": 2,
            "instruction": "Turn toward destination approach",
            "maneuver": "turn-right" if bearing < 180 else "turn-left",
            "distance_m": int(total_distance_km * 1000 * 0.20),
            "bearing": (bearing + 45) % 360,
        },
        {
            "step_index": 3,
            "instruction": "Arrive at destination on the right",
            "maneuver": "arrive",
            "distance_m": int(max(50, total_distance_km * 1000 * 0.10)),
            "bearing": bearing,
        },
    ]
    return steps


def get_route_details(
    pickup_lat: float, pickup_lng: float, dest_lat: float, dest_lng: float
) -> Dict[str, Any]:
    """
    Compute driving distance with road network detour multiplier, realistic traffic ETA,
    detailed polyline points, and turn-by-turn steps.
    """
    straight_dist = haversine_km(pickup_lat, pickup_lng, dest_lat, dest_lng)
    # Urban road network factor typically 1.25x - 1.4x of haversine
    driving_distance_km = round(max(0.5, straight_dist * 1.32), 2)

    # Average urban speed: 28 km/h + 2 min boarding cushion
    driving_duration_min = max(3, int(round((driving_distance_km / 28.0) * 60 + 2)))

    polyline = generate_route_geometry(pickup_lat, pickup_lng, dest_lat, dest_lng)
    steps = generate_navigation_steps(pickup_lat, pickup_lng, dest_lat, dest_lng, driving_distance_km)
    initial_bearing = calculate_bearing(pickup_lat, pickup_lng, dest_lat, dest_lng)

    return {
        "distance_km": driving_distance_km,
        "duration_min": driving_duration_min,
        "polyline": polyline,
        "steps": steps,
        "initial_bearing": initial_bearing,
    }
