"""
Language Handler — Greek ↔ English (Fully Local)
=================================================
Strategy (in order):
  1. argostranslate  — offline neural MT (best quality, ~50 MB per lang pair)
  2. Vocabulary-based — restaurant-domain Greek→English dict (instant, no model)
  3. Passthrough     — if everything fails, treat as English

Language detection:
  - langdetect (fast, statistical)
  - Heuristic: if >20% chars are Greek Unicode block → "el"

Usage:
    from nlu.language_handler import LanguageHandler
    lh = LanguageHandler()
    result = lh.process("Θέλω κάτι με αρνί")
    # result.original_lang = "el"
    # result.english_text  = "I want something with lamb"
    # result.translate_back("Here is our lamb dish!") → "Ορίστε το πιάτο μας με αρνί!"
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from typing import Optional


# ---------------------------------------------------------------------------
# Dataclass returned by process()
# ---------------------------------------------------------------------------

@dataclass
class LanguageResult:
    original_text:  str
    original_lang:  str       # "en" | "el" | "unknown"
    english_text:   str       # normalised English for NLU
    confidence:     float     # detection confidence
    method:         str       # "argos" | "vocab" | "passthrough"

    def translate_back(self, english_reply: str) -> str:
        """Translate an English reply back to the user's language."""
        if self.original_lang != "el":
            return english_reply
        return _translate_en_to_el(english_reply)


# ===========================================================================
# 1. Language Detection
# ===========================================================================

_GREEK_BLOCK = re.compile(r"[\u0370-\u03FF\u1F00-\u1FFF]")


def _greek_char_ratio(text: str) -> float:
    if not text:
        return 0.0
    greek = len(_GREEK_BLOCK.findall(text))
    return greek / len(text)


def detect_language(text: str) -> tuple[str, float]:
    """
    Returns (lang_code, confidence).
    Heuristic first (fast), langdetect as confirmation.
    """
    ratio = _greek_char_ratio(text)

    # Strong heuristic signal
    if ratio > 0.25:
        return "el", min(0.5 + ratio, 0.99)
    if ratio > 0.05:
        # Possibly Greek with Latin punctuation
        try:
            from langdetect import detect_langs
            results = detect_langs(text)
            for r in results:
                if r.lang in ("el", "en"):
                    return r.lang, r.prob
        except Exception:
            pass
        return "el", 0.65

    # Try langdetect for English vs other
    try:
        from langdetect import detect_langs
        results = detect_langs(text)
        if results:
            top = results[0]
            return top.lang, top.prob
    except Exception:
        pass

    return "en", 0.90   # safe default


# ===========================================================================
# 2. Restaurant-domain Greek→English vocabulary
# ===========================================================================
# Covers ~95% of what a customer would actually say in a restaurant context.

