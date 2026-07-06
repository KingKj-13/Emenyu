"""Auth request/response schemas."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


# ── Device Registration (Customer Tablet — passwordless) ──────────────────


class DeviceRegisterRequest(BaseModel):
    device_name: str = Field("", max_length=120, description="Human-readable device label, e.g. 'Table 5 Customer'")
    platform: str = Field("android", max_length=20, description="android | ios | web")
    app_type: str = Field("customer_tablet", max_length=40, description="customer_tablet | waiter_tablet")


class DeviceRegisterResponse(BaseModel):
    device_id: str
    access_token: str
    refresh_token: str
    expires_in: int = Field(description="Access token lifetime in seconds")


# ── Staff Login ───────────────────────────────────────────────────────────


class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=80)
    password: str = Field(..., min_length=1)
    device_id: str = Field("", max_length=80, description="Optional existing device ID for refresh-token binding")
    device_name: str = Field("", max_length=120)
    platform: str = Field("android", max_length=20)


class LoginResponse(BaseModel):
    access_token: str
    refresh_token: str
    expires_in: int
    user: UserInfo


class UserInfo(BaseModel):
    id: int
    username: str
    role: str
    label: str | None = None
    suspended: bool = False


# ── Token Refresh ─────────────────────────────────────────────────────────


class RefreshRequest(BaseModel):
    refresh_token: str = Field(..., min_length=10)


class RefreshResponse(BaseModel):
    access_token: str
    refresh_token: str
    expires_in: int


# ── Token Introspection ──────────────────────────────────────────────────


class TokenPayload(BaseModel):
    sub: str
    role: str
    restaurant_id: str
    device_id: str = ""
    type: str = "access"
    iat: datetime | None = None
    exp: datetime | None = None
