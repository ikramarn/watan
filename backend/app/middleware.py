import asyncio
import logging
import time
import uuid
from collections import defaultdict, deque

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from .config import settings

logger = logging.getLogger(__name__)


class RequestContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
        request.state.request_id = request_id
        start = time.perf_counter()

        response = await call_next(request)

        ms = (time.perf_counter() - start) * 1000
        response.headers["X-Request-ID"] = request_id
        response.headers["X-Response-Time-Ms"] = f"{ms:.2f}"
        return response


class RedisRateLimitMiddleware(BaseHTTPMiddleware):
    """Redis-backed rate limiter — works correctly across multiple Uvicorn workers."""

    def __init__(self, app):
        super().__init__(app)
        self._redis = None
        self._fallback: dict = defaultdict(deque)  # used if Redis unavailable

    async def _get_redis(self):
        if self._redis is None:
            try:
                import redis.asyncio as aioredis  # type: ignore
                self._redis = aioredis.from_url(settings.redis_url, decode_responses=True)
            except Exception as exc:
                logger.warning("Rate-limit Redis unavailable, using in-process fallback: %s", exc)
        return self._redis

    def _should_limit(self, request: Request) -> bool:
        if request.method == "OPTIONS":
            return False
        path = request.url.path
        return path.startswith("/api/auth") or request.method in {"POST", "PUT", "PATCH", "DELETE"}

    def _get_client_ip(self, request: Request) -> str:
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            return forwarded.split(",")[0].strip()
        real_ip = request.headers.get("X-Real-IP")
        if real_ip:
            return real_ip.strip()
        return request.client.host if request.client else "unknown"

    async def dispatch(self, request: Request, call_next):
        if not self._should_limit(request):
            return await call_next(request)

        ip = self._get_client_ip(request)
        path = request.url.path
        key = f"rl:{ip}:{path}"

        r = await self._get_redis()
        if r:
            try:
                count = await r.incr(key)
                if count == 1:
                    await r.expire(key, settings.rate_limit_window_sec)
                if count > settings.rate_limit_max_requests:
                    return JSONResponse(status_code=429, content={"detail": "Rate limit exceeded"})
                return await call_next(request)
            except Exception as exc:
                logger.warning("Redis rate-limit check failed, falling back: %s", exc)

        # Fallback: in-process (single-worker only)
        now = time.time()
        q = self._fallback[key]
        window = settings.rate_limit_window_sec
        while q and q[0] < now - window:
            q.popleft()
        if len(q) >= settings.rate_limit_max_requests:
            return JSONResponse(status_code=429, content={"detail": "Rate limit exceeded"})
        q.append(now)
        return await call_next(request)


# Keep old name as alias so imports don't break
InMemoryRateLimitMiddleware = RedisRateLimitMiddleware
