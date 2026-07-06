"""Menu request/response schemas — customer tablet and admin."""

from __future__ import annotations

from pydantic import BaseModel, Field


class MenuItemResponse(BaseModel):
    id: int
    name: str
    description: str = ""
    price: float = 0
    calories: str = ""
    allergens: str = ""
    spice: str = ""
    image_path: str = ""
    video_path: str = ""
    visible: bool = True
    available: bool = True
    chef_pick: bool = False
    popular: bool = False
    sort_order: int = 0
    # Luxury content (joined from LuxuryItemContent when available)
    hero_image_path: str = ""
    hero_video_path: str = ""
    ingredient_story: str = ""
    origin_story: str = ""
    chef_story: str = ""
    editorial_notes: str = ""

    class Config:
        from_attributes = True


class MenuCategoryResponse(BaseModel):
    id: int
    title: str
    slug: str
    course_type: str | None = "MAIN"
    visible: bool = True
    sort_order: int = 0
    parent_id: int | None = None
    items: list[MenuItemResponse] = Field(default_factory=list)

    class Config:
        from_attributes = True


class MenuResponse(BaseModel):
    """Full menu tree response for the customer tablet."""
    version: int = Field(description="Content version for sync")
    restaurant_id: str
    categories: list[MenuCategoryResponse] = Field(default_factory=list)


class MenuItemUpdate(BaseModel):
    """Admin update for a menu item."""
    name: str | None = None
    description: str | None = None
    price: float | None = None
    visible: bool | None = None
    available: bool | None = None
    chef_pick: bool | None = None
    popular: bool | None = None
