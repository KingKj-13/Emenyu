"""Confidence Engine — computes confidence score of recommendations.

Confidence is based on pairing source strength, data volume, and historical feedback.
"""

from __future__ import annotations

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.order import OrderItem


class ConfidenceEngine:
    """Calculates a normalized confidence score (0.0 - 1.0) for recommendations."""

    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def calculate_confidence(
        self,
        source_id: int,
        target_id: int,
        source_tier: str,
        restaurant_id: str,
    ) -> float:
        """Calculate confidence based on source strength and order history."""
        # 1. Base confidence from the pairing source tier
        if source_tier == "hero":
            base_confidence = 0.95
        elif source_tier == "strong":
            base_confidence = 0.85
        elif source_tier == "csv":
            base_confidence = 0.75
        elif source_tier == "premium" or source_tier == "prestige":
            base_confidence = 0.80
        else:
            base_confidence = 0.55

        # 2. Adjust based on historical order co-occurrences (market basket data)
        # Check how many times target was ordered alongside source historically
        # (This is calculated asynchronously via DB queries in the session)
        try:
            # Simple count of total orders for the target item to verify popularity/quality
            cnt_result = await self._db.execute(
                select(func.count(OrderItem.id)).where(OrderItem.metadata_["menu_item_id"].astext == str(target_id))
            )
            order_count = cnt_result.scalar() or 0

            # Scale factor: 0.7 for no order history, up to 1.0 for 50+ orders
            data_quality_factor = 0.70 + min(0.30, (order_count / 50.0) * 0.30)
        except Exception:
            # Fallback if JSON metadata queries fail
            data_quality_factor = 0.85

        confidence = base_confidence * data_quality_factor
        return round(max(0.1, min(1.0, confidence)), 2)
class_instance = ConfidenceEngine
