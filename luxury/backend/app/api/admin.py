from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import func, select

from app.config import get_settings
from app.core.dependencies import DbSession, require_roles
from app.models.analytics import RecommendationEvent
from app.models.luxury import DiningSession
from app.models.order import Order
from app.models.table import Table

router = APIRouter(prefix="/admin", tags=["Admin Dashboard"])

@router.get(
    "/dashboard",
    summary="Get core Admin Dashboard metrics",
    dependencies=[Depends(require_roles("owner", "manager"))],
)
async def get_dashboard_metrics(db: DbSession) -> dict[str, Any]:
    settings = get_settings()
    rid = settings.restaurant_id

    # Revenue
    revenue_result = await db.execute(
        select(func.sum(Order.total)).where(Order.restaurantId == rid)
    )
    revenue = revenue_result.scalar() or 0.0

    # Tables
    tables_result = await db.execute(
        select(func.count(Table.id)).where(Table.restaurantId == rid)
    )
    total_tables = tables_result.scalar() or 0

    active_sessions_result = await db.execute(
        select(func.count(DiningSession.id)).where(
            DiningSession.restaurantId == rid, DiningSession.endedAt == None
        )
    )
    active_tables = active_sessions_result.scalar() or 0

    # AI Revenue
    ai_revenue_result = await db.execute(
        select(func.sum(RecommendationEvent.value)).where(
            RecommendationEvent.restaurantId == rid,
            RecommendationEvent.eventType == "accepted"
        )
    )
    ai_revenue = ai_revenue_result.scalar() or 0.0

    # Acceptance Rate
    total_recs_result = await db.execute(
        select(func.count(RecommendationEvent.id)).where(
            RecommendationEvent.restaurantId == rid
        )
    )
    total_recs = total_recs_result.scalar() or 0

    accepted_recs_result = await db.execute(
        select(func.count(RecommendationEvent.id)).where(
            RecommendationEvent.restaurantId == rid,
            RecommendationEvent.eventType == "accepted"
        )
    )
    accepted_recs = accepted_recs_result.scalar() or 0

    acceptance_rate = (accepted_recs / total_recs) if total_recs > 0 else 0.0

    return {
        "live_revenue": float(revenue),
        "total_tables": total_tables,
        "active_tables": active_tables,
        "available_tables": total_tables - active_tables,
        "occupancy_rate": (active_tables / total_tables) if total_tables > 0 else 0.0,
        "ai_generated_revenue": float(ai_revenue),
        "recommendation_acceptance_rate": float(acceptance_rate),
        "current_dining_sessions": active_tables,
        "average_spend": float(revenue / active_tables) if active_tables > 0 else 0.0,
    }

@router.get(
    "/health",
    summary="Get System Health",
    dependencies=[Depends(require_roles("owner", "manager"))],
)
async def get_system_health() -> dict[str, Any]:
    # Mock health for demonstration
    return {
        "backend": "Online",
        "database": "Connected",
        "redis": "Connected",
        "websocket": "Active",
        "sync": "Delta Sync Operational",
        "connected_customers": 12,
        "connected_waiters": 3,
        "connected_admins": 1,
    }

@router.get(
    "/analytics/tables/{table_id}",
    summary="Table Intelligence Analytics",
    dependencies=[Depends(require_roles("owner", "manager"))],
)
async def get_table_intelligence(table_id: str, db: DbSession) -> dict[str, Any]:
    settings = get_settings()
    rid = settings.restaurant_id

    # Active Session
    session_result = await db.execute(
        select(DiningSession).where(
            DiningSession.restaurantId == rid,
            DiningSession.tableId == table_id,
            DiningSession.endedAt == None
        ).order_by(DiningSession.startedAt.desc()).limit(1)
    )
    session = session_result.scalar_one_or_none()

    # Recommendations
    recs_result = await db.execute(
        select(RecommendationEvent).where(
            RecommendationEvent.restaurantId == rid,
        ).order_by(RecommendationEvent.id.desc()).limit(10) # Mock filtering to this table for demo
    )
    recs = recs_result.scalars().all()

    accepted = len([r for r in recs if r.eventType == "accepted"])
    declined = len([r for r in recs if r.eventType == "declined"])

    return {
        "table_id": table_id,
        "ai_summary": "Premium spending profile. Excellent opportunity to recommend Reserve Wines.",
        "premium_spending_score": 94,
        "occasion_detection": "Anniversary",
        "accepted_recommendations": accepted,
        "declined_recommendations": declined,
        "best_next_action": "Offer Dessert Upgrade",
        "timeline": session.stateHistory if session else []
    }
