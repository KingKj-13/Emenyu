"""Pairing Engine — determines drink and side pairings for a menu item.

Combines authored hero pairings, CSV menu pairings, and category-level heuristics.
"""

from __future__ import annotations

import json
from pathlib import Path
import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.menu import MenuItem

logger = structlog.get_logger()


class PairingEngine:
    """Computes pairing scores based on authored pairings, CSV rules, and categories."""

    def __init__(self, db: AsyncSession) -> None:
        self._db = db
        self._hero_pairings: dict = {}
        self._load_hero_pairings()

    def _load_hero_pairings(self) -> None:
        """Find and parse trump_hero_pairings.json.

        Path is configurable via HERO_PAIRINGS_PATH since the Node/Trump repo
        checkout lives at a different relative location on each deployment.
        """
        settings = get_settings()
        paths = []
        if settings.hero_pairings_path:
            paths.append(Path(settings.hero_pairings_path))
        paths += [
            Path(__file__).resolve().parents[4] / "Sites" / "Trump" / "trump_hero_pairings.json",
            Path(__file__).resolve().parents[3] / "Trump" / "trump_hero_pairings.json",
            Path(__file__).parent / "data" / "trump_hero_pairings.json",
        ]
        for path in paths:
            if path.is_file():
                try:
                    with open(path, encoding="utf-8") as f:
                        self._hero_pairings = json.load(f)
                    logger.info("hero_pairings_loaded", path=str(path))
                    return
                except Exception as exc:
                    logger.warn("hero_pairings_parse_failed", path=str(path), error=str(exc))

        logger.warn("hero_pairings_not_found")

    async def get_best_pairing(
        self,
        source_item_id: int,
        restaurant_id: str,
        occasion: str = "standard",
        profile_tags: list[str] | None = None,
    ) -> dict | None:
        """Find the absolute best pairing for a source menu item.

        Scores all available target items that qualify as a pairing.
        """
        # Load source item
        src_result = await self._db.execute(
            select(MenuItem).where(MenuItem.id == source_item_id, MenuItem.restaurantId == restaurant_id)
        )
        source_item = src_result.scalar_one_or_none()
        if not source_item:
            return None

        # Load all potential target drink items (wines, champagne, beer, whisky)
        targets_result = await self._db.execute(
            select(MenuItem).where(
                MenuItem.restaurantId == restaurant_id,
                MenuItem.visible == True,  # noqa: E712
                MenuItem.available == True,  # noqa: E712
            )
        )
        candidates = targets_result.scalars().all()

        best_candidate: MenuItem | None = None
        best_score = -1.0
        best_explanation = ""
        best_tier = "fallback"

        for target in candidates:
            # Pairings should be drinks if source is food, or food/sides if source is drink
            # Check source type and target type
            src_cat = source_item.category.lower()
            tgt_cat = target.category.lower()

            src_is_drink = any(x in src_cat for x in ["wine", "drink", "whisky", "whiskey", "champagne", "beer"])
            tgt_is_drink = any(x in tgt_cat for x in ["wine", "drink", "whisky", "whiskey", "champagne", "beer"])

            if src_is_drink == tgt_is_drink:
                # Do not pair food-to-food or drink-to-drink here unless they are sides
                continue

            # Compute pairing score
            score, explanation, tier = self._score_pairing(
                source_item, target, occasion, profile_tags or []
            )

            if score > best_score:
                best_score = score
                best_candidate = target
                best_explanation = explanation
                best_tier = tier

        if not best_candidate:
            return None

        return {
            "item": {
                "id": best_candidate.id,
                "name": best_candidate.name,
                "price": best_candidate.price,
                "description": best_candidate.description,
            },
            "score": best_score,
            "explanation": best_explanation,
            "tier": best_tier,
        }

    def _score_pairing(
        self,
        source: MenuItem,
        target: MenuItem,
        occasion: str,
        profile_tags: list[str],
    ) -> tuple[float, str, str]:
        """Compute matching score between source and target items."""
        score = 0.0
        explanation = ""
        tier = "fallback"

        # 1. Authored Hero pairings
        # Match by name or varietal key
        hero_match = self._find_hero_pairing(source.name, target.name)
        if hero_match:
            tier = hero_match.get("tier", "strong")
            score = 95.0 if tier == "hero" else 80.0
            explanation = hero_match.get("reason", "")
            # Boost if occasion matches
            if occasion == "celebration" and target.category.lower() in ("champagne", "cap classique"):
                score += 10.0
            return score, explanation, tier

        # 2. Database MenuItemRecommendation pairings
        # Check if there's a stored recommendation between the two
        # (We will mock this or read it from DB, since we run in sync mode here, we'll check it)
        # But this is a fallback for dynamic pairings

        # 3. Heuristic matching
        src_desc = source.description.lower()
        tgt_name = target.name.lower()
        tgt_desc = target.description.lower()

        # Premium steaks go with heavy reds
        if "steak" in source.category.lower() or "ribs" in source.category.lower():
            if any(x in tgt_name or x in target.category.lower() for x in ["cabernet", "shiraz", "pinotage", "merlot", "red blend"]):
                score = 50.0
                explanation = f"Rich red {target.name} complements the intense marbling and char of our dry-aged steaks."
                tier = "csv"

        # Seafood goes with white wines
        elif "seafood" in source.category.lower() or "prawn" in source.name.lower() or "salmon" in source.name.lower():
            if any(x in tgt_name or x in target.category.lower() for x in ["sauvignon blanc", "chardonnay", "chenin"]):
                score = 50.0
                explanation = f"Crisp, refreshing {target.name} provides an elegant acidity lift alongside our fresh seafood."
                tier = "csv"

        # Occasion boosts
        if occasion == "celebration" and "champagne" in target.category.lower():
            score += 15.0
        if occasion == "quick_bite" and "beer" in target.category.lower():
            score += 15.0

        # Profile boosts
        if "wine_lover" in profile_tags and target.price > 100.0:
            score += 5.0

        return score, explanation, tier

    def _find_hero_pairing(self, dish_name: str, drink_name: str) -> dict | None:
        """Finds if a hero pairing exists in the loaded json data."""
        if not self._hero_pairings:
            return None

        dish_lower = dish_name.lower()
        drink_lower = drink_name.lower()

        for p in self._hero_pairings.get("pairings", []):
            p_dish = p.get("dish", "").lower()
            p_drink = p.get("drink", "").lower()

            # Exact or substring match on dish and drink
            if (p_dish in dish_lower or dish_lower in p_dish) and (p_drink in drink_lower or drink_lower in p_drink):
                return p

        return None
