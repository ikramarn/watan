from datetime import datetime, timedelta, timezone

import pytest

from app.models import RegisterIn
from app.services.fare import compute_fare
from app.services.matching import can_consider, score_ride
from app.services.state_machine import assert_transition


def test_compute_fare_positive_and_types():
    economy = compute_fare(10.0, "economy")
    premium = compute_fare(10.0, "premium")
    xl = compute_fare(10.0, "xl")

    assert economy["fare"] > 0
    assert premium["fare"] > economy["fare"]
    assert xl["fare"] > economy["fare"]


def test_state_machine_valid_transition():
    assert_transition("pending", "accepted")
    assert_transition("accepted", "arrived")
    assert_transition("arrived", "in_progress")
    assert_transition("in_progress", "completed")


def test_state_machine_invalid_transition_raises():
    with pytest.raises(Exception):
        assert_transition("pending", "completed")


def test_matching_consider_requires_pending_type_and_distance():
    driver_status = {"lat": 37.77, "lng": -122.41}
    ride = {
        "status": "pending",
        "ride_type": "economy",
        "pickup": {"lat": 37.78, "lng": -122.42},
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    assert can_consider(ride, driver_status, "economy") is True


def test_matching_score_prefers_closer_ride():
    driver_status = {"lat": 37.77, "lng": -122.41}
    created = (datetime.now(timezone.utc) - timedelta(minutes=3)).isoformat()
    near = {
        "pickup": {"lat": 37.7705, "lng": -122.4105},
        "created_at": created,
    }
    far = {
        "pickup": {"lat": 37.82, "lng": -122.47},
        "created_at": created,
    }
    assert score_ride(near, driver_status) < score_ride(far, driver_status)


# --- Non-interference regression tests (dispatch-control-room, Requirements 7.1, 7.3) ---
# These confirm the additive `dispatcher` Role literal value did not change existing
# validation behavior for `passenger`/`driver`, and that invalid roles are still rejected.


def _register_payload(role: str) -> dict:
    return {
        "email": "regression_test@example.com",
        "password": "TestPass123!",
        "name": "Regression Test",
        "role": role,
    }


def test_role_literal_still_accepts_passenger_and_driver_unchanged():
    passenger = RegisterIn(**_register_payload("passenger"))
    driver = RegisterIn(**_register_payload("driver"))
    assert passenger.role == "passenger"
    assert driver.role == "driver"


def test_role_literal_additively_accepts_dispatcher():
    dispatcher = RegisterIn(**_register_payload("dispatcher"))
    assert dispatcher.role == "dispatcher"


def test_role_literal_still_rejects_invalid_role_unchanged():
    with pytest.raises(Exception):
        RegisterIn(**_register_payload("admin"))
