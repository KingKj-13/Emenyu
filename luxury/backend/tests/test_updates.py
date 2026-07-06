"""Tests for the app updates and beta distribution routes."""

from __future__ import annotations

import pytest
from unittest.mock import AsyncMock

from app.main import app
from app.database import get_db


@pytest.fixture(autouse=True)
def override_db_dependency():
    """Setup and teardown dependency overrides for the DB session."""
    mock_db = AsyncMock()
    mock_db.execute = AsyncMock()

    app.dependency_overrides[get_db] = lambda: mock_db
    yield mock_db
    app.dependency_overrides.clear()


@pytest.mark.anyio
async def test_check_update_empty(client, override_db_dependency):
    """Check update returns no update when no releases exist in DB."""
    mock_db = override_db_dependency
    mock_result = AsyncMock()
    mock_result.scalar_one_or_none = lambda: None
    mock_db.execute.return_value = mock_result

    response = await client.get("/api/v1/app/check-update?appType=customer_tablet&currentVersionCode=1")
    assert response.status_code == 200
    data = response.json()
    assert data["updateAvailable"] is False
    assert data["forceUpdate"] is False
    assert data["latestVersion"] is None


@pytest.mark.anyio
async def test_register_release_and_check(client, override_db_dependency):
    """Register a new app release and verify the client flags it."""
    mock_db = override_db_dependency

    # Stub latest active release row from database query
    class MockRelease:
        id = 1
        appType = "customer_tablet"
        versionCode = 12
        versionName = "1.2.0"
        apkUrl = "http://127.0.0.1:8000/static/releases/update-v1.2.0.apk"
        releaseNotes = "Improved video buffering times."
        minVersionCode = 10
        active = True

    mock_result = AsyncMock()
    mock_result.scalar_one_or_none = lambda: MockRelease()
    mock_db.execute.return_value = mock_result

    # 1. Check optional update (currentVersionCode = 11, minVersionCode = 10, latest = 12)
    response = await client.get("/api/v1/app/check-update?appType=customer_tablet&currentVersionCode=11")
    assert response.status_code == 200
    data = response.json()
    assert data["updateAvailable"] is True
    assert data["forceUpdate"] is False
    assert data["latestVersion"]["versionName"] == "1.2.0"

    # 2. Check force update (currentVersionCode = 5, minVersionCode = 10, latest = 12)
    response = await client.get("/api/v1/app/check-update?appType=customer_tablet&currentVersionCode=5")
    assert response.status_code == 200
    data = response.json()
    assert data["updateAvailable"] is True
    assert data["forceUpdate"] is True
