from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, EmailStr, Field, field_validator


Role = Literal["passenger", "driver", "munshi", "dispatcher", "admin"]
RideType = Literal[
    "bike",
    "rickshaw",
    "qingqi",
    "car_mini",
    "car_comfort",
    "wagon",
    "coaster",
    # Legacy aliases
    "economy",
    "premium",
    "xl",
]
DriverMode = Literal["roaming", "adda"]
RideStatus = Literal[
    "pending",
    "accepted",
    "arrived",
    "in_progress",
    "completed",
    "cancelled",
]
KycStatus = Literal["pending", "verified", "rejected", "documents_required"]
PaymentMethod = Literal["cash", "pay_at_adda", "raast", "jazzcash", "easypaisa", "card"]


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    name: str = Field(min_length=2, max_length=80)
    role: Role
    phone: Optional[str] = Field(default="", max_length=30)
    cnic: Optional[str] = Field(default="", max_length=25)
    vehicle_make: Optional[str] = Field(default="", max_length=80)
    vehicle_plate: Optional[str] = Field(default="", max_length=30)
    vehicle_type: Optional[RideType] = "car_mini"
    assigned_adda_id: Optional[str] = None


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    role: Optional[Role] = None


class GoogleAuthIn(BaseModel):
    id_token: str = Field(min_length=10)
    role: Optional[Role] = "passenger"
    vehicle_make: Optional[str] = Field(default="", max_length=80)
    vehicle_plate: Optional[str] = Field(default="", max_length=30)
    vehicle_type: Optional[RideType] = "car_mini"


class RefreshIn(BaseModel):
    refresh_token: str = Field(min_length=20)


