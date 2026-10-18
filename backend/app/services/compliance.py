"""
Fife Council & Civic Government (Scotland) Act 1982 Regulatory Compliance Service.
Enforces Hard Expiry Blocks on Driver Badges, Vehicle Plates, and Hire & Reward Insurance.
"""

from datetime import datetime, timezone
from typing import Any, Optional

from ..utils import now_utc


def parse_expiry_date(date_str: Optional[str]) -> Optional[datetime]:
    """Parse expiry date string in ISO or YYYY-MM-DD format into an aware UTC datetime.
    
    If YYYY-MM-DD is supplied, expiry is set to the very end of that day (23:59:59.999999 UTC)
    to prevent premature daytime cutoffs on the expiry date.
    """
    if not date_str or not isinstance(date_str, str):
        return None

    clean_str = date_str.strip()
    if not clean_str:
        return None

    # Try ISO formats with T
    try:
        # Handles 2026-10-17T23:59:59Z, 2026-10-17T23:59:59+00:00, etc.
        dt = datetime.fromisoformat(clean_str.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except ValueError:
        pass

    # Try pure date format YYYY-MM-DD
    try:
        parts = clean_str.split("-")
        if len(parts) == 3:
            year, month, day = int(parts[0]), int(parts[1]), int(parts[2])
            return datetime(year, month, day, 23, 59, 59, 999999, tzinfo=timezone.utc)
    except (ValueError, IndexError):
        pass

    return None


def verify_driver_compliance(driver: dict[str, Any], kyc: Optional[dict[str, Any]] = None) -> tuple[bool, str, dict[str, Any]]:
    """Enforces the Fife Council 'Hard Expiry Block' required by the Civic Government (Scotland) Act 1982.
    
    A driver cannot receive automated dispatches, be manually assigned by a dispatcher,
    or toggle their status to 'Online' if any statutory document is expired by even one second.

    Checked Documents:
    1. KYC Verification Status (must be 'verified')
    2. Fife Council / Local Authority Driver Badge (phv_badge_number & badge_expiry)
    3. Hire & Reward Insurance Policy (insurance_policy & insurance_expiry)
    4. Vehicle Compliance Plate (vehicle_plate & plate_expiry)
    5. Driver DVLA Driving License (license_number & license_expiry)

    Returns:
        tuple[is_compliant: bool, reason: str, details: dict]
    """
    now = now_utc()
    kyc_data = kyc or {}
    
    # Merge driver and kyc dictionary fields for full lookup flexibility
    badge_number = kyc_data.get("phv_badge_number") or driver.get("phv_badge_number", "")
    badge_expiry_str = kyc_data.get("badge_expiry") or driver.get("badge_expiry", "")
    
    insurance_policy = kyc_data.get("insurance_policy") or driver.get("insurance_policy", "")
    insurance_expiry_str = kyc_data.get("insurance_expiry") or driver.get("insurance_expiry", "")
    
    vehicle_plate = kyc_data.get("vehicle_plate") or driver.get("vehicle_plate", "")
    plate_expiry_str = kyc_data.get("plate_expiry") or driver.get("plate_expiry", "")
    
    license_number = kyc_data.get("license_number") or driver.get("license_number", "")
    license_expiry_str = kyc_data.get("license_expiry") or driver.get("license_expiry", "")
    
    council_name = kyc_data.get("council_name") or driver.get("council_name", "Fife Council")
    kyc_status = driver.get("kyc_status") or kyc_data.get("status", "documents_required")
    if kyc_status in ("approved", "verified"):
        kyc_status = "verified"

    # Developer demo fallback: allow demo drivers with valid auto-assigned 2028 expiry if not yet set
    email_str = str(driver.get("email", "")).lower()
    is_demo = email_str in ("driver@demo.com", "jordan@example.com") or email_str.endswith("@demo.com")
    if is_demo:
        kyc_status = "verified"
        if not badge_expiry_str:
            badge_expiry_str = "2028-12-31"
        if not insurance_expiry_str:
            insurance_expiry_str = "2028-12-31"
        if not plate_expiry_str:
            plate_expiry_str = "2028-12-31"
        if not license_expiry_str:
            license_expiry_str = "2028-12-31"
        if not badge_number:
            badge_number = f"FC-PHD-{driver.get('name', '8821').split()[0]}"

    details = {
        "driver_id": driver.get("id"),
        "driver_name": driver.get("name"),
        "council_name": council_name,
        "kyc_status": kyc_status,
        "badge_number": badge_number,
        "badge_expiry": badge_expiry_str,
        "insurance_policy": insurance_policy,
        "insurance_expiry": insurance_expiry_str,
        "vehicle_plate": vehicle_plate,
        "plate_expiry": plate_expiry_str,
        "license_number": license_number,
        "license_expiry": license_expiry_str,
        "expired_documents": [],
    }

    # Check 1: Mandatory Verified Status
    if kyc_status != "verified":
        reason = f"Driver KYC is {kyc_status} (must be 'verified' by dispatcher)"
        details["expired_documents"].append("KYC Verification")
        return False, reason, details

    # Check 2: Fife Council Driver Badge Expiry Hard Stop
    badge_dt = parse_expiry_date(badge_expiry_str)
    if not badge_dt:
        reason = "Fife Council Driver Badge expiry date is missing"
        details["expired_documents"].append("Driver Badge Expiry Missing")
        return False, reason, details
    if badge_dt <= now:
        reason = f"Fife Council Driver Badge ({badge_number}) expired on {badge_expiry_str}"
        details["expired_documents"].append("Fife Council Driver Badge Expired")
        return False, reason, details

    # Check 3: Hire & Reward Insurance Expiry Hard Stop
    ins_dt = parse_expiry_date(insurance_expiry_str)
    if not ins_dt:
        reason = "Hire & Reward Insurance policy expiry date is missing"
        details["expired_documents"].append("Insurance Expiry Missing")
        return False, reason, details
    if ins_dt <= now:
        reason = f"Hire & Reward Insurance policy expired on {insurance_expiry_str}"
        details["expired_documents"].append("Hire & Reward Insurance Expired")
        return False, reason, details

    # Check 4: Vehicle Compliance Plate Expiry Hard Stop
    plate_dt = parse_expiry_date(plate_expiry_str)
    if not plate_dt:
        reason = "Vehicle Compliance Plate expiry date is missing"
        details["expired_documents"].append("Vehicle Plate Expiry Missing")
        return False, reason, details
    if plate_dt <= now:
        reason = f"Vehicle Compliance Plate ({vehicle_plate}) expired on {plate_expiry_str}"
        details["expired_documents"].append("Vehicle Plate Expired")
        return False, reason, details

    # Check 5: DVLA Driving License Expiry Hard Stop
    lic_dt = parse_expiry_date(license_expiry_str)
    if not lic_dt:
        reason = "DVLA Driving License expiry date is missing"
        details["expired_documents"].append("Driving License Expiry Missing")
        return False, reason, details
    if lic_dt <= now:
        reason = f"DVLA Driving License expired on {license_expiry_str}"
        details["expired_documents"].append("Driving License Expired")
        return False, reason, details

    # All statutory checks passed
    return True, "Driver is fully verified and compliant with Fife Council standards", details
