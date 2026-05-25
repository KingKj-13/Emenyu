"""
🇬🇷 JOSH 11.0 — Mythos Enterprise AI Assistant
================================================
Architecture:
  POST /chat              → full NLU → dialogue → recommendation → response
  GET  /health            → status check
  GET  /menu              → menu preview
  GET  /cart/<uid>        → user cart
  GET  /unknown-questions → admin: unanswered logs
  POST /admin/teach       → admin: teach Q&A
  POST /admin/retrain     → admin: retrain intent model
  GET  /session/<uid>     → debug session state
"""


from __future__ import annotations


import os
import sys
import datetime
import random


from flask import Flask, request, jsonify
from flask_cors import CORS


# ---------------------------------------------------------------------------
# Path setup — allow imports from project root
# ---------------------------------------------------------------------------
BASE_DIR     = os.path.dirname(os.path.abspath(__file__))   # josh_enterprise/api/
JOSH_ROOT    = os.path.dirname(BASE_DIR)                    # josh_enterprise/   ← nlu/dialogue/memory live here
PROJECT_ROOT = os.path.dirname(JOSH_ROOT)                   # Greek/             ← food/MythosMenu.json lives here

sys.path.insert(0, JOSH_ROOT)   # so 'from nlu import ...' works
os.chdir(PROJECT_ROOT)          # so 'food/MythosMenu.json' resolves


# ---------------------------------------------------------------------------
# Internal modules
# ---------------------------------------------------------------------------
from nlu                          import analyze, get_semantic_engine
from nlu.language_handler         import get_language_handler
from dialogue.dialogue_manager    import Action, get_dialogue_manager
from dialogue.response_generator  import get_response_generator
from memory.memory_system         import get_memory
from recommender.recommender_v2   import get_recommender, wine_for_item



# ===========================================================================
# App init
# ===========================================================================


app = Flask(__name__)
CORS(app)


memory      = get_memory()
dialogue    = get_dialogue_manager()
responder   = get_response_generator()
recommender = get_recommender()
lang_handler = get_language_handler()



# ===========================================================================
# Text cleaning
# ===========================================================================


_CORRECTIONS = {
    "whats": "what is", "whos": "who is", "hwo": "how",
    "dont": "do not", "wanna": "want to", "im": "i am",
    "starving": "hungry", "famished": "hungry",
    "veggie": "vegetarian", "veggies": "vegetarian",
}


def clean(text: str) -> str:
    words = text.lower().strip().split()
    return " ".join(_CORRECTIONS.get(w, w) for w in words)



# ===========================================================================
# Core chat logic
# ===========================================================================


def _uid(req) -> str:
    return req.remote_addr or "anon"



def handle_chat(raw_msg: str, uid: str) -> dict:
    """
    Full pipeline:
      1. NLU   → intent + entities
      2. Memory → session + profile + knowledge
      3. Dialogue → action + state transition
      4. Recommender → ranked items
      5. Response → natural language reply
    """
    msg = clean(raw_msg)


    # ----- language detection + normalise to English -----
    lang_result = lang_handler.process(msg)
    detected_lang = lang_result.original_lang if lang_result.original_lang in ("en", "el") else "en"
    msg = lang_result.english_text   # NLU always works on English


    # ----- memory -----
    session = memory.get_session(uid)
    profile = memory.get_profile(uid)
    combined_exclude = memory.merge_exclusions(uid)


    # ----- knowledge shortcut -----
    learned = memory.knowledge.lookup(msg)
    if learned:
        return {"reply": learned, "action": "learned_answer"}


    # ----- NLU -----
    nlu = analyze(msg)
    intent     = nlu.top_intent
    confidence = nlu.confidence
    entities   = nlu.entities
    multi      = nlu.intent.multi_intents


    # ----- apply detected dietary restrictions immediately -----
    if entities.dietary_restrictions:
        for dr in entities.dietary_restrictions:
            if dr not in session.exclude:
                session.exclude.append(dr)
        combined_exclude = memory.merge_exclusions(uid)


    # detect no-alcohol explicitly
    if any(x in msg for x in ["no alcohol", "without alcohol", "non-alcoholic", "soft drink only"]):
        session.no_alcohol = True


    # ----- dialogue policy -----
    action, new_state = dialogue.process(session, intent, confidence, entities, multi)


    # ----- item retrieval -----
    items: list[dict] = []
    wine: dict | None = None


    if action in (Action.RECOMMEND_FOOD, Action.SHOW_SPECIALS):
        query = _build_query(msg, entities, session)
        if action == Action.SHOW_SPECIALS or any(w in msg for w in ["special","specials"]):
            items = recommender.specials(exclude=combined_exclude)
        else:
            items = recommender.search(query, exclude=combined_exclude, top_k=3)
        if not items:
            items_raw = recommender.random_food(exclude=combined_exclude)
            items = [items_raw] if items_raw else []
        if items:
            wine = wine_for_item(items[0]) if not session.no_alcohol else None


    elif action in (Action.RECOMMEND_DRINK, Action.UPSELL_DRINK):
        drink_q = " ".join(entities.drink_types) or "drink"
        items = recommender.search(drink_q, exclude=combined_exclude, top_k=2)
        if not items:
            d = recommender.random_drink(exclude=combined_exclude)
            items = [d] if d else []


    elif action == Action.CONFIRM_ORDER:
        if session.history:
            chosen = session.history[0]
            session.add_to_cart(chosen)
            profile.add_order(chosen)
            memory.profiles.save(profile)


    # ----- special dietary response -----
    if entities.dietary_restrictions and action == Action.RECOMMEND_FOOD:
        reply = responder.dietary_filter_response(
            entities.dietary_restrictions, items, session, lang=detected_lang
        )
        return _build_response(reply, items, action, session, detected_lang)


    # ----- response generation -----
    reply = responder.generate(
        action=action,
        session=session,
        items=items,
        wine=wine,
        excluded=combined_exclude,
        context={},
        lang=detected_lang,
    )


    # ----- upsell hook -----
    if action == Action.CONFIRM_ORDER and not session.upsell_offered:
        upsell = responder.generate(
            action=Action.UPSELL_DRINK,
            session=session,
            lang=detected_lang,
        )
        if upsell:
            reply += f"\n\n{upsell}"
            session.dialogue_state = "upselling"


    # ----- fallback: log unknown -----
    if action == Action.LOG_UNKNOWN:
        memory.knowledge.log_unknown(msg, uid)


    return _build_response(reply, items, action, session, detected_lang)



