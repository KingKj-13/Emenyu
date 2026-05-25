"""
Recommender Engine v2 — Semantic + Popularity + Dietary Scoring
================================================================
Wraps recommend.py-style menu loading with the SemanticEngine.
Exposes:
  search(query, exclude, top_k)  → list[dict]
  specials(exclude)              → list[dict]
  random_food(exclude)           → dict | None
  random_drink(exclude)          → dict | None
  wine_for_item(item)            → dict
"""

from __future__ import annotations

import glob
import json
import os
import random
from collections import Counter
from difflib import SequenceMatcher
from typing import Optional

from nlu.semantic_engine import SemanticEngine, get_semantic_engine


# ---------------------------------------------------------------------------
# Wine pairings knowledge base
# ---------------------------------------------------------------------------

WINE_PAIRINGS: dict[str, dict] = {
    "Spier Signature Sauvignon Blanc": {
        "name": "Spier Signature Sauvignon Blanc",
        "flavor_profile": "tropical, herbaceous, zesty",
        "keywords": ["prawn", "calamari", "squid", "fish", "oyster", "mussel", "seafood", "hake", "sole"],
        "price": 95,
        "reason": "Bright acidity cuts through ocean flavors beautifully",
    },
    "Nederburg Cabernet Sauvignon": {
        "name": "Nederburg The Winemasters Cabernet Sauvignon",
        "flavor_profile": "dark cherry, plum, oak",
        "keywords": ["beef", "tomahawk", "fillet", "steak", "rump", "rib"],
        "price": 125,
        "reason": "Tannins grip onto rich meat flavors and enhance every bite",
    },
    "Porcupine Ridge Shiraz": {
        "name": "Porcupine Ridge Shiraz",
        "flavor_profile": "dark berry, pepper, bold",
        "keywords": ["lamb", "chops", "rosemary"],
        "price": 140,
        "reason": "Pepper notes complement charred, grilled lamb perfectly",
    },
    "Boschendal Chardonnay": {
        "name": "Boschendal 1685 Chardonnay",
        "flavor_profile": "butter, vanilla, oak",
        "keywords": ["chicken", "pasta", "cream", "poultry"],
        "price": 150,
        "reason": "Creamy texture matches buttery, lightly sauced dishes",
    },
    "KWV Roodeberg Red Blend": {
        "name": "KWV Roodeberg Red Blend",
        "flavor_profile": "blackberry, spice, smooth tannins",
        "keywords": ["beef strip", "biltong", "grilled meat", "pork"],
        "price": 199,
        "reason": "Dark fruit and spice sit well with seasoned meats from the coals",
    },
    "Simonsig Cap Classique": {
        "name": "Simonsig Kaapse Vonkel Brut Cap Classique",
        "flavor_profile": "brioche, citrus, bubbles",
        "keywords": ["oyster", "starter", "prawn", "celebration"],
        "price": 220,
        "reason": "Bubbles and acidity pair elegantly with oysters and rich starters",
    },
    "Fairview Pinotage": {
        "name": "Fairview Pinotage",
        "flavor_profile": "dark cherry, earthy, medium-bodied",
        "keywords": [],   # default fallback
        "price": 130,
        "reason": "Earthy notes complement char, mushrooms and premium beef",
    },
}

DEFAULT_WINE = WINE_PAIRINGS["Fairview Pinotage"]


def wine_for_item(item: dict) -> dict:
    """Match a menu item to its best wine pairing."""
    text = (item.get("name","") + " " + item.get("description","")).lower()
    for wine in WINE_PAIRINGS.values():
        if any(kw in text for kw in wine.get("keywords", [])):
            return wine
    return DEFAULT_WINE


# ---------------------------------------------------------------------------
# Menu loading helpers
# ---------------------------------------------------------------------------

FOOD_DRINK_KEYWORDS = [
    "wine", "beer", "cocktail", "coffee", "tea", "water", "juice",
    "frappe", "cappuccino", "lager", "espresso", "freddo",
]


def _is_drink(item: dict) -> bool:
    name = item.get("name", "").lower()
    return any(kw in name for kw in FOOD_DRINK_KEYWORDS)


def _flatten_menu(raw) -> list[dict]:
    flat: list[dict] = []

    def walk(node):
        if isinstance(node, list):
            for item in node:
                walk(item)
        elif isinstance(node, dict):
            if "items" in node:
                for item in node["items"]:
                    if item.get("visible", True):
                        flat.append(item)
            for key, val in node.items():
                if key != "items":
                    walk(val)

    walk(raw)
    return flat


# ---------------------------------------------------------------------------
# Recommender
# ---------------------------------------------------------------------------

