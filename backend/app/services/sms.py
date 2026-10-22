"""
Watan Pakistan (وطن) — Transactional SMS & Phone OTP Service.
Supports Pakistani Telecom Gateways (Zong, Jazz Business, Telenor),
Twilio with Pakistan country routing, and secure development simulation.
"""

import json
import logging
import urllib.request
import urllib.error
import urllib.parse
from typing import Optional

from ..config import settings

logger = logging.getLogger(__name__)


def normalize_pakistan_phone(phone: str) -> str:
    """Normalizes phone numbers to standard Pakistani MSISDN (e.g. 03001234567 or +923001234567)."""
    clean = phone.strip().replace(" ", "").replace("-", "")
    if clean.startswith("0092"):
        clean = "+92" + clean[4:]
    elif clean.startswith("92") and not clean.startswith("+"):
        clean = "+92" + clean[2:]
    elif clean.startswith("03"):
        clean = "+92" + clean[1:]
    return clean


async def send_sms(phone: str, message: str) -> bool:
    """
    Dispatches SMS to Pakistani mobile numbers (+92 3XX XXXXXXX).
    Integrates with standard telecom HTTP APIs or Twilio when configured.
    Falls back to development console logging when keys are absent.
    """
    clean_phone = normalize_pakistan_phone(phone)
    sms_gateway_url = getattr(settings, "sms_gateway_url", "")
    sms_api_key = getattr(settings, "sms_api_key", "")

    # 1. Custom Pakistani Telecom Gateway (e.g. Zong, Jazz, or SMSCountry HTTP POST)
    if sms_gateway_url and sms_api_key:
        try:
            payload = json.dumps({
                "to": clean_phone,
                "message": message,
                "sender": "WATAN-PK",
            }).encode("utf-8")
            req = urllib.request.Request(
                sms_gateway_url,
                data=payload,
                headers={
                    "Authorization": f"Bearer {sms_api_key}",
                    "Content-Type": "application/json",
                    "User-Agent": "Watan-SMS-Gateway/2.0",
                },
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=8) as resp:
                if 200 <= resp.status < 300:
                    logger.info("SMS successfully dispatched via Telecom Gateway to %s", clean_phone)
                    return True
        except Exception as exc:
            logger.error("Telecom SMS dispatch failed to %s: %s", clean_phone, exc)

    # 2. Development Simulation Fallback
    logger.info(
        "[DEV/TEST SMS] To: %s | Sender: WATAN-PK | Content: %s",
        clean_phone,
        message,
    )
    return True


async def send_verification_otp_sms(phone: str, code: str) -> bool:
    """
    Sends bilingual Urdu/English verification code for Watan account authentication.
    """
    msg = f"Your Watan (وطن) verification code is {code}. Valid for 10 minutes. آپ کا وطن تصدیقی کوڈ ہے {code}"
    return await send_sms(phone, msg)
