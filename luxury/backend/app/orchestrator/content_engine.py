"""Luxury Content Engine — manages editorial content delivery and curation.

Responsible for:
- Assembling the full editorial view of a dish (hero media, stories, notes)
- Curating content based on dining state (e.g. highlight starters during STARTERS)
- Managing seasonal and rotational content
- Providing content for the Experience Engine to orchestrate

The Content Engine sits between the raw database (ContentService) and the
Orchestrator.  ContentService handles CRUD; the Content Engine handles
*intelligent delivery*.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import structlog

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.schemas.dining import DiningState

logger = structlog.get_logger()

# Course-type mapping for content curation
_COURSE_CATEGORIES: dict[DiningState, list[str]] = {
    DiningState.APERITIF: ["DRINK"],
    DiningState.STARTERS: ["STARTER"],
    DiningState.MAINS: ["MAIN"],
    DiningState.DESSERT: ["DESSERT"],
    DiningState.DIGESTIF: ["DRINK"],
}


class LuxuryContentEngine:
    """Intelligent editorial content delivery.

    Created once on app startup.  Methods receive a DB session from the
    route handler (not stored as instance state) for request scoping.
    """

    def __init__(self) -> None:
        self._settings = get_settings()

    @property
    def restaurant_id(self) -> str:
        return self._settings.restaurant_id

    async def get_editorial_view(self, db: AsyncSession, item_id: int) -> dict | None:
        """Assemble the full editorial package for a single dish.

        This is what the customer tablet renders when a guest taps a dish:
        hero image, cinematic video, all stories, and editorial notes.
        """
        from app.services.menu_service import MenuService

        svc = MenuService(db)
        item = await svc.get_item(item_id)
        if not item:
            return None

        return {
            "item": item,
            "has_hero_image": bool(item.get("hero_image_path")),
            "has_hero_video": bool(item.get("hero_video_path")),
            "has_stories": any([
                item.get("ingredient_story"),
                item.get("origin_story"),
                item.get("chef_story"),
            ]),
            "content_complete": all([
                item.get("hero_image_path"),
                item.get("ingredient_story"),
            ]),
        }

    async def get_curated_items(
        self,
        db: AsyncSession,
        dining_state: DiningState,
        limit: int = 6,
    ) -> list[dict]:
        """Return curated items for the current dining state.

        During STARTERS, highlight starters with rich editorial content.
        During MAINS, highlight mains.  During APERITIF/DIGESTIF, highlight
        drinks.  Items with complete editorial content (hero image + at least
        one story) are prioritised.
        """
        from app.services.menu_service import MenuService

        svc = MenuService(db)
        menu = await svc.get_menu_tree()

        target_courses = _COURSE_CATEGORIES.get(dining_state, [])
        candidates: list[dict] = []

        for cat in menu.get("categories", []):
            course = cat.get("course_type", "MAIN")
            if target_courses and course not in target_courses:
                continue
            for item in cat.get("items", []):
                if not item.get("visible") or not item.get("available"):
                    continue
                # Score: chef_pick > popular > has_stories > has_hero
                score = 0
                if item.get("chef_pick"):
                    score += 4
                if item.get("popular"):
                    score += 2
                if item.get("hero_image_path"):
                    score += 1
                if item.get("ingredient_story") or item.get("origin_story"):
                    score += 1
                candidates.append({**item, "_score": score})

        candidates.sort(key=lambda x: x.get("_score", 0), reverse=True)
        return candidates[:limit]

    def get_content_completeness(self, items: list[dict]) -> dict:
        """Compute content completeness metrics for the admin dashboard."""
        total = len(items)
        if total == 0:
            return {"total": 0, "complete": 0, "partial": 0, "empty": 0, "percentage": 0}

        complete = sum(1 for i in items if i.get("hero_image_path") and i.get("ingredient_story"))
        partial = sum(1 for i in items if (i.get("hero_image_path") or i.get("ingredient_story")) and not (i.get("hero_image_path") and i.get("ingredient_story")))
        empty = total - complete - partial

        return {
            "total": total,
            "complete": complete,
            "partial": partial,
            "empty": empty,
            "percentage": round(complete / total * 100, 1),
        }
