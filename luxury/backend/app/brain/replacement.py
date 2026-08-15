"""Replacement Engine — finds logical substitutions for out-of-stock items
or smaller portions.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.menu import MenuItem


class ReplacementEngine:
    """Computes similarity scores to find suitable menu item replacements."""

    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def get_best_replacement(
        self,
        source_item_id: int,
        restaurant_id: str,
    ) -> dict | None:
        """Find the best replacement/alternative item."""
        # Retrieve source item
        src_result = await self._db.execute(
            select(MenuItem).where(MenuItem.id == source_item_id, MenuItem.restaurantId == restaurant_id)
        )
        source = src_result.scalar_one_or_none()
        if not source:
            return None

        # Retrieve items in same category that are in-stock
        candidates_result = await self._db.execute(
            select(MenuItem).where(
                MenuItem.restaurantId == restaurant_id,
                MenuItem.categoryId == source.categoryId,
                MenuItem.visible == True,  # noqa: E712
                MenuItem.available == True,  # noqa: E712
                MenuItem.id != source_item_id,
            )
        )
        candidates = candidates_result.scalars().all()

        best_replacement: MenuItem | None = None
        best_score = -1.0

        # Tokenize source name for token overlap
        src_tokens = set(source.name.lower().split())

        for candidate in candidates:
            # Word overlap similarity
            cand_tokens = set(candidate.name.lower().split())
            overlap = len(src_tokens.intersection(cand_tokens))

            # Score base
            score = 30.0 + (overlap * 15.0)

            # Price similarity (closer price is better)
            price_diff_ratio = abs(candidate.price - source.price) / max(1.0, source.price)
            price_factor = max(0.0, 1.0 - price_diff_ratio)
            score += price_factor * 30.0

            if score > best_score:
                best_score = score
                best_replacement = candidate

        if not best_replacement:
            return None

        return {
            "item": {
                "id": best_replacement.id,
                "name": best_replacement.name,
                "price": best_replacement.price,
                "description": best_replacement.description,
            },
            "score": best_score,
            "explanation": f"A refined alternative to {source.name}, offering a similar profile and flavor layout.",
            "tier": "alternative",
        }
