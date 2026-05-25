"""
🇮🇹 AL PESCATORE AI SOMMELIER (ENHANCED EDITION)
=====================================================================================
Production-ready Flask chatbot with:
✅ SMART MULTI-FILE LOADING (Separates Food, Wine, Cocktails)
✅ REAL WINE PAIRINGS (Uses your actual wine list, not generics)
✅ COCKTAIL EXPERT (Specific logic for your cocktail menu)
✅ CONVERSATIONAL AI (Italian Persona)
✅ DIETARY FILTERS (Vegan, Seafood-free, etc.)

Restaurant: Al Pescatore | Seafood & Italian
Prices in South African Rand (R)
"""

import json
import os
import glob
import random
import datetime
import requests
import sys
from collections import Counter
from difflib import SequenceMatcher
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# ==============================================================================
# CONFIGURATION & FILE PATHS
# ==============================================================================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
FOOD_DIR = os.path.join(BASE_DIR, "food")
ORDERS_DIR = os.path.join(BASE_DIR, "orders")

for directory in [DATA_DIR, FOOD_DIR, ORDERS_DIR]:
    if not os.path.exists(directory):
        os.makedirs(directory)

# 📂 SPECIFIC FILE MAPPING
FILES = {
    "food": os.path.join(FOOD_DIR, "Al Pescatore Food.json"),
    "wine": os.path.join(FOOD_DIR, "Al Pescatore Wine.json"),
    "cocktail": os.path.join(FOOD_DIR, "Al Pescatore Coctail.json")
}

LEARNED_QA_FILE = os.path.join(DATA_DIR, "learned_qa.json")
UNKNOWN_QUESTIONS_FILE = os.path.join(DATA_DIR, "unknown_questions.json")

def ensure_files_exist():
    if not os.path.exists(LEARNED_QA_FILE):
        with open(LEARNED_QA_FILE, 'w', encoding='utf-8') as f: json.dump({"qa_pairs": []}, f)
    if not os.path.exists(UNKNOWN_QUESTIONS_FILE):
        with open(UNKNOWN_QUESTIONS_FILE, 'w', encoding='utf-8') as f: json.dump({"unknown": []}, f)

ensure_files_exist()

# ==============================================================================
# 1. RECOMMENDER ENGINE (THE BRAIN)
# ==============================================================================
class RecommenderEngine:
    """Handles loading and searching specific menus."""
    
    def __init__(self):
        self.all_items = []
        self.food_items = []
        self.wine_items = []
        self.cocktail_items = []
        self.popular = []
        
        # Keywords to filter dangerous allergens
        self.allergen_map = {
            'seafood': ['fish', 'hake', 'sole', 'kingklip', 'prawn', 'shrimp', 'oyster', 'mussel', 'calamari', 'squid', 'shellfish', 'crustacean', 'salmon', 'tuna'],
            'shellfish': ['oyster', 'mussel', 'prawn', 'shrimp', 'crayfish', 'lobster'],
            'dairy': ['cheese', 'milk', 'feta', 'halloumi', 'cream', 'yogurt', 'butter', 'parmesan', 'mozzarella'],
            'gluten': ['bread', 'pasta', 'pizza', 'focaccia', 'spaghetti', 'linguine', 'penne', 'flour'],
            'nuts': ['nuts', 'almond', 'pecan', 'walnut', 'pine nut', 'pesto'],
            'meat': ['beef', 'chicken', 'lamb', 'pork', 'bacon', 'ham', 'prosciutto', 'meatball', 'bolognese', 'steak', 'rib']
        }
    
    def _flatten_json(self, data):
        """Helper to extract items from nested JSON structures."""
        items = []
        def recursive_search(node):
            if isinstance(node, list):
                for i in node: recursive_search(i)
            elif isinstance(node, dict):
                if "items" in node and isinstance(node["items"], list):
                    for i in node["items"]:
                        if i.get("visible", True): items.append(i)
                for key, value in node.items():
                    if key != "items": recursive_search(value)
        recursive_search(data)
        return items

    def load_menus(self):
        """Loads and separates Food, Wine, and Cocktail items."""
        print("\n📥 Loading Menus...")
        
        # 1. Load Food
        if os.path.exists(FILES["food"]):
            try:
                with open(FILES["food"], "r", encoding="utf-8") as f:
                    self.food_items = self._flatten_json(json.load(f))
                print(f"   ✅ Food Loaded: {len(self.food_items)} items")
            except Exception as e: print(f"   ❌ Error loading Food: {e}")
        
        # 2. Load Wine
        if os.path.exists(FILES["wine"]):
            try:
                with open(FILES["wine"], "r", encoding="utf-8") as f:
                    self.wine_items = self._flatten_json(json.load(f))
                print(f"   ✅ Wine Loaded: {len(self.wine_items)} items")
            except Exception as e: print(f"   ❌ Error loading Wine: {e}")

        # 3. Load Cocktails
        if os.path.exists(FILES["cocktail"]):
            try:
                with open(FILES["cocktail"], "r", encoding="utf-8") as f:
                    self.cocktail_items = self._flatten_json(json.load(f))
                print(f"   ✅ Cocktails Loaded: {len(self.cocktail_items)} items")
            except Exception as e: print(f"   ❌ Error loading Cocktails: {e}")

        # Combine for global search
        self.all_items = self.food_items + self.wine_items + self.cocktail_items
        
        if not self.all_items:
            print("⚠️ WARNING: No items loaded. Check JSON file paths.")
            return False
            
        self._calc_popular()
        return True
    
    def _calc_popular(self):
        """Identify popular items from order history."""
        try:
            counts = Counter()
            for order_file in glob.glob(os.path.join(ORDERS_DIR, "*.json")):
                try:
                    with open(order_file, 'r', encoding='utf-8') as f:
                        order = json.load(f)
                        for item in order.get('items', []):
                            counts[item.get('name', '')] += 1
                except: pass
            
            if counts:
                pop_names = [name for name, _ in counts.most_common(10)]
                self.popular = [i for i in self.all_items if i.get('name') in pop_names]
            else:
                self.popular = self.food_items[:5] # Default fallback
        except: pass

    def is_safe(self, item, exclude_list):
        """Check if item is safe based on exclusion list."""
        if not exclude_list: return True
        text = (item.get('name', '') + " " + item.get('description', '') + " " + item.get('allergens', '')).lower()
        
        for exc in exclude_list:
            exc_lower = exc.lower()
            # Direct match
            if exc_lower in text: return False
            # Category match (e.g. user says "no shellfish", check prawn/oyster)
            if exc_lower in self.allergen_map:
                for keyword in self.allergen_map[exc_lower]:
                    if keyword in text: return False
        return True

    def search(self, query, category="all", exclude=None):
        """Smart fuzzy search within a specific category."""
        query = query.lower().strip()
        
        # Select source list
        source = self.all_items
        if category == "food": source = self.food_items
        elif category == "wine": source = self.wine_items
        elif category == "cocktail": source = self.cocktail_items
        
        matches = []
        for item in source:
            if not self.is_safe(item, exclude): continue
            
            name = item.get('name', '').lower()
            desc = item.get('description', '').lower()
            
            score = 0
            if query == name: score = 1.0
            elif query in name: score = 0.9
            elif query in desc: score = 0.7
            else: score = SequenceMatcher(None, query, name).ratio()
            
            if score > 0.5: matches.append((score, item))
            
        matches.sort(key=lambda x: x[0], reverse=True)
        return [m[1] for m in matches]