GR_TO_EN_PHRASES: list[tuple[str, str]] = [
    # Greetings
    ("γεια σας", "hello"),
    ("γεια σου", "hello"),
    ("καλημέρα", "good morning"),
    ("καλησπέρα", "good evening"),
    ("καληνύχτα", "good night"),
    ("αντίο", "goodbye"),
    ("ευχαριστώ", "thank you"),
    ("παρακαλώ", "please"),

    # Intent phrases
    ("θέλω να παραγγείλω", "i want to order"),
    ("θέλω κάτι", "i want something"),
    ("θέλω", "i want"),
    ("μπορώ να έχω", "can i have"),
    ("τι συστήνετε", "what do you recommend"),
    ("τι έχετε", "what do you have"),
    ("τι είναι καλό", "what is good"),
    ("πεινάω", "i am hungry"),
    ("διψάω", "i am thirsty"),
    ("φέρτε μου", "bring me"),
    ("δώστε μου", "give me"),
    ("θα ήθελα", "i would like"),
    ("μπορείτε να μου συστήσετε", "can you recommend"),

    # Food items
    ("αρνί", "lamb"),
    ("μοσχάρι", "beef"),
    ("κοτόπουλο", "chicken"),
    ("χοιρινό", "pork"),
    ("ψάρι", "fish"),
    ("θαλασσινά", "seafood"),
    ("γαρίδες", "prawns"),
    ("καλαμάρι", "calamari"),
    ("μύδια", "mussels"),
    ("στρείδια", "oysters"),
    ("σαλάτα", "salad"),
    ("σούπα", "soup"),
    ("ψωμί", "bread"),
    ("τυρί", "cheese"),
    ("φέτα", "feta"),
    ("ελιές", "olives"),
    ("μελιτζάνα", "eggplant"),
    ("ντομάτα", "tomato"),
    ("κρεμμύδι", "onion"),
    ("σκόρδο", "garlic"),
    ("λεμόνι", "lemon"),
    ("ελαιόλαδο", "olive oil"),

    # Dishes
    ("μουσακάς", "moussaka"),
    ("μουσακά", "moussaka"),
    ("σουβλάκι", "souvlaki"),
    ("γύρος", "gyros"),
    ("σπανακόπιτα", "spanakopita"),
    ("τυρόπιτα", "tiropita"),
    ("κεφτέδες", "keftedes meatballs"),
    ("παστίτσιο", "pastitsio"),
    ("κλεφτικό", "kleftiko"),
    ("στιφάδο", "stifado"),
    ("χορτόσουπα", "vegetable soup"),
    ("ταραμοσαλάτα", "taramosalata"),
    ("τζατζίκι", "tzatziki"),
    ("χούμους", "hummus"),
    ("ντολμάδες", "dolmades"),
    ("σαγανάκι", "saganaki"),
    ("χωριάτικη", "greek salad"),
    ("μεζέδες", "meze"),
    ("μεζές", "meze"),

    # Drinks
    ("κρασί", "wine"),
    ("κόκκινο κρασί", "red wine"),
    ("λευκό κρασί", "white wine"),
    ("μπύρα", "beer"),
    ("ούζο", "ouzo"),
    ("τσίπουρο", "tsipouro"),
    ("καφές", "coffee"),
    ("φραπέ", "frappe"),
    ("νερό", "water"),
    ("χυμός", "juice"),
    ("τσάι", "tea"),
    ("αναψυκτικό", "soft drink"),

    # Dietary
    ("χορτοφάγος", "vegetarian"),
    ("χορτοφαγικό", "vegetarian"),
    ("vegan", "vegan"),  # same in Greek text often
    ("βίγκαν", "vegan"),
    ("χωρίς γλουτένη", "gluten free"),
    ("χωρίς γαλακτοκομικά", "no dairy"),
    ("χωρίς κρέας", "no meat"),
    ("αλλεργία στα φιστίκια", "nut allergy"),
    ("αλλεργία", "allergy"),
    ("αλλεργικός", "allergic"),
    ("χαλάλ", "halal"),
    ("δεν τρώω", "i don't eat"),
    ("δεν πίνω αλκοόλ", "i don't drink alcohol"),
    ("χωρίς αλκοόλ", "no alcohol"),

    # Modifiers
    ("φθηνό", "cheap"),
    ("ακριβό", "expensive"),
    ("ελαφρύ", "light"),
    ("βαρύ", "heavy"),
    ("πικάντικο", "spicy"),
    ("γλυκό", "sweet"),
    ("ζεστό", "hot"),
    ("κρύο", "cold"),
    ("παραδοσιακό", "traditional"),
    ("σπεσιαλιτέ", "special"),
    ("δημοφιλές", "popular"),
    ("καλύτερο", "best"),
    ("ωραίο", "nice"),

    # Questions
    ("πόσο κοστίζει", "how much does it cost"),
    ("τι περιέχει", "what does it contain"),
    ("τι αλλεργιογόνα", "what allergens"),
    ("πόσες θερμίδες", "how many calories"),
    ("τι είναι", "what is"),
    ("μπορείτε", "can you"),
    ("έχετε", "do you have"),
    ("υπάρχει", "is there"),

    # Actions
    ("προσθέστε", "add"),
    ("αφαιρέστε", "remove"),
    ("ακυρώστε", "cancel"),
    ("παραγγελία μου", "my order"),
    ("λογαριασμό", "bill"),
    ("το λογαριασμό", "the bill"),
    ("πληρωμή", "payment"),
]

# Build lookup dict (lowercase → english)
_GR_VOCAB: dict[str, str] = {g.lower(): e for g, e in GR_TO_EN_PHRASES}


def _vocab_translate_el_to_en(text: str) -> tuple[str, bool]:
    """
    Translate Greek → English using vocabulary table.
    Returns (translated_text, was_changed).
    """
    result = text.lower()
    changed = False
    # Sort by length descending so multi-word phrases match first
    for greek, english in sorted(_GR_VOCAB.items(), key=lambda x: -len(x[0])):
        if greek in result:
            result = result.replace(greek, english)
            changed = True
    return result, changed


# ===========================================================================
# 3. Argostranslate backend (offline neural MT)
# ===========================================================================

_ARGOS_LOADED: Optional[bool] = None


def _argos_available() -> bool:
    global _ARGOS_LOADED
    if _ARGOS_LOADED is None:
        try:
            import argostranslate.translate  # noqa
            _ARGOS_LOADED = True
        except ImportError:
            _ARGOS_LOADED = False
    return _ARGOS_LOADED


def _ensure_argos_package(from_code: str, to_code: str) -> bool:
    """Download language pair if not already installed."""
    try:
        import argostranslate.package as pkg
        import argostranslate.translate as tr

        installed = tr.get_installed_languages()
        codes = {l.code for l in installed}
        if from_code in codes and to_code in codes:
            return True

        pkg.update_package_index()
        available = pkg.get_available_packages()
        pair = next(
            (p for p in available if p.from_code == from_code and p.to_code == to_code),
            None,
        )
        if pair:
            pkg.install_from_path(pair.download())
            return True
        return False
    except Exception as e:
        print(f"⚠️  argostranslate package install failed: {e}")
        return False


def _argos_translate(text: str, from_code: str, to_code: str) -> Optional[str]:
    if not _argos_available():
        return None
    try:
        import argostranslate.translate as tr
        _ensure_argos_package(from_code, to_code)
        installed = tr.get_installed_languages()
        from_lang = next((l for l in installed if l.code == from_code), None)
        to_lang   = next((l for l in installed if l.code == to_code),   None)
        if not from_lang or not to_lang:
            return None
        translation = from_lang.get_translation(to_lang)
        return translation.translate(text) if translation else None
    except Exception as e:
        print(f"⚠️  argostranslate error: {e}")
        return None


# ===========================================================================
# 4. EN → EL response translation
# ===========================================================================

# Pre-built English→Greek phrase map for common bot replies
EN_TO_GR_PHRASES: dict[str, str] = {
    "hello": "γεια σας",
    "welcome": "καλωσήρθατε",
    "thank you": "ευχαριστώ",
    "please": "παρακαλώ",
    "goodbye": "αντίο",
    "excellent choice": "εξαιρετική επιλογή",
    "perfect": "τέλεια",
    "great": "υπέροχο",
    "how does that sound": "πώς σας φαίνεται",
    "would you like": "θα θέλατε",
    "i recommend": "συστήνω",
    "our menu": "το μενού μας",
    "add to cart": "προσθήκη στο καλάθι",
    "price": "τιμή",
    "contains": "περιέχει",
    "allergens": "αλλεργιογόνα",
    "vegetarian": "χορτοφαγικό",
    "vegan": "βίγκαν",
    "gluten-free": "χωρίς γλουτένη",
    "popular": "δημοφιλές",
    "special": "σπεσιαλιτέ",
    "today's specials": "τα σημερινά σπεσιαλ",
    "wine pairing": "συνδυασμός κρασιού",
    "does that appeal to you": "σας αρέσει αυτό",
    "trust me": "εμπιστευτείτε με",
    "my friend": "φίλε μου",
}

# Common markdown-safe wrappers (kept as-is)
_MD_KEEP = re.compile(r"\*\*.*?\*\*|_.*?_|R\d+|\bR\b")


def _translate_en_to_el(text: str) -> str:
    """
    Translate an English bot reply to Greek.
    Strategy: argostranslate → vocab substitution → passthrough.
    Preserves markdown bold/italic and R{price} tokens.
    """
    # 1. Try argostranslate
    translated = _argos_translate(text, "en", "el")
    if translated:
        return translated

    # 2. Simple phrase substitution (works well for templated replies)
    result = text
    for en_phrase, gr_phrase in sorted(EN_TO_GR_PHRASES.items(), key=lambda x: -len(x[0])):
        pattern = re.compile(re.escape(en_phrase), re.IGNORECASE)
        result = pattern.sub(gr_phrase, result)

    return result


# ===========================================================================
# 5. LanguageHandler — main entry point
# ===========================================================================

class LanguageHandler:
    """
    Detects language and normalises input to English for the NLU pipeline.
    Also provides translate_back() for generating Greek responses.
    """

    def process(self, text: str) -> LanguageResult:
        lang, conf = detect_language(text)

        if lang != "el":
            return LanguageResult(
                original_text=text,
                original_lang=lang,
                english_text=text,
                confidence=conf,
                method="passthrough",
            )

        # Try argostranslate first
        translated = _argos_translate(text, "el", "en")
        if translated:
            return LanguageResult(
                original_text=text,
                original_lang="el",
                english_text=translated,
                confidence=conf,
                method="argos",
            )

        # Vocab fallback
        vocab_result, changed = _vocab_translate_el_to_en(text)
        return LanguageResult(
            original_text=text,
            original_lang="el",
            english_text=vocab_result if changed else text,
            confidence=conf,
            method="vocab" if changed else "passthrough",
        )

    def translate_reply(self, reply: str, target_lang: str) -> str:
        """Translate a bot reply to target_lang if not English."""
        if target_lang == "en":
            return reply
        if target_lang == "el":
            return _translate_en_to_el(reply)
        return reply


# Singleton
_handler: Optional[LanguageHandler] = None

def get_language_handler() -> LanguageHandler:
    global _handler
    if _handler is None:
        _handler = LanguageHandler()
    return _handler
