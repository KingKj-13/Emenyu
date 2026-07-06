"""Authentication service — device registration, staff login, token lifecycle.

Handles both passwordless device registration (customer tablets) and
username/password staff authentication (waiter tablets + admin dashboard).
"""

from __future__ import annotations

from datetime import datetime, UTC

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.exceptions import AuthenticationError, DeviceRevokedError
from app.core.security import (
    build_refresh_token,
    create_access_token,
    generate_device_id,
    generate_refresh_secret,
    hash_refresh_secret,
    refresh_expiry,
    verify_password,
    verify_refresh_secret,
)
from app.models.device import Device
from app.models.user import User

logger = structlog.get_logger()


class AuthService:
    """Stateless auth service — all state lives in the database."""

    def __init__(self, db: AsyncSession) -> None:
        self._db = db
        self._settings = get_settings()

    # ── Device Registration (Passwordless) ────────────────────────────────

    async def register_device(
        self,
        device_name: str = "",
        platform: str = "android",
        app_type: str = "customer_tablet",
    ) -> dict:
        """Register a new customer tablet device (no password required).

        Creates a Device row with a ``tablet`` username derived from the
        device ID, mints access + refresh tokens, and returns them.
        """
        device_id = generate_device_id()
        secret = generate_refresh_secret()
        username = f"tablet_{device_id[:12]}"

        device = Device(
            restaurantId=self._settings.restaurant_id,
            deviceId=device_id,
            username=username,
            deviceName=device_name,
            platform=platform,
            refreshTokenHash=hash_refresh_secret(secret),
            refreshExpiresAt=refresh_expiry(),
            lastSeenAt=datetime.now(UTC),
        )
        self._db.add(device)
        await self._db.commit()
        await self._db.refresh(device)

        access_token = create_access_token(
            subject=username,
            role="tablet",
            restaurant_id=self._settings.restaurant_id,
            device_id=device_id,
        )

        logger.info("device_registered", device_id=device_id, app_type=app_type)

        return {
            "device_id": device_id,
            "access_token": access_token,
            "refresh_token": build_refresh_token(device_id, secret),
            "expires_in": self._settings.access_token_expire_minutes * 60,
        }

    # ── Staff Login ───────────────────────────────────────────────────────

    async def login(
        self,
        username: str,
        password: str,
        device_id: str = "",
        device_name: str = "",
        platform: str = "android",
    ) -> dict:
        """Authenticate a staff member with username/password.

        Verifies the password against the PBKDF2 hash stored in the ``User``
        table, creates or updates a ``Device`` row for the refresh token, and
        returns access + refresh tokens.
        """
        # Look up user
        result = await self._db.execute(
            select(User).where(
                User.username == username.strip().lower(),
                User.suspended == False,  # noqa: E712
            )
        )
        user = result.scalar_one_or_none()

        if not user or not verify_password(password, user.password):
            logger.warning("login_failed", username=username)
            raise AuthenticationError("Invalid username or password")

        # Create or update device record
        if not device_id:
            device_id = generate_device_id()

        secret = generate_refresh_secret()

        # Check if device exists
        existing = await self._db.execute(select(Device).where(Device.deviceId == device_id))
        device = existing.scalar_one_or_none()

        if device:
            device.username = user.username
            device.deviceName = device_name
            device.platform = platform
            device.refreshTokenHash = hash_refresh_secret(secret)
            device.refreshExpiresAt = refresh_expiry()
            device.revokedAt = None
            device.lastSeenAt = datetime.now(UTC)
        else:
            device = Device(
                restaurantId=self._settings.restaurant_id,
                deviceId=device_id,
                username=user.username,
                deviceName=device_name,
                platform=platform,
                refreshTokenHash=hash_refresh_secret(secret),
                refreshExpiresAt=refresh_expiry(),
                lastSeenAt=datetime.now(UTC),
            )
            self._db.add(device)

        await self._db.commit()

        access_token = create_access_token(
            subject=user.username,
            role=user.role,
            restaurant_id=self._settings.restaurant_id,
            device_id=device_id,
        )

        logger.info("login_success", username=user.username, role=user.role)

        return {
            "access_token": access_token,
            "refresh_token": build_refresh_token(device_id, secret),
            "expires_in": self._settings.access_token_expire_minutes * 60,
            "user": {
                "id": user.id,
                "username": user.username,
                "role": user.role,
                "label": user.label,
                "suspended": user.suspended,
            },
        }

    # ── Token Refresh ─────────────────────────────────────────────────────

    async def refresh_token(self, refresh_token: str) -> dict:
        """Rotate a refresh token and issue a new access token.

        The refresh token format is ``<deviceId>.<secret>``.  Only the
        SHA-256 hash of the secret is stored; the secret itself is compared
        in constant time.  On each refresh, a new secret is generated
        (rotation) to limit the blast radius of a leaked token.
        """
        parts = refresh_token.split(".", 1)
        if len(parts) != 2:
            raise AuthenticationError("Invalid refresh token format")

        device_id, secret = parts

        result = await self._db.execute(select(Device).where(Device.deviceId == device_id))
        device = result.scalar_one_or_none()

        if not device:
            raise AuthenticationError("Unknown device")

        if device.revokedAt is not None:
            raise DeviceRevokedError()

        if device.refreshExpiresAt < datetime.now(UTC):
            raise AuthenticationError("Refresh token expired")

        if not verify_refresh_secret(secret, device.refreshTokenHash):
            raise AuthenticationError("Invalid refresh token")

        # Rotate the secret
        new_secret = generate_refresh_secret()
        device.refreshTokenHash = hash_refresh_secret(new_secret)
        device.refreshExpiresAt = refresh_expiry()
        device.lastSeenAt = datetime.now(UTC)
        await self._db.commit()

        # Determine role: if username starts with 'tablet_', it's a device-only auth
        role = "tablet"
        if not device.username.startswith("tablet_"):
            user_result = await self._db.execute(
                select(User).where(User.username == device.username)
            )
            user = user_result.scalar_one_or_none()
            role = user.role if user else "tablet"

        access_token = create_access_token(
            subject=device.username,
            role=role,
            restaurant_id=device.restaurantId,
            device_id=device_id,
        )

        return {
            "access_token": access_token,
            "refresh_token": build_refresh_token(device_id, new_secret),
            "expires_in": self._settings.access_token_expire_minutes * 60,
        }
