"""WebSocket endpoint — real-time communication with tablets and dashboard."""

from __future__ import annotations

import json

import structlog
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core.security import decode_access_token
from app.ws.manager import ws_manager

logger = structlog.get_logger()
router = APIRouter(tags=["WebSocket"])


@router.websocket("/ws")
async def websocket_endpoint(ws: WebSocket) -> None:
    """Main WebSocket endpoint for all real-time communication.

    Authentication: pass ``token`` as a query parameter or in the first
    message.  The token is validated as a JWT access token.

    After auth, the client can join rooms by sending::

        {"event": "join", "data": {"room": "table:table-5"}}

    The server pushes events (content updates, dining state changes,
    order updates) to the appropriate rooms.
    """
    # Extract token from query params
    token = ws.query_params.get("token", "")
    user: dict | None = None

    if token:
        try:
            user = decode_access_token(token)
        except Exception:
            await ws.close(code=4001, reason="Invalid token")
            return

    await ws_manager.connect(ws, user)

    # Auto-join default rooms based on role
    if user:
        restaurant_id = user.get("restaurant_id", "")
        role = user.get("role", "")
        username = user.get("sub", "")

        ws_manager.join_room(ws, f"menu:{restaurant_id}")

        if role in ("owner", "manager", "waiter"):
            ws_manager.join_room(ws, f"staff:{restaurant_id}")
            ws_manager.join_room(ws, f"waiter:{username}")

        if role in ("owner", "manager"):
            ws_manager.join_room(ws, f"admin:{restaurant_id}")

    try:
        while True:
            raw = await ws.receive_text()
            try:
                message = json.loads(raw)
            except json.JSONDecodeError:
                continue

            event = message.get("event", "")
            data = message.get("data", {})

            if event == "join":
                room = data.get("room", "")
                if room:
                    ws_manager.join_room(ws, room)
                    await ws_manager.send_to(ws, {"event": "joined", "data": {"room": room}})

            elif event == "leave":
                room = data.get("room", "")
                if room:
                    ws_manager.leave_room(ws, room)

            elif event == "ping":
                await ws_manager.send_to(ws, {"event": "pong", "data": {}})

            elif event == "sync:request":
                # Client wants a delta sync — handled by orchestrator
                # For now, acknowledge
                await ws_manager.send_to(ws, {
                    "event": "sync:response",
                    "data": {"scope": data.get("scope", ""), "version": 0, "changes": []},
                })

    except WebSocketDisconnect:
        ws_manager.disconnect(ws)
    except Exception:
        ws_manager.disconnect(ws)
