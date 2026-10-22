"""
Transactional Email Service for Watan Pakistan (وطن).
Supports Resend API and SendGrid API with fallback development simulation.
"""

import json
import logging
import urllib.request
import urllib.error
from typing import Optional

from ..config import settings

logger = logging.getLogger(__name__)


async def send_email(
    to_email: str,
    subject: str,
    html_content: str,
    text_content: Optional[str] = None,
) -> bool:
    """
    Send an email via Resend or SendGrid API based on configured settings.
    If no API key is configured, logs the email for development/testing.
    """
    from_email = settings.email_from or "Watan Pakistan <noreply@watan.pk>"
    to_clean = to_email.strip().lower()

    # 1. Try Resend API if API key is present
    if settings.resend_api_key:
        try:
            payload = {
                "from": from_email,
                "to": [to_clean],
                "subject": subject,
                "html": html_content,
            }
            if text_content:
                payload["text"] = text_content

            req = urllib.request.Request(
                "https://api.resend.com/emails",
                data=json.dumps(payload).encode("utf-8"),
                headers={
                    "Authorization": f"Bearer {settings.resend_api_key}",
                    "Content-Type": "application/json",
                    "User-Agent": "Watan-Backend/2.0",
                },
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                if 200 <= resp.status < 300:
                    logger.info("Email successfully sent via Resend to %s", to_clean)
                    return True
        except urllib.error.HTTPError as exc:
            err_msg = exc.read().decode("utf-8", errors="ignore")
            logger.error("Resend API failed with status %d: %s", exc.code, err_msg)
        except Exception as exc:
            logger.error("Unexpected error sending email via Resend: %s", exc)

    # 2. Try SendGrid API if API key is present
    if settings.sendgrid_api_key:
        try:
            payload = {
                "personalizations": [{"to": [{"email": to_clean}]}],
                "from": {"email": from_email.split("<")[-1].replace(">", "").strip() or "noreply@watan.pk", "name": "Watan Pakistan"},
                "subject": subject,
                "content": [{"type": "text/html", "value": html_content}],
            }
            req = urllib.request.Request(
                "https://api.sendgrid.com/v3/mail/send",
                data=json.dumps(payload).encode("utf-8"),
                headers={
                    "Authorization": f"Bearer {settings.sendgrid_api_key}",
                    "Content-Type": "application/json",
                    "User-Agent": "Watan-Backend/2.0",
                },
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                if 200 <= resp.status < 300:
                    logger.info("Email successfully sent via SendGrid to %s", to_clean)
                    return True
        except urllib.error.HTTPError as exc:
            err_msg = exc.read().decode("utf-8", errors="ignore")
            logger.error("SendGrid API failed with status %d: %s", exc.code, err_msg)
        except Exception as exc:
            logger.error("Unexpected error sending email via SendGrid: %s", exc)

    # 3. Development / Test Fallback
    logger.info(
        "[DEV/TEST EMAIL] To: %s | Subject: %s | Body preview: %s",
        to_clean,
        subject,
        text_content or "(HTML email sent)",
    )
    return True


async def send_verification_otp_email(to_email: str, name: str, code: str) -> bool:
    """
    Sends a branded 6-digit verification code email for account registration and login.
    """
    first_name = name.split()[0] if name else "there"
    subject = f"{code} is your Watan verification code"
    
    html = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Your Watan Verification Code</title>
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b1118; margin: 0; padding: 24px; color: #f8fafc; }}
    .card {{ max-width: 480px; margin: 0 auto; background: #131c26; border-radius: 16px; padding: 32px; box-shadow: 0 4px 20px rgba(0,0,0,0.3); border: 1px solid #1f2d3d; }}
    .logo {{ font-size: 24px; font-weight: 800; color: #10b981; letter-spacing: -0.5px; margin-bottom: 24px; }}
    .title {{ font-size: 20px; font-weight: 700; color: #f8fafc; margin-bottom: 8px; }}
    .text {{ font-size: 15px; color: #94a3b8; line-height: 22px; margin-bottom: 24px; }}
    .code-box {{ background: #0b1118; border-radius: 12px; padding: 18px; text-align: center; letter-spacing: 8px; font-size: 32px; font-weight: 800; color: #10b981; margin: 24px 0; font-family: monospace; border: 1px solid #10b981; }}
    .footer {{ font-size: 12px; color: #64748b; text-align: center; margin-top: 32px; border-top: 1px solid #1f2d3d; padding-top: 16px; }}
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">Watan (وطن)</div>
    <div class="title">Verify your email address</div>
    <div class="text">Hi {first_name}, welcome to Watan Pakistan! Use the 6-digit code below to verify your account:</div>
    <div class="code-box">{code}</div>
    <div class="text" style="font-size: 13px; color: #64748b;">
      This code will expire in <strong>10 minutes</strong>. If you didn't request this code, you can safely ignore this email.
    </div>
    <div class="footer">
      Watan Pakistan (وطن) • National Multi-Modal Mobility & Adda Transport Network
    </div>
  </div>
</body>
</html>"""

    text = f"Hi {first_name},\n\nYour Watan verification code is: {code}\n\nThis code will expire in 10 minutes.\n\nWatan Pakistan (وطن)"
    return await send_email(to_email, subject, html, text)
