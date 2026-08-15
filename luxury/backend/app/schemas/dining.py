"""Dining schemas — state machine, experience engine, orchestrator."""

from __future__ import annotations

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field


class DiningState(str, Enum):
    """Guest journey states — linear progression through a fine-dining meal."""
    WELCOME = "WELCOME"
    APERITIF = "APERITIF"
    STARTERS = "STARTERS"
    MAINS = "MAINS"
    DESSERT = "DESSERT"
    DIGESTIF = "DIGESTIF"
    FINISHED = "FINISHED"


# Valid transitions — each state can only advance to the next
VALID_TRANSITIONS: dict[DiningState, list[DiningState]] = {
    DiningState.WELCOME: [DiningState.APERITIF, DiningState.STARTERS],
    DiningState.APERITIF: [DiningState.STARTERS],
    DiningState.STARTERS: [DiningState.MAINS],
    DiningState.MAINS: [DiningState.DESSERT, DiningState.DIGESTIF],
    DiningState.DESSERT: [DiningState.DIGESTIF, DiningState.FINISHED],
    DiningState.DIGESTIF: [DiningState.FINISHED],
    DiningState.FINISHED: [],
}


class DiningSessionCreate(BaseModel):
    table_id: str = Field(..., min_length=1)
    covers: int = Field(0, ge=0)
    waiter_name: str = ""
    guest_id: int | None = None


class DiningSessionResponse(BaseModel):
    id: int
    table_id: str
    state: DiningState
    covers: int = 0
    waiter_name: str = ""
    guest_id: int | None = None
    started_at: datetime
    ended_at: datetime | None = None
    state_history: list[dict] | None = None

    class Config:
        from_attributes = True


class StateTransitionRequest(BaseModel):
    target_state: DiningState


class ExperienceConfig(BaseModel):
    """Configuration for the Experience Engine — controls media playback
    timing and presentation flow on the customer tablet.
    """
    autoplay_delay_seconds: float = Field(3.0, description="Seconds before cinematic video begins")
    video_duration_seconds: float = Field(5.0, description="Cinematic video loop duration")
    idle_timeout_seconds: float = Field(120.0, description="Seconds of inactivity before idle mode")
    transition_duration_ms: int = Field(600, description="Animation transition duration in ms")
    parallax_intensity: float = Field(0.15, description="Parallax scroll intensity (0.0–1.0)")
    hero_image_scale: float = Field(1.0, description="Hero image zoom level on entry")


class ExperienceStateResponse(BaseModel):
    """Current experience state for a customer tablet."""
    session_id: int | None = None
    dining_state: DiningState = DiningState.WELCOME
    experience_config: ExperienceConfig = Field(default_factory=ExperienceConfig)
    recommended_category: str | None = None
    idle_mode: bool = False


class MediaAsset(BaseModel):
    """A media asset reference for the Media Pipeline."""
    path: str
    type: str = Field(description="image | video")
    version: int = 1
    size_bytes: int = 0
    cached: bool = False


class MediaManifest(BaseModel):
    """Full media manifest for offline preloading."""
    restaurant_id: str
    version: int
    assets: list[MediaAsset] = Field(default_factory=list)
    total_size_bytes: int = 0
