from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, EmailStr, Field, field_validator


Role = Literal["passenger", "driver", "dispatcher"]
RideType = Literal["economy", "premium", "xl"]
RideStatus = Literal[
    "pending",
    "accepted",
    "arrived",
    "in_progress",
    "completed",
    "cancelled",
]
KycStatus = Literal["pending", "verified", "rejected", "documents_required"]


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    name: str = Field(min_length=2, max_length=80)
    role: Role
    phone: Optional[str] = Field(default="", max_length=30)
    vehicle_make: Optional[str] = Field(default="", max_length=80)
    vehicle_plate: Optional[str] = Field(default="", max_length=30)
    vehicle_type: Optional[RideType] = "economy"


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    role: Optional[Role] = None


class GoogleAuthIn(BaseModel):
    id_token: str = Field(min_length=10)
    role: Optional[Role] = "passenger"
    vehicle_make: Optional[str] = Field(default="", max_length=80)
    vehicle_plate: Optional[str] = Field(default="", max_length=30)
    vehicle_type: Optional[RideType] = "economy"


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


class RideEstimateIn(BaseModel):
    pickup_lat: float = Field(ge=-90, le=90)
    pickup_lng: float = Field(ge=-180, le=180)
    dest_lat: float = Field(ge=-90, le=90)
    dest_lng: float = Field(ge=-180, le=180)


class RideRequestIn(BaseModel):
    pickup_lat: float = Field(ge=-90, le=90)
    pickup_lng: float = Field(ge=-180, le=180)
    pickup_address: str = Field(min_length=2, max_length=200)
    dest_lat: float = Field(ge=-90, le=90)
    dest_lng: float = Field(ge=-180, le=180)
    dest_address: str = Field(min_length=2, max_length=200)
    ride_type: RideType = "economy"
    payment_method: Optional[Literal["card", "cash"]] = "card"


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


class PaymentIntentCreateIn(BaseModel):
    ride_id: str = Field(min_length=8, max_length=80)


class PaymentCaptureIn(BaseModel):
    ride_id: str = Field(min_length=8, max_length=80)
    tip_amount: Optional[float] = Field(default=0.0, ge=0)


class TipIn(BaseModel):
    ride_id: str = Field(min_length=8, max_length=80)
    tip_amount: float = Field(gt=0, le=200)


class DriverPayoutIn(BaseModel):
    amount: Optional[float] = Field(default=None, gt=0)


class DriverKycSubmitIn(BaseModel):
    license_number: str = Field(min_length=4, max_length=50)
    license_expiry: str = Field(min_length=4, max_length=20)
    council_name: Optional[str] = Field(default="", max_length=100)
    operator_license_number: Optional[str] = Field(default="", max_length=60)
    operator_license_expiry: Optional[str] = Field(default="", max_length=20)
    phv_badge_number: Optional[str] = Field(default="", max_length=50)
    badge_expiry: Optional[str] = Field(default="", max_length=20)
    insurance_policy: str = Field(min_length=4, max_length=60)
    insurance_expiry: Optional[str] = Field(default="", max_length=20)
    vehicle_plate: Optional[str] = Field(default="", max_length=30)
    plate_expiry: Optional[str] = Field(default="", max_length=20)
    vehicle_year: int = Field(ge=2005, le=2030)
    vehicle_color: str = Field(min_length=2, max_length=30)
    bank_sort_code: Optional[str] = Field(default="", max_length=10)
    bank_account_number: Optional[str] = Field(default="", max_length=20)
    document_urls: Optional[List[str]] = Field(default_factory=list)


class DriverKycReviewIn(BaseModel):
    driver_id: str = Field(min_length=1, max_length=80)
    status: Literal["verified", "rejected"]
    reason: Optional[str] = Field(default="", max_length=300)


class EmergencySosIn(BaseModel):
    ride_id: str = Field(min_length=8, max_length=80)
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    reason: Optional[str] = Field(default="Passenger triggered emergency SOS", max_length=300)


class DeleteAccountIn(BaseModel):
    confirmation: str = Field(min_length=4, max_length=50)


class PhoneOtpRequestIn(BaseModel):
    phone: str = Field(min_length=7, max_length=30)


class PhoneOtpVerifyIn(BaseModel):
    phone: str = Field(min_length=7, max_length=30)
    code: str = Field(min_length=4, max_length=10)


class EmailOtpRequestIn(BaseModel):
    email: EmailStr


class EmailOtpVerifyIn(BaseModel):
    email: EmailStr
    code: str = Field(min_length=4, max_length=10)


class DispatcherCreateIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    name: str = Field(min_length=2, max_length=80)


class ManualAssignIn(BaseModel):
    driver_id: str = Field(min_length=1, max_length=80)


class ReassignIn(BaseModel):
    driver_id: str = Field(min_length=1, max_length=80)


class ForceCancelIn(BaseModel):
    reason: Optional[str] = Field(default="", max_length=300)


class AuditLogQueryIn(BaseModel):
    start: Optional[str] = None
    end: Optional[str] = None
    dispatcher_id: Optional[str] = None


class AnalyticsRangeIn(BaseModel):
    start: str
    end: str
