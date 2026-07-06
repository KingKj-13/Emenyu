"""Menu service — read the menu tree with luxury content joined."""

from __future__ import annotations

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.luxury import ContentVersion, LuxuryItemContent
from app.models.menu import MenuCategory, MenuItem

logger = structlog.get_logger()


class MenuService:
    """Reads the menu tree from the shared PostgreSQL database, joining
    luxury editorial content when available.
    """

    def __init__(self, db: AsyncSession) -> None:
        self._db = db
        self._settings = get_settings()
        self._rid = self._settings.restaurant_id

    async def get_menu_tree(self, since_version: int = 0) -> dict:
        """Load the full menu tree with luxury content attached.

        Returns a dict with ``version``, ``restaurant_id``, and ``categories``
        (each containing nested ``items``).
        """
        # Get current content version
        version = await self._get_version("menu")
        
        if since_version > 0 and version <= since_version:
            return {
                "version": version,
                "restaurant_id": self._rid,
                "categories": [],
                "up_to_date": True,
            }

        # Load categories
        cat_result = await self._db.execute(
            select(MenuCategory)
            .where(MenuCategory.restaurantId == self._rid, MenuCategory.visible == True)  # noqa: E712
            .order_by(MenuCategory.parentId.asc().nullsfirst(), MenuCategory.sortOrder.asc())
        )
        categories = list(cat_result.scalars().all())

        # Load items
        item_result = await self._db.execute(
            select(MenuItem)
            .where(MenuItem.restaurantId == self._rid, MenuItem.visible == True)  # noqa: E712
            .order_by(MenuItem.sortOrder.asc())
        )
        items = list(item_result.scalars().all())

        # Load luxury content
        content_result = await self._db.execute(
            select(LuxuryItemContent).where(LuxuryItemContent.restaurantId == self._rid)
        )
        content_map: dict[int, LuxuryItemContent] = {
            c.menuItemId: c for c in content_result.scalars().all()
        }

        # Build items by category ID
        items_by_cat: dict[int, list[dict]] = {}
        for item in items:
            luxury = content_map.get(item.id)
            item_dict = {
                "id": item.id,
                "name": item.name,
                "description": item.description,
                "price": item.price,
                "calories": item.calories,
                "allergens": item.allergens,
                "spice": item.spice,
                "image_path": item.imagePath,
                "video_path": item.videoPath,
                "visible": item.visible,
                "available": item.available,
                "chef_pick": item.chefPick,
                "popular": item.popular,
                "sort_order": item.sortOrder,
                # Luxury fields
                "hero_image_path": luxury.heroImagePath if luxury else "",
                "hero_video_path": luxury.heroVideoPath if luxury else "",
                "ingredient_story": luxury.ingredientStory if luxury else "",
                "origin_story": luxury.originStory if luxury else "",
                "chef_story": luxury.chefStory if luxury else "",
                "editorial_notes": luxury.editorialNotes if luxury else "",
            }
            items_by_cat.setdefault(item.categoryId, []).append(item_dict)

        # Build category tree (roots + children)
        roots = [c for c in categories if c.parentId is None]
        children_by_parent: dict[int, list] = {}
        for c in categories:
            if c.parentId is not None:
                children_by_parent.setdefault(c.parentId, []).append(c)

        cat_list = []
        for root in roots:
            cat_dict = self._category_to_dict(root, items_by_cat)
            # Attach subcategories
            for child in children_by_parent.get(root.id, []):
                child_dict = self._category_to_dict(child, items_by_cat)
                child_dict["parent_id"] = root.id
                cat_dict.setdefault("subcategories", []).append(child_dict)
            cat_list.append(cat_dict)

        return {
            "version": version,
            "restaurant_id": self._rid,
            "categories": cat_list,
        }

    async def get_item(self, item_id: int) -> dict | None:
        """Load a single menu item with luxury content."""
        result = await self._db.execute(
            select(MenuItem).where(
                MenuItem.id == item_id,
                MenuItem.restaurantId == self._rid,
            )
        )
        item = result.scalar_one_or_none()
        if not item:
            return None

        content_result = await self._db.execute(
            select(LuxuryItemContent).where(
                LuxuryItemContent.menuItemId == item_id,
                LuxuryItemContent.restaurantId == self._rid,
            )
        )
        luxury = content_result.scalar_one_or_none()

        return {
            "id": item.id,
            "name": item.name,
            "description": item.description,
            "price": item.price,
            "calories": item.calories,
            "allergens": item.allergens,
            "spice": item.spice,
            "image_path": item.imagePath,
            "video_path": item.videoPath,
            "visible": item.visible,
            "available": item.available,
            "chef_pick": item.chefPick,
            "popular": item.popular,
            "sort_order": item.sortOrder,
            "hero_image_path": luxury.heroImagePath if luxury else "",
            "hero_video_path": luxury.heroVideoPath if luxury else "",
            "ingredient_story": luxury.ingredientStory if luxury else "",
            "origin_story": luxury.originStory if luxury else "",
            "chef_story": luxury.chefStory if luxury else "",
            "editorial_notes": luxury.editorialNotes if luxury else "",
        }

    async def _get_version(self, scope: str) -> int:
        result = await self._db.execute(
            select(ContentVersion).where(
                ContentVersion.restaurantId == self._rid,
                ContentVersion.scope == scope,
            )
        )
        row = result.scalar_one_or_none()
        return row.version if row else 0

    @staticmethod
    def _category_to_dict(cat: MenuCategory, items_by_cat: dict[int, list[dict]]) -> dict:
        return {
            "id": cat.id,
            "title": cat.title,
            "slug": cat.slug,
            "course_type": cat.courseType,
            "visible": cat.visible,
            "sort_order": cat.sortOrder,
            "parent_id": cat.parentId,
            "items": items_by_cat.get(cat.id, []),
        }
