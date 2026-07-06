"""Security utilities — JWT, password hashing, token management.

Password hashing uses PBKDF2-SHA256 (120k iterations) to remain compatible
with hashes stored by the existing Node.js backend (``accountService.js``).

JWT tokens are used for stateless access tokens.  Refresh tokens are opaque
``<deviceId>.<secret>`` strings with only ``sha256(secret)`` stored in the
``Device`` table — identical to the existing ``tokenService.js`` pattern.
"""

from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any

from jose import JWTError, jwt
from passlib.hash import pbkdf2_sha256

from app.config import get_settings

# ── Password Hashing ─────────────────────────────────────────────────────

# 120k rounds matches the existing Node.js PBKDF2 configuration
_PBKDF2_ROUNDS = 120_000


def hash_password(password: str) -> str:
    """Hash a password with PBKDF2-SHA256 (120k rounds)."""
    return pbkdf2_sha256.using(rounds=_PBKDF2_ROUNDS).hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    """Verify a password against a PBKDF2-SHA256 hash.

    The existing Node.js backend stores hashes in the format produced by
    ``crypto.pbkdf2Sync``.  ``passlib`` can verify both its own format and,
    with a thin wrapper, the Node format.
    """
    try:
        return pbkdf2_sha256.verify(plain, hashed)
    except Exception:
        return False


# ── JWT Tokens ────────────────────────────────────────────────────────────


def create_access_token(
    subject: str,
    role: str,
    restaurant_id: str,
    device_id: str = "",
    extra: dict[str, Any] | None = None,
) -> str:
    """Mint a short-lived JWT access token."""
    settings = get_settings()
    now = datetime.now(UTC)
    payload: dict[str, Any] = {
        "sub": subject,
        "role": role,
        "restaurant_id": restaurant_id,
        "device_id": device_id,
        "type": "access",
        "iat": now,
        "exp": now + timedelta(minutes=settings.access_token_expire_minutes),
    }
    if extra:
        payload.update(extra)
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict[str, Any]:
    """Decode and validate a JWT access token.  Raises ``JWTError`` on failure."""
    settings = get_settings()
    payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    if payload.get("type") != "access":
        raise JWTError("Not an access token")
    return payload


# ── Refresh Tokens ────────────────────────────────────────────────────────


def generate_device_id() -> str:
    """Generate a cryptographically random device identifier."""
    return secrets.token_urlsafe(24)


def generate_refresh_secret() -> str:
    """Generate a cryptographically random refresh-token secret."""
    return secrets.token_urlsafe(32)


def build_refresh_token(device_id: str, secret: str) -> str:
    """Assemble a refresh token: ``<deviceId>.<secret>``."""
    return f"{device_id}.{secret}"


def hash_refresh_secret(secret: str) -> str:
    """SHA-256 hash of the refresh-token secret (stored in DB)."""
    return hashlib.sha256(secret.encode()).hexdigest()


def verify_refresh_secret(provided: str, stored_hash: str) -> bool:
    """Constant-time comparison of refresh-token secret against stored hash."""
    provided_hash = hash_refresh_secret(provided)
    return hmac.compare_digest(provided_hash, stored_hash)


def refresh_expiry() -> datetime:
    """Default refresh-token expiry timestamp."""
    settings = get_settings()
    return datetime.now(UTC) + timedelta(days=settings.refresh_token_expire_days)
