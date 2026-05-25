# recommend.py -- Greek Restaurant
# DUAL MODE:
#   1. Flask Server (port 5002) -> /ai-pairing  (called by server.js)
#   2. CLI mode (stdin)         -> cart JSON -> recommendations

import json, os, sys, glob, random, time
from collections import defaultdict
from flask import Flask, request, jsonify
from flask_cors import CORS
from groq import Groq

BASE_DIR             = os.path.dirname(os.path.abspath(__file__))
MENU_FILE            = os.path.join(BASE_DIR, "food", "MythosMenu.json")
ORDERS_DIR           = os.path.join(BASE_DIR, "orders")
RECOMMENDATIONS_FILE = os.path.join(BASE_DIR, "food", "recommendations.json")

client = Groq(api_key=os.environ.get("GROQ_API_KEY"))

WAITER_STYLES = [
    "You are a confident, warm restaurant waiter. Speak naturally and make the guest feel welcome.",
    "You are a refined, professional sommelier. Use elegant and precise language.",
    "You are a laid-back, enthusiastic foodie. Be fun, casual and conversational.",
    "You are an extremely passionate chef. Use vivid, sensory-rich descriptions.",
    "You are a knowledgeable Greek culture expert. Weave in subtle heritage references.",
]

def get_style_for_waiter(waiter_name):
    idx = sum(ord(c) for c in (waiter_name or "default")) % len(WAITER_STYLES)
    return WAITER_STYLES[idx]


# ============================================================
# SECTION 1 -- HELPERS
# ============================================================

def normalize_name(s):
    if not s: return ""
    return str(s).strip().lower().replace(" ", "-").replace("_", "-")


def sanitize_item(item, source_title="You might also like"):
    raw_price = item.get("price", 85)
    try:
        clean_str = str(raw_price).replace("R", "").replace(" ", "")
        final_price = float(clean_str)
    except:
        final_price = 85.0
    return {
        "name":         str(item.get("name", "Tasty Item")),
        "price":        final_price,
        "description":  str(item.get("description", "A Customer Favourite")),
        "img":          str(item.get("img", "Images/Mythos_Logo.jpg")),
        "calories":     str(item.get("calories", "") or ""),
        "allergens":    str(item.get("allergens", "") or ""),
        "spice":        str(item.get("spice", "") or ""),
        "source_title": source_title
    }


# ============================================================
# SECTION 2 -- DATA LOADERS
# ============================================================

def load_full_menu():
    all_items = {}
    all_names_raw = []
    if os.path.exists(MENU_FILE):
        try:
            with open(MENU_FILE, "r", encoding="utf-8") as f:
                menu = json.load(f)
            def walk(node):
                if isinstance(node, dict):
                    for key, val in node.items():
                        if key == "items" and isinstance(val, list):
                            for item in val:
                                if item.get("name"):
                                    norm = normalize_name(item["name"])
                                    all_items[norm] = item
                                    all_names_raw.append(item["name"])
                        else:
                            walk(val)
                elif isinstance(node, list):
                    for i in node:
                        walk(i)
            walk(menu)
        except:
            pass
    return all_items, all_names_raw


