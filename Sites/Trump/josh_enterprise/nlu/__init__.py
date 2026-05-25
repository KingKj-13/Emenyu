"""
NLU Package — unified analysis entry point
==========================================
Usage:
    from nlu import analyze
    result = analyze("I want something vegan and cheap")
    # result.intent, result.entities, result.confidence …
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

from .intent_classifier import IntentResult, get_classifier
from .entity_extractor  import EntityBundle, get_extractor
from .semantic_engine   import get_semantic_engine


@dataclass
class NLUResult:
    text:     str
    intent:   IntentResult
    entities: EntityBundle
    # convenience shortcuts
    top_intent:  str  = ""
    confidence:  float = 0.0

    def __post_init__(self):
        self.top_intent = self.intent.intent
        self.confidence = self.intent.confidence


def analyze(text: str) -> NLUResult:
    """Full NLU pipeline: intent + entities."""
    intent  = get_classifier().classify(text)
    entities = get_extractor().extract(text)
    return NLUResult(text=text, intent=intent, entities=entities)


__all__ = ["analyze", "NLUResult", "get_semantic_engine"]
