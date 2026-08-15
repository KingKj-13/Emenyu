"""Recommendation Brain Engine — orchestrates pairing, upgrade, and replacement engines.

Invokes individual engines (Table Intel, Occasion, Customer Profile, Pairing,
Upgrade, Replacement, Expected Value, Confidence, Memory, and Scripts)
to yield targeted recommendation scripts and scores.
"""

from __future__ import annotations

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.brain.analytics import BrainAnalyticsCollector
from app.brain.confidence import ConfidenceEngine
from app.brain.expected_value import ExpectedValueEngine
from app.brain.memory import memory
from app.brain.occasion import OccasionEngine
from app.brain.pairing import PairingEngine
from app.brain.profile import CustomerProfileEngine
from app.brain.replacement import ReplacementEngine
from app.brain.scripts import WaiterScriptGenerator
from app.brain.table_intel import TableIntelligenceEngine
from app.brain.upgrade import UpgradeEngine
from app.config import get_settings
from app.models.menu import MenuItem

logger = structlog.get_logger()


class RecommendationBrain:
    """Orchestrates all decision modules for EMenu recommendations."""

    def __init__(self) -> None:
        self._ready = False

    async def initialize(self, db: AsyncSession) -> None:
        """Prefetch database rules or warm caches if necessary."""
        logger.info("brain_initializing")
        # Instantiate PairingEngine to warm hero pairings JSON
        PairingEngine(db)
        self._ready = True
        logger.info("brain_ready")

    async def recommend(
        self,
        db: AsyncSession,
        source_item_id: int,
        table_id: str = "",
        current_cart: list[dict] | None = None,
        guest_id: int | None = None,
        dining_state: str = "",
    ) -> dict:
        """Coordinate decision engines to generate recommended upsells and scripts.

        Outputs matching the RecommendationResponse schema.
        """
        settings = get_settings()
        rid = settings.restaurant_id

        # 1. Enforce Cooldown check
        if table_id and memory.is_in_cooldown(table_id):
            logger.info("brain_recommend_cooldown_active", table_id=table_id)
            return self._empty_response(source_item_id)

        # 2. Retrieve source item details
        src_result = await db.execute(
            select(MenuItem).where(MenuItem.id == source_item_id, MenuItem.restaurantId == rid)
        )
        source = src_result.scalar_one_or_none()
        if not source:
            return self._empty_response(source_item_id)

        source_brief = {
            "id": source.id,
            "name": source.name,
            "price": source.price,
            "description": source.description,
        }

        # 3. Table and Guest Context aggregation
        intel = TableIntelligenceEngine(db)
        table_context = await intel.get_table_context(table_id, rid)

        # Occasion detection
        occasion = OccasionEngine.detect_occasion(
            table_context=table_context,
            current_cart=current_cart,
            guest_vip=bool(table_context.get("guest_id") and guest_id),
        )

        # Customer preferences profile
        profile_engine = CustomerProfileEngine(db)
        profile = await profile_engine.get_profile(guest_id or table_context.get("guest_id"), rid)
        profile_tags = profile.get("tags", [])

        # 4. Generate recommendations concurrently
        pairing_engine = PairingEngine(db)
        upgrade_engine = UpgradeEngine(db)
        replacement_engine = ReplacementEngine(db)
        confidence_engine = ConfidenceEngine(db)

        raw_pairing, raw_upgrade, raw_replacement = await asyncio.gather(
            pairing_engine.get_best_pairing(source_item_id, rid, occasion, profile_tags),
            upgrade_engine.get_best_upgrade(source_item_id, rid, occasion, profile_tags),
            replacement_engine.get_best_replacement(source_item_id, rid)
        )

        pairing_out = None
        if raw_pairing and not await memory.was_shown(table_id, raw_pairing["item"]["id"]):
            tgt_id = raw_pairing["item"]["id"]
            conf = await confidence_engine.calculate_confidence(source_item_id, tgt_id, raw_pairing["tier"], rid)
            ev = ExpectedValueEngine.calculate_expected_value(raw_pairing["item"]["price"], conf, raw_pairing["tier"])
            scripts = WaiterScriptGenerator.generate_scripts(
                source.name, raw_pairing["item"]["name"], raw_pairing["item"].get("category", ""), raw_pairing["explanation"], "pairing"
            )
            pairing_out = {
                "item": raw_pairing["item"],
                "expected_value": ev,
                "confidence": conf,
                "explanation": raw_pairing["explanation"],
                "scripts": scripts,
            }
            if table_id:
                await memory.add_shown(table_id, tgt_id)

        # ── Upgrade ──
        upgrade_out = None
        if raw_upgrade and not await memory.was_shown(table_id, raw_upgrade["item"]["id"]):
            tgt_id = raw_upgrade["item"]["id"]
            conf = await confidence_engine.calculate_confidence(source_item_id, tgt_id, raw_upgrade["tier"], rid)
            ev = ExpectedValueEngine.calculate_expected_value(raw_upgrade["item"]["price"], conf, raw_upgrade["tier"])
            scripts = WaiterScriptGenerator.generate_scripts(
                source.name, raw_upgrade["item"]["name"], raw_upgrade["item"].get("category", ""), raw_upgrade["explanation"], "upgrade"
            )
            upgrade_out = {
                "item": raw_upgrade["item"],
                "expected_value": ev,
                "confidence": conf,
                "explanation": raw_upgrade["explanation"],
                "scripts": scripts,
            }
            if table_id:
                await memory.add_shown(table_id, tgt_id)

        # ── Replacement ──
        replacement_out = None
        if raw_replacement and not await memory.was_shown(table_id, raw_replacement["item"]["id"]):
            tgt_id = raw_replacement["item"]["id"]
            conf = await confidence_engine.calculate_confidence(source_item_id, tgt_id, raw_replacement["tier"], rid)
            ev = ExpectedValueEngine.calculate_expected_value(raw_replacement["item"]["price"], conf, raw_replacement["tier"])
            scripts = WaiterScriptGenerator.generate_scripts(
                source.name, raw_replacement["item"]["name"], raw_replacement["item"].get("category", ""), raw_replacement["explanation"], "replacement"
            )
            replacement_out = {
                "item": raw_replacement["item"],
                "expected_value": ev,
                "confidence": conf,
                "explanation": raw_replacement["explanation"],
                "scripts": scripts,
            }
            if table_id:
                memory.add_shown(table_id, tgt_id)

        # 5. Log analytics & start cooldown
        if table_id:
            memory.record_prompt(table_id)
            # Log created events in database via collector
            collector = BrainAnalyticsCollector(db)
            session_id = table_context.get("session_id") or 0
            if pairing_out:
                await collector.log_created(session_id, source_item_id, pairing_out["item"]["id"], "pairing", pairing_out["expected_value"], rid)
            if upgrade_out:
                await collector.log_created(session_id, source_item_id, upgrade_out["item"]["id"], "upgrade", upgrade_out["expected_value"], rid)

        return {
            "source_item": source_brief,
            "pairing": pairing_out,
            "upgrade": upgrade_out,
            "replacement": replacement_out,
        }

    async def batch_recommend(
        self,
        db: AsyncSession,
        cart: list[dict],
        table_id: str = "",
        guest_id: int | None = None,
        dining_state: str = "",
    ) -> list[dict]:
        """Generate batch cart-level recommendations concurrently."""
        import asyncio
        tasks = []
        for item in cart:
            item_id = item.get("item_id", 0)
            if item_id:
                tasks.append(
                    self.recommend(db, item_id, table_id, cart, guest_id, dining_state)
                )
        
        if not tasks:
            return []
            
        results = await asyncio.gather(*tasks)
        return list(results)

    def invalidate_cache(self) -> None:
        """Drop cache if necessary."""
        self._ready = False
        logger.info("brain_cache_invalidated")

    def status(self) -> dict:
        return {
            "ready": self._ready,
            "engine": "production_deterministic",
            "version": "1.0.0",
        }

    @staticmethod
    def _empty_response(source_item_id: int) -> dict:
        return {
            "source_item": {"id": source_item_id, "name": "", "price": 0, "description": ""},
            "pairing": None,
            "upgrade": None,
            "replacement": None,
        }


# Singleton
brain = RecommendationBrain()
