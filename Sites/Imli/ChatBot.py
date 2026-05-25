import json
import os
from flask import Flask, request, jsonify
from flask_cors import CORS
from thefuzz import process, fuzz  # Library for smart text matching
from datetime import datetime  # Added for timestamps

app = Flask(__name__)
CORS(app)  # Allows your HTML frontend to talk to this Python script

# --- PATHS ---
# This automatically finds the 'food' folder inside the 'Imli' directory
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MENU_FILE = os.path.join(BASE_DIR, "food", "MythosMenu.json") 
POPULAR_FILE = os.path.join(BASE_DIR, "food", "popular.json")
HISTORY_DIR = os.path.join(BASE_DIR, "history") # Directory for chat logs

# Ensure history directory exists
if not os.path.exists(HISTORY_DIR):
    os.makedirs(HISTORY_DIR)

# --- SPECIAL EVENT KEYWORDS (NEW FEATURE) ---
SPECIAL_KEYWORDS = [
    "birthday", "anniversary", "event", "celebration", "party", "gathering",
    "festival", "ceremony", "function", "occasion", "milestone", "achievement",
    "accomplishment", "success", "breakthrough", "win", "completion", "goal",
    "target", "engagement", "wedding", "proposal", "reception", "honeymoon",
    "commitment", "union", "reunion", "graduation", "convocation", "admission",
    "orientation", "farewell", "retirement", "promotion", "transfer", "date"
]

# --- DATA LOADING ---
menu_data = {}
all_items = []
popular_items = []

def load_data():
    global menu_data, all_items, popular_items
    
    # 1. Load Popular Items
    try:
        with open(POPULAR_FILE, "r", encoding="utf-8") as f:
            popular_items = json.load(f)
    except Exception as e:
        print(f"Error loading popular.json: {e}")
        popular_items = []

    # 2. Load Menu & Flatten
    try:
        with open(MENU_FILE, "r", encoding="utf-8") as f:
            menu_data = json.load(f)
            
        # Flatten menu for easier searching
        all_items = []
        def walk(node):
            if isinstance(node, list):
                for x in node: walk(x)
            elif isinstance(node, dict):
                if "items" in node and isinstance(node["items"], list):
                    for i in node["items"]:
                        if isinstance(i, dict) and i.get("visible", True) is not False:
                            all_items.append(i)
                for k, v in node.items():
                    if k not in ["items", "visible"]:
                        walk(v)
        walk(menu_data)
        print(f"Loaded {len(all_items)} menu items.")
        
    except Exception as e:
        print(f"Error loading menu: {e}")

# Initial Load
load_data()

# --- STATE MANAGEMENT ---
user_sessions = {}

def get_session(user_id):
    if user_id not in user_sessions:
        user_sessions[user_id] = {"step": None, "preferences": {}}
    return user_sessions[user_id]

def reset_session(user_id):
    user_sessions[user_id] = {"step": None, "preferences": {}}

# --- HELPER FUNCTIONS ---

def search_menu(query):
    choices = {item["name"]: item for item in all_items}
    best_match = process.extractOne(query, choices.keys(), scorer=fuzz.token_set_ratio)
    
    if best_match and best_match[1] > 70:
        item = choices[best_match[0]]
        text = f"Found it! **{item['name']}** costs R{item['price']}. {item.get('description', '')}"
        return text, item
    return None, None

def filter_recommendation(prefs):
    candidates = []
    for item in all_items:
        name_lower = item['name'].lower()
        desc_lower = (item.get('description') or "").lower()
        full_text = name_lower + " " + desc_lower
        
        is_veg = "veg" in full_text or "halloumi" in full_text or "cheese" in full_text or "mushroom" in full_text
        if prefs.get('veg_status') == 'veg' and not is_veg:
            continue

        cat = prefs.get('category', '').lower()
        if cat and cat not in full_text:
            if cat == 'meat' and ('beef' in full_text or 'lamb' in full_text or 'pork' in full_text):
                pass
            elif cat == 'seafood' and ('prawn' in full_text or 'fish' in full_text or 'calamari' in full_text):
                pass
            else:
                continue

        allergy = prefs.get('allergy', '').lower()
        if allergy and allergy != 'no':
            item_allergens = str(item.get('allergens', '')).lower()
            if allergy in item_allergens:
                continue

        candidates.append(item)

    if not candidates:
        return "I couldn't find an exact match for those preferences, but our **Specials** are always great choices!", None
    
    rec = candidates[0]
    text = f"Based on that, I recommend the **{rec['name']}** (R{rec['price']}). {rec.get('description','')}"
    return text, rec


# --- CHAT ROUTE ---

