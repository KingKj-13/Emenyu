"""
Dialogue Manager — State Machine + Policy Engine
=================================================
States:
  neutral → asked_preference → recommending → asked_drink →
  upselling → checkout → farewell

Policy decides next_action from (state, intent, entities, confidence).
"""

from __future__ import annotations

import random
from dataclasses import dataclass
from enum import Enum
from typing import Optional

from memory.memory_system import SessionState


# ===========================================================================
# States & Actions
# ===========================================================================

class State(str, Enum):
    NEUTRAL          = "neutral"
    ASKED_PREFERENCE = "asked_preference"
    RECOMMENDING     = "recommending"
    ASKED_DRINK      = "asked_drink"
    UPSELLING        = "upselling"
    CHECKOUT         = "checkout"
    FAREWELL         = "farewell"
    CLARIFYING       = "clarifying"


class Action(str, Enum):
    GREET              = "greet"
    ASK_PREFERENCE     = "ask_preference"
    RECOMMEND_FOOD     = "recommend_food"
    RECOMMEND_DRINK    = "recommend_drink"
    UPSELL_DRINK       = "upsell_drink"
    CONFIRM_ORDER      = "confirm_order"
    CLARIFY_DIETARY    = "clarify_dietary"
    CLARIFY_PRICE      = "clarify_price"
    SHOW_SPECIALS      = "show_specials"
    HANDLE_COMPLAINT   = "handle_complaint"
    FAREWELL           = "farewell"
    KNOWLEDGE_ANSWER   = "knowledge_answer"
    SMALL_TALK         = "small_talk"
    LOG_UNKNOWN        = "log_unknown"
    LEARNED_ANSWER     = "learned_answer"


# ===========================================================================
# Dialogue Policy
# ===========================================================================

class DialoguePolicy:
    """
    Decides the next Action given current state + NLU signals.
    Rule-hybrid: structured transitions + confidence-based overrides.
    """

    CONFIDENCE_HIGH = 0.60
    CONFIDENCE_MED  = 0.40

    def decide(
        self,
        session:    SessionState,
        intent:     str,
        confidence: float,
        entities,
        multi_intents: list[str] = None,
    ) -> Action:
        state = State(session.dialogue_state)
        multi_intents = multi_intents or []

        # ---- explicit intent overrides (ALWAYS fire first, regardless of state) ----
        if intent == "greet":
            # ✅ FIX: Only ask preference on a plain greet with no food context
            if not session.last_food and not session.history:
                return Action.ASK_PREFERENCE
            return Action.GREET

        if intent == "farewell":
            return Action.FAREWELL
        if intent == "complaint":
            return Action.HANDLE_COMPLAINT
        if intent == "small_talk":
            return Action.SMALL_TALK
        if intent == "knowledge_query":
            return Action.KNOWLEDGE_ANSWER
        if intent == "add_to_cart":
            return Action.CONFIRM_ORDER
        if intent == "view_cart":
            return Action.CONFIRM_ORDER

        # ---- food/drink/dietary intent overrides (fire before state logic) ----
        has_dietary = bool(entities.dietary_restrictions) if entities else False
        has_food    = bool(entities.food_types) if entities else False

        if intent == "recommend_food" or has_food:
            return Action.RECOMMEND_FOOD

        if intent == "recommend_drink":
            return Action.RECOMMEND_DRINK

        if intent == "dietary_filter" or has_dietary:
            if has_food or "recommend_food" in multi_intents:
                return Action.RECOMMEND_FOOD
            if not session.last_food and not session.history:
                return Action.ASK_PREFERENCE
            return Action.RECOMMEND_FOOD

        if intent == "price_inquiry":
            if not entities.food_types:
                return Action.CLARIFY_PRICE
            return Action.RECOMMEND_FOOD

        if intent == "item_detail":
            return Action.RECOMMEND_FOOD

        if intent == "show_specials":
            return Action.SHOW_SPECIALS

        # ---- upsell flow ----
        if state == State.UPSELLING:
            if intent in ("upsell_accept", "recommend_drink"):
                return Action.RECOMMEND_DRINK
            if intent == "upsell_decline":
                session.dialogue_state = State.NEUTRAL.value
                return Action.CONFIRM_ORDER

        # ---- drink flow ----
        if state == State.ASKED_DRINK:
            return Action.RECOMMEND_DRINK

        # ---- state-driven defaults (only reached when intent is truly unknown) ----
        # ✅ FIX: Removed turn_count <= 1 block — was hijacking first message
        if state == State.NEUTRAL:
            return Action.RECOMMEND_FOOD

        if state == State.ASKED_PREFERENCE:
            return Action.RECOMMEND_FOOD

        if state == State.RECOMMENDING:
            if not session.upsell_offered:
                return Action.UPSELL_DRINK
            return Action.RECOMMEND_FOOD

        # ---- low confidence fallback ----
        if confidence < self.CONFIDENCE_MED:
            return Action.LOG_UNKNOWN

        return Action.RECOMMEND_FOOD


