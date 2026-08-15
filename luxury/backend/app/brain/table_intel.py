"""Table Intelligence Engine — aggregates dining session and cart state.

Analyzes what courses have been served, what's currently in the cart, and
how long the guests have been at the table.
"""

from __future__ import annotations

from datetime import datetime, UTC
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.luxury import DiningSession
from app.models.order import Order, OrderItem
from app.schemas.dining import DiningState


class TableIntelligenceEngine:
    """Aggregates active table session data, order history, and active carts."""

    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def get_table_context(self, table_id: str, restaurant_id: str) -> dict:
        """Assembles comprehensive context for a table."""
        # Find active session
        result = await self._db.execute(
            select(DiningSession).where(
                DiningSession.restaurantId == restaurant_id,
                DiningSession.tableId == table_id,
                DiningSession.endedAt == None,  # noqa: E711
            )
        )
        session = result.scalar_one_or_none()

        # Find previous orders placed during this session
        ordered_item_ids: set[int] = set()
        total_spent = 0.0
        elapsed_minutes = 0.0

        if session:
            elapsed_seconds = (datetime.now(UTC) - session.startedAt.replace(tzinfo=UTC)).total_seconds()
            elapsed_minutes = max(0.0, elapsed_seconds / 60.0)

            # Retrieve orders for this table during this session
            orders_result = await self._db.execute(
                select(Order).where(
                    Order.restaurantId == restaurant_id,
                    Order.tableId == table_id,
                    Order.timestamp >= session.startedAt,
                )
            )
            orders = orders_result.scalars().all()

            for order in orders:
                total_spent += order.total
                items_result = await self._db.execute(
                    select(OrderItem).where(OrderItem.orderId == order.id)
                )
                for item in items_result.scalars().all():
                    # We can use item.metadata's menu_item_id or look up by name later
                    if item.metadata_ and "menu_item_id" in item.metadata_:
                        ordered_item_ids.add(int(item.metadata_["menu_item_id"]))

        return {
            "session_id": session.id if session else None,
            "dining_state": DiningState(session.state) if session else DiningState.WELCOME,
            "covers": session.covers if session else 0,
            "waiter_name": session.waiterName if session else "",
            "guest_id": session.guestId if session else None,
            "ordered_item_ids": list(ordered_item_ids),
            "total_spent": total_spent,
            "elapsed_minutes": elapsed_minutes,
        }
