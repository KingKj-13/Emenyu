"""Test fixtures and shared utilities."""

from __future__ import annotations

import threading

import pytest
from fakeredis import TcpFakeServer
from httpx import ASGITransport, AsyncClient

from app.core.security import create_access_token, hash_password
from app.main import app


@pytest.fixture(scope="session", autouse=True)
def fake_redis_server():
    """Serve a local RESP-compatible fake Redis so brain/memory tests don't need a real server."""
    server = TcpFakeServer(("127.0.0.1", 6379))
    server.daemon_threads = True
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield server
    server.shutdown()
    server.server_close()


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
async def client():
    """Async HTTP test client for the FastAPI app."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
def staff_token() -> str:
    """A valid JWT access token for a waiter role."""
    return create_access_token(
        subject="test_waiter",
        role="waiter",
        restaurant_id="luxury_trump",
        device_id="test-device-001",
    )


@pytest.fixture
def manager_token() -> str:
    """A valid JWT access token for a manager role."""
    return create_access_token(
        subject="test_manager",
        role="manager",
        restaurant_id="luxury_trump",
        device_id="test-device-002",
    )


@pytest.fixture
def tablet_token() -> str:
    """A valid JWT access token for a customer tablet."""
    return create_access_token(
        subject="tablet_abc123",
        role="tablet",
        restaurant_id="luxury_trump",
        device_id="test-tablet-001",
    )


@pytest.fixture
def auth_headers(staff_token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {staff_token}"}


@pytest.fixture
def manager_headers(manager_token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {manager_token}"}


@pytest.fixture
def tablet_headers(tablet_token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {tablet_token}"}


@pytest.fixture
def sample_password_hash() -> str:
    """PBKDF2 hash for the password 'testpass123'."""
    return hash_password("testpass123")
