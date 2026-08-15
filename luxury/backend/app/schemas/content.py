"""Content schemas — luxury editorial content management."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class ContentItemUpdate(BaseModel):
    """Update luxury content for a specific menu item."""
    hero_image_path: str | None = None
    hero_video_path: str | None = None
    ingredient_story: str | None = None
    origin_story: str | None = None
    chef_story: str | None = None
    editorial_notes: str | None = None
    tone_style: str | None = Field(None, pattern=r"^(luxury|editorial|rustic|modern|classic)$")


class ContentItemResponse(BaseModel):
    id: int
    menu_item_id: int
    hero_image_path: str = ""
    hero_video_path: str = ""
    ingredient_story: str = ""
    origin_story: str = ""
    chef_story: str = ""
    editorial_notes: str = ""
    tone_style: str = "luxury"
    media_version: int = 1
    updated_at: datetime

    class Config:
        from_attributes = True


class ContentVersionResponse(BaseModel):
    """Sync version numbers for each content scope."""
    menu: int = 0
    content: int = 0
    recommendations: int = 0
    config: int = 0


class SyncDelta(BaseModel):
    """A single change in a delta sync response."""
    action: str = Field(description="update | delete | create")
    item_id: int
    data: dict | None = None


class SyncResponse(BaseModel):
    """Delta sync response — only changes since a given version."""
    scope: str
    version: int
    changes: list[SyncDelta] = Field(default_factory=list)


class MediaUploadResponse(BaseModel):
    path: str
    url: str
    filename: str
    size_bytes: int
