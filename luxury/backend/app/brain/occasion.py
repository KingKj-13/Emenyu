"""Occasion Detection Engine — infers the dining occasion or table mood.

Dining occasions: romantic | business | celebration | family | quick_bite | VIP
"""

from __future__ import annotations

from datetime import datetime, UTC

# Occasion keywords mapped to target occasion types
OCCASION_KEYWORDS = {
    "birthday": "celebration",
    "anniversary": "celebration",
    "celebrate": "celebration",
    "celebrating": "celebration",
    "date": "romantic",
    "romantic": "romantic",
    "proposal": "romantic",
    "propose": "romantic",
    "business": "business",
    "meeting": "business",
    "corporate": "business",
    "client": "business",
    "family": "family",
    "kids": "family",
    "children": "family",
}


class OccasionEngine:
    """Detects/infers the occasion and mood of a table based on heuristics."""

    @staticmethod
    def detect_occasion(
        table_context: dict,
        current_cart: list[dict] | None = None,
        reservation_notes: str = "",
        guest_vip: bool = False,
    ) -> str:
        """Infers the dining occasion.

        Returns one of: VIP | celebration | romantic | business | family | quick_bite | standard
        """
        if guest_vip:
            return "VIP"

        # 1. Parse reservation notes / keywords
        notes_lower = reservation_notes.lower()
        for keyword, occasion in OCCASION_KEYWORDS.items():
            if keyword in notes_lower:
                return occasion

        # 2. Check current cart items for occasion triggers (e.g. champagne, platters)
        cart = current_cart or []
        cart_names = [item.get("name", "").lower() for item in cart]

        if any("champagne" in name or "dom perignon" in name or "mcc" in name for name in cart_names):
            return "celebration"

        if any("platter" in name or "sharing" in name for name in cart_names):
            return "family"

        if any("kid" in name or "juice" in name or "milkshake" in name for name in cart_names):
            return "family"

        # 3. Time of day and covers heuristics
        now = datetime.now(UTC)
        hour = now.hour
        is_weekend = now.weekday() >= 5  # Saturday/Sunday
        covers = table_context.get("covers", 0)

        # Quick bite
        if covers == 1 and hour in (11, 12, 13, 14, 15, 16):
            return "quick_bite"

        # Family
        if covers >= 5:
            return "family"

        # Romantic
        if covers == 2 and hour >= 18 and not is_weekend:
            # Evening date night
            return "romantic"

        # Business
        if covers in (2, 3, 4) and hour in (12, 13, 14) and not is_weekend:
            # Weekday business lunch
            return "business"

        # Fallback to standard
        return "standard"
