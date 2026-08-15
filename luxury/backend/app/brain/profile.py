"""Customer Profile Engine — computes behavioral profiles from guest histories.

Profiles: wine_lover | steak_enthusiast | seafood_lover | dietary_restricted | value_focused
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.guest import Guest
from app.models.order import Order, OrderItem


class CustomerProfileEngine:
    """Computes preference profiles from guest metadata and order histories."""

    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def get_profile(self, guest_id: int | None, restaurant_id: str) -> dict:
        """Analyze guest characteristics and historic ordering patterns."""
        profile = {
            "tags": [],
            "avg_spend": 0.0,
            "dietary": "",
            "allergies": "",
            "preferences": {},
        }

        if not guest_id:
            return profile

        # Retrieve guest record
        result = await self._db.execute(
            select(Guest).where(Guest.id == guest_id, Guest.restaurantId == restaurant_id)
        )
        guest = result.scalar_one_or_none()

        if not guest:
            return profile

        tags_set = set()


        profile["avg_spend"] = guest.avgSpend
        profile["dietary"] = guest.dietary or ""
        profile["allergies"] = guest.allergies or ""
        profile["preferences"] = guest.preferences or {}

        # Add dietary restricted tag if allergies or dietary fields are populated
        if guest.dietary or guest.allergies:
            tags_set.add("dietary_restricted")

        # Load historic orders to extract category trends
        orders_result = await self._db.execute(
            select(Order).where(Order.guestId == guest_id, Order.restaurantId == restaurant_id)
        )
        orders = orders_result.scalars().all()

        wine_count = 0
        steak_count = 0
        seafood_count = 0
        total_items = 0

        for order in orders:
            items_result = await self._db.execute(
                select(OrderItem).where(OrderItem.orderId == order.id)
            )
            for item in items_result.scalars().all():
                total_items += 1
                name = item.name.lower()
                desc = item.description.lower()

                # Classification heuristics
                if any(x in name or x in desc for x in ["wine", "sauvignon", "cabernet", "chardonnay", "pinot", "merlot", "shiraz"]):
                    wine_count += 1
                if any(x in name or x in desc for x in ["steak", "rump", "ribeye", "sirloin", "fillet", "tomahawk", "wagyu"]):
                    steak_count += 1
                if any(x in name or x in desc for x in ["prawn", "calamari", "salmon", "kingklip", "hake", "oyster", "squid", "linefish"]):
                    seafood_count += 1

        if total_items > 0:
            if wine_count / total_items >= 0.25:
                tags_set.add("wine_lover")
            if steak_count / total_items >= 0.35:
                tags_set.add("steak_enthusiast")
            if seafood_count / total_items >= 0.30:
                tags_set.add("seafood_lover")

        # Value focused if guest average spend is below 150 (relative threshold)
        if guest.avgSpend > 0 and guest.avgSpend < 150.0:
            tags_set.add("value_focused")

        # Convert set of tags to list for JSON serialization
        profile["tags"] = list(tags_set)
        return profile

class_instance = CustomerProfileEngine
