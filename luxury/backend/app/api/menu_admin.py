from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import select

from app.config import get_settings
from app.core.dependencies import DbSession, require_roles
from app.models.menu import MenuItem
from app.ws.manager import ws_manager

router = APIRouter(prefix="/admin/menu", tags=["Admin Menu Management"])

@router.put(
    "/items/{item_id}",
    summary="Update a menu item and its luxury content",
    dependencies=[Depends(require_roles("owner", "manager"))],
)
async def update_menu_item(item_id: int, body: dict[str, Any], db: DbSession) -> dict[str, Any]:
    """Updates a menu item's details and broadcasts a content_update signal."""
    settings = get_settings()
    rid = settings.restaurant_id

    result = await db.execute(select(MenuItem).where(MenuItem.id == item_id, MenuItem.restaurantId == rid))
    item = result.scalar_one_or_none()
    
    if not item:
        return {"error": "Item not found"}

    if "price" in body:
        item.price = body["price"]
    if "name" in body:
        item.name = body["name"]
    if "description" in body:
        item.description = body["description"]
        
    # Update luxury editorial content inside metadata
    meta = item.metadata_ or {}
    if "chef_story" in body:
        meta["chef_story"] = body["chef_story"]
    if "ingredient_story" in body:
        meta["ingredient_story"] = body["ingredient_story"]
    if "pairing_notes" in body:
        meta["pairing_notes"] = body["pairing_notes"]
        
    item.metadata_ = meta
    
    await db.commit()

    # Trigger Signal-to-Pull Sync
    # We increment a global version. For this demo, we'll just send a generic version bump.
    # The client will fetch the full menu if its version is lower.
    import time
    new_version = int(time.time())
    
    await ws_manager.broadcast_to_room(
        f"customer:{rid}",
        {
            "type": "content_update",
            "version": new_version
        }
    )
    await ws_manager.broadcast_to_room(
        f"waiters:{rid}",
        {
            "type": "content_update",
            "version": new_version
        }
    )

    return {"status": "success", "new_version": new_version}
