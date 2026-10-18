import hashlib
import secrets
import uuid
from datetime import timedelta
from typing import Any

import bcrypt
import jwt
from fastapi import HTTPException, status

from .config import settings
from .db import db
from .utils import now_utc


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), hashed.encode())
    except Exception:
        return False


def _encode(payload: dict[str, Any]) -> str:
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_alg)


def create_access_token(user_id: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "role": role,
        "type": "access",
        "exp": now_utc() + timedelta(minutes=settings.access_ttl_min),
        "jti": str(uuid.uuid4()),
    }
    return _encode(payload)


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


async def create_refresh_token(user_id: str) -> str:
    token = secrets.token_urlsafe(48)
    token_hash = _hash_token(token)
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "token_hash": token_hash,
        "revoked": False,
        "created_at": now_utc().isoformat(),
        "expires_at": (now_utc() + timedelta(days=settings.refresh_ttl_days)).isoformat(),
    }
    await db.refresh_tokens.insert_one(doc)
    return token


async def rotate_refresh_token(refresh_token: str) -> tuple[str, str]:
    token_hash = _hash_token(refresh_token)
    doc = await db.refresh_tokens.find_one({"token_hash": token_hash})
    if not doc or doc.get("revoked"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")
    if doc.get("expires_at", "") < now_utc().isoformat():
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token expired")

    await db.refresh_tokens.update_one(
        {"id": doc["id"]},
        {"$set": {"revoked": True, "revoked_at": now_utc().isoformat()}},
    )
    return await create_refresh_token(doc["user_id"]), doc["user_id"]


async def revoke_refresh_token(refresh_token: str) -> None:
    token_hash = _hash_token(refresh_token)
    await db.refresh_tokens.update_one(
        {"token_hash": token_hash},
        {"$set": {"revoked": True, "revoked_at": now_utc().isoformat()}},
    )


def decode_access_token(token: str) -> dict[str, Any]:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_alg])
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(status_code=401, detail="Token expired") from exc
    except jwt.InvalidTokenError as exc:
        raise HTTPException(status_code=401, detail="Invalid token") from exc

    if payload.get("type") != "access":
        raise HTTPException(status_code=401, detail="Invalid token type")
    return payload
