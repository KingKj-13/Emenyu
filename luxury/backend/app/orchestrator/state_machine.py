"""Dining State Machine — models the guest journey through a fine-dining meal.

States: WELCOME → APERITIF → STARTERS → MAINS → DESSERT → DIGESTIF → FINISHED

The state machine enforces valid transitions (you can't go from WELCOME to
DESSERT), tracks timing for each phase, and persists the full state history
in the ``DiningSession`` table for analytics.
"""

from __future__ import annotations

from datetime import datetime, UTC

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.exceptions import NotFoundError, ValidationError
from app.models.luxury import DiningSession
from app.schemas.dining import DiningState, VALID_TRANSITIONS

logger = structlog.get_logger()


class DiningStateMachine:
    """Manages dining session state with validated transitions.

    All methods receive a DB session and operate transactionally.
    """

    def __init__(self) -> None:
        self._settings = get_settings()
        self._rid = self._settings.restaurant_id

    async def start_session(
        self,
        db: AsyncSession,
        table_id: str,
        covers: int = 0,
        waiter_name: str = "",
        guest_id: int | None = None,
    ) -> dict:
        """Create a new dining session in the WELCOME state."""
        now = datetime.now(UTC)
        session = DiningSession(
            restaurantId=self._rid,
            tableId=table_id,
            state=DiningState.WELCOME.value,
            covers=covers,
            waiterName=waiter_name,
            guestId=guest_id,
            stateHistory=[{"state": DiningState.WELCOME.value, "entered_at": now.isoformat()}],
            startedAt=now,
        )
        db.add(session)
        await db.commit()
        await db.refresh(session)

        logger.info("session_started", session_id=session.id, table_id=table_id)
        return self._to_dict(session)

    async def transition(self, db: AsyncSession, session_id: int, target_state_str: str) -> dict:
        """Advance the dining state.  Validates the transition is legal."""
        session = await self._get_session(db, session_id)
        current = DiningState(session.state)
        target = DiningState(target_state_str)

        # Validate transition
        allowed = VALID_TRANSITIONS.get(current, [])
        if target not in allowed:
            raise ValidationError(
                f"Cannot transition from {current.value} to {target.value}. "
                f"Allowed: {[s.value for s in allowed]}"
            )

        now = datetime.now(UTC)
        previous = current.value

        # Update history — close current state, open new one
        history = list(session.stateHistory or [])
        if history:
            history[-1]["exited_at"] = now.isoformat()
        history.append({"state": target.value, "entered_at": now.isoformat()})

        session.state = target.value
        session.stateHistory = history
        session.updatedAt = now

        if target == DiningState.FINISHED:
            session.endedAt = now

        await db.commit()
        await db.refresh(session)

        logger.info("state_transition", session_id=session_id, from_state=previous, to_state=target.value)

        result = self._to_dict(session)
        result["previous_state"] = previous
        return result

    async def end_session(self, db: AsyncSession, session_id: int) -> dict:
        """Force-end a session (regardless of current state)."""
        session = await self._get_session(db, session_id)
        now = datetime.now(UTC)

        history = list(session.stateHistory or [])
        if history:
            history[-1]["exited_at"] = now.isoformat()

        session.state = DiningState.FINISHED.value
        session.stateHistory = history
        session.endedAt = now
        session.updatedAt = now

        await db.commit()
        await db.refresh(session)

        logger.info("session_ended", session_id=session_id)
        return self._to_dict(session)

    async def get_session(self, db: AsyncSession, session_id: int) -> dict:
        """Read a dining session."""
        session = await self._get_session(db, session_id)
        return self._to_dict(session)

    async def get_active_session(self, db: AsyncSession, table_id: str) -> dict | None:
        """Get the active (non-FINISHED) session for a table, if any."""
        result = await db.execute(
            select(DiningSession).where(
                DiningSession.restaurantId == self._rid,
                DiningSession.tableId == table_id,
                DiningSession.endedAt == None,  # noqa: E711
            ).order_by(DiningSession.startedAt.desc()).limit(1)
        )
        session = result.scalar_one_or_none()
        return self._to_dict(session) if session else None

    async def _get_session(self, db: AsyncSession, session_id: int) -> DiningSession:
        result = await db.execute(
            select(DiningSession).where(
                DiningSession.id == session_id,
                DiningSession.restaurantId == self._rid,
            )
        )
        session = result.scalar_one_or_none()
        if not session:
            raise NotFoundError(f"Dining session {session_id} not found")
        return session

    @staticmethod
    def _to_dict(session: DiningSession) -> dict:
        return {
            "id": session.id,
            "table_id": session.tableId,
            "state": session.state,
            "covers": session.covers,
            "waiter_name": session.waiterName,
            "guest_id": session.guestId,
            "started_at": session.startedAt,
            "ended_at": session.endedAt,
            "state_history": session.stateHistory,
        }