@app.route('/chat', methods=['POST'])
def chat():
    data = request.json
    user_msg = data.get('message', '').strip()
    table_id = data.get('tableId', 'Guest') # Capture Table ID for logging
    user_id = request.remote_addr 
    
    session = get_session(user_id)
    msg_lower = user_msg.lower()
    
    response_text = ""
    suggested_item = None
    suggested_items = []

    # --- NEW: CHECK FOR SPECIAL EVENT KEYWORDS ---
    # This boolean flag detects if the user mentioned a birthday, anniversary, etc.
    is_special_event = any(keyword in msg_lower for keyword in SPECIAL_KEYWORDS)

    # ------------------------------------
    # FLOW 1: VIEWING POPULAR ITEMS
    # ------------------------------------
    if session['step'] == 'ask_view_popular':
        if any(x in msg_lower for x in ['yes', 'sure', 'yeah', 'okay', 'show']):
            found_items = []
            for pop in popular_items:
                match = next((i for i in all_items if i['name'].lower() == pop['name'].lower()), None)
                if match:
                    found_items.append(match)
            
            if found_items:
                response_text = "Here you go! Click to view details:"
                suggested_items = found_items
            else:
                response_text = "I couldn't locate the details for those specific items right now."
            reset_session(user_id)
        else:
            response_text = "No problem! Ask me anything else."
            reset_session(user_id)

    # ------------------------------------
    # FLOW 2: RECOMMENDATION WIZARD
    # ------------------------------------
    elif session['step'] == 'ask_veg':
        if 'non' in msg_lower:
            session['preferences']['veg_status'] = 'non-veg'
            session['step'] = 'ask_category'
            response_text = "Got it. Do you prefer **Seafood**, **Meat** (Lamb/Pork), or **Beef**?"
        elif 'veg' in msg_lower:
            session['preferences']['veg_status'] = 'veg'
            session['preferences']['category'] = '' 
            session['step'] = 'ask_allergy'
            response_text = "Great choice. Do you have any allergies I should know about? (e.g. Nuts, Dairy, or just say 'No')"
        else:
            response_text = "Sorry, did you mean **Veg** or **Non-Veg**?"
            
    elif session['step'] == 'ask_category':
        session['preferences']['category'] = msg_lower
        session['step'] = 'ask_allergy'
        response_text = "Noted. Finally, any allergies? (e.g. Shellfish, Gluten, or 'No')"

    elif session['step'] == 'ask_allergy':
        session['preferences']['allergy'] = msg_lower
        response_text, suggested_item = filter_recommendation(session['preferences'])
        reset_session(user_id) 

    # ------------------------------------
    # FLOW 3: NEW INTENTS
    # ------------------------------------
    else:
        if any(x in msg_lower for x in ['recommend', 'suggest', 'what should i eat', 'hungry']):
            session['step'] = 'ask_veg'
            response_text = "I'd love to help! First, are you looking for **Veg** or **Non-Veg** options?"
        
        elif any(x in msg_lower for x in ['popular', 'best', 'favorite', 'top']):
            names = [f"**{i['name']}**" for i in popular_items]
            response_text = "Here are our most popular dishes: " + ", ".join(names) + ". Would you like to view them?"
            session['step'] = 'ask_view_popular'
            
        elif any(x in msg_lower for x in ['hi', 'hello', 'hey']):
            response_text = "Welcome to Imli! Ask me about our menu, popular items, or for a recommendation!"

        else:
            response_text, suggested_item = search_menu(user_msg)
            if not response_text:
                response_text = "I'm not sure about that specific question. You can ask me for **recommendations**, **popular items**, or ask about a specific dish!"

    # ------------------------------------
    # NEW: LOGGING SYSTEM (History)
    # ------------------------------------
    now = datetime.now()
    log_entry = {
        "timestamp": now.strftime("%H:%M:%S"),
        "date": now.strftime("%Y-%m-%d"),
        "tableId": table_id,
        "message": user_msg,
        "reply": response_text,
        "is_special": is_special_event  # <--- Flag sent to Admin to trigger notification
    }

    try:
        history_file = os.path.join(HISTORY_DIR, "full_chat_history.json")
        history_data = []
        if os.path.exists(history_file):
            with open(history_file, "r", encoding="utf-8") as f:
                try:
                    history_data = json.load(f)
                except:
                    history_data = []
        
        history_data.append(log_entry)
        with open(history_file, "w", encoding="utf-8") as f:
            json.dump(history_data, f, indent=4)
    except Exception as e:
        print(f"Logging error: {e}")

    # Return structured JSON
    return jsonify({
        "reply": response_text,
        "suggested_item": suggested_item,
        "suggested_items": suggested_items,
        "log": log_entry  # This log object is captured by server.js to update Admin UI
    })

if __name__ == '__main__':
    print("[INFO] Imli ChatBot running on port 5002...") 
    # [FIX] Running on Port 5002 for Imli Restaurant
    app.run(port=5002, debug=True)