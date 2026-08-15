"""Tests for the Experience Engine."""

from __future__ import annotations

from app.orchestrator.experience_engine import ExperienceEngine
from app.schemas.dining import ExperienceConfig


class TestExperienceEngine:
    """Validate experience config generation per dining state."""

    def setup_method(self):
        self.engine = ExperienceEngine()

    def test_init_session_returns_config(self):
        session = {"state": "WELCOME", "id": 1}
        config = self.engine.init_for_session(session)
        assert isinstance(config, dict)
        assert "autoplay_delay_seconds" in config
        assert "recommended_category" in config

    def test_welcome_has_no_category(self):
        config = self.engine.update_for_state("WELCOME")
        assert config["recommended_category"] is None

    def test_starters_highlights_starters(self):
        config = self.engine.update_for_state("STARTERS")
        assert config["recommended_category"] == "STARTER"

    def test_mains_highlights_mains(self):
        config = self.engine.update_for_state("MAINS")
        assert config["recommended_category"] == "MAIN"

    def test_dessert_highlights_desserts(self):
        config = self.engine.update_for_state("DESSERT")
        assert config["recommended_category"] == "DESSERT"

    def test_aperitif_highlights_drinks(self):
        config = self.engine.update_for_state("APERITIF")
        assert config["recommended_category"] == "DRINK"

    def test_finished_enables_idle_mode(self):
        config = self.engine.update_for_state("FINISHED")
        assert config["idle_mode"] is True

    def test_idle_config(self):
        config = self.engine.get_idle_config()
        assert config["idle_mode"] is True
        assert config["transition_duration_ms"] > 1000

    def test_custom_base_config(self):
        custom = ExperienceConfig(autoplay_delay_seconds=5.0, video_duration_seconds=8.0)
        engine = ExperienceEngine(base_config=custom)
        config = engine.update_for_state("STARTERS")
        # Starters doesn't override autoplay, so base value should persist
        assert config["autoplay_delay_seconds"] == 5.0

    def test_mains_overrides_video_duration(self):
        config = self.engine.update_for_state("MAINS")
        assert config["video_duration_seconds"] == 7.0  # Overridden for mains
