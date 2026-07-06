"""Brain Analytics Collector — tracks recommendation lifecycle events.

Tracks status transitions: Created → Shown → Accepted/Declined/Ignored → Ordered
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.analytics import RecommendationEvent
from app.models.menu import MenuItem


class BrainAnalyticsCollector:
    """Manages database logging for recommendation performance analytics."""

    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def log_created(
        self,
        session_id: int,
        source_item_id: int,
        target_item_id: int,
        rec_type: str,
        expected_value: float,
        restaurant_id: str,
    ) -> int:
        """Log that a recommendation was generated (state: CREATED)."""
        # Resolve names
        src_result = await self._db.execute(select(MenuItem.name).where(MenuItem.id == source_item_id))
        source_name = src_result.scalar_one_or_none() or ""

        tgt_result = await self._db.execute(select(MenuItem.name).where(MenuItem.id == target_item_id))
        target_name = tgt_result.scalar_one_or_none() or ""

        event = RecommendationEvent(
            restaurantId=restaurant_id,
            eventType="created",
            source="coach",
            recType=rec_type,
            recommendedItemId=target_item_id,
            recommendedName=target_name,
            originatingItemId=source_item_id,
            originatingName=source_name,
            sessionId=str(session_id),
            value=expected_value,
        )
        self._db.add(event)
        await self._db.commit()
        await self._db.refresh(event)
        return event.id

    async def log_shown(self, event_id: int) -> None:
        """Update recommendation state to SHOWN."""
        result = await self._db.execute(select(RecommendationEvent).where(RecommendationEvent.id == event_id))
        event = result.scalar_one_or_none()
        if event:
            event.eventType = "shown"
            await self._db.commit()

    async def log_feedback(self, event_id: int, outcome: str) -> None:
        """Log guest feedback: accepted | declined | ignored."""
        result = await self._db.execute(select(RecommendationEvent).where(RecommendationEvent.id == event_id))
        event = result.scalar_one_or_none()
        if event:
            event.eventType = outcome
            await self._db.commit()

    async def log_ordered(self, event_id: int, actual_value: float) -> None:
        """Log that the recommended item was actually ordered (ordered)."""
        result = await self._db.execute(select(RecommendationEvent).where(RecommendationEvent.id == event_id))
        event = result.scalar_one_or_none()
        if event:
            event.eventType = "ordered"
            event.value = actual_value
            await self._db.commit()
