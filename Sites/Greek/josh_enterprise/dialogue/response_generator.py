"""
Response Generator — Greek Waiter Personality
==============================================
Produces natural, varied responses for each dialogue Action.
Context-aware: references past items, adapts to dietary needs.
"""

from __future__ import annotations

import random
from typing import Optional

from dialogue.dialogue_manager import Action, get_clarification
from dialogue.greek_templates import pick as tpick, get_pool
from memory.memory_system import SessionState


# ===========================================================================
# Template pools
# ===========================================================================

GREET_POOL = [
    "Yassas! 🇬🇷 Welcome to Mythos, my friend! What brings you in today?",
    "Kalimera! The kitchen is buzzing. First time here or are you a regular?",
    "Opa! Welcome, welcome! I'm Josh, your guide to the best Greek food in town. What are you in the mood for?",
    "Hey there! Ready for a real Greek feast? What sounds good to you?",
    "Efharisto for stopping by! How can I make your evening unforgettable?",
]

ASK_PREFERENCE_POOL = [
    "What flavors are calling you today? Something light and fresh, or rich and hearty?",
    "Tell me — are you a seafood person, a meat lover, or do you prefer something plant-based?",
    "How hungry are you? Small plates to share, or a full main course?",
    "Any dietary preferences I should know about? Vegetarian, gluten-free, no dairy?",
    "First time trying Greek food or are you already a fan? I'll tailor my suggestions!",
]

CONFIRM_POOL = [
    "Excellent choice, my friend! You have *impeccable* taste.",
    "Polígala! Now we're talking!",
    "Perfect! The chef will be delighted! 👌",
    "Bravo! That's one of our best. You won't regret it.",
    "OPA! That's what I'm talking about!",
]

UPSELL_POOL = [
    "Now — can I make this even better? The right drink makes ALL the difference with this dish!",
    "Shall we find the perfect drink to go with this? I promise it'll elevate the whole experience.",
    "You know what would take this to the next level? The right pairing. Want my suggestion?",
    "Can I tempt you with something to drink alongside this? I have the *perfect* match in mind.",
]

FAREWELL_POOL = [
    "Antío! Come back soon — we'll have something new waiting for you! 🇬🇷",
    "Yassas! It was a pleasure. Enjoy your meal, my friend!",
    "Efcharistó! Thanks for dining with us. Until next time!",
    "Take care! You're always welcome back at Mythos. 🫒",
]

COMPLAINT_POOL = [
    "I'm so sorry to hear that! Let me fix this right away — what can I do to make it right?",
    "Oh no, that's not good at all! We'll sort this out immediately. What happened?",
    "I sincerely apologize! Please let me speak to the kitchen and we'll make this right.",
]

SMALL_TALK_POOL = [
    "I'm Josh, your friendly Greek guide! I know every dish on this menu like the back of my hand. 😄",
    "I'm doing wonderfully, thank you! Even better now that you're here. Ready to eat?",
    "Ha! I love chatting, but my real skill is finding you the *perfect* dish. Try me!",
]

FALLBACK_POOL = [
    "That's a great question! Let me think… You know what, ask me about our menu and I'll shine! 😊",
    "Hmm, I'm not sure about that one — but I *am* sure I can find you something delicious. Shall we?",
    "I'll note that and get a better answer next time! Meanwhile — hungry? 😋",
]

ALLERGEN_ACK_POOL = [
    "Got it! I'll make sure none of that ends up on your plate.",
    "Absolutely — no {items} for you. You're safe with me!",
    "Smart thinking! I'll steer clear of {items} in everything I suggest.",
    "No problem at all! Zero {items} from here on out.",
]

NO_RESULTS_POOL = [
    "Hmm, I couldn't find an exact match — let me surprise you with something similar!",
    "That's a tough one, but let me show you something you might love even more.",
    "We might not have exactly that, but I have something close that might win you over!",
]


# ===========================================================================
# Item presentation
# ===========================================================================

PRESENT_STARTERS = [
    "You know what's calling your name?",
    "I've got something special for you:",
    "Trust me on this one —",
    "Picture this:",
    "Let me tell you about",
    "Here's exactly what you need:",
]