class LocationIn(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    bearing: Optional[float] = Field(default=None, ge=0, le=360)
    speed: Optional[float] = Field(default=None, ge=0)


class DriverStatusIn(BaseModel):
    online: bool
    lat: Optional[float] = Field(default=None, ge=-90, le=90)
    lng: Optional[float] = Field(default=None, ge=-180, le=180)
    bearing: Optional[float] = Field(default=None, ge=0, le=360)
    active_mode: Optional[DriverMode] = "roaming"
    current_adda_id: Optional[str] = None


class DriverModeToggleIn(BaseModel):
    mode: DriverMode
    adda_id: Optional[str] = None
    lat: Optional[float] = Field(default=None, ge=-90, le=90)
    lng: Optional[float] = Field(default=None, ge=-180, le=180)


class RideEstimateIn(BaseModel):
    pickup_lat: float = Field(ge=-90, le=90)
    pickup_lng: float = Field(ge=-180, le=180)
    dest_lat: float = Field(ge=-90, le=90)
    dest_lng: float = Field(ge=-180, le=180)
    ride_type: Optional[RideType] = "car_mini"


class RideRequestIn(BaseModel):
    pickup_lat: float = Field(ge=-90, le=90)
    pickup_lng: float = Field(ge=-180, le=180)
    pickup_address: str = Field(min_length=2, max_length=200)
    dest_lat: float = Field(ge=-90, le=90)
    dest_lng: float = Field(ge=-180, le=180)
    dest_address: str = Field(min_length=2, max_length=200)
    ride_type: RideType = "car_mini"
    payment_method: Optional[PaymentMethod] = "cash"


class RateIn(BaseModel):
    rating: int = Field(ge=1, le=5)
    comment: Optional[str] = Field(default="", max_length=400)


class ChatIn(BaseModel):
    text: str = Field(min_length=1, max_length=500)

    @field_validator("text")
    @classmethod
    def validate_text(cls, v: str) -> str:
        clean = v.strip()
        if not clean:
            raise ValueError("Message cannot be empty")
        return clean


class CheckoutIn(BaseModel):
    ride_id: str = Field(min_length=8, max_length=80)
    origin_url: str = Field(min_length=8, max_length=300)


# ==========================================
# WATAN ADDA & PARI MANAGEMENT MODELS
# ==========================================

class AddaCreateIn(BaseModel):
    name: str = Field(min_length=3, max_length=100)
    urdu_name: Optional[str] = Field(default="", max_length=100)
    watan_code: str = Field(min_length=3, max_length=20)
    city: str = Field(min_length=2, max_length=60)
    district: str = Field(min_length=2, max_length=60)
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    geofence_radius_meters: float = Field(default=250.0, ge=50.0, le=2000.0)
    allowed_vehicle_types: List[str] = Field(default=["wagon", "qingqi", "coaster"])
    bays_count: int = Field(default=6, ge=1, le=30)
    internal_parchi_rate_fixed_pkr: float = Field(default=150.0, ge=0.0)
    weekly_subscription_fee_pkr: float = Field(default=4500.0, ge=0.0)
    manager_phone: Optional[str] = Field(default="", max_length=30)


class AddaCheckinIn(BaseModel):
    adda_id: str
    driver_id: str
    corridor_id: str
    corridor_name: str
    vehicle_plate: str
    vehicle_type: Optional[str] = "wagon"
    bay_number: int = Field(ge=1, le=30)
    total_seats: int = Field(default=14, ge=1, le=50)
    scheduled_departure_time: Optional[str] = None


class AddaEnrollDriverIn(BaseModel):
    adda_id: str
    driver_identifier: str = Field(description="Driver Phone or CNIC or Driver ID")


class SeatReservationIn(BaseModel):
    adda_id: str
    corridor_id: str
    vehicle_id: Optional[str] = None
    seat_numbers: List[int] = Field(min_length=1, max_length=10)
    payment_method: PaymentMethod = "pay_at_adda"
    passenger_name: Optional[str] = "Passenger"
    passenger_phone: str = Field(min_length=7, max_length=25)
    is_female_zone: bool = False


class CounterTicketIssueIn(BaseModel):
    adda_id: str
    corridor_id: str
    bay_number: int = Field(ge=1, le=30)
    seat_numbers: List[int] = Field(min_length=1, max_length=14)
    fare_per_seat_pkr: float = Field(gt=0)
    cash_tendered_pkr: float = Field(gt=0)
    passenger_name: Optional[str] = "Walk-in Passenger"


class ValidateTicketIn(BaseModel):
    ticket_code_or_qr: str


class DriverKycSubmitIn(BaseModel):
    cnic: Optional[str] = Field(default="", max_length=25)
    license_number: str = Field(min_length=2, max_length=50)
    license_expiry: str = Field(min_length=2, max_length=20)
    city_traffic_police: Optional[str] = Field(default="", max_length=100)
    council_name: Optional[str] = Field(default="Transport Authority", max_length=100)
    operator_license_number: Optional[str] = Field(default="", max_length=50)
    operator_license_expiry: Optional[str] = Field(default="", max_length=20)
    phv_badge_number: Optional[str] = Field(default="", max_length=50)
    badge_expiry: Optional[str] = Field(default="", max_length=20)
    insurance_policy: Optional[str] = Field(default="", max_length=80)
    insurance_expiry: Optional[str] = Field(default="", max_length=20)
    mot_certificate: Optional[str] = Field(default="", max_length=80)
    mot_expiry: Optional[str] = Field(default="", max_length=20)
    phv_licence: Optional[str] = Field(default="", max_length=80)
    phv_licence_expiry: Optional[str] = Field(default="", max_length=20)
    v5c_logbook: Optional[str] = Field(default="", max_length=80)
    dvla_check_code: Optional[str] = Field(default="", max_length=80)
    vehicle_make: Optional[str] = Field(default="", max_length=80)
    vehicle_model: Optional[str] = Field(default="", max_length=80)
    vehicle_plate: Optional[str] = Field(default="", max_length=30)
    vehicle_year: Optional[int] = Field(default=2020, ge=1990, le=2035)
    vehicle_colour: Optional[str] = Field(default="White", max_length=30)
    vehicle_type: Optional[RideType] = "car_mini"
    bank_iban_or_raast_alias: Optional[str] = Field(default="", max_length=40)
    document_urls: Optional[List[str]] = Field(default_factory=list)


class EmergencySosIn(BaseModel):
    ride_id: str = Field(min_length=8, max_length=80)
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    reason: Optional[str] = Field(default="Passenger triggered emergency SOS", max_length=300)


class WalletTopupIn(BaseModel):
    amount_pkr: float = Field(gt=0, le=50000)
    method: Literal["raast", "jazzcash", "easypaisa", "counter_cash"]
    account_number: Optional[str] = ""


class DriverPayoutIn(BaseModel):
    amount: float = Field(gt=0)
    bank_iban: Optional[str] = None
    raast_id: Optional[str] = None


class EmailOtpRequestIn(BaseModel):
    email: EmailStr


class EmailOtpVerifyIn(BaseModel):
    email: EmailStr
    code: str = Field(min_length=4, max_length=10)


class PhoneOtpRequestIn(BaseModel):
    phone: str = Field(min_length=7, max_length=30)


class PhoneOtpVerifyIn(BaseModel):
    phone: str = Field(min_length=7, max_length=30)
    code: str = Field(min_length=4, max_length=10)


class DispatcherCreateIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    name: str = Field(min_length=2, max_length=80)


class ForceCancelIn(BaseModel):
    ride_id: str = Field(min_length=6, max_length=80)
    reason: Optional[str] = Field(default="", max_length=300)


class ManualAssignIn(BaseModel):
    ride_id: str = Field(min_length=6, max_length=80)
    driver_id: str = Field(min_length=6, max_length=80)


class ReassignIn(BaseModel):
    ride_id: str = Field(min_length=6, max_length=80)
    new_driver_id: str = Field(min_length=6, max_length=80)
    reason: Optional[str] = Field(default="", max_length=300)


class PaymentIntentCreateIn(BaseModel):
    ride_id: str = Field(min_length=6, max_length=80)
    tip_amount: Optional[float] = 0.0


class PaymentCaptureIn(BaseModel):
    ride_id: str = Field(min_length=6, max_length=80)
    payment_intent_id: Optional[str] = None
    tip_amount: Optional[float] = Field(default=0.0, ge=0)


class TipIn(BaseModel):
    ride_id: str = Field(min_length=6, max_length=80)
    tip_amount: float = Field(default=0.0, ge=0)
    amount: Optional[float] = None


class RaastQrGenerateIn(BaseModel):
    ride_id: str = Field(min_length=6, max_length=80)
    amount_pkr: Optional[float] = Field(default=None, gt=0)
    purpose: Optional[str] = Field(default="Watan Ride Fare", max_length=100)


class JazzCashInitiateIn(BaseModel):
    ride_id: str = Field(min_length=6, max_length=80)
    mobile_number: str = Field(min_length=10, max_length=15)
    cnic_last_6: Optional[str] = Field(default="", max_length=6)
    amount_pkr: Optional[float] = Field(default=None, gt=0)


class EasyPaisaInitiateIn(BaseModel):
    ride_id: str = Field(min_length=6, max_length=80)
    mobile_number: str = Field(min_length=10, max_length=15)
    email: Optional[str] = Field(default="", max_length=80)
    amount_pkr: Optional[float] = Field(default=None, gt=0)


class CashConfirmIn(BaseModel):
    ride_id: str = Field(min_length=6, max_length=80)
    amount_received_pkr: Optional[float] = Field(default=None, gt=0)
    notes: Optional[str] = Field(default="", max_length=200)