# ===========================================================================
# State Machine transitions
# ===========================================================================

_TRANSITIONS: dict[tuple[State, Action], State] = {
    (State.NEUTRAL,          Action.GREET):           State.NEUTRAL,
    (State.NEUTRAL,          Action.ASK_PREFERENCE):  State.ASKED_PREFERENCE,
    (State.NEUTRAL,          Action.RECOMMEND_FOOD):  State.RECOMMENDING,
    (State.NEUTRAL,          Action.RECOMMEND_DRINK): State.ASKED_DRINK,
    (State.ASKED_PREFERENCE, Action.RECOMMEND_FOOD):  State.RECOMMENDING,
    (State.RECOMMENDING,     Action.UPSELL_DRINK):    State.UPSELLING,
    (State.RECOMMENDING,     Action.CONFIRM_ORDER):   State.CHECKOUT,
    (State.UPSELLING,        Action.RECOMMEND_DRINK): State.ASKED_DRINK,
    (State.UPSELLING,        Action.CONFIRM_ORDER):   State.CHECKOUT,
    (State.ASKED_DRINK,      Action.RECOMMEND_DRINK): State.RECOMMENDING,
    (State.CHECKOUT,         Action.FAREWELL):        State.FAREWELL,
    (State.NEUTRAL,          Action.FAREWELL):        State.FAREWELL,
    (State.RECOMMENDING,     Action.FAREWELL):        State.FAREWELL,
}


def transition(session: SessionState, action: Action) -> State:
    current = State(session.dialogue_state)
    new_state = _TRANSITIONS.get((current, action), current)
    session.dialogue_state = new_state.value
    return new_state


# ===========================================================================
# Clarification question generator
# ===========================================================================

CLARIFICATION_QUESTIONS = {
    "dietary": [
        "Just so I can find you the perfect dish — any dietary restrictions I should know about?",
        "Any allergies or preferences? Vegan, gluten-free, halal?",
        "Are you vegetarian, vegan, or is everything on the table?",
    ],
    "price": [
        "What kind of budget are you thinking — light bites or a full feast?",
        "Are you looking for something affordable or going all out tonight?",
        "Budget in mind, or shall I show you our premium options?",
    ],
    "food_type": [
        "What flavors are you craving — seafood, meat, or something plant-based?",
        "Are you in the mood for something light or hearty?",
        "Do you prefer meat, seafood, or vegetarian dishes?",
    ],
    "drink": [
        "Something with alcohol or would you prefer a non-alcoholic option?",
        "Wine, beer, cocktail, or something soft?",
        "Shall I suggest a wine pairing or a refreshing non-alcoholic drink?",
    ],
}


def get_clarification(topic: str) -> str:
    return random.choice(CLARIFICATION_QUESTIONS.get(topic, CLARIFICATION_QUESTIONS["food_type"]))


# ===========================================================================
# Dialogue Manager (orchestrator)
# ===========================================================================

class DialogueManager:
    def __init__(self):
        self._policy = DialoguePolicy()

    def process(
        self,
        session:    SessionState,
        intent:     str,
        confidence: float,
        entities,
        multi_intents: list[str] = None,
    ) -> tuple[Action, State]:
        session.turn_count += 1
        action = self._policy.decide(session, intent, confidence, entities, multi_intents)
        new_state = transition(session, action)
        return action, new_state


_manager: Optional[DialogueManager] = None


def get_dialogue_manager() -> DialogueManager:
    global _manager
    if _manager is None:
        _manager = DialogueManager()
    return _manager