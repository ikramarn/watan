from typing import Any, Dict, Optional

CURRENCY = "PKR"
CURRENCY_SYMBOL = "Rs."

# Pakistani Multi-Modal Fare Structure
FARE_CONFIG = {
    "bike": {
        "base": 60.0,
        "per_km": 22.0,
        "per_min": 3.0,
        "min_fare": 80.0,
        "cancel_fee": 40.0,
        "label": "Watan Bike (موٹرسائیکل)",
        "seats": 1,
    },
    "rickshaw": {
        "base": 100.0,
        "per_km": 35.0,
        "per_min": 4.0,
        "min_fare": 140.0,
        "cancel_fee": 60.0,
        "label": "Auto Rickshaw (رکشہ)",
        "seats": 3,
    },
    "qingqi": {
        "base": 40.0,
        "per_km": 15.0,
        "per_min": 2.0,
        "min_fare": 50.0,
        "cancel_fee": 30.0,
        "label": "Watan Qingqi (چنگچی شٹل)",
        "seats": 8,
    },
    "car_mini": {
        "base": 200.0,
        "per_km": 50.0,
        "per_min": 6.0,
        "min_fare": 280.0,
        "cancel_fee": 100.0,
        "label": "Watan Mini (مہران / آلٹو)",
        "seats": 4,
    },
    "car_comfort": {
        "base": 300.0,
        "per_km": 70.0,
        "per_min": 8.0,
        "min_fare": 450.0,
        "cancel_fee": 150.0,
        "label": "Watan Comfort (سڈان کار)",
        "seats": 4,
    },
    "wagon": {
        "base": 120.0,
        "per_km": 30.0,
        "per_min": 4.0,
        "min_fare": 200.0,
        "cancel_fee": 100.0,
        "label": "Watan Wagon (ہائی ایس ویگن)",
        "seats": 14,
    },
    "coaster": {
        "base": 250.0,
        "per_km": 40.0,
        "per_min": 5.0,
        "min_fare": 350.0,
        "cancel_fee": 150.0,
        "label": "Watan Coaster (کوسٹر بس)",
        "seats": 28,
    },
    # Backwards compatibility aliases
    "economy": {
        "base": 200.0,
        "per_km": 50.0,
        "per_min": 6.0,
        "min_fare": 280.0,
        "cancel_fee": 100.0,
        "label": "Economy Mini",
        "seats": 4,
    },
    "premium": {
        "base": 300.0,
        "per_km": 70.0,
        "per_min": 8.0,
        "min_fare": 450.0,
        "cancel_fee": 150.0,
        "label": "Comfort Sedan",
        "seats": 4,
    },
    "xl": {
        "base": 400.0,
        "per_km": 75.0,
        "per_min": 8.0,
        "min_fare": 600.0,
        "cancel_fee": 200.0,
        "label": "XL / Grand Cabin Full Charter",
        "seats": 14,
    },
}

# Platform commission rate for independent roaming drivers (10%)
# For Adda-affiliated drivers, commission is 0.00 (covered by the weekly Adda subscription)
INDEPENDENT_COMMISSION_RATE = 0.10
ADDA_DRIVER_COMMISSION_RATE = 0.00


def calculate_surge_multiplier(active_requests_in_zone: int, available_drivers_in_zone: int) -> float:
    """
    Dynamic surge pricing based on local Pakistani traffic and peak demand hours.
    Returns a multiplier from 1.0x (standard) up to 2.5x (peak rain/rush hour).
    """
    if available_drivers_in_zone <= 0:
        return 1.8 if active_requests_in_zone > 0 else 1.0

    ratio = active_requests_in_zone / float(available_drivers_in_zone)
    if ratio <= 1.0:
        return 1.0
    elif ratio <= 1.5:
        return 1.2
    elif ratio <= 2.0:
        return 1.5
    elif ratio <= 3.5:
        return 1.8
    else:
        return 2.5