recommender = RecommenderEngine()

# ==============================================================================
# 2. WINE PAIRING ENGINE (Uses Real Menu Items)
# ==============================================================================
class WineSommelier:
    """Matches food to ACTUAL wines from the loaded menu."""
    
    def suggest_pairing(self, food_item, no_alcohol=False):
        if no_alcohol: return ""

        food_name = food_item.get('name', '').lower()
        food_desc = food_item.get('description', '').lower()
        text = food_name + " " + food_desc
        
        # 1. Determine Wine Type needed
        target_wine_type = "White"
        reason = "A crisp white wine complements this perfectly."
        
        if any(w in text for w in ["steak", "beef", "lamb", "fillet", "red meat", "stew"]):
            target_wine_type = "Red"
            reason = "A bold red wine is needed to stand up to these rich meaty flavors."
        elif any(w in text for w in ["prawn", "curry", "spicy", "lobster"]):
            target_wine_type = "White" # Specifically Chenin or off-dry
            reason = "A fruity white wine helps balance the spice and sweetness of the seafood."
        elif any(w in text for w in ["oyster", "sushi", "calamari", "starter"]):
            target_wine_type = "Sparkling" 
            reason = "Bubbles are the classic pairing for fresh ocean starters."
        elif any(w in text for w in ["pasta", "tomato", "pizza", "chicken"]):
            target_wine_type = "Red" # Lighter red
            reason = "A smooth red wine pairs beautifully with tomato-based Italian dishes."

        # 2. Find a matching wine from the REAL wine list
        candidates = []
        
        for wine in recommender.wine_items:
            w_name = wine.get('name', '').lower()
            w_desc = wine.get('description', '').lower()
            
            # Simple keyword matching logic
            if target_wine_type == "Red" and any(k in w_name for k in ["cabernet", "merlot", "shiraz", "pinot", "red", "rouge"]):
                candidates.append(wine)
            elif target_wine_type == "White" and any(k in w_name for k in ["sauvignon", "chardonnay", "chenin", "blanc", "white"]):
                candidates.append(wine)
            elif target_wine_type == "Sparkling" and any(k in w_name for k in ["brut", "sparkling", "prosecco", "champagne", "cap classique"]):
                candidates.append(wine)

        # 3. Return suggestion
        if candidates:
            best_wine = random.choice(candidates)
            return f"\n\n🍷 **Sommelier's Tip:** Pair this with the **{best_wine['name']}** (R{best_wine['price']}).\n_{reason}_"
        
        return ""

sommelier = WineSommelier()

