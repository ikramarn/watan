import os
import secrets
from pathlib import Path
from typing import List

from dotenv import load_dotenv

# Search for .env in current dir, backend/, or parent workspace directories
CURRENT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = CURRENT_DIR.parent
PROJECT_DIR = BACKEND_DIR.parent
WORKSPACE_DIR = PROJECT_DIR.parent

for p in [BACKEND_DIR / ".env", PROJECT_DIR / ".env", WORKSPACE_DIR / ".env"]:
    if p.is_file():
        load_dotenv(p)


def _csv_env(name: str, default: str = "") -> List[str]:
    value = os.getenv(name, default)
    return [x.strip() for x in value.split(",") if x.strip()]


class Settings:
    app_name = "getchum"
    env = os.getenv("APP_ENV", "development")

    mongo_url = os.getenv("MONGO_URL", "mongodb://localhost:27017")
    db_name = os.getenv("DB_NAME", "getchum")

    jwt_secret = os.getenv("JWT_SECRET", "getchum_dev_secret_key_93847291847291847192847192847")
    jwt_alg = "HS256"
    access_ttl_min = int(os.getenv("ACCESS_TTL_MIN", "15"))
    refresh_ttl_days = int(os.getenv("REFRESH_TTL_DAYS", "14"))

    currency = os.getenv("APP_CURRENCY", "gbp").lower()

    stripe_api_key = os.getenv("STRIPE_API_KEY", "")
    stripe_webhook_secret = os.getenv("STRIPE_WEBHOOK_SECRET", "")

    google_client_id = os.getenv("GOOGLE_CLIENT_ID", "")

    # Transactional Email (Resend or SendGrid)
    resend_api_key = os.getenv("RESEND_API_KEY", "")
    sendgrid_api_key = os.getenv("SENDGRID_API_KEY", "")
    email_from = os.getenv("EMAIL_FROM", "GetChum <noreply@getchum.co.uk>")

    redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    sentry_dsn = os.getenv("SENTRY_DSN", "")

    simulate_drivers = os.getenv("SIMULATE_DRIVERS", "false").lower() in ("true", "1")

    cors_origins = _csv_env(
        "CORS_ORIGINS",
        "https://admin.getchum.co.uk,https://getchum.co.uk,https://www.getchum.co.uk,http://localhost:8081,http://localhost:8082,http://localhost:5173,http://localhost:3000,http://localhost:19006,http://127.0.0.1:8081,http://127.0.0.1:8082,http://127.0.0.1:5173",
    )

    rate_limit_window_sec = int(os.getenv("RATE_LIMIT_WINDOW_SEC", "60"))
    rate_limit_max_requests = int(os.getenv("RATE_LIMIT_MAX_REQUESTS", "120"))


settings = Settings()
