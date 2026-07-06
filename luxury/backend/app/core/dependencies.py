"""FastAPI dependencies — injectable singletons for auth, config, and DB.

These are the primary injection points used by all API route handlers.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Header
from jose import JWTError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.core.exceptions import AuthenticationError, AuthorizationError, TokenExpiredError, TokenInvalidError
from app.core.security import decode_access_token
from app.database import get_db

# ── Type aliases for cleaner route signatures ─────────────────────────────

DbSession = Annotated[AsyncSession, Depends(get_db)]
AppSettings = Annotated[Settings, Depends(get_settings)]


# ── Auth dependencies ─────────────────────────────────────────────────────


async def get_current_user(
    authorization: Annotated[str | None, Header()] = None,
) -> dict:
    """Extract and validate the JWT access token from the Authorization header.

    Returns the decoded token payload as a dict with keys:
    ``sub``, ``role``, ``restaurant_id``, ``device_id``, ``type``.

    Raises ``AuthenticationError`` if the header is missing or the token is
    invalid/expired.
    """
    if not authorization:
        raise AuthenticationError("Authorization header required")

    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise AuthenticationError("Bearer token required")

    try:
        payload = decode_access_token(token)
    except JWTError as exc:
        if "expired" in str(exc).lower():
            raise TokenExpiredError() from exc
        raise TokenInvalidError() from exc

    return payload


CurrentUser = Annotated[dict, Depends(get_current_user)]


def require_roles(*roles: str):
    """Factory for role-based authorization guards.

    Usage::

        @router.get("/admin-only", dependencies=[Depends(require_roles("owner", "manager"))])
        async def admin_endpoint(): ...
    """

    async def _guard(user: CurrentUser) -> dict:
        user_role = user.get("role", "")
        if user_role not in roles:
            raise AuthorizationError(f"Required role: {', '.join(roles)}")
        return user

    return _guard


# Role guard shortcuts
RequireStaff = Depends(require_roles("owner", "manager", "waiter"))
RequireManager = Depends(require_roles("owner", "manager"))
RequireOwner = Depends(require_roles("owner"))
RequireTablet = Depends(require_roles("owner", "manager", "waiter", "tablet"))
