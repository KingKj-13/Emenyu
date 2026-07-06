"""Health API — liveness and readiness probes."""

from __future__ import annotations

from fastapi import APIRouter
from sqlalchemy import text

from app.brain.engine import brain
from app.database import async_session_factory
from app.ws.manager import ws_manager

router = APIRouter(tags=["Health"])


@router.get("/healthz", summary="Liveness probe")
async def healthz() -> dict:
    """Returns 200 if the process is alive."""
    return {"status": "ok"}


@router.get("/readyz", summary="Readiness probe")
async def readyz() -> dict:
    """Returns 200 if the service is ready to handle requests.

    Checks database connectivity and subsystem readiness.
    """
    checks: dict = {}

    # Database
    try:
        async with async_session_factory() as session:
            await session.execute(text("SELECT 1"))
            checks["database"] = "ok"
    except Exception as exc:
        checks["database"] = f"error: {exc}"

    # Brain
    checks["brain"] = brain.status()

    # WebSocket
    checks["websocket"] = ws_manager.status()

    all_ok = checks["database"] == "ok"
    return {"status": "ready" if all_ok else "degraded", "checks": checks}