def _build_query(msg: str, entities, session) -> str:
    """Build the best search query from entities + message."""
    parts = []
    if entities.food_types:
        parts.extend(entities.food_types)
    if entities.cuisine:
        parts.extend(entities.cuisine)
    if entities.drink_types:
        parts.extend(entities.drink_types)
    if parts:
        return " ".join(parts)
    for filler in ["i want","can i have","get me","do you have","show me","i'd like","give me"]:
        msg = msg.replace(filler, "").strip()
    return msg or "food"



def _build_response(reply: str, items: list[dict], action: Action, session, lang: str = "en") -> dict:
    """Package final JSON response."""
    result: dict = {"reply": reply}
    if items:
        result["suggested"] = items[:3]
    result["debug"] = {
        "action": action.value,
        "state":  session.dialogue_state,
        "turn":   session.turn_count,
        "lang":   lang,
    }
    return result



# ===========================================================================
# Flask routes
# ===========================================================================


@app.route("/chat", methods=["POST"])
def chat():
    try:
        data    = request.json or {}
        raw_msg = data.get("message", "").strip()
        uid     = _uid(request)

        if not raw_msg:
            session = memory.get_session(uid)
            reply   = responder.generate(Action.GREET, session, lang="en")
            return jsonify({"reply": reply})

        result = handle_chat(raw_msg, uid)
        return jsonify(result)

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"reply": "Oops! Something went wrong — try again, friend! 😊", "error": str(e)})



@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status":      "healthy ✅",
        "items":       len(recommender._all_items),
        "sessions":    len(memory.session.all_ids()),
        "wines":       7,
        "model_ready": recommender._ready,
        "timestamp":   datetime.datetime.utcnow().isoformat(),
    })



@app.route("/menu", methods=["GET"])
def menu():
    return jsonify({
        "total": len(recommender._all_items),
        "items": recommender._all_items[:20],
    })



@app.route("/cart/<uid>", methods=["GET"])
def get_cart(uid):
    session = memory.get_session(uid)
    total   = sum(i.get("price", 0) for i in session.cart)
    return jsonify({"cart": session.cart, "total": total})



@app.route("/session/<uid>", methods=["GET"])
def get_session_debug(uid):
    session = memory.get_session(uid)
    return jsonify({
        "state":        session.dialogue_state,
        "turn_count":   session.turn_count,
        "exclude":      session.exclude,
        "no_alcohol":   session.no_alcohol,
        "last_food":    session.last_food.get("name") if session.last_food else None,
        "last_drink":   session.last_drink.get("name") if session.last_drink else None,
        "cart_items":   len(session.cart),
        "history":      [i.get("name") for i in session.history[:5]],
    })



@app.route("/unknown-questions", methods=["GET"])
def unknown_questions():
    return jsonify(memory.knowledge.get_unknown())



@app.route("/admin/teach", methods=["POST"])
def admin_teach():
    data = request.json or {}
    q    = data.get("question", "").strip()
    a    = data.get("answer", "").strip()
    if not q or not a:
        return jsonify({"error": "question and answer required"}), 400
    memory.knowledge.teach(q, a)
    return jsonify({"status": "learned ✅", "question": q})



@app.route("/admin/retrain", methods=["POST"])
def admin_retrain():
    from nlu.intent_classifier import get_classifier
    clf = get_classifier()
    clf.train_from_file()
    return jsonify({"status": "retrained ✅"})



# ===========================================================================
# Entry point
# ===========================================================================


if __name__ == "__main__":
    print("=" * 70)
    print("🇬🇷 JOSH 11.0 — Mythos Enterprise AI (NLU Edition)")
    print("=" * 70)
    print("NLU:       SentenceTransformers + sklearn intent classifier")
    print("NER:       spaCy custom EntityRuler")
    print("Dialogue:  State machine + ML policy")
    print("Memory:    3-layer (session / SQLite profile / JSON knowledge)")
    print("Semantic:  Dense embedding menu search")
    print()
    print("Endpoints:")
    print("  POST /chat                → chat")
    print("  GET  /health              → health check")
    print("  GET  /menu                → menu preview")
    print("  GET  /cart/<uid>          → cart")
    print("  GET  /session/<uid>       → debug session")
    print("  GET  /unknown-questions   → admin: unresolved Qs")
    print("  POST /admin/teach         → admin: teach answer")
    print("  POST /admin/retrain       → admin: retrain model")
    print("=" * 70)
    print()

    if recommender.load():
        print(f"✅ {len(recommender._all_items)} menu items ready!")
        app.run(host="0.0.0.0", port=5001, debug=False)
    else:
        print("❌ Cannot start: MythosMenu.json not found.")
        print("   Place it at: food/MythosMenu.json")