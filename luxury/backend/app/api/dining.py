"""Dining API — session management and state transitions."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.core.dependencies import DbSession, require_roles
from app.orchestrator.state_machine import DiningStateMachine
from app.schemas.dining import DiningSessionCreate, StateTransitionRequest

router = APIRouter(prefix="/dining", tags=["Dining"])

_sm = DiningStateMachine()


@router.post(
    "/sessions",
    summary="Start a new dining session",
    dependencies=[Depends(require_roles("owner", "manager", "waiter"))],
)
async def start_session(body: DiningSessionCreate, db: DbSession) -> dict:
    """Create a new dining session when guests are seated."""
    return await _sm.start_session(
        db,
        table_id=body.table_id,
        covers=body.covers,
        waiter_name=body.waiter_name,
        guest_id=body.guest_id,
    )


@router.get(
    "/sessions/{session_id}",
    summary="Get a dining session",
    dependencies=[Depends(require_roles("owner", "manager", "waiter", "tablet"))],
)
async def get_session(session_id: int, db: DbSession) -> dict:
    """Read a dining session with its state history."""
    return await _sm.get_session(db, session_id)


@router.post(
    "/sessions/{session_id}/transition",
    summary="Advance the dining state",
    dependencies=[Depends(require_roles("owner", "manager", "waiter"))],
)
async def transition(session_id: int, body: StateTransitionRequest, db: DbSession) -> dict:
    """Advance the dining journey to the next course.

    Validates the transition is legal (e.g. STARTERS → MAINS is OK,
    STARTERS → DESSERT is not).
    """
    return await _sm.transition(db, session_id, body.target_state.value)


@router.post(
    "/sessions/{session_id}/finish",
    summary="End a dining session",
    dependencies=[Depends(require_roles("owner", "manager", "waiter"))],
)
async def finish_session(session_id: int, db: DbSession) -> dict:
    """End a dining session — guests have left."""
    return await _sm.end_session(db, session_id)


@router.get(
    "/tables/{table_id}/active-session",
    summary="Get active session for a table",
    dependencies=[Depends(require_roles("owner", "manager", "waiter", "tablet"))],
)
async def get_active_session(table_id: str, db: DbSession) -> dict:
    """Get the current active dining session for a table, if any."""
    session = await _sm.get_active_session(db, table_id)
    return session or {"active": False, "table_id": table_id}
