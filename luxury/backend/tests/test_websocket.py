"""Tests for the WebSocket Connection Manager."""

from __future__ import annotations


from app.ws.manager import ConnectionManager


class TestConnectionManager:
    """WebSocket manager unit tests."""

    def test_status_empty(self):
        mgr = ConnectionManager()
        status = mgr.status()
        assert status["connections"] == 0
        assert status["rooms"] == 0

    def test_get_room_size_empty(self):
        mgr = ConnectionManager()
        assert mgr.get_room_size("nonexistent") == 0
