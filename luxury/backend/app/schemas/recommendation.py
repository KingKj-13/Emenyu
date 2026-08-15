"""Recommendation schemas — Brain input/output contracts."""

from __future__ import annotations

from pydantic import BaseModel, Field


class RecommendationRequest(BaseModel):
    """Input to the Recommendation Brain when a waiter selects a dish."""
    source_item_id: int
    table_id: str = ""
    current_cart: list[CartItem] = Field(default_factory=list)
    guest_id: int | None = None
    dining_state: str = ""


class CartItem(BaseModel):
    item_id: int
    name: str = ""
    quantity: int = 1


class WaiterScript(BaseModel):
    professional: str = ""
    friendly: str = ""
    luxury: str = ""


class RecommendationItem(BaseModel):
    item: MenuItemBrief
    expected_value: float = 0
    confidence: float = Field(0, ge=0, le=1)
    explanation: str = ""
    scripts: WaiterScript = Field(default_factory=WaiterScript)


class MenuItemBrief(BaseModel):
    id: int
    name: str
    price: float = 0
    description: str = ""


class RecommendationResponse(BaseModel):
    """Full Brain output for a single dish selection."""
    source_item: MenuItemBrief
    pairing: RecommendationItem | None = None
    upgrade: RecommendationItem | None = None
    replacement: RecommendationItem | None = None


class CartRecommendationRequest(BaseModel):
    """Input for batch cart-level recommendations."""
    table_id: str
    cart: list[CartItem]
    guest_id: int | None = None
    dining_state: str = ""


class CartRecommendationResponse(BaseModel):
    recommendations: list[RecommendationResponse] = Field(default_factory=list)


# Fix forward references
RecommendationRequest.model_rebuild()
