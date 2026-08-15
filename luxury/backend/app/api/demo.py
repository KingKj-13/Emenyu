import random
import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select

from app.config import get_settings
from app.core.dependencies import DbSession, require_roles
from app.models.analytics import RecommendationEvent
from app.models.luxury import DiningSession
from app.models.order import Order
from app.models.table import Table
from app.ws.manager import ws_manager

router = APIRouter(prefix="/demo", tags=["Demo Mode"])

@router.post(
    "/simulate",
    summary="Run Demo Mode simulation",
    dependencies=[Depends(require_roles("owner", "manager"))],
)
async def run_demo_simulation(db: DbSession) -> dict[str, str]:
    """Generates realistic deterministic demo data for the system."""
    settings = get_settings()
    rid = settings.restaurant_id

    # Ensure tables exist
    result = await db.execute(select(Table).where(Table.restaurantId == rid))
    tables = result.scalars().all()
    if not tables:
        for i in range(1, 13):
            db.add(Table(restaurantId=rid, tableId=f"T{i}", displayName=f"Table {i}"))
        await db.commit()
        result = await db.execute(select(Table).where(Table.restaurantId == rid))
        tables = result.scalars().all()

    # Create deterministic active sessions with varied lifecycles
    active_table_ids = ["T1", "T2", "T3", "T4", "T5", "T7", "T8", "T10"]
    
    # Predefined dining flows
    flows = [
        {"state": "WELCOME", "history": [{"state": "WELCOME", "entered_at": "2026-07-05T19:25:00Z"}]},
        {"state": "STARTERS", "history": [{"state": "WELCOME", "entered_at": "2026-07-05T18:40:00Z"}, {"state": "STARTERS", "entered_at": "2026-07-05T18:55:00Z"}]},
        {"state": "MAINS", "history": [{"state": "WELCOME", "entered_at": "2026-07-05T18:00:00Z"}, {"state": "STARTERS", "entered_at": "2026-07-05T18:15:00Z"}, {"state": "MAINS", "entered_at": "2026-07-05T18:45:00Z"}]},
        {"state": "DESSERT", "history": [{"state": "WELCOME", "entered_at": "2026-07-05T17:30:00Z"}, {"state": "STARTERS", "entered_at": "2026-07-05T17:45:00Z"}, {"state": "MAINS", "entered_at": "2026-07-05T18:15:00Z"}, {"state": "DESSERT", "entered_at": "2026-07-05T19:05:00Z"}]},
    ]
    
    for tid in active_table_ids:
        # Check if session exists
        sess_result = await db.execute(
            select(DiningSession).where(
                DiningSession.restaurantId == rid,
                DiningSession.tableId == tid,
                DiningSession.endedAt == None
            )
        )
        if not sess_result.scalar_one_or_none():
            flow = random.choice(flows)
            db.add(DiningSession(
                restaurantId=rid,
                tableId=tid,
                state=flow["state"],
                covers=random.randint(2, 6),
                waiterName="AI Assistant",
                stateHistory=flow["history"]
            ))

    # Generate deterministic orders and revenue
    for _ in range(15):
        total = random.uniform(500, 3500)
        db.add(Order(
            restaurantId=rid,
            filename=str(uuid.uuid4()),
            tableId=random.choice(active_table_ids),
            status="active",
            subtotal=total,
            total=total
        ))

    # Generate deterministic AI analytics
    for _ in range(25):
        event_type = random.choice(["accepted", "accepted", "declined", "shown"])
        value = random.uniform(150, 850)
        db.add(RecommendationEvent(
            restaurantId=rid,
            eventType=event_type,
            source="coach",
            recType=random.choice(["pairing", "upgrade"]),
            recommendedItemId=1,
            recommendedName="Château Margaux",
            originatingItemId=2,
            originatingName="Wagyu",
            sessionId="demo",
            value=value if event_type == "accepted" else 0.0
        ))

    await db.commit()
    
    # Broadcast to all clients to refresh data
    await ws_manager.broadcast_to_room(f"admin:{rid}", {"type": "demo_update"})
    await ws_manager.broadcast_to_room(f"waiters:{rid}", {"type": "cart_update"})

    return {"status": "Demo environment populated successfully"}
