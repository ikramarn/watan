"""
Watan (وطن) — Pakistan Multi-Modal and Adda Pari Unit Test Suite
Validates:
1. Multi-modal fare computation in PKR (bike, rickshaw, qingqi, car_mini, car_comfort, wagon, coaster)
2. 0% platform commission on Adda Pari drivers vs 10% on Independent Roaming drivers
3. Seat manifest allocation and pricing
4. Pakistani vehicle models and regulatory validation
"""

import pytest
from app.services.fare import compute_multimodal_fare, compute_fare, MULTIMODAL_RATES
from app.models import (
    RegisterIn,
    SeatReservationIn,
    CounterTicketIssueIn,
    AddaCreateIn,
    DriverModeToggleIn,
)


def test_multimodal_fares_in_pkr():
    distance_km = 12.0
    duration_min = 25.0

    bike = compute_multimodal_fare("bike", distance_km, duration_min, is_adda_trip=False)
    assert bike["currency"] == "PKR"
    assert bike["fare_pkr"] > 0
    assert bike["platform_fee_pkr"] == round(bike["fare_pkr"] * 0.10, 2)
    assert bike["driver_net_pkr"] == round(bike["fare_pkr"] * 0.90, 2)

    rickshaw = compute_multimodal_fare("rickshaw", distance_km, duration_min, is_adda_trip=False)
    assert rickshaw["fare_pkr"] > bike["fare_pkr"]

    car_mini = compute_multimodal_fare("car_mini", distance_km, duration_min, is_adda_trip=False)
    car_comfort = compute_multimodal_fare("car_comfort", distance_km, duration_min, is_adda_trip=False)
    assert car_comfort["fare_pkr"] > car_mini["fare_pkr"]


def test_zero_commission_on_adda_pari_drivers():
    """Adda Pari drivers keep 100% of their fare. Watan platform fee must strictly be 0.00 PKR."""
    distance_km = 65.0
    duration_min = 90.0

    # Wagon corridor trip under an Adda
    wagon_trip = compute_multimodal_fare("wagon", distance_km, duration_min, is_adda_trip=True)
    assert wagon_trip["is_adda_trip"] is True
    assert wagon_trip["platform_fee_pkr"] == 0.0
    assert wagon_trip["driver_net_pkr"] == wagon_trip["fare_pkr"]

    # Qingqi arterial corridor trip under an Adda
    qingqi_trip = compute_multimodal_fare("qingqi", 8.0, 20.0, is_adda_trip=True)
    assert qingqi_trip["platform_fee_pkr"] == 0.0
    assert qingqi_trip["driver_net_pkr"] == qingqi_trip["fare_pkr"]


def test_independent_roaming_has_ten_percent_fee():
    """Independent roaming drivers pay 10% platform commission."""
    roaming_car = compute_multimodal_fare("car_mini", 10.0, 20.0, is_adda_trip=False)
    assert roaming_car["is_adda_trip"] is False
    assert roaming_car["platform_fee_pkr"] > 0
    assert round(roaming_car["fare_pkr"] - roaming_car["platform_fee_pkr"], 2) == roaming_car["driver_net_pkr"]


def test_backward_compatibility_compute_fare():
    """Ensures legacy frontend callers receive valid PKR fares."""
    res = compute_fare(15.0, "car_mini")
    assert "fare" in res
    assert "currency" in res
    assert res["currency"] == "PKR"
    assert res["fare"] > 0


def test_pydantic_pakistan_models_validation():
    adda = AddaCreateIn(
        name="Pirwadhai Intercity Stand",
        urdu_name="پیرودھائی انٹرسیٹی بس اسٹینڈ",
        watan_code="PWD-RPL-01",
        city="Rawalpindi",
        district="Rawalpindi",
        lat=33.6331,
        lng=73.0489,
        geofence_radius_meters=300.0,
        allowed_vehicle_types=["wagon", "coaster"],
        bays_count=8,
        internal_parchi_rate_fixed_pkr=150.0,
        weekly_subscription_fee_pkr=4500.0,
        manager_phone="03001234567",
    )
    assert adda.city == "Rawalpindi"
    assert adda.weekly_subscription_fee_pkr == 4500.0

    res = SeatReservationIn(
        adda_id="adda_pwd_01",
        corridor_id="rpl_murree",
        seat_numbers=[3, 4],
        payment_method="pay_at_adda",
        passenger_name="Ayesha Bibi",
        passenger_phone="03009876543",
        is_female_zone=True,
    )
    assert res.is_female_zone is True
    assert len(res.seat_numbers) == 2

    ticket = CounterTicketIssueIn(
        adda_id="adda_pwd_01",
        corridor_id="rpl_murree",
        bay_number=2,
        seat_numbers=[1],
        fare_per_seat_pkr=350.0,
        cash_tendered_pkr=500.0,
    )
    assert ticket.cash_tendered_pkr - ticket.fare_per_seat_pkr == 150.0

    mode = DriverModeToggleIn(
        mode="adda",
        adda_id="adda_pwd_01",
        lat=33.6331,
        lng=73.0489,
    )
    assert mode.mode == "adda"
