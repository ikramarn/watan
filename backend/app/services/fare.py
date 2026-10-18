from typing import Any, Dict, Optional

CURRENCY = "GBP"
CURRENCY_SYMBOL = "£"

# UK Private Hire Fare Structure
FARE_CONFIG = {
    "economy": {
        "base": 3.00,
        "per_km": 1.30,
        "per_min": 0.25,
        "min_fare": 5.00,
        "cancel_fee": 4.00,
        "label": "Economy Taxi",
        "seats": 4,
    },
    "premium": {
        "base": 5.50,
        "per_km": 2.20,
        "per_min": 0.40,
        "min_fare": 10.00,
        "cancel_fee": 7.00,
        "label": "Executive / Premium",
        "seats": 4,
    },
    "xl": {
        "base": 4.50,
        "per_km": 1.90,
        "per_min": 0.35,
        "min_fare": 8.00,
        "cancel_fee": 6.00,
        "label": "XL / 6-Seater",
        "seats": 6,
    },
}

# In Route B (SaaS Technology Provider), platform charges a modest technology service fee (e.g. 8%)
SAAS_TECH_FEE_RATE = 0.08  # 8% technology platform fee; 92% retained by 1-car licensed operator


def calculate_surge_multiplier(active_requests_in_zone: int, available_drivers_in_zone: int) -> float:
    """
    Dynamic surge pricing based on supply-demand ratio in the local UK zone.
    Returns a multiplier from 1.0x (standard) up to 2.5x (peak demand).
    """
    if available_drivers_in_zone <= 0:
        return 1.8 if active_requests_in_zone > 0 else 1.0

    ratio = active_requests_in_zone / float(available_drivers_in_zone)
    if ratio <= 1.0:
        return 1.0
    elif ratio <= 1.5:
        return 1.2
    elif ratio <= 2.5:
        return 1.5
    elif ratio <= 4.0:
        return 1.8
    else:
        return 2.5


def compute_fare(
    distance_km: float,
    ride_type: str,
    duration_min: Optional[float] = None,
    surge_multiplier: float = 1.0,
    tips: float = 0.0,
) -> Dict[str, Any]:
    cfg = FARE_CONFIG.get(ride_type, FARE_CONFIG["economy"])

    if duration_min is None:
        duration_min = max(3.0, distance_km * 2.5)

    base_component = cfg["base"]
    distance_component = distance_km * cfg["per_km"]
    time_component = duration_min * cfg["per_min"]

    subtotal = (base_component + distance_component + time_component) * max(1.0, surge_multiplier)
    fare = round(max(cfg.get("min_fare", 5.0), subtotal), 2)

    total_with_tip = round(fare + max(0.0, tips), 2)

    # Route B: Software technology fee vs operator earnings
    platform_fee = round(fare * SAAS_TECH_FEE_RATE, 2)
    driver_earnings = round((fare - platform_fee) + max(0.0, tips), 2)

    return {
        "type": ride_type,
        "label": cfg["label"],
        "seats": cfg.get("seats", 4),
        "currency": CURRENCY,
        "currency_symbol": CURRENCY_SYMBOL,
        "base_fare": round(base_component, 2),
        "distance_fare": round(distance_component, 2),
        "time_fare": round(time_component, 2),
        "surge_multiplier": round(surge_multiplier, 2),
        "fare": fare,
        "tips": round(tips, 2),
        "total_amount": total_with_tip,
        "platform_fee": platform_fee,
        "driver_earnings": driver_earnings,
        "cancellation_fee": cfg.get("cancel_fee", 4.0),
        "distance_km": round(distance_km, 2),
        "duration_min": round(duration_min, 1),
    }