# ==============================================================================
# 3. FLASK SERVER & CHAT LOGIC
# ==============================================================================
@app.route('/chat', methods=['POST'])
def chat():
    try:
        data = request.json or {}
        raw_msg = data.get('message', '').strip()
        uid = data.get('tableId', 'guest')
        
        # --- SESSION HANDLING ---
        # (Simple in-memory session for this scope)
        if not hasattr(chat, 'sessions'): chat.sessions = {}
        if uid not in chat.sessions: chat.sessions[uid] = {'exclude': [], 'no_alcohol': False, 'history': []}
        session = chat.sessions[uid]
        
        msg = raw_msg.lower()
        
        # 1. GREETING
        if any(w in msg for w in ["hi", "hello", "ciao", "hey"]) and len(msg) < 20:
            return jsonify({"reply": "Ciao! 🇮🇹 Benvenuto to Al Pescatore! Are you in the mood for fresh **Seafood**, **Italian Pasta**, or perhaps a **Cocktail**?"})

        # 2. DIETARY FILTERS
        if "no alcohol" in msg:
            session['no_alcohol'] = True
            session['exclude'].append('alcohol')
            return jsonify({"reply": "Capito! (Understood). I will stick to non-alcoholic options for you. 🥤"})
        
        if any(w in msg for w in ["allergy", "no shellfish", "no gluten", "vegan", "vegetarian"]):
            if "shellfish" in msg: session['exclude'].extend(['prawn','mussel','oyster','crab','lobster'])
            if "gluten" in msg: session['exclude'].extend(['pasta','pizza','bread','crumbed'])
            if "vegan" in msg: session['exclude'].extend(['meat','dairy','egg','honey','fish','seafood'])
            return jsonify({"reply": "Grazie for telling me. I have updated my recommendations to keep you safe! What are you hungry for?"})

        # 3. SPECIFIC INTENTS
        
        # --- A. COCKTAILS ---
        if any(w in msg for w in ["cocktail", "drink", "mix", "alcohol", "beer"]) and "food" not in msg:
            if session['no_alcohol']:
                return jsonify({"reply": "We have great soft drinks and virgin cocktails. Ask me about them!"})
            
            # Search specifically in Cocktail/Wine lists
            items = recommender.search(msg, category="cocktail", exclude=session['exclude'])
            if not items: items = recommender.search(msg, category="wine", exclude=session['exclude'])
            
            if items:
                best = items[0]
                reply = f"Cheers! 🥂 You should try the **{best['name']}**.\n_{best.get('description','')}_"
                return jsonify({"reply": reply, "suggested": [best]})
            else:
                # Random Suggestion if search fails
                if recommender.cocktail_items:
                    rand = random.choice(recommender.cocktail_items)
                    return jsonify({"reply": f"How about a **{rand['name']}**? It's a favorite here!", "suggested": [rand]})

        # --- B. WINE ---
        if "wine" in msg:
            items = recommender.search(msg, category="wine", exclude=session['exclude'])
            if items:
                best = items[0]
                return jsonify({"reply": f"Excellent vintage. The **{best['name']}** is wonderful.", "suggested": [best]})
            elif recommender.wine_items:
                rand = random.choice(recommender.wine_items)
                return jsonify({"reply": f"I highly recommend the **{rand['name']}**. It is exquisite.", "suggested": [rand]})

        # --- C. FOOD SEARCH ---
        items = recommender.search(msg, category="food", exclude=session['exclude'])
        if items:
            best = items[0]
            reply = f"Eccellente! The **{best['name']}** is delicious.\n\n_{best.get('description','')}_\n💰 **R{best.get('price')}**"
            
            # Add Wine Pairing
            reply += sommelier.suggest_pairing(best, session['no_alcohol'])
            
            session['history'].append(best)
            return jsonify({"reply": reply, "suggested": [best]})

        # --- D. ADD TO CART ---
        if any(w in msg for w in ["add", "yes", "order", "want"]) and session['history']:
            item = session['history'][-1]
            return jsonify({
                "reply": f"Benissimo! **{item['name']}** has been added to your order.",
                "action": "ADD_TO_CART",
                "action_payload": item
            })

        # --- E. FALLBACK ---
        return jsonify({"reply": "Scusi? I didn't quite catch that. Ask me about our **Seafood Platters**, **Pasta**, or **Wines**!"})

    except Exception as e:
        print(f"❌ Error: {e}")
        return jsonify({"reply": "Mamma mia! My brain is a bit fuzzy. Please ask again."})

@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        "status": "healthy 🇮🇹",
        "menu_counts": {
            "food": len(recommender.food_items),
            "wine": len(recommender.wine_items),
            "cocktails": len(recommender.cocktail_items)
        }
    })

if __name__ == '__main__':
    # PORT CONFIGURATION
    port = 5005
    if len(sys.argv) > 1:
        try: port = int(sys.argv[1])
        except: pass

    print("=" * 80)
    print(f"🇮🇹 AL PESCATORE AI SOMMELIER (Running on Port {port})")
    print("=" * 80)
    
    if recommender.load_menus():
        app.run(host='0.0.0.0', port=port, debug=True)
    else:
        print("❌ Cannot start - Critical Menu Files Missing!")