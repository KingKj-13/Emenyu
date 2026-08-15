from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import select

from app.config import get_settings
from app.core.dependencies import DbSession, require_roles
from app.models.table import Table
from app.orchestrator.state_machine import DiningStateMachine

router = APIRouter(prefix="/tables", tags=["Tables"])
_sm = DiningStateMachine()


@router.get(
    "/status",
    summary="Get status of all tables",
    dependencies=[Depends(require_roles("owner", "manager", "waiter", "tablet"))],
)
async def get_all_table_statuses(db: DbSession) -> dict[str, Any]:
    """Get a summary of all tables and their current active dining session."""
    settings = get_settings()
    rid = settings.restaurant_id

    # 1. Fetch all active tables
    result = await db.execute(
        select(Table).where(Table.restaurantId == rid, Table.status == "active")
    )
    tables = result.scalars().all()

    if not tables:
        # Auto-seed some tables if none exist (for demo purposes)
        for i in range(1, 13):
            t = Table(restaurantId=rid, tableId=f"T{i}", displayName=f"Table {i}")
            db.add(t)
        await db.commit()
        
        result = await db.execute(
            select(Table).where(Table.restaurantId == rid, Table.status == "active")
        )
        tables = result.scalars().all()

    # 2. Get active session for each table
    table_statuses = []
    for t in tables:
        session = await _sm.get_active_session(db, t.tableId)
        
        if session:
            state = session.get("state", "UNKNOWN")
            covers = session.get("covers", 0)
        else:
            state = "EMPTY"
            covers = 0
            
        table_statuses.append({
            "table_id": t.tableId,
            "display_name": t.displayName,
            "state": state,
            "covers": covers,
            "session": session,
        })

    return {"tables": table_statuses}
