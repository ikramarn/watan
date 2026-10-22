from fastapi import Depends, HTTPException, Request

from .db import db
from .security import decode_access_token
from .utils import clean_doc


async def get_current_user(request: Request) -> dict:
    auth = request.headers.get("Authorization", "")
    token = auth[7:] if auth.startswith("Bearer ") else None
    if not token:
        token = request.cookies.get("access_token")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    payload = decode_access_token(token)
    user = await db.users.find_one({"id": payload["sub"]})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    safe = clean_doc(user) or {}
    safe.pop("password_hash", None)
    return safe


async def get_optional_user(request: Request) -> dict | None:
    auth = request.headers.get("Authorization", "")
    token = auth[7:] if auth.startswith("Bearer ") else None
    if not token:
        token = request.cookies.get("access_token")
    if not token:
        return None

    try:
        payload = decode_access_token(token)
        user = await db.users.find_one({"id": payload["sub"]})
        if not user:
            return None
        safe = clean_doc(user) or {}
        safe.pop("password_hash", None)
        return safe
    except Exception:
        return None


def require_role(role: str):
    async def _require(user: dict = Depends(get_current_user)) -> dict:
        user_role = user.get("role")
        if user_role != role and not (role == "dispatcher" and user_role == "admin"):
            raise HTTPException(status_code=403, detail=f"Requires {role} role")
        return user

    return _require
