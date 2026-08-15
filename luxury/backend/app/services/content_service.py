"""Content service — manage luxury editorial content and sync versioning."""

from __future__ import annotations

from datetime import datetime, UTC

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.exceptions import NotFoundError
from app.models.luxury import ContentVersion, LuxuryItemContent
from app.models.menu import MenuItem

logger = structlog.get_logger()


class ContentService:
    """Manages luxury editorial content (stories, hero media) and the
    content-version protocol used by tablets for delta sync.
    """

    def __init__(self, db: AsyncSession) -> None:
        self._db = db
        self._settings = get_settings()
        self._rid = self._settings.restaurant_id

    async def get_content(self, item_id: int) -> dict | None:
        """Load luxury content for a specific menu item."""
        result = await self._db.execute(
            select(LuxuryItemContent).where(
                LuxuryItemContent.restaurantId == self._rid,
                LuxuryItemContent.menuItemId == item_id,
            )
        )
        content = result.scalar_one_or_none()
        if not content:
            return None
        return self._to_dict(content)

    async def upsert_content(self, item_id: int, data: dict) -> dict:
        """Create or update luxury content for a menu item.

        Increments ``mediaVersion`` on every update and bumps the global
        content version counter, which triggers WebSocket notifications
        to connected tablets.
        """
        # Verify menu item exists
        item_result = await self._db.execute(
            select(MenuItem).where(
                MenuItem.id == item_id,
                MenuItem.restaurantId == self._rid,
            )
        )
        if not item_result.scalar_one_or_none():
            raise NotFoundError(f"Menu item {item_id} not found")

        # Find or create
        result = await self._db.execute(
            select(LuxuryItemContent).where(
                LuxuryItemContent.restaurantId == self._rid,
                LuxuryItemContent.menuItemId == item_id,
            )
        )
        content = result.scalar_one_or_none()

        if content:
            for key, value in data.items():
                if value is not None and hasattr(content, key):
                    setattr(content, key, value)
            content.mediaVersion += 1
            content.updatedAt = datetime.now(UTC)
        else:
            content = LuxuryItemContent(
                restaurantId=self._rid,
                menuItemId=item_id,
                **{k: v for k, v in data.items() if v is not None},
            )
            self._db.add(content)

        # Bump content version
        await self._bump_version("content")
        await self._db.commit()
        await self._db.refresh(content)

        logger.info("content_updated", item_id=item_id, version=content.mediaVersion)
        return self._to_dict(content)

    async def get_versions(self) -> dict:
        """Get current version numbers for all content scopes."""
        result = await self._db.execute(
            select(ContentVersion).where(ContentVersion.restaurantId == self._rid)
        )
        rows = result.scalars().all()
        versions = {row.scope: row.version for row in rows}
        return {
            "menu": versions.get("menu", 0),
            "content": versions.get("content", 0),
            "recommendations": versions.get("recommendations", 0),
            "config": versions.get("config", 0),
        }

    async def _bump_version(self, scope: str) -> int:
        """Increment the monotonic version counter for a scope."""
        result = await self._db.execute(
            select(ContentVersion).where(
                ContentVersion.restaurantId == self._rid,
                ContentVersion.scope == scope,
            )
        )
        row = result.scalar_one_or_none()

        if row:
            row.version += 1
            row.changedAt = datetime.now(UTC)
            new_version = row.version
        else:
            cv = ContentVersion(
                restaurantId=self._rid,
                scope=scope,
                version=1,
                changedAt=datetime.now(UTC),
            )
            self._db.add(cv)
            new_version = 1

        # Broadcast signal-to-pull WebSocket event to all connected tablets
        from app.ws.manager import ws_manager
        
        # We broadcast to the specific restaurant's menu room
        room = f"menu:{self._rid}"
        await ws_manager.broadcast_to_room(room, {
            "type": "content_update",
            "scope": scope,
            "version": new_version
        })

        return new_version

    @staticmethod
    def _to_dict(content: LuxuryItemContent) -> dict:
        return {
            "id": content.id,
            "menu_item_id": content.menuItemId,
            "hero_image_path": content.heroImagePath,
            "hero_video_path": content.heroVideoPath,
            "ingredient_story": content.ingredientStory,
            "origin_story": content.originStory,
            "chef_story": content.chefStory,
            "editorial_notes": content.editorialNotes,
            "tone_style": content.toneStyle,
            "media_version": content.mediaVersion,
            "updated_at": content.updatedAt,
        }
