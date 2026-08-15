"""WebSocket event schemas."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class WsEvent(BaseModel):
    """Base WebSocket event envelope."""
    event: str
    data: dict = Field(default_factory=dict)
    timestamp: datetime = Field(default_factory=lambda: datetime.now())


class WsAuthMessage(BaseModel):
    """Authentication message sent on WebSocket connect."""
    token: str = ""
    device_id: str = ""
    restaurant_id: str = ""


class WsContentUpdate(BaseModel):
    """Pushed when content changes on the backend."""
    scope: str = Field(description="menu | content | recommendations | config")
    version: int
    changed_items: list[int] = Field(default_factory=list)


class WsSyncRequest(BaseModel):
    """Client requests a delta sync."""
    scope: str
    since_version: int


class WsDiningStateUpdate(BaseModel):
    """Pushed when a table's dining state changes."""
    table_id: str
    session_id: int
    state: str
    previous_state: str = ""


class WsOrderUpdate(BaseModel):
    """Pushed when an order is placed or status changes."""
    table_id: str
    order_id: int
    status: str
    kitchen_status: str = ""
