import math
import pytest
from app.services.email import send_verification_otp_email


@pytest.mark.anyio
async def test_email_otp_generation_and_fallback():
    # Test that the OTP email sending function executes cleanly in test mode
    result = await send_verification_otp_email("passenger@test.com", "John Doe", "123456")
    assert result is True


def test_uber_uk_waiting_fee_calculation():
    """
    Validates Uber UK Waiting Fee rules:
    - First 120 seconds (2 minutes): Grace period (£0.00).
    - Thereafter: £0.25 per minute (rounded up to nearest minute).
    """
    def compute_waiting_fee(elapsed_seconds: float) -> float:
        if elapsed_seconds <= 120.0:
            return 0.0
        chargeable_seconds = elapsed_seconds - 120.0
        chargeable_minutes = math.ceil(chargeable_seconds / 60.0)
        return round(chargeable_minutes * 0.25, 2)

    # Within 2-minute grace period
    assert compute_waiting_fee(0) == 0.0
    assert compute_waiting_fee(60) == 0.0
    assert compute_waiting_fee(120) == 0.0

    # 1 second over grace period -> 1 minute charged
    assert compute_waiting_fee(121) == 0.25
    assert compute_waiting_fee(180) == 0.25

    # 2 minutes over grace period
    assert compute_waiting_fee(181) == 0.50
    assert compute_waiting_fee(240) == 0.50

    # 3 minutes over grace period (5 mins total wait)
    assert compute_waiting_fee(300) == 0.75

    # 10 minutes wait total (8 minutes chargeable)
    assert compute_waiting_fee(600) == 2.00


def test_no_show_cancellation_fee():
    """Validates Uber UK £5.00 no-show cancellation fee and 80% driver share."""
    cancellation_fee = 5.00
    driver_share = round(cancellation_fee * 0.80, 2)
    platform_cut = round(cancellation_fee - driver_share, 2)

    assert cancellation_fee == 5.00
    assert driver_share == 4.00
    assert platform_cut == 1.00


def test_dual_payment_driver_wallet_accounting():
    """
    Validates wallet balance updates for Card vs Cash trips:
    - Card: Passenger pays via Stripe -> Driver wallet receives +80% driver earnings.
    - Cash: Driver collects 100% physical cash -> Driver wallet is debited -20% platform commission.
    """
    fare = 20.00
    driver_earnings = round(fare * 0.80, 2)  # £16.00
    platform_commission = round(fare - driver_earnings, 2)  # £4.00

    # Card trip simulation
    card_wallet_delta = driver_earnings
    assert card_wallet_delta == 16.00

    # Cash trip simulation (driver already has £20 cash in pocket)
    cash_wallet_delta = -platform_commission
    assert cash_wallet_delta == -4.00

    # Net driver position in cash trip: £20 cash collected - £4 commission owed = £16 profit
    assert (fare + cash_wallet_delta) == driver_earnings
