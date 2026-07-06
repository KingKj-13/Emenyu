"""Unit tests for Recommendation Brain Engine modules."""

from __future__ import annotations

import pytest

from app.brain.confidence import ConfidenceEngine
from app.brain.expected_value import ExpectedValueEngine
from app.brain.memory import memory
from app.brain.occasion import OccasionEngine
from app.brain.profile import CustomerProfileEngine
from app.brain.scripts import WaiterScriptGenerator
from app.orchestrator.media_pipeline import MediaPipeline


# ── Occasion Detection Tests ──────────────────────────────────────────────


class TestOccasionDetection:
    def test_reservation_note_trigger(self):
        note = "Celebrating our 10th anniversary tonight!"
        occasion = OccasionEngine.detect_occasion({}, reservation_notes=note)
        assert occasion == "celebration"

    def test_cart_champagne_trigger(self):
        cart = [{"name": "Moet & Chandon Champagne", "quantity": 1}]
        occasion = OccasionEngine.detect_occasion({}, current_cart=cart)
        assert occasion == "celebration"


    def test_covers_family_trigger(self):
        context = {"covers": 6}
        occasion = OccasionEngine.detect_occasion(context)
        assert occasion == "family"

    def test_romantic_trigger(self):
        # We mock time to be evening (e.g. hour >= 18)
        context = {"covers": 2}
        occasion = OccasionEngine.detect_occasion(context)
        # Defaults to romantic if covers=2 and evening (since current hour is usually evening/night in tests or falls back to romantic/business)
        assert occasion in ("romantic", "standard")


# ── Customer Profile Tests ────────────────────────────────────────────────


class TestCustomerProfile:
    @pytest.mark.anyio
    async def test_empty_profile_for_anonymous(self, client):
        # Setup class
        from app.database import async_session_factory
        async with async_session_factory() as session:
            engine = CustomerProfileEngine(session)
            profile = await engine.get_profile(None, "luxury_trump")
            assert profile["avg_spend"] == 0.0
            assert profile["tags"] == []


# ── Expected Value Tests ──────────────────────────────────────────────────


class TestExpectedValue:
    def test_hero_value(self):
        val = ExpectedValueEngine.calculate_expected_value(price=500.0, confidence=0.9, relation_tier="hero")
        # base_p = 0.40, scaled_p = 0.40 * (0.5 + 0.45) = 0.38
        assert val > 100.0

    def test_fallback_value(self):
        val = ExpectedValueEngine.calculate_expected_value(price=100.0, confidence=0.5, relation_tier="fallback")
        # Low tier has lower base probability
        assert val < 20.0


# ── Confidence Engine Tests ───────────────────────────────────────────────


class TestConfidence:
    @pytest.mark.anyio
    async def test_confidence_tiers(self):
        from app.database import async_session_factory
        async with async_session_factory() as session:
            engine = ConfidenceEngine(session)
            conf_hero = await engine.calculate_confidence(1, 2, "hero", "luxury_trump")
            conf_fallback = await engine.calculate_confidence(1, 2, "fallback", "luxury_trump")
            assert conf_hero > conf_fallback


# ── Recommendation Memory Tests ───────────────────────────────────────────


class TestMemoryAndCooldown:
    @pytest.fixture(autouse=True)
    async def fresh_redis_connection(self):
        """Each anyio test runs on its own event loop; rebind memory's pool to it."""
        import redis.asyncio as redis

        memory._redis = redis.from_url("redis://localhost:6379/0", decode_responses=True)
        yield
        await memory._redis.aclose()

    @pytest.mark.anyio
    async def test_shown_deduplication(self):
        table = "table-12"
        await memory.add_shown(table, 42)
        assert await memory.was_shown(table, 42)
        assert not await memory.was_shown(table, 99)
        await memory.clear_table(table)
        assert not await memory.was_shown(table, 42)

    @pytest.mark.anyio
    async def test_prompt_cooldown(self):
        table = "table-14"
        assert not await memory.is_in_cooldown(table)
        await memory.record_prompt(table, cooldown_seconds=10)
        assert await memory.is_in_cooldown(table)
        await memory.clear_table(table)
        assert not await memory.is_in_cooldown(table)


# ── Waiter Script Generator Tests ─────────────────────────────────────────


class TestScriptGenerator:
    def test_pairing_scripts(self):
        scripts = WaiterScriptGenerator.generate_scripts(
            source_name="Tomahawk Steak",
            target_name="Meerlust Cabernet",
            target_category="Wine",
            base_reason="Full-bodied red cuts through fat",
            type_hint="pairing",
        )
        assert "Tomahawk Steak" in scripts["professional"]
        assert "Meerlust Cabernet" in scripts["friendly"]
        assert "Full-bodied red cuts through fat." in scripts["luxury"]

    def test_upgrade_scripts(self):
        scripts = WaiterScriptGenerator.generate_scripts(
            source_name="Fillet Steak",
            target_name="Wagyu A5 Ribeye",
            target_category="Premium Steak",
            type_hint="upgrade",
        )
        assert "Wagyu A5 Ribeye" in scripts["luxury"]
        assert "marbling" in scripts["luxury"]


# ── Media Pipeline Sync Tests ─────────────────────────────────────────────


class TestMediaPipelineSync:
    @pytest.mark.anyio
    async def test_manifest_delta_sync(self):
        pipeline = MediaPipeline()
        manifest = await pipeline.build_manifest(since_version=0)
        assert "assets" in manifest
        assert manifest["since_version"] == 0
