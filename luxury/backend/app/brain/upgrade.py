"""Upgrade Engine — computes premium upsells for a selected menu item.

Looks for items in the same course/category with higher prices and high margins.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.menu import MenuItem


class UpgradeEngine:
    """Finds logical, higher-value upgrades for a given menu item."""

    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def get_best_upgrade(
        self,
        source_item_id: int,
        restaurant_id: str,
        occasion: str = "standard",
        profile_tags: list[str] | None = None,
    ) -> dict | None:
        """Find the best premium upgrade for a selected item."""
        # Retrieve source item
        src_result = await self._db.execute(
            select(MenuItem).where(MenuItem.id == source_item_id, MenuItem.restaurantId == restaurant_id)
        )
        source = src_result.scalar_one_or_none()
        if not source:
            return None

        # Look for items in the same category/course type
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

        best_upgrade: MenuItem | None = None
        best_score = -1.0
        best_explanation = ""

        tags = profile_tags or []

        for candidate in candidates:
            # Must be more expensive (upsell) but within a reasonable multiplier
            if candidate.price <= source.price:
                continue

            multiplier = candidate.price / source.price
            if multiplier < 1.1 or multiplier > 3.5:
                continue

            # Core upgrade score
            score = 50.0

            # Boosts for high margin / prestige items
            if "wagyu" in candidate.name.lower() or "tomahawk" in candidate.name.lower():
                score += 20.0
            if "champagne" in candidate.category.lower():
                score += 15.0

            # Occasion adjustments
            if occasion == "celebration":
                score += 15.0
            if occasion == "business" and "steak" in candidate.category.lower():
                score += 10.0

            # Profile adjustments
            if "value_focused" in tags:
                # Lower score if the customer is value focused
                score -= 20.0

            # High spend history favors larger upgrades
            if "wine_lover" in tags and "wine" in candidate.category.lower():
                score += 15.0

            if score > best_score:
                best_score = score
                best_upgrade = candidate
                best_explanation = (
                    f"Elevate your experience to our signature {candidate.name}, "
                    f"representing the pinnacle of our {candidate.category} offerings."
                )

        if not best_upgrade:
            return None

        return {
            "item": {
                "id": best_upgrade.id,
                "name": best_upgrade.name,
                "price": best_upgrade.price,
                "description": best_upgrade.description,
            },
            "score": best_score,
            "explanation": best_explanation,
            "tier": "prestige" if "wagyu" in best_upgrade.name.lower() or "tomahawk" in best_upgrade.name.lower() else "premium",
        }