def estimate_fare(
    distance_km: float,
    duration_min: float,
    ride_type: str = "car_mini",
    surge: float = 1.0,
) -> Dict[str, Any]:
    """Calculate transparent Pakistani Rupee fare estimate."""
    cfg = FARE_CONFIG.get(ride_type, FARE_CONFIG["car_mini"])

    raw = cfg["base"] + (distance_km * cfg["per_km"]) + (duration_min * cfg["per_min"])
    surged = raw * surge
    final_fare = max(cfg["min_fare"], round(surged, 0))

    return {
        "ride_type": ride_type,
        "label": cfg["label"],
        "currency": CURRENCY,
        "currency_symbol": CURRENCY_SYMBOL,
        "base_fare": cfg["base"],
        "distance_fare": round(distance_km * cfg["per_km"], 0),
        "time_fare": round(duration_min * cfg["per_min"], 0),
        "surge_multiplier": surge,
        "estimated_fare": final_fare,
        "seats": cfg["seats"],
    }


def compute_fare(
    distance_km: float,
    ride_type: str = "car_mini",
    duration_min: Optional[float] = None,
    surge_multiplier: float = 1.0,
    tips: float = 0.0,
    is_adda_trip: bool = False,
) -> Dict[str, Any]:
    """
    Deterministic fare computation returning fare, breakdown, driver split, and details.
    Compatible with rides.py, unit tests, and multi-modal bookings.
    """
    if duration_min is None or duration_min <= 0:
        duration_min = max(2.0, distance_km * 2.0)

    est = estimate_fare(distance_km, duration_min, ride_type, surge=surge_multiplier)
    fare = est["estimated_fare"]

    commission_rate = ADDA_DRIVER_COMMISSION_RATE if is_adda_trip else INDEPENDENT_COMMISSION_RATE
    platform_fee = round(fare * commission_rate, 2)
    driver_earnings = round((fare - platform_fee) + tips, 2)
    total_amount = round(fare + tips, 2)

    return {
        "fare": fare,
        "currency": CURRENCY,
        "currency_symbol": CURRENCY_SYMBOL,
        "ride_type": ride_type,
        "distance_km": distance_km,
        "duration_min": duration_min,
        "surge_multiplier": surge_multiplier,
        "tips": tips,
        "total_amount": total_amount,
        "platform_fee": platform_fee,
        "driver_earnings": driver_earnings,
        "details": est,
    }


def compute_multimodal_fare(
    vehicle_type: str,
    distance_km: float,
    duration_min: float = 0.0,
    is_adda_trip: bool = False,
    surge: float = 1.0,
) -> Dict[str, Any]:
    """
    Computes upfront multi-modal fare in PKR and enforces Watan's core monetization rule:
    - Adda Pari drivers: 0% platform commission (100% kept by driver, Adda pays weekly flat SaaS)
    - Independent Roaming drivers: 10% platform commission
    """
    if duration_min <= 0.0:
        duration_min = max(2.0, distance_km * 2.2)

    est = estimate_fare(distance_km, duration_min, vehicle_type, surge=surge)
    fare_pkr = est["estimated_fare"]

    if is_adda_trip:
        platform_fee_pkr = 0.0
        driver_net_pkr = fare_pkr
        commission_rate = ADDA_DRIVER_COMMISSION_RATE
    else:
        platform_fee_pkr = round(fare_pkr * INDEPENDENT_COMMISSION_RATE, 2)
        driver_net_pkr = round(fare_pkr - platform_fee_pkr, 2)
        commission_rate = INDEPENDENT_COMMISSION_RATE

    return {
        "currency": CURRENCY,
        "currency_symbol": CURRENCY_SYMBOL,
        "vehicle_type": vehicle_type,
        "fare_pkr": fare_pkr,
        "platform_fee_pkr": platform_fee_pkr,
        "driver_net_pkr": driver_net_pkr,
        "is_adda_trip": is_adda_trip,
        "commission_rate": commission_rate,
        "seats": est["seats"],
        "details": est,
    }


MULTIMODAL_RATES = FARE_CONFIG


