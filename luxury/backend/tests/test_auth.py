"""Tests for the authentication and security system."""

from __future__ import annotations

import pytest
from jose import jwt

from app.config import get_settings
from app.core.security import (
    build_refresh_token,
    create_access_token,
    decode_access_token,
    generate_device_id,
    generate_refresh_secret,
    hash_password,
    hash_refresh_secret,
    verify_password,
    verify_refresh_secret,
)


class TestPasswordHashing:
    """PBKDF2-SHA256 password hashing tests."""

    def test_hash_and_verify(self):
        password = "luxury_secure_password_123!"
        hashed = hash_password(password)
        assert verify_password(password, hashed)

    def test_wrong_password_fails(self):
        hashed = hash_password("correct_password")
        assert not verify_password("wrong_password", hashed)

    def test_hash_is_unique(self):
        h1 = hash_password("same_password")
        h2 = hash_password("same_password")
        assert h1 != h2  # Different salts

    def test_empty_password_verifies(self):
        hashed = hash_password("")
        assert verify_password("", hashed)


class TestJWT:
    """JWT access token tests."""

    def test_create_and_decode(self):
        token = create_access_token(
            subject="waiter1",
            role="waiter",
            restaurant_id="luxury_trump",
            device_id="device-001",
        )
        payload = decode_access_token(token)
        assert payload["sub"] == "waiter1"
        assert payload["role"] == "waiter"
        assert payload["restaurant_id"] == "luxury_trump"
        assert payload["device_id"] == "device-001"
        assert payload["type"] == "access"

    def test_extra_claims(self):
        token = create_access_token(
            subject="admin",
            role="owner",
            restaurant_id="luxury_trump",
            extra={"shift_id": 42},
        )
        payload = decode_access_token(token)
        assert payload["shift_id"] == 42

    def test_invalid_token_raises(self):
        from jose import JWTError

        with pytest.raises(JWTError):
            decode_access_token("invalid.token.here")

    def test_wrong_key_raises(self):
        from jose import JWTError

        settings = get_settings()
        token = jwt.encode(
            {"sub": "test", "role": "waiter", "type": "access"},
            "wrong-secret-key",
            algorithm=settings.jwt_algorithm,
        )
        with pytest.raises(JWTError):
            decode_access_token(token)


class TestRefreshTokens:
    """Refresh token generation and verification."""

    def test_device_id_generation(self):
        d1 = generate_device_id()
        d2 = generate_device_id()
        assert len(d1) > 16
        assert d1 != d2

    def test_secret_generation(self):
        s1 = generate_refresh_secret()
        s2 = generate_refresh_secret()
        assert len(s1) > 24
        assert s1 != s2

    def test_build_refresh_token(self):
        token = build_refresh_token("device-123", "secret-abc")
        assert token == "device-123.secret-abc"

    def test_hash_and_verify_secret(self):
        secret = generate_refresh_secret()
        hashed = hash_refresh_secret(secret)
        assert verify_refresh_secret(secret, hashed)

    def test_wrong_secret_fails(self):
        secret = generate_refresh_secret()
        hashed = hash_refresh_secret(secret)
        assert not verify_refresh_secret("wrong-secret", hashed)


class TestHealthEndpoints:
    """Health endpoint tests (no DB required)."""

    @pytest.mark.anyio
    async def test_healthz(self, client):
        response = await client.get("/healthz")
        assert response.status_code == 200
        assert response.json()["status"] == "ok"


class TestAuthRoutes:
    """Auth API route tests."""

    @pytest.mark.anyio
    async def test_get_me_unauthorized(self, client):
        response = await client.get("/api/v1/auth/me")
        assert response.status_code == 401

    @pytest.mark.anyio
    async def test_get_me_with_token(self, client, auth_headers):
        response = await client.get("/api/v1/auth/me", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["username"] == "test_waiter"
        assert data["role"] == "waiter"
