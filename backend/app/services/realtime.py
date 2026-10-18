import asyncio
import json
import logging
from typing import DefaultDict, Set

from fastapi import WebSocket

logger = logging.getLogger(__name__)

# Per-worker local WebSocket connections
_ride_channels: DefaultDict[str, Set[WebSocket]] = DefaultDict(set)
_driver_channels: DefaultDict[str, Set[WebSocket]] = DefaultDict(set)
_dispatch_channel: Set[WebSocket] = set()

_redis_client = None


async def _get_redis():
    """Lazy-initialize Redis client (requires redis[asyncio] installed)."""
    global _redis_client
    if _redis_client is None:
        try:
            import redis.asyncio as aioredis  # type: ignore
            from app.config import settings
            _redis_client = aioredis.from_url(settings.redis_url, decode_responses=True)
        except Exception as exc:
            logger.warning("Redis unavailable, falling back to in-process pub/sub: %s", exc)
            _redis_client = None
    return _redis_client


from starlette.websockets import WebSocketState


class RealtimeHub:
    async def connect_ride(self, ride_id: str, ws: WebSocket) -> None:
        if ws.client_state != WebSocketState.CONNECTED:
            await ws.accept()
        _ride_channels[ride_id].add(ws)

    async def connect_driver(self, driver_id: str, ws: WebSocket) -> None:
        if ws.client_state != WebSocketState.CONNECTED:
            await ws.accept()
        _driver_channels[driver_id].add(ws)

    def disconnect_ride(self, ride_id: str, ws: WebSocket) -> None:
        _ride_channels[ride_id].discard(ws)

    def disconnect_driver(self, driver_id: str, ws: WebSocket) -> None:
        _driver_channels[driver_id].discard(ws)

    async def connect_dispatch(self, ws: WebSocket) -> None:
        if ws.client_state != WebSocketState.CONNECTED:
            await ws.accept()
        _dispatch_channel.add(ws)

    def disconnect_dispatch(self, ws: WebSocket) -> None:
        _dispatch_channel.discard(ws)

    async def publish_ride(self, ride_id: str, payload: dict) -> None:
        message = json.dumps(payload)
        r = await _get_redis()
        if r:
            try:
                await r.publish(f"ride:{ride_id}", message)
                return
            except Exception as exc:
                logger.warning("Redis publish failed, broadcasting locally: %s", exc)
        await self._local_broadcast_ride(ride_id, message)

    async def publish_driver(self, driver_id: str, payload: dict) -> None:
        message = json.dumps(payload)
        r = await _get_redis()
        if r:
            try:
                await r.publish(f"driver:{driver_id}", message)
                return
            except Exception as exc:
                logger.warning("Redis publish failed, broadcasting locally: %s", exc)
        await self._local_broadcast_driver(driver_id, message)

    async def publish_dispatch(self, payload: dict) -> None:
        message = json.dumps(payload)
        r = await _get_redis()
        if r:
            try:
                await r.publish("dispatch:events", message)
                return
            except Exception as exc:
                logger.warning("Redis publish failed, broadcasting locally: %s", exc)
        await self._local_broadcast_dispatch(message)

    async def _local_broadcast_ride(self, ride_id: str, message: str) -> None:
        dead = []
        for ws in list(_ride_channels.get(ride_id, set())):
            try:
                await ws.send_text(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            _ride_channels[ride_id].discard(ws)

    async def _local_broadcast_driver(self, driver_id: str, message: str) -> None:
        dead = []
        for ws in list(_driver_channels.get(driver_id, set())):
            try:
                await ws.send_text(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            _driver_channels[driver_id].discard(ws)

    async def _local_broadcast_dispatch(self, message: str) -> None:
        dead = []
        for ws in list(_dispatch_channel):
            try:
                await ws.send_text(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            _dispatch_channel.discard(ws)


hub = RealtimeHub()


async def redis_subscriber() -> None:
    """Background coroutine: subscribe to Redis pub/sub and fan out to local WebSocket clients."""
    r = await _get_redis()
    if not r:
        logger.info("Redis not available — skipping subscriber (single-worker mode)")
        return
    try:
        import redis.asyncio as aioredis  # type: ignore
        pubsub = r.pubsub()
        await pubsub.psubscribe("ride:*", "driver:*", "dispatch:events")
        logger.info("Redis pub/sub subscriber started")
        async for message in pubsub.listen():
            if message["type"] == "pmessage":
                channel: str = message["channel"]
                data: str = message["data"]
                if channel.startswith("ride:"):
                    await hub._local_broadcast_ride(channel[5:], data)
                elif channel.startswith("driver:"):
                    await hub._local_broadcast_driver(channel[7:], data)
                elif channel.startswith("dispatch:"):
                    await hub._local_broadcast_dispatch(data)
    except Exception as exc:
        logger.error("Redis subscriber crashed: %s", exc)


async def send_push_notification(push_token: str, title: str, body: str, data: dict | None = None) -> None:
    """Send a push notification via Expo Push Service (fire-and-forget)."""
    import urllib.request

    if not push_token or not push_token.startswith("ExponentPushToken"):
        return
    payload = json.dumps({
        "to": push_token,
        "title": title,
        "body": body,
        "data": data or {},
        "sound": "default",
        "priority": "high",
    }).encode()
    try:
        req = urllib.request.Request(
            "https://exp.host/--/api/v2/push/send",
            data=payload,
            headers={"Content-Type": "application/json", "Accept": "application/json"},
            method="POST",
        )
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, lambda: urllib.request.urlopen(req, timeout=5))
    except Exception as exc:
        logger.warning("Push notification send failed: %s", exc)

