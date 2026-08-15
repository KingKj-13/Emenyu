"""Menu API — read the menu tree with luxury content."""

from __future__ import annotations

from fastapi import APIRouter

from app.core.dependencies import CurrentUser, DbSession
from app.core.exceptions import NotFoundError
from app.services.menu_service import MenuService

router = APIRouter(prefix="/menu", tags=["Menu"])


@router.get(
    "",
    summary="Get full menu tree with luxury content",
    description="Returns all visible categories and items with hero media and editorial stories joined.",
)
async def get_menu(db: DbSession, _user: CurrentUser, since_version: int = 0) -> dict:
    """Load the full menu tree for the customer tablet or waiter tablet.

    Joins luxury editorial content (hero images, videos, stories) when
    available.  Includes a ``version`` field for content sync.
    If since_version matches the current backend version, returns an empty list
    of categories to save bandwidth.
    """
    svc = MenuService(db)
    return await svc.get_menu_tree(since_version=since_version)


@router.get(
    "/items/{item_id}",
    summary="Get a single menu item with luxury content",
)
async def get_item(item_id: int, db: DbSession, _user: CurrentUser) -> dict:
    """Load a single menu item with all luxury editorial content."""
    svc = MenuService(db)
    item = await svc.get_item(item_id)
    if not item:
        raise NotFoundError(f"Menu item {item_id} not found")
    return item