class RecommenderV2:

    def __init__(self, menu_path: str = "food/TrumpMenu.json",
                 orders_dir: str = "orders"):
        self.menu_path   = menu_path
        self.orders_dir  = orders_dir
        self._all_items: list[dict] = []
        self._popularity: dict[str, float] = {}
        self._engine: SemanticEngine = get_semantic_engine()
        self._ready = False

    # ---- public setup -----------------------------------------------------

    def load(self) -> bool:
        if not os.path.exists(self.menu_path):
            print(f"❌ Menu file not found: {self.menu_path}")
            return False
        try:
            with open(self.menu_path, encoding="utf-8") as f:
                raw = json.load(f)
            self._all_items = _flatten_menu(raw)
            self._popularity = self._calc_popularity()
            # normalise popularity to 0-1
            max_pop = max(self._popularity.values(), default=1)
            self._popularity = {k: v / max_pop for k, v in self._popularity.items()}
            # build semantic index
            self._engine.build_index(self._all_items, self._popularity)
            self._ready = True
            print(f"✅ RecommenderV2 loaded {len(self._all_items)} items.")
            return True
        except Exception as e:
            print(f"❌ Recommender load error: {e}")
            return False

    # ---- popularity -------------------------------------------------------

    def _calc_popularity(self) -> dict[str, float]:
        counts: Counter = Counter()
        for path in sorted(glob.glob(os.path.join(self.orders_dir, "*.json")))[-50:]:
            try:
                with open(path, encoding="utf-8") as f:
                    order = json.load(f)
                for item in order.get("items", []):
                    counts[item.get("name", "")] += 1
            except Exception:
                pass
        return dict(counts) if counts else {i.get("name",""): 1 for i in self._all_items[:10]}

    # ---- exclusion check --------------------------------------------------

    _ALLERGEN_MAP: dict[str, list[str]] = {
        "seafood": ["fish","hake","sole","prawn","shrimp","oyster","mussel","calamari","squid","shellfish","kingklip"],
        "dairy":   ["cheese","milk","feta","halloumi","cream","yogurt","butter"],
        "gluten":  ["bread","pasta","phyllo"],
        "nuts":    ["nuts","almond","pecan","walnut"],
        "meat":    ["beef","chicken","lamb","pork","fish","prawn","calamari","squid","oyster","mussel"],
    }

    def _should_exclude(self, item: dict, exclude: list[str]) -> bool:
        if not exclude:
            return False
        combined = (
            item.get("name","") + " " +
            item.get("description","") + " " +
            item.get("allergens","")
        ).lower()
        for exc in exclude:
            e = exc.lower()
            if e in combined:
                return True
            for kw in self._ALLERGEN_MAP.get(e, []):
                if kw in combined:
                    return True
        return False

    # ---- public search API ------------------------------------------------

    def search(self, query: str, exclude: Optional[list[str]] = None, top_k: int = 5) -> list[dict]:
        """Semantic search with dietary filtering."""
        if not self._ready:
            return []
        exclude = exclude or []
        results = self._engine.query(query, top_k=top_k * 2, exclude=exclude)
        # inject explanation into item dict for response generator
        items = []
        for r in results:
            item_copy = dict(r.item)
            item_copy["_explanation"] = r.explanation
            item_copy["_score"] = r.score
            items.append(item_copy)
        return items[:top_k]

    def specials(self, exclude: Optional[list[str]] = None) -> list[dict]:
        """Return popular items, filtered."""
        pop_names = sorted(self._popularity, key=self._popularity.get, reverse=True)[:10]
        items = [i for i in self._all_items
                 if i.get("name") in pop_names and not self._should_exclude(i, exclude or [])]
        return items[:5]

    def random_food(self, exclude: Optional[list[str]] = None) -> Optional[dict]:
        candidates = [i for i in self._all_items
                      if not _is_drink(i) and not self._should_exclude(i, exclude or [])]
        return random.choice(candidates) if candidates else None

    def random_drink(self, exclude: Optional[list[str]] = None) -> Optional[dict]:
        candidates = [i for i in self._all_items
                      if _is_drink(i) and not self._should_exclude(i, exclude or [])]
        return random.choice(candidates) if candidates else None

    def items_by_type(self, food_type: str, exclude: Optional[list[str]] = None) -> list[dict]:
        return self.search(food_type, exclude=exclude, top_k=5)


# Singleton
_recommender: Optional[RecommenderV2] = None

def get_recommender() -> RecommenderV2:
    global _recommender
    if _recommender is None:
        _recommender = RecommenderV2()
    return _recommender
