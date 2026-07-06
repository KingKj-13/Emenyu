"""Recommendation Brain API — skeleton endpoints for Phase 2."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.brain.engine import brain
from app.core.dependencies import CurrentUser, DbSession, require_roles

router = APIRouter(prefix="/brain", tags=["Recommendation Brain"])


@router.post(
    "/recommend",
    summary="Get recommendations for a dish (Phase 2)",
    dependencies=[Depends(require_roles("owner", "manager", "waiter"))],
)
async def recommend(body: dict, db: DbSession) -> dict:
    """Generate pairing/upgrade/replacement recommendations for a dish.

    Requires staff role.  Returns empty results until Phase 2 implements
    the scoring engine.
    """
    return await brain.recommend(
        db,
        source_item_id=body.get("source_item_id", 0),
        table_id=body.get("table_id", ""),
        current_cart=body.get("current_cart"),
        guest_id=body.get("guest_id"),
        dining_state=body.get("dining_state", ""),
    )


@router.post(
    "/cart-recommendations",
    summary="Get recommendations for a full cart (Phase 2)",
    dependencies=[Depends(require_roles("owner", "manager", "waiter"))],
)
async def cart_recommendations(body: dict, db: DbSession) -> dict:
    """Generate recommendations for every item in a cart."""
    results = await brain.batch_recommend(
        db,
        cart=body.get("cart", []),
        table_id=body.get("table_id", ""),
        guest_id=body.get("guest_id"),
        dining_state=body.get("dining_state", ""),
    )
    return {"recommendations": results}


@router.get(
    "/status",
    summary="Brain health status",
)
async def brain_status(_user: CurrentUser) -> dict:
    """Return the current status of the Recommendation Brain."""
    return brain.status()
