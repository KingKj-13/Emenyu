"""Experience Engine — controls the presentation layer on the customer tablet.

Responsible for:
- Media playback timing (when cinematic videos begin, how long they loop)
- Autoplay logic (start video after N seconds of viewing a dish)
- Animation orchestration (transition durations, parallax intensity)
- Idle mode (what happens when nobody touches the tablet)
- Presentation flow (which category/dish to highlight based on dining state)

The engine does NOT render anything — it computes *configuration* that the
Flutter customer tablet uses to drive its own rendering.  This keeps the
engine testable and decoupled from the UI framework.
"""

from __future__ import annotations

from app.schemas.dining import DiningState, ExperienceConfig

# Map dining states to the category the customer tablet should highlight
_STATE_CATEGORY_MAP: dict[DiningState, str | None] = {
    DiningState.WELCOME: None,         # Show welcome / full menu
    DiningState.APERITIF: "DRINK",     # Highlight aperitif wines, champagne
    DiningState.STARTERS: "STARTER",   # Highlight starters
    DiningState.MAINS: "MAIN",         # Highlight mains
    DiningState.DESSERT: "DESSERT",    # Highlight desserts
    DiningState.DIGESTIF: "DRINK",     # Highlight digestifs, whisky, cognac
    DiningState.FINISHED: None,        # Show thank-you / idle
}

# Adjust experience parameters by dining state
_STATE_EXPERIENCE_OVERRIDES: dict[DiningState, dict] = {
    DiningState.WELCOME: {"hero_image_scale": 1.1, "parallax_intensity": 0.2},
    DiningState.APERITIF: {"autoplay_delay_seconds": 2.0},
    DiningState.MAINS: {"video_duration_seconds": 7.0},
    DiningState.DESSERT: {"transition_duration_ms": 800},
    DiningState.FINISHED: {"idle_timeout_seconds": 30.0},
}


class ExperienceEngine:
    """Computes tablet presentation configuration from dining state.

    Stateless — all state is derived from the dining session and the
    base configuration.  The engine is instantiated once on app startup.
    """

    def __init__(self, base_config: ExperienceConfig | None = None) -> None:
        self._base = base_config or ExperienceConfig()

    def init_for_session(self, session: dict) -> dict:
        """Compute initial experience config when a table is seated."""
        state = DiningState(session.get("state", "WELCOME"))
        return self._build_config(state)

    def update_for_state(self, state_str: str) -> dict:
        """Compute updated experience config for a state transition."""
        state = DiningState(state_str)
        return self._build_config(state)

    def get_idle_config(self) -> dict:
        """Config for idle mode — reduced animations, ambient content."""
        return {
            "idle_mode": True,
            "autoplay_delay_seconds": 0,
            "video_duration_seconds": 10.0,
            "transition_duration_ms": 2000,
            "parallax_intensity": 0.05,
            "recommended_category": None,
        }

    def _build_config(self, state: DiningState) -> dict:
        """Merge base config with state-specific overrides."""
        config = self._base.model_dump()
        overrides = _STATE_EXPERIENCE_OVERRIDES.get(state, {})
        config.update(overrides)
        config["recommended_category"] = _STATE_CATEGORY_MAP.get(state)
        config["idle_mode"] = state == DiningState.FINISHED
        return config