def load_pairing_rules():
    rules = defaultdict(list)
    if os.path.exists(RECOMMENDATIONS_FILE):
        try:
            with open(RECOMMENDATIONS_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
            for group in data:
                items = group.get("items", [])
                desc  = group.get("description", "Chef's Pairing")
                if len(items) < 2: continue
                group_names = [normalize_name(i.get("name")) for i in items]
                for current in group_names:
                    for other in group_names:
                        if current == other: continue
                        if not any(r["name"] == other for r in rules[current]):
                            rules[current].append({"name": other, "desc": desc})
        except:
            pass
    return rules


def load_history():
    history = []
    if os.path.exists(ORDERS_DIR):
        for fpath in glob.glob(os.path.join(ORDERS_DIR, "*.json")):
            try:
                with open(fpath, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if isinstance(data, dict):
                        history.append(data)
            except:
                pass
    return history


# ============================================================
# SECTION 3 -- CLI RECOMMENDATION ENGINE (original logic unchanged)
# ============================================================

def get_recommendations(cart_json):
    try:
        raw_data = json.loads(cart_json)
    except:
        raw_data = []
    cart = []
    if isinstance(raw_data, list):
        cart = raw_data
    elif isinstance(raw_data, dict):
        if isinstance(raw_data.get("cart"), list):    cart = raw_data["cart"]
        elif isinstance(raw_data.get("items"), list): cart = raw_data["items"]

    menu_db, all_names_raw = load_full_menu()
    pairing_rules          = load_pairing_rules()
    cart_norm_names        = {normalize_name(c.get("name")) for c in cart if isinstance(c, dict)}
    final_recs_objs        = []
    seen_names             = set(cart_norm_names)

    found_pairing = False
    for cart_item in cart:
        if not isinstance(cart_item, dict): continue
        c_name            = normalize_name(cart_item.get("name"))
        potential_targets = pairing_rules.get(c_name, [])
        if not potential_targets: continue
        target_norms = [t["name"] for t in potential_targets]
        if not set(target_norms).isdisjoint(cart_norm_names): continue
        found_pairing = True
        for target in potential_targets:
            t_name = target["name"]
            t_desc = target["desc"]
            if t_name in seen_names: continue
            if t_name in menu_db:
                final_recs_objs.append(sanitize_item(menu_db[t_name], t_desc))
                seen_names.add(t_name)

    if found_pairing and len(final_recs_objs) > 0:
        return final_recs_objs[:3]

    target_name = None
    if cart:
        for item in reversed(cart):
            if not isinstance(item, dict): continue
            name = item.get("name", "")
            if not any(x in name.lower() for x in ["wine","drink","water","sauce","coke","soda"]):
                target_name = name
                break
        if not target_name and isinstance(cart[-1], dict):
            target_name = cart[-1].get("name")

    history         = load_history()
    suggested_names = []

    if history and target_name:
        target_lower = normalize_name(target_name)
        counts = defaultdict(int)
        for order in history:
            items = [normalize_name(i.get("name", "")) for i in order.get("items", [])]
            if target_lower in items:
                for other in items:
                    if other != target_lower:
                        counts[other] += 1
        suggested_names = [n for n, _ in sorted(counts.items(), key=lambda x: x[1], reverse=True)]

    if not suggested_names and history:
        counts = defaultdict(int)
        for order in history:
            for item in order.get("items", []):
                name = normalize_name(item.get("name", ""))
                if name: counts[name] += 1
        suggested_names = [n for n, _ in sorted(counts.items(), key=lambda x: x[1], reverse=True)]

    for norm_name in suggested_names:
        if norm_name not in seen_names and norm_name in menu_db:
            final_recs_objs.append(sanitize_item(menu_db[norm_name], "Popular Choice"))
            seen_names.add(norm_name)
        if len(final_recs_objs) >= 3: break

    attempts  = 0
    menu_keys = list(menu_db.keys())
    while len(final_recs_objs) < 3 and menu_keys and attempts < 50:
        attempts += 1
        rnd_key = random.choice(menu_keys)
        if rnd_key not in seen_names:
            final_recs_objs.append(sanitize_item(menu_db[rnd_key], "You might also like"))
            seen_names.add(rnd_key)

    return final_recs_objs[:3]


# ============================================================
# SECTION 4 -- GROQ RETRY HELPER
# ============================================================

def call_groq(prompt, system, attempts=3, delay=1):
    for i in range(attempts):
        try:
            response = client.chat.completions.create(
                model="llama-3.1-8b-instant",
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user",   "content": prompt},
                ],
                temperature=0.85,
                max_tokens=350,
            )
            return response.choices[0].message.content.strip()
        except Exception as e:
            if i < attempts - 1:
                time.sleep(delay * (i + 1))
            else:
                raise e


# ============================================================
# SECTION 5 -- FLASK SERVER  ->  /ai-pairing
# ============================================================

app = Flask(__name__)
CORS(app)

@app.route("/ai-pairing", methods=["POST"])
def ai_pairing():
    data = request.get_json(force=True)

    item_name     = data.get("itemName", "")
    item_price    = data.get("itemPrice", "")
    item_desc     = data.get("itemDescription", "")
    item_category = data.get("itemCategory", "")
    waiter_name   = data.get("waiterName", "")
    current_order = data.get("currentOrder", [])
    table_id      = data.get("tableId", "")

    order_context = ""
    if current_order:
        names = [i.get("name", "") for i in current_order if i.get("name")]
        if names:
            order_context = "The table has already ordered: " + ", ".join(names) + "."

    system_prompt = get_style_for_waiter(waiter_name)

    user_prompt = (
        "A guest at Table " + str(table_id or "N/A") + " is looking at: \"" + item_name +
        "\" (R" + str(item_price) + ") -- " + (item_desc or item_category) + ".\n" +
        order_context + "\n\n"
        "Give a SHORT waiter-style recommendation. Include:\n"
        "1. A catchy title (max 5 words)\n"
        "2. A 2-sentence description the waiter can say out loud -- unique, specific and delicious-sounding\n"
        "3. 2 pairing suggestions from a Greek restaurant menu (food or drink) with a brief reason each\n\n"
        "Respond in this EXACT JSON format only, no extra text:\n"
        "{\n"
        "  \"title\": \"...\",\n"
        "  \"description\": \"...\",\n"
        "  \"pairings\": [\n"
        "    {\"name\": \"...\", \"reason\": \"...\"},\n"
        "    {\"name\": \"...\", \"reason\": \"...\"}\n"
        "  ],\n"
        "  \"talkTrack\": \"One casual sentence the waiter says when recommending this.\"\n"
        "}"
    )

    try:
        raw = call_groq(user_prompt, system_prompt)
        if "```" in raw:
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        raw = raw.strip()
        result = json.loads(raw)
        return jsonify(result), 200

    except Exception as e:
        print("[recommend.py] AI fallback triggered: " + str(e), flush=True)
        return jsonify({
            "title": "Chef's Recommendation",
            "description": item_name + " is one of our most-loved dishes. A beautiful choice for any occasion.",
            "pairings": [
                {"name": "House White Wine", "reason": "A crisp white balances rich flavours beautifully."},
                {"name": "Greek Salad",       "reason": "A fresh, light side to complement any main."}
            ],
            "talkTrack": "I'd really recommend the " + item_name + " -- it's a guest favourite tonight."
        }), 200


# ============================================================
# SECTION 6 -- ENTRY POINT
# ============================================================

if __name__ == "__main__":
    if not sys.stdin.isatty():
        try:
            input_data = sys.stdin.read()
            if not input_data.strip():
                input_data = "[]"
            result = get_recommendations(input_data)
            print(json.dumps(result))
        except Exception:
            print("[]")
    else:
        print("[recommend.py] Starting AI Pairing server on port 5002...", flush=True)
        app.run(host="0.0.0.0", port=5002, debug=False)
