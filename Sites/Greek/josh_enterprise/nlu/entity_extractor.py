"""
Entity Extractor — spaCy + Custom EntityRuler
==============================================
Extracts:
  FOOD_TYPE            beef, seafood, lamb, chicken, vegan …
  DIETARY_RESTRICTION  gluten-free, dairy-free, halal, kosher …
  PRICE_RANGE          cheap, premium, budget, expensive …
  QUANTITY             one, two, a plate of …
  DRINK_TYPE           wine, beer, cocktail, coffee …
  CUISINE              greek, mediterranean …

Falls back to regex patterns when spaCy is not installed.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Optional


# ---------------------------------------------------------------------------
# Data class
# ---------------------------------------------------------------------------

@dataclass
class EntityBundle:
    food_types:          list[str] = field(default_factory=list)
    dietary_restrictions:list[str] = field(default_factory=list)
    price_range:         Optional[str] = None
    quantity:            Optional[int] = None
    drink_types:         list[str] = field(default_factory=list)
    cuisine:             list[str] = field(default_factory=list)
    raw_entities:        list[dict] = field(default_factory=list)   # spaCy spans

    def to_filter_dict(self) -> dict[str, Any]:
        return {
            "food_types":    self.food_types,
            "exclude":       self.dietary_restrictions,
            "price_range":   self.price_range,
            "quantity":      self.quantity,
            "drink_types":   self.drink_types,
        }


# ---------------------------------------------------------------------------
# Pattern definitions
# ---------------------------------------------------------------------------

FOOD_PATTERNS = [
    # proteins
    {"label": "FOOD_TYPE", "pattern": [{"LOWER": {"IN": ["beef", "steak", "tomahawk", "fillet", "rump", "biftekia"]}}]},
    {"label": "FOOD_TYPE", "pattern": [{"LOWER": {"IN": ["lamb", "chops", "souvlaki", "kleftiko"]}}]},
    {"label": "FOOD_TYPE", "pattern": [{"LOWER": {"IN": ["chicken", "poultry", "kotópoulo"]}}]},
    {"label": "FOOD_TYPE", "pattern": [{"LOWER": {"IN": ["pork", "loukaniko"]}}]},
    {"label": "FOOD_TYPE", "pattern": [{"LOWER": {"IN": ["seafood", "fish", "prawn", "shrimp", "calamari",
                                                          "squid", "mussel", "oyster", "hake", "sole", "sardine",
                                                          "kingklip", "octopus"]}}]},
    # starters / dishes
    {"label": "FOOD_TYPE", "pattern": [{"LOWER": {"IN": ["meze", "mezze", "moussaka", "spanakopita",
                                                          "tiropita", "gyros", "gyro", "keftethes",
                                                          "saganaki", "tzatziki", "hummus", "dolmades",
                                                          "kleftiko", "stifado", "souvlaki"]}}]},
    # plant
    {"label": "FOOD_TYPE", "pattern": [{"LOWER": {"IN": ["salad", "vegetables", "veggie", "vegies",
                                                          "mushroom", "eggplant", "aubergine", "tomato"]}}]},
]

DIETARY_PATTERNS = [
    {"label": "DIETARY_RESTRICTION", "pattern": [{"LOWER": "vegan"}]},
    {"label": "DIETARY_RESTRICTION", "pattern": [{"LOWER": "vegetarian"}]},
    {"label": "DIETARY_RESTRICTION", "pattern": [{"LOWER": {"IN": ["gluten-free", "gluten", "celiac"]}}]},
    {"label": "DIETARY_RESTRICTION", "pattern": [{"LOWER": {"IN": ["dairy-free", "dairy", "lactose"]}}]},
    {"label": "DIETARY_RESTRICTION", "pattern": [{"LOWER": {"IN": ["halal", "kosher"]}}]},
    {"label": "DIETARY_RESTRICTION", "pattern": [{"LOWER": {"IN": ["nut", "nuts", "peanut", "almond"]}}]},
    {"label": "DIETARY_RESTRICTION", "pattern": [{"LOWER": {"IN": ["egg", "eggs"]}}]},
    {"label": "DIETARY_RESTRICTION", "pattern": [{"LOWER": {"IN": ["shellfish", "crustacean"]}}]},
    {"label": "DIETARY_RESTRICTION", "pattern": [{"LOWER": "meat"}, {"LOWER": {"IN": ["free", "-free"]}}]},
]

PRICE_PATTERNS = [
    {"label": "PRICE_RANGE", "pattern": [{"LOWER": {"IN": ["cheap", "budget", "affordable", "inexpensive", "value"]}}]},
    {"label": "PRICE_RANGE", "pattern": [{"LOWER": {"IN": ["premium", "expensive", "pricey", "luxury", "high-end", "upscale"]}}]},
    {"label": "PRICE_RANGE", "pattern": [{"LOWER": {"IN": ["mid-range", "moderate", "medium"]}}]},
]

DRINK_PATTERNS = [
    {"label": "DRINK_TYPE", "pattern": [{"LOWER": {"IN": ["wine", "red wine", "white wine", "rosé", "rose"]}}]},
    {"label": "DRINK_TYPE", "pattern": [{"LOWER": {"IN": ["beer", "lager", "ale", "craft beer"]}}]},
    {"label": "DRINK_TYPE", "pattern": [{"LOWER": {"IN": ["cocktail", "mocktail", "spritz"]}}]},
    {"label": "DRINK_TYPE", "pattern": [{"LOWER": {"IN": ["coffee", "espresso", "cappuccino", "frappe",
                                                           "freddo", "latte", "americano"]}}]},
    {"label": "DRINK_TYPE", "pattern": [{"LOWER": {"IN": ["juice", "water", "sparkling", "still"]}}]},
    {"label": "DRINK_TYPE", "pattern": [{"LOWER": {"IN": ["ouzo", "tsipouro", "metaxa", "raki"]}}]},
]

CUISINE_PATTERNS = [
    {"label": "CUISINE", "pattern": [{"LOWER": {"IN": ["greek", "mediterranean", "traditional", "authentic"]}}]},
]

ALL_PATTERNS = FOOD_PATTERNS + DIETARY_PATTERNS + PRICE_PATTERNS + DRINK_PATTERNS + CUISINE_PATTERNS


# ---------------------------------------------------------------------------
# Synonym / alias normalisation
# ---------------------------------------------------------------------------

FOOD_ALIASES: dict[str, str] = {
    "steak": "beef", "fillet": "beef", "rump": "beef", "tomahawk": "beef",
    "biftekia": "beef", "keftethes": "beef",
    "chops": "lamb", "kleftiko": "lamb", "souvlaki": "lamb",
    "kotópoulo": "chicken", "poultry": "chicken",
    "fish": "seafood", "prawn": "seafood", "shrimp": "seafood",
    "calamari": "seafood", "squid": "seafood", "mussel": "seafood",
    "oyster": "seafood", "hake": "seafood", "sole": "seafood",
    "salad": "vegetables", "veggie": "vegetables", "vegies": "vegetables",
}

DIETARY_ALIASES: dict[str, str] = {
    "gluten": "gluten-free", "celiac": "gluten-free",
    "dairy": "dairy-free", "lactose": "dairy-free",
    "nuts": "nut-free", "peanut": "nut-free", "almond": "nut-free",
    "egg": "egg-free", "eggs": "egg-free",
    "shellfish": "shellfish-free", "crustacean": "shellfish-free",
}

PRICE_ALIASES: dict[str, str] = {
    "cheap": "budget", "affordable": "budget", "inexpensive": "budget", "value": "budget",
    "expensive": "premium", "pricey": "premium", "luxury": "premium",
    "high-end": "premium", "upscale": "premium",
    "moderate": "mid-range", "medium": "mid-range",
}


def _normalise_food(raw: str) -> str:
    return FOOD_ALIASES.get(raw.lower(), raw.lower())

def _normalise_dietary(raw: str) -> str:
    return DIETARY_ALIASES.get(raw.lower(), raw.lower())

def _normalise_price(raw: str) -> str:
    return PRICE_ALIASES.get(raw.lower(), raw.lower())


# ---------------------------------------------------------------------------
# spaCy extractor
# ---------------------------------------------------------------------------

class SpacyEntityExtractor:
    _nlp = None

    @classmethod
    def _load(cls):
        if cls._nlp is not None:
            return True
        try:
            import spacy
            cls._nlp = spacy.blank("en")
            ruler = cls._nlp.add_pipe("entity_ruler", config={"overwrite_ents": True})
            ruler.add_patterns(ALL_PATTERNS)
            return True
        except Exception:
            return False

    @classmethod
    def extract(cls, text: str) -> Optional[list[dict]]:
        if not cls._load():
            return None
        doc = cls._nlp(text)
        return [{"text": ent.text, "label": ent.label_} for ent in doc.ents]


# ---------------------------------------------------------------------------
# Regex fallback extractor
# ---------------------------------------------------------------------------

REGEX_FOOD = re.compile(
    r"\b(beef|steak|lamb|chicken|pork|seafood|fish|prawn|calamari|squid|mussel|oyster|"
    r"hake|sole|salad|moussaka|gyro|souvlaki|meze|kleftiko|spanakopita|keftethes)\b", re.I
)
REGEX_DIETARY = re.compile(
    r"\b(vegan|vegetarian|gluten.free|dairy.free|halal|kosher|no\s+\w+|nut.free|egg.free)\b", re.I
)
REGEX_PRICE = re.compile(r"\b(cheap|budget|affordable|premium|expensive|luxury|moderate)\b", re.I)
REGEX_DRINK = re.compile(
    r"\b(wine|beer|cocktail|coffee|espresso|frappe|juice|water|ouzo|lager)\b", re.I
)
REGEX_QTY = re.compile(
    r"\b(one|two|three|four|five|six|\d+)\b.{0,10}(plate|portion|glass|bottle|order|of)\b", re.I
)


def _regex_extract(text: str) -> list[dict]:
    spans = []
    for m in REGEX_FOOD.finditer(text):
        spans.append({"text": m.group(), "label": "FOOD_TYPE"})
    for m in REGEX_DIETARY.finditer(text):
        spans.append({"text": m.group(), "label": "DIETARY_RESTRICTION"})
    for m in REGEX_PRICE.finditer(text):
        spans.append({"text": m.group(), "label": "PRICE_RANGE"})
    for m in REGEX_DRINK.finditer(text):
        spans.append({"text": m.group(), "label": "DRINK_TYPE"})
    return spans


# ---------------------------------------------------------------------------
# Number word → int
# ---------------------------------------------------------------------------

_NUM_WORDS = {"one":1,"two":2,"three":3,"four":4,"five":5,"six":6,"seven":7,"eight":8,"nine":9,"ten":10}

def _parse_quantity(text: str) -> Optional[int]:
    m = re.search(r"\b(\d+)\b", text)
    if m:
        return int(m.group(1))
    for word, val in _NUM_WORDS.items():
        if word in text.lower():
            return val
    return None


# ---------------------------------------------------------------------------
# Master extractor
# ---------------------------------------------------------------------------

class EntityExtractor:

    def extract(self, text: str) -> EntityBundle:
        raw_spans = SpacyEntityExtractor.extract(text) or _regex_extract(text)
        bundle = EntityBundle(raw_entities=raw_spans)

        for span in raw_spans:
            label, value = span["label"], span["text"].lower()
            if label == "FOOD_TYPE":
                norm = _normalise_food(value)
                if norm not in bundle.food_types:
                    bundle.food_types.append(norm)
            elif label == "DIETARY_RESTRICTION":
                norm = _normalise_dietary(value)
                if norm not in bundle.dietary_restrictions:
                    bundle.dietary_restrictions.append(norm)
            elif label == "PRICE_RANGE" and bundle.price_range is None:
                bundle.price_range = _normalise_price(value)
            elif label == "DRINK_TYPE":
                if value not in bundle.drink_types:
                    bundle.drink_types.append(value)
            elif label == "CUISINE":
                if value not in bundle.cuisine:
                    bundle.cuisine.append(value)

        bundle.quantity = _parse_quantity(text)
        return bundle


# Singleton
_extractor: Optional[EntityExtractor] = None

def get_extractor() -> EntityExtractor:
    global _extractor
    if _extractor is None:
        _extractor = EntityExtractor()
    return _extractor
