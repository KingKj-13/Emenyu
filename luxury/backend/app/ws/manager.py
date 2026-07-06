"""WebSocket Connection Manager — room-based broadcasting.

Manages WebSocket connections with a room/channel model similar to Socket.IO:
- ``menu:{restaurantId}`` — all tablets (content updates)
- ``table:{tableId}`` — customer tablet + assigned waiter
- ``waiter:{username}`` — specific waiter tablet
- ``staff:{restaurantId}`` — all staff
- ``admin:{restaurantId}`` — admin dashboard (superset)
"""

from __future__ import annotations

import json
from collections import defaultdict

import structlog
from fastapi import WebSocket

logger = structlog.get_logger()


class ConnectionManager:
    """Thread-safe WebSocket connection manager with room support.

    Not horizontally scalable (in-process only).  For multi-process
    deployment, swap to a Redis pub/sub adapter.
    """

    def __init__(self) -> None:
        # connection → set of rooms
        self._connections: dict[WebSocket, set[str]] = {}
        # room → set of connections
        self._rooms: dict[str, set[WebSocket]] = defaultdict(set)
        # connection → user metadata
        self._metadata: dict[WebSocket, dict] = {}

    async def connect(self, ws: WebSocket, user: dict | None = None) -> None:
        """Accept a new WebSocket connection."""
        await ws.accept()
        self._connections[ws] = set()
        self._metadata[ws] = user or {}
        logger.info("ws_connected", total=len(self._connections))

    def disconnect(self, ws: WebSocket) -> None:
        """Remove a connection from all rooms and clean up."""
        rooms = self._connections.pop(ws, set())
        for room in rooms:
            self._rooms[room].discard(ws)
            if not self._rooms[room]:
                del self._rooms[room]
        self._metadata.pop(ws, None)
        logger.info("ws_disconnected", total=len(self._connections))

    def join_room(self, ws: WebSocket, room: str) -> None:
        """Add a connection to a room."""
        if ws in self._connections:
            self._connections[ws].add(room)
            self._rooms[room].add(ws)
            logger.info("ws_room_joined", room=room, total_in_room=len(self._rooms[room]))

    def leave_room(self, ws: WebSocket, room: str) -> None:
        """Remove a connection from a room."""
        if ws in self._connections:
            self._connections[ws].discard(room)
            self._rooms[room].discard(ws)
            logger.info("ws_room_left", room=room, total_in_room=len(self._rooms[room]))

    async def send_to(self, ws: WebSocket, data: dict) -> None:
        """Send a message to a specific connection."""
        try:
            await ws.send_text(json.dumps(data, default=str))
        except Exception:
            self.disconnect(ws)

    async def broadcast_to_room(self, room: str, data: dict) -> None:
        """Send a message to all connections in a room."""
        dead: list[WebSocket] = []
        for ws in list(self._rooms.get(room, [])):
            try:
                await ws.send_text(json.dumps(data, default=str))
            except Exception:
                dead.append(ws)

        for ws in dead:
            self.disconnect(ws)

    async def broadcast_all(self, data: dict) -> None:
        """Send a message to every connected client."""
        dead: list[WebSocket] = []
        for ws in list(self._connections.keys()):
            try:
                await ws.send_text(json.dumps(data, default=str))
            except Exception:
                dead.append(ws)

        for ws in dead:
            self.disconnect(ws)

    def get_room_size(self, room: str) -> int:
        return len(self._rooms.get(room, set()))

    def status(self) -> dict:
        """Health check data."""
        return {
            "connections": len(self._connections),
            "rooms": len(self._rooms),
            "room_sizes": {room: len(members) for room, members in self._rooms.items()},
        }


# Singleton instance — created once, shared across the app
ws_manager = ConnectionManager()
