import pytest
from app.config import settings
from app.models import GoogleAuthIn, PaymentCaptureIn, PhoneOtpRequestIn, PhoneOtpVerifyIn
from app.middleware import RedisRateLimitMiddleware
from fastapi import FastAPI, Request


def test_google_auth_model_validation():
    m = GoogleAuthIn(id_token="valid_google_id_token_1234567890", role="passenger")
    assert m.id_token == "valid_google_id_token_1234567890"
    assert m.role == "passenger"

    driver_m = GoogleAuthIn(
        id_token="valid_google_id_token_1234567890",
        role="driver",
        vehicle_make="Mercedes E-Class",
        vehicle_plate="AB12 CDE",
        vehicle_type="premium",
    )
    assert driver_m.role == "driver"
    assert driver_m.vehicle_make == "Mercedes E-Class"
    assert driver_m.vehicle_type == "premium"


def test_payment_capture_input_validation():
    cap = PaymentCaptureIn(ride_id="ride-uuid-123456", tip_amount=5.0)
    assert cap.ride_id == "ride-uuid-123456"
    assert cap.tip_amount == 5.0

    # Negative tip should fail validation
    with pytest.raises(Exception):
        PaymentCaptureIn(ride_id="ride-uuid-123456", tip_amount=-1.0)


def test_phone_otp_models():
    req = PhoneOtpRequestIn(phone="+447911123456")
    assert req.phone == "+447911123456"

    verify = PhoneOtpVerifyIn(phone="+447911123456", code="123456")
    assert verify.code == "123456"


def test_rate_limit_ip_resolution():
    app = FastAPI()
    mw = RedisRateLimitMiddleware(app)

    # Test X-Forwarded-For resolution
    class MockRequest:
        headers = {"X-Forwarded-For": "203.0.113.195, 70.41.3.18, 150.172.238.178"}
        client = type("Client", (), {"host": "10.0.0.1"})()

    ip = mw._get_client_ip(MockRequest())
    assert ip == "203.0.113.195"

    # Test X-Real-IP resolution
    class MockRealIpRequest:
        headers = {"X-Real-IP": "198.51.100.42"}
        client = type("Client", (), {"host": "10.0.0.1"})()

    ip = mw._get_client_ip(MockRealIpRequest())
    assert ip == "198.51.100.42"
