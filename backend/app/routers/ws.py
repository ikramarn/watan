from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from ..db import db
from ..security import decode_access_token
from ..services.realtime import hub

router = APIRouter(tags=["ws"])


def _token_from_query(ws: WebSocket) -> str:
    token = ws.query_params.get("token")
    if not token:
        raise ValueError("Missing token")
    return token


@router.websocket("/ws/rides/{ride_id}")
async def ws_ride(ride_id: str, websocket: WebSocket):
    await websocket.accept()
    try:
        token = _token_from_query(websocket)
        payload = decode_access_token(token)
        ride = await db.rides.find_one({"id": ride_id})
        if not ride:
            await websocket.close(code=4404)
            return
        if payload.get("sub") not in (ride.get("passenger_id"), ride.get("driver_id")) and payload.get("role") != "dispatcher":
            await websocket.close(code=4403)
            return

        await hub.connect_ride(ride_id, websocket)
        await websocket.send_json({"event": "connected", "channel": "ride", "ride_id": ride_id})
        while True:
            await websocket.receive_text()
    except (ValueError, KeyError):
        try:
            await websocket.close(code=4401)
        except Exception:
            pass
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        hub.disconnect_ride(ride_id, websocket)


@router.websocket("/ws/driver/{driver_id}")
async def ws_driver(driver_id: str, websocket: WebSocket):
    await websocket.accept()
    try:
        token = _token_from_query(websocket)
        payload = decode_access_token(token)
        if payload.get("sub") != driver_id and payload.get("role") != "dispatcher":
            await websocket.close(code=4403)
            return

        await hub.connect_driver(driver_id, websocket)
        await websocket.send_json({"event": "connected", "channel": "driver", "driver_id": driver_id})
        while True:
            await websocket.receive_text()
    except (ValueError, KeyError):
        try:
            await websocket.close(code=4401)
        except Exception:
            pass
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        hub.disconnect_driver(driver_id, websocket)


@router.websocket("/ws/dispatch")
async def ws_dispatch(websocket: WebSocket):
    await websocket.accept()
    try:
        token = _token_from_query(websocket)
        payload = decode_access_token(token)
        if payload.get("role") != "dispatcher":
            await websocket.close(code=4403)
            return

        await hub.connect_dispatch(websocket)
        await websocket.send_json({"event": "connected", "channel": "dispatch"})
        while True:
            await websocket.receive_text()
    except (ValueError, KeyError):
        try:
            await websocket.close(code=4401)
        except Exception:
            pass
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        hub.disconnect_dispatch(websocket)
