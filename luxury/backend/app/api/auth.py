"""Auth API — device registration, staff login, token refresh."""

from __future__ import annotations

from fastapi import APIRouter

from app.core.dependencies import CurrentUser, DbSession
from app.schemas.auth import (
    DeviceRegisterRequest,
    DeviceRegisterResponse,
    LoginRequest,
    LoginResponse,
    RefreshRequest,
    RefreshResponse,
)
from app.services.auth_service import AuthService

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post(
    "/device/register",
    response_model=DeviceRegisterResponse,
    summary="Register a customer tablet (passwordless)",
)
async def register_device(body: DeviceRegisterRequest, db: DbSession) -> dict:
    """Register a new customer tablet device.

    No password required.  Returns a device ID, access token, and refresh
    token.  The device ID is permanent; store it securely on the tablet.
    """
    svc = AuthService(db)
    return await svc.register_device(
        device_name=body.device_name,
        platform=body.platform,
        app_type=body.app_type,
    )


@router.post(
    "/login",
    response_model=LoginResponse,
    summary="Staff login (waiter / manager / owner)",
)
async def login(body: LoginRequest, db: DbSession) -> dict:
    """Authenticate a staff member with username and password.

    Returns access + refresh tokens and user info.
    """
    svc = AuthService(db)
    return await svc.login(
        username=body.username,
        password=body.password,
        device_id=body.device_id,
        device_name=body.device_name,
        platform=body.platform,
    )


@router.post(
    "/token/refresh",
    response_model=RefreshResponse,
    summary="Refresh an access token",
)
async def refresh_token(body: RefreshRequest, db: DbSession) -> dict:
    """Exchange a refresh token for a new access + refresh token pair.

    The old refresh token is invalidated (rotation).
    """
    svc = AuthService(db)
    return await svc.refresh_token(body.refresh_token)


@router.get("/me", summary="Get current user info")
async def get_me(user: CurrentUser) -> dict:
    """Return the current authenticated user's token payload."""
    return {
        "username": user.get("sub"),
        "role": user.get("role"),
        "restaurant_id": user.get("restaurant_id"),
        "device_id": user.get("device_id"),
    }
