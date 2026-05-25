"""
Premium grillhouse response templates.

The filename is kept for compatibility with the existing imports, but the
template content now reflects the Trump Prime Grillhouse experience.
"""

from __future__ import annotations
import random


def _same(lines: list[str]) -> dict[str, list[str]]:
    return {"en": lines, "el": lines}


TEMPLATES: dict[str, dict[str, list[str]]] = {
    "greet": _same([
        "Welcome to Trump Prime Grillhouse. Are you here for the butchery, the menu, or the cellar?",
        "Good evening. The grill is ready, the cellar is open, and I can guide you through both.",
        "Welcome. Tell me what kind of night you want: bold steak, lighter grillhouse dining, or drinks first?",
        "Glad you are here. I can help with premium cuts, signature plates, wines or cocktails.",
    ]),
    "ask_preference": _same([
        "What flavours are calling you today: rich and smoky, light from the grill, or cellar-led?",
        "Are you thinking steak, seafood, something lighter, or a drink pairing first?",
        "Any dietary preferences I should know about? Vegetarian, gluten-free, no dairy?",
        "How hungry are you: a small plate to share, a full grillhouse main, or something for the table?",
    ]),
    "confirm": _same([
        "Excellent choice. You have impeccable taste.",
        "Perfect. The grill team will be pleased with that one.",
        "That is one of our strongest plates.",
        "A proper grillhouse choice.",
    ]),
    "upsell": _same([
        "Shall we find the right wine or cocktail to sit beside it?",
        "The right drink will lift that plate beautifully. Want my suggestion?",
        "I can pair that with something from the cellar if you like.",
        "Would you like a side or drink that makes the plate feel complete?",
    ]),
    "farewell": _same([
        "It was a pleasure. Enjoy your meal.",
        "Thanks for dining with us. Until next time.",
        "Come back soon. The butcher's block and cellar will have something new waiting.",
        "Take care. You are always welcome back at Trump Prime Grillhouse.",
    ]),
    "complaint": _same([
        "I am sorry to hear that. Let me help fix it right away.",
        "That is not the experience we want. Tell me what happened and I will help.",
        "I sincerely apologize. We will make this right.",
    ]),
    "no_results": _same([
        "I could not find an exact match, but I can show you something close.",
        "That is a specific request. Let me suggest the nearest fit from the menu.",
        "We may not have exactly that, but I have a strong alternative.",
    ]),
    "small_talk": _same([
        "I am Josh, your grillhouse concierge. I know the cuts, sauces and cellar pairings.",
        "I am doing well, thank you. Even better now that the grill is moving.",
        "I love chatting, but my real skill is finding you the right plate. Try me.",
    ]),
    "fallback": _same([
        "Ask me about the menu, butchery, wines or cocktails and I will help.",
        "I am not certain on that one, but I can absolutely guide your order.",
        "I will note that. Meanwhile, shall we find you something from the grill?",
    ]),
    "allergen_ack": _same([
        "Got it. I will steer clear of {items} in anything I suggest.",
        "Absolutely. No {items} for you.",
        "Smart to mention it. I will keep {items} out of my recommendations.",
    ]),
    "wine_starters": _same([
        "From the cellar, I would point you toward",
        "The pairing I like here is",
        "The polished match for this plate is",
        "If you want the best pairing, choose",
    ]),
    "present_starters": _same([
        "I would look at",
        "A strong choice is",
        "The one I would recommend is",
        "Let me point you toward",
        "For this kind of mood, go with",
    ]),
    "present_followups": _same([
        "How does that sound?",
        "Would you like to add it, or hear more?",
        "Does that feel right for the table?",
        "Interested?",
        "Tempting, right?",
    ]),
}


def get_pool(pool_name: str, lang: str = "en") -> list[str]:
    lang = lang if lang in ("en", "el") else "en"
    return TEMPLATES.get(pool_name, {}).get(lang, TEMPLATES.get(pool_name, {}).get("en", []))


def pick(pool_name: str, lang: str = "en", **kwargs) -> str:
    pool = get_pool(pool_name, lang)
    if not pool:
        return ""
    choice = random.choice(pool)
    if kwargs:
        try:
            choice = choice.format(**kwargs)
        except KeyError:
            pass
    return choice
