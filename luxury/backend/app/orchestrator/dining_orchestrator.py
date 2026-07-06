"""Dining Orchestrator — the single coordination layer between all applications
and backend services.

The Orchestrator is the central nervous system of the Luxury Edition.  Every
significant action (table seated, order placed, course transition, content
update) flows through it.  It coordinates between:

- Dining State Machine (guest journey)
- Experience Engine (tablet presentation)
- Luxury Content Engine (editorial content)
- Media Pipeline (asset delivery)
- Recommendation Brain (suggestions)
- WebSocket Manager (real-time push)

No other component talks directly to the WebSocket layer or triggers
cross-cutting side-effects.  This keeps the dependency graph shallow and
makes the system testable by replacing the Orchestrator with a mock.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import structlog

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.orchestrator.content_engine import LuxuryContentEngine
    from app.orchestrator.experience_engine import ExperienceEngine
    from app.orchestrator.media_pipeline import MediaPipeline
    from app.orchestrator.state_machine import DiningStateMachine
    from app.ws.manager import ConnectionManager

logger = structlog.get_logger()


class DiningOrchestrator:
    """Central coordinator for all Luxury Edition subsystems.

    Lifecycle:
    1. Created once on app startup.
    2. Injected into API route handlers via FastAPI dependency.
    3. Route handlers call orchestrator methods instead of touching
       subsystems directly.
    """

    def __init__(
        self,
        state_machine: DiningStateMachine,
        experience_engine: ExperienceEngine,
        content_engine: LuxuryContentEngine,
        media_pipeline: MediaPipeline,
        ws_manager: ConnectionManager,
    ) -> None:
        self._state_machine = state_machine
        self._experience = experience_engine
        self._content = content_engine
        self._media = media_pipeline
        self._ws = ws_manager

    # ── Table Lifecycle ───────────────────────────────────────────────────

    async def seat_table(
        self,
        db: AsyncSession,
        table_id: str,
        covers: int = 0,
        waiter_name: str = "",
        guest_id: int | None = None,
    ) -> dict:
        """A new party is seated.  Creates a dining session, initialises the
        experience engine for the table's customer tablet, and notifies the
        waiter tablet.
        """
        # Create dining session
        session = await self._state_machine.start_session(
            db, table_id=table_id, covers=covers,
            waiter_name=waiter_name, guest_id=guest_id,
        )

        # Initialise experience state for customer tablet
        experience = self._experience.init_for_session(session)

        # Notify connected devices
        await self._ws.broadcast_to_room(
            f"table:{table_id}",
            {
                "event": "table:seated",
                "data": {
                    "session_id": session["id"],
                    "table_id": table_id,
                    "state": session["state"],
                    "covers": covers,
                    "experience": experience,
                },
            },
        )

        logger.info("table_seated", table_id=table_id, session_id=session["id"])
        return session

    async def advance_course(
        self,
        db: AsyncSession,
        session_id: int,
        target_state: str,
    ) -> dict:
        """Advance the dining journey to the next course.

        Updates the state machine, adjusts the experience engine (e.g.
        which category to highlight on the customer tablet), and pushes
        the update to all connected devices for this table.
        """
        session = await self._state_machine.transition(db, session_id, target_state)

        # Update experience engine recommendations
        experience = self._experience.update_for_state(session["state"])

        await self._ws.broadcast_to_room(
            f"table:{session['table_id']}",
            {
                "event": "dining:state_changed",
                "data": {
                    "session_id": session_id,
                    "table_id": session["table_id"],
                    "state": session["state"],
                    "previous_state": session.get("previous_state", ""),
                    "experience": experience,
                },
            },
        )

        logger.info("course_advanced", session_id=session_id, state=target_state)
        return session

    async def finish_table(self, db: AsyncSession, session_id: int) -> dict:
        """End a dining session — guests have left."""
        session = await self._state_machine.end_session(db, session_id)

        await self._ws.broadcast_to_room(
            f"table:{session['table_id']}",
            {
                "event": "table:finished",
                "data": {"session_id": session_id, "table_id": session["table_id"]},
            },
        )

        logger.info("table_finished", session_id=session_id)
        return session

    # ── Content Updates ───────────────────────────────────────────────────

    async def notify_content_update(self, scope: str, version: int, changed_items: list[int] | None = None) -> None:
        """Broadcast a content update to all connected tablets."""
        await self._ws.broadcast_to_room(
            f"menu:{self._content.restaurant_id}",
            {
                "event": "content:updated",
                "data": {
                    "scope": scope,
                    "version": version,
                    "changed_items": changed_items or [],
                },
            },
        )

    # ── Media Pipeline ────────────────────────────────────────────────────

    async def get_media_manifest(self, db: AsyncSession | None = None, since_version: int = 0) -> dict:
        """Return the current media manifest for tablet preloading, supporting delta sync."""
        return await self._media.build_manifest(since_version=since_version, db=db)


    # ── Health ────────────────────────────────────────────────────────────

    def status(self) -> dict:
        """Health check — report subsystem status."""
        return {
            "state_machine": "ready",
            "experience_engine": "ready",
            "content_engine": "ready",
            "media_pipeline": "ready",
            "websocket": self._ws.status(),
        }
