"""
Greek Response Templates
========================
Drop-in replacement pools for response_generator.py when
detected language is "el".

Import in response_generator.py:
    from dialogue.greek_templates import get_pool
    pool = get_pool(pool_name, lang)   # lang = "en" | "el"
"""

from __future__ import annotations
import random


# ---------------------------------------------------------------------------
# Template pools  (English / Greek pairs)
# ---------------------------------------------------------------------------

TEMPLATES: dict[str, dict[str, list[str]]] = {

    "greet": {
        "en": [
            "Yassas! 🇬🇷 Welcome to Mythos, my friend! What brings you in today?",
            "Kalimera! The kitchen is buzzing. First time here or are you a regular?",
            "Opa! Welcome! I'm Josh, your guide to the best Greek food in town. What are you in the mood for?",
            "Hey there! Ready for a real Greek feast? What sounds good to you?",
        ],
        "el": [
            "Γεια σας! 🇬🇷 Καλωσήρθατε στο Mythos, φίλε μου! Τι σας φέρνει σήμερα;",
            "Καλημέρα! Η κουζίνα είναι σε εγρήγορση. Πρώτη φορά ή είστε τακτικός επισκέπτης;",
            "Ωπα! Καλωσήρθατε! Είμαι ο Josh, ο οδηγός σας για το καλύτερο ελληνικό φαγητό! Τι σας αρέσει;",
            "Χαίρετε! Έτοιμοι για ένα αυθεντικό ελληνικό γεύμα; Τι σας ακούγεται καλό;",
        ],
    },

    "ask_preference": {
        "en": [
            "What flavors are calling you today? Something light and fresh, or rich and hearty?",
            "Are you a seafood person, a meat lover, or do you prefer something plant-based?",
            "Any dietary preferences? Vegetarian, gluten-free, no dairy?",
            "How hungry are you — small plates to share, or a full main course?",
        ],
        "el": [
            "Τι γεύσεις σας τραβάνε σήμερα; Κάτι ελαφρύ και φρέσκο, ή πλούσιο και χορταστικό;",
            "Προτιμάτε θαλασσινά, κρέας ή κάτι φυτικό;",
            "Έχετε διατροφικές προτιμήσεις; Χορτοφαγικό, χωρίς γλουτένη, χωρίς γαλακτοκομικά;",
            "Πόσο πεινασμένοι είστε — μικρά πιάτα για μοίρασμα ή κυρίως πιάτο;",
        ],
    },

    "confirm": {
        "en": [
            "Excellent choice, my friend! You have *impeccable* taste. 👌",
            "Polígala! Now we're talking!",
            "Perfect! The chef will be delighted!",
            "Bravo! That's one of our best — you won't regret it!",
            "OPA! That's what I'm talking about! 🎉",
        ],
        "el": [
            "Εξαιρετική επιλογή, φίλε μου! Έχετε *άψογο* γούστο! 👌",
            "Πολύ καλά! Τώρα μιλάμε!",
            "Τέλεια! Ο σεφ θα χαρεί πολύ!",
            "Μπράβο! Αυτό είναι ένα από τα καλύτερά μας — δεν θα το μετανιώσετε!",
            "ΩΠΑ! Αυτό ήθελα να ακούσω! 🎉",
        ],
    },

    "upsell": {
        "en": [
            "Now — can I make this even better? The right drink makes ALL the difference!",
            "Shall we find the perfect drink to go with this?",
            "Can I tempt you with something to drink alongside this?",
            "You know what would take this to the next level? The right pairing!",
        ],
        "el": [
            "Τώρα — μπορώ να το κάνω ακόμα καλύτερο; Το σωστό ποτό κάνει ΟΛΗ τη διαφορά!",
            "Να βρούμε το τέλειο ποτό για αυτό το πιάτο;",
            "Μπορώ να σας προτείνω κάτι για να πιείτε μαζί;",
            "Ξέρετε τι θα ανεβάσει αυτό στο επόμενο επίπεδο; Ο σωστός συνδυασμός!",
        ],
    },

    "farewell": {
        "en": [
            "Antío! Come back soon — we'll have something new waiting for you! 🇬🇷",
            "Yassas! It was a pleasure. Enjoy your meal, my friend!",
            "Efcharistó! Thanks for dining with us. Until next time!",
            "Take care! You're always welcome back at Mythos. 🫒",
        ],
        "el": [
            "Αντίο! Ελάτε ξανά σύντομα — θα έχουμε κάτι νέο για σας! 🇬🇷",
            "Γεια σας! Ήταν χαρά μου. Καλή σας όρεξη, φίλε μου!",
            "Ευχαριστώ! Χαρήκαμε που ήρθατε. Μέχρι την επόμενη φορά!",
            "Να προσέχετε! Είστε πάντα ευπρόσδεκτοι στο Mythos. 🫒",
        ],
    },

    "complaint": {
        "en": [
            "I'm so sorry to hear that! Let me fix this right away — what can I do?",
            "Oh no, that's not good at all! We'll sort this out immediately.",
            "I sincerely apologize! We'll make this right.",
        ],
        "el": [
            "Λυπάμαι πολύ που το ακούω! Θα το διορθώσω αμέσως — τι μπορώ να κάνω;",
            "Ω όχι, αυτό δεν είναι καθόλου καλό! Θα το τακτοποιήσουμε άμεσα.",
            "Ζητώ ειλικρινά συγγνώμη! Θα το φτιάξουμε.",
        ],
    },

    "no_results": {
        "en": [
            "Hmm, I couldn't find an exact match — let me surprise you with something similar!",
            "That's a tough one, but let me show you something you might love even more.",
            "We might not have exactly that, but I have something close that might win you over!",
        ],
        "el": [
            "Χμ, δεν βρήκα ακριβή αντιστοιχία — αφήστε με να σας εκπλήξω με κάτι παρόμοιο!",
            "Δύσκολο, αλλά αφήστε με να σας δείξω κάτι που μπορεί να σας αρέσει ακόμα περισσότερο.",
            "Μπορεί να μην έχουμε ακριβώς αυτό, αλλά έχω κάτι κοντινό που θα σας κερδίσει!",
        ],
    },

    "small_talk": {
        "en": [
            "I'm Josh, your friendly Greek guide! I know every dish on this menu. 😄",
            "I'm doing wonderfully, thank you! Even better now that you're here. Ready to eat?",
            "Ha! I love chatting, but my real skill is finding you the *perfect* dish. Try me!",
        ],
        "el": [
            "Είμαι ο Josh, ο φιλικός σας ελληνικός οδηγός! Ξέρω κάθε πιάτο σε αυτό το μενού. 😄",
            "Πολύ καλά, ευχαριστώ! Ακόμα καλύτερα τώρα που είστε εδώ. Έτοιμοι να φάτε;",
            "Χα! Μου αρέσει η κουβέντα, αλλά η πραγματική μου δεξιότητα είναι να βρίσκω το *τέλειο* πιάτο!",
        ],
    },

    "fallback": {
        "en": [
            "That's a great question! Ask me about our menu and I'll shine! 😊",
            "Hmm, I'm not sure about that one — but I *am* sure I can find you something delicious. Shall we?",
            "I'll note that for next time! Meanwhile — hungry? 😋",
        ],
        "el": [
            "Ωραία ερώτηση! Ρωτήστε με για το μενού μας και θα λάμψω! 😊",
            "Χμ, δεν είμαι σίγουρος γι' αυτό — αλλά είμαι σίγουρος ότι μπορώ να σας βρω κάτι νόστιμο!",
            "Θα το σημειώσω για την επόμενη φορά! Εν τω μεταξύ — πεινάτε; 😋",
        ],
    },

    "allergen_ack": {
        "en": [
            "Got it! I'll make sure none of that ends up on your plate.",
            "Absolutely — no {items} for you. You're safe with me!",
            "Smart thinking! I'll steer clear of {items} in everything I suggest.",
        ],
        "el": [
            "Κατάλαβα! Θα βεβαιωθώ ότι τίποτα από αυτό δεν θα καταλήξει στο πιάτο σας.",
            "Σίγουρα — καθόλου {items} για σας. Είστε ασφαλείς μαζί μου!",
            "Έξυπνη σκέψη! Θα αποφύγω {items} σε όλες τις προτάσεις μου.",
        ],
    },

    "wine_starters": {
        "en": [
            "Now listen — with this dish, you absolutely need",
            "The perfect pairing?",
            "Here's the secret weapon:",
            "I'm telling you, pair this with",
        ],
        "el": [
            "Ακούστε τώρα — με αυτό το πιάτο, απολύτως χρειάζεστε",
            "Ο τέλειος συνδυασμός;",
            "Ιδού η μυστική κίνηση:",
            "Σας λέω, συνδυάστε το με",
        ],
    },

    "present_starters": {
        "en": [
            "You know what's calling your name?",
            "I've got something special for you:",
            "Trust me on this one —",
            "Let me tell you about",
            "Here's exactly what you need:",
        ],
        "el": [
            "Ξέρετε τι σας καλεί;",
            "Έχω κάτι ιδιαίτερο για σας:",
            "Εμπιστευτείτε με σε αυτό —",
            "Αφήστε με να σας πω για",
            "Αυτό ακριβώς χρειάζεστε:",
        ],
    },

    "present_followups": {
        "en": [
            "How does that sound?",
            "Want me to add it, or shall I tell you more?",
            "Does that appeal to you?",
            "Trust me — it's *chef's kiss*. Interested?",
            "Tempting, right?",
        ],
        "el": [
            "Πώς σας φαίνεται;",
            "Να το προσθέσω, ή να σας πω περισσότερα;",
            "Σας αρέσει αυτό;",
            "Εμπιστευτείτε με — είναι *τέλειο*. Ενδιαφέρεστε;",
            "Δελεαστικό, έτσι δεν είναι;",
        ],
    },
}


def get_pool(pool_name: str, lang: str = "en") -> list[str]:
    """Return the template pool for pool_name in the given language."""
    lang = lang if lang in ("en", "el") else "en"
    return TEMPLATES.get(pool_name, {}).get(lang, TEMPLATES.get(pool_name, {}).get("en", []))


def pick(pool_name: str, lang: str = "en", **kwargs) -> str:
    """Pick a random template, applying .format(**kwargs) if needed."""
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