PRESENT_FOLLOW_UPS = [
    "How does that sound?",
    "Want me to add it, or shall I tell you more?",
    "Does that appeal to you?",
    "Trust me — it's *chef's kiss*. Interested?",
    "Tempting, right?",
]

WINE_STARTERS = [
    "Now listen — with this dish, you absolutely need",
    "The perfect pairing?",
    "Here's the secret weapon:",
    "I'm telling you, pair this with",
    "The magic combination:",
]


# ===========================================================================
# Response Generator class
# ===========================================================================

class ResponseGenerator:

    # ---- public entry point -----------------------------------------------

    def generate(
        self,
        action:   Action,
        session:  SessionState,
        items:    Optional[list[dict]] = None,   # recommended items
        wine:     Optional[dict]       = None,   # wine suggestion
        excluded: Optional[list[str]]  = None,
        context:  Optional[dict]       = None,   # extra info
        lang:     str                  = "en",   # "en" | "el"
    ) -> str:
        ctx = context or {}
        items = items or []
        excluded = excluded or []
        self._lang = lang   # store for sub-methods

        handlers = {
            Action.GREET:            self._greet,
            Action.ASK_PREFERENCE:   self._ask_preference,
            Action.RECOMMEND_FOOD:   self._recommend_food,
            Action.RECOMMEND_DRINK:  self._recommend_drink,
            Action.UPSELL_DRINK:     self._upsell_drink,
            Action.CONFIRM_ORDER:    self._confirm_order,
            Action.CLARIFY_DIETARY:  lambda **k: get_clarification("dietary"),
            Action.CLARIFY_PRICE:    lambda **k: get_clarification("price"),
            Action.SHOW_SPECIALS:    self._show_specials,
            Action.HANDLE_COMPLAINT: lambda **k: tpick("complaint", lang),
            Action.FAREWELL:         lambda **k: tpick("farewell", lang),
            Action.SMALL_TALK:       lambda **k: tpick("small_talk", lang),
            Action.LOG_UNKNOWN:      lambda **k: tpick("fallback", lang),
            Action.LEARNED_ANSWER:   lambda **k: ctx.get("answer", ""),
        }

        handler = handlers.get(action, lambda **k: random.choice(FALLBACK_POOL))
        return handler(session=session, items=items, wine=wine, excluded=excluded, ctx=ctx)

    # ---- handlers ---------------------------------------------------------

    def _greet(self, session, **_) -> str:
        lang = getattr(self, "_lang", "en")
        g = tpick("greet", lang)
        if session.turn_count <= 1:
            g += f"\n\n{tpick('ask_preference', lang)}"
        return g

    def _ask_preference(self, **_) -> str:
        return tpick("ask_preference", getattr(self, "_lang", "en"))

    def _recommend_food(self, session, items, wine, excluded, ctx, **_) -> str:
        if not items:
            return random.choice(NO_RESULTS_POOL)

        if len(items) == 1:
            return self._present_single(items[0], session, wine, excluded)
        else:
            return self._present_list(items, session)

    def _present_single(self, item: dict, session: SessionState, wine: Optional[dict], excluded: list) -> str:
        lang  = getattr(self, "_lang", "en")
        name  = item.get("name", "?")
        desc  = item.get("description", "")
        price = item.get("price", "?")
        allergens = item.get("allergens", "")
        explanation = item.get("_explanation", "")

        starter = tpick("present_starters", lang)
        follow  = tpick("present_followups", lang)

        reply = f"{starter} **{name}**.\n\n{desc}\n\n💰 **R{price}**"

        if allergens and allergens.lower() not in ("none", "n/a", ""):
            label = "Περιέχει" if lang == "el" else "Contains"
            reply += f"\n\n⚠️ *{label}:* {allergens}"

        if explanation:
            why = "Γιατί αυτό" if lang == "el" else "Why this"
            reply += f"\n\n💡 *{why}?* {explanation.capitalize()}."

        if follow:
            reply += f"\n\n{follow}"

        if wine and not session.no_alcohol:
            wname  = wine.get("name", "")
            reason = wine.get("reason", "")
            wine_start = tpick("wine_starters", lang)
            reply += f"\n\n🍷 {wine_start} **{wname}** — {reason}"

        session.add_to_history(item)
        session.last_food = item
        return reply

    def _present_list(self, items: list[dict], session: SessionState) -> str:
        reply = "Here are some great options for you:\n"
        for i, item in enumerate(items[:4], 1):
            name  = item.get("name", "?")
            price = item.get("price", "?")
            desc  = item.get("description", "")
            short = desc[:80] + "…" if len(desc) > 80 else desc
            reply += f"\n**{i}. {name}** — R{price}\n   _{short}_"
        reply += "\n\nWhich of these speaks to you? Or tell me more about what you're after!"
        for item in items:
            session.add_to_history(item)
        return reply

    def _recommend_drink(self, session, items, wine, ctx, **_) -> str:
        if not items:
            return "I'd love to suggest a drink! What are you in the mood for — wine, beer, or something soft?"

        item  = items[0]
        name  = item.get("name", "?")
        price = item.get("price", "?")
        desc  = item.get("description", "")

        reply = f"Perfect choice! Let me pour you a **{name}** (R{price}).\n\n_{desc}_"

        if session.no_alcohol and any(w in name.lower() for w in ["wine","beer","lager","ale","cocktail","ouzo"]):
            return "Since you prefer non-alcoholic, how about a refreshing Frappe or fresh juice instead?"

        session.last_drink = item
        return reply

    def _upsell_drink(self, session, **_) -> str:
        if session.upsell_offered:
            return ""
        session.upsell_offered = True
        return tpick("upsell", getattr(self, "_lang", "en"))

    def _confirm_order(self, session, items, ctx, **_) -> str:
        lang = getattr(self, "_lang", "en")
        if not session.history:
            return "Τι θέλετε να προσθέσετε;" if lang == "el" else "What would you like to add to your order?"

        item = session.history[0]
        name = item.get("name", "your selection")
        conf = tpick("confirm", lang)
        added = "προστέθηκε στην παραγγελία σας" if lang == "el" else "has been added to your order"
        reply = f"{conf} **{name}** {added}! 🎉"

        if session.cart:
            total = sum(i.get("price", 0) for i in session.cart)
            label = "Σύνολο καλαθιού μέχρι τώρα" if lang == "el" else "Cart total so far"
            reply += f"\n\n🛒 *{label}: R{total}*"

        session.add_to_cart(item)
        return reply

    def _show_specials(self, session, items, **_) -> str:
        if not items:
            return "We're prepping today's specials — let me show you our all-time favourites instead!"
        reply = "🌟 **Today's Specials** — straight from the kitchen:\n"
        for i, item in enumerate(items[:4], 1):
            name  = item.get("name", "?")
            price = item.get("price", "?")
            desc  = item.get("description", "")[:90]
            reply += f"\n**{i}. {name}** — R{price}\n   _{desc}_"
        reply += "\n\nThese are flying off the pass today. Which one calls to you?"
        return reply

    def allergen_ack(self, excluded: list[str], lang: str = "en") -> str:
        items_str = ", ".join(excluded)
        return tpick("allergen_ack", lang, items=items_str)

    def dietary_filter_response(self, excluded: list[str], items: list[dict], session: SessionState, lang: str = "en") -> str:
        ack = self.allergen_ack(excluded, lang)
        if items:
            sep = "\n\nΜε αυτό το μυαλό, ορίστε κάτι τέλειο για σας:\n" if lang == "el" else "\n\nWith that in mind, here's something perfect for you:\n"
            ack += sep
            ack += self._present_single(items[0], session, None, excluded)
        else:
            follow = "\n\nΘα βεβαιωθώ ότι κάθε πρότασή μου είναι ασφαλής για σας. Τι σας ακούγεται καλό;" if lang == "el" \
                     else "\n\nI'll make sure every suggestion I make is safe for you. What sounds good?"
            ack += follow
        return ack


# Singleton
_generator: Optional[ResponseGenerator] = None

def get_response_generator() -> ResponseGenerator:
    global _generator
    if _generator is None:
        _generator = ResponseGenerator()
    return _generator
