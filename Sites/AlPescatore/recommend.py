import json
import os
import sys
import glob
import random
import re
from collections import defaultdict
from difflib import get_close_matches

# --- CONFIGURATION ---
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MENU_FILE = os.path.join(BASE_DIR, "food", "MythosMenu.json")
ORDERS_DIR = os.path.join(BASE_DIR, "orders")
RECOMMENDATIONS_FILE = os.path.join(BASE_DIR, "food", "recommendations.json")

# ==========================================
# 1. HELPERS & SANITIZERS
# ==========================================

def normalize_name(s):
    """
    Standardizes names for comparison (from pop_recommend logic).
    """
    if not s: return ""
    return str(s).strip().lower().replace(" ", "-").replace("_", "-")

def sanitize_item(item, source_title="You might also like"):
    """
    Ensures every item matches the frontend requirements.
    """
    raw_price = item.get("price", 85)
    try:
        clean_str = str(raw_price).replace('R', '').replace(' ', '')
        final_price = float(clean_str)
    except:
        final_price = 85.0

    return {
        "name": str(item.get("name", "Tasty Item")),
        "price": final_price,
        "description": str(item.get("description", "A Customer Favorite")),
        "img": str(item.get("img", "Images/Mythos_Logo.jpg")),
        "calories": str(item.get("calories", "") or ""),
        "allergens": str(item.get("allergens", "") or ""),
        "spice": str(item.get("spice", "") or ""),
        "source_title": source_title 
    }

# ==========================================
# 2. DATA LOADERS
# ==========================================

def load_full_menu():
    """Loads menu and creates a lookup dictionary."""
    all_items = {}
    all_names_raw = []

    if os.path.exists(MENU_FILE):
        try:
            with open(MENU_FILE, 'r', encoding='utf-8') as f:
                menu = json.load(f)

            def walk(node):
                if isinstance(node, dict):
                    for key, val in node.items():
                        if key == "items" and isinstance(val, list):
                            for item in val:
                                if item.get('name'):
                                    # Store by normalized name for easy lookup
                                    norm = normalize_name(item['name'])
                                    all_items[norm] = item
                                    all_names_raw.append(item['name'])
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
    """
    Reads recommendations.json and builds an adjacency map (Logic from pop_recommend).
    Returns: { 'normalized_trigger': [ {'name': 'target', 'desc': 'rule_desc'} ] }
    """
    rules = defaultdict(list)
    if os.path.exists(RECOMMENDATIONS_FILE):
        try:
            with open(RECOMMENDATIONS_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
                
            for group in data:
                items = group.get('items', [])
                desc = group.get('description', "Chef's Pairing")
                
                if len(items) < 2: continue
                
                group_names = [normalize_name(i.get('name')) for i in items]
                
                # Cross-reference: Every item points to every other item
                for current in group_names:
                    for other in group_names:
                        if current == other: continue
                        
                        # Add rule if not already present
                        if not any(r['name'] == other for r in rules[current]):
                            rules[current].append({'name': other, 'desc': desc})
                            
        except:
            pass
    return rules

def load_history():
    history = []
    if os.path.exists(ORDERS_DIR):
        for fpath in glob.glob(os.path.join(ORDERS_DIR, "*.json")):
            try:
                with open(fpath, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    if isinstance(data, dict):
                        history.append(data)
            except:
                pass
    return history

# ==========================================
# 3. RECOMMENDATION ENGINE
# ==========================================

def get_recommendations(cart_json):
    # --- A. PARSE INPUT ---
    try:
        raw_data = json.loads(cart_json)
    except:
        raw_data = []

    cart = []
    if isinstance(raw_data, list): cart = raw_data
    elif isinstance(raw_data, dict):
        if isinstance(raw_data.get('cart'), list): cart = raw_data['cart']
        elif isinstance(raw_data.get('items'), list): cart = raw_data['items']

    # --- B. PREPARE DATA ---
    menu_db, all_names_raw = load_full_menu() # Dict: norm_name -> item_obj
    pairing_rules = load_pairing_rules()      # Dict: norm_name -> list of targets
    
    cart_norm_names = {normalize_name(c.get('name')) for c in cart if isinstance(c, dict)}
    
    final_recs_objs = []
    seen_names = set(cart_norm_names) # Track normalized names we have/suggested

    # ============================================================
    # PRIORITY 1: CHEF'S PAIRINGS (Smart Logic from pop_recommend)
    # ============================================================
    found_pairing = False

    for cart_item in cart:
        if not isinstance(cart_item, dict): continue
        
        c_name = normalize_name(cart_item.get('name'))
        potential_targets = pairing_rules.get(c_name, [])
        
        if not potential_targets: continue

        # --- EXCLUSIVITY LOGIC (From pop_recommend) ---
        # If cart ALREADY has one of the targets, user is likely "satisfied" with this combo.
        # We skip suggesting the rest to avoid spamming.
        target_norms = [t['name'] for t in potential_targets]
        if not set(target_norms).isdisjoint(cart_norm_names):
            continue 
        # ---------------------------------------------

        found_pairing = True
        
        for target in potential_targets:
            t_name = target['name']
            t_desc = target['desc']
            
            if t_name in seen_names: continue

            # Retrieve full item details
            if t_name in menu_db:
                full_item = menu_db[t_name]
                final_recs_objs.append(sanitize_item(full_item, t_desc))
                seen_names.add(t_name)

    # Return immediately if we found specific pairings
    if found_pairing and len(final_recs_objs) > 0:
        return final_recs_objs[:3]

    # ============================================================
    # PRIORITY 2: HISTORY & POPULARITY (Fallback)
    # ============================================================
    
    # Find a "Trigger Item" (last non-drink item added)
    target_name = None
    if cart:
        for item in reversed(cart):
            if not isinstance(item, dict): continue
            name = item.get('name', "")
            if not any(x in name.lower() for x in ["wine", "drink", "water", "sauce", "coke", "soda"]):
                target_name = name
                break
        if not target_name and isinstance(cart[-1], dict):
            target_name = cart[-1].get('name')

    history = load_history()
    suggested_names = []

    if history and target_name:
        target_lower = normalize_name(target_name)
        counts = defaultdict(int)
        
        for order in history:
            items = [normalize_name(i.get('name', "")) for i in order.get('items', [])]
            # If order contained our target, see what else was bought
            if target_lower in items:
                for other in items:
                    if other != target_lower:
                        counts[other] += 1
                        
        suggested_names = [n for n, _ in sorted(counts.items(), key=lambda x: x[1], reverse=True)]

    # If simple history failed, just get most popular items globally
    if not suggested_names and history:
        counts = defaultdict(int)
        for order in history:
            for item in order.get('items', []):
                name = normalize_name(item.get('name', ""))
                if name: counts[name] += 1
        suggested_names = [n for n, _ in sorted(counts.items(), key=lambda x: x[1], reverse=True)]

    # Convert normalized suggestions back to real objects
    for norm_name in suggested_names:
        if norm_name not in seen_names and norm_name in menu_db:
            final_recs_objs.append(sanitize_item(menu_db[norm_name], "Popular Choice"))
            seen_names.add(norm_name)
        
        if len(final_recs_objs) >= 3: break

    # ============================================================
    # PRIORITY 3: RANDOM FILLER (Last Resort)
    # ============================================================
    
    attempts = 0
    # Convert menu keys to list for random choice
    menu_keys = list(menu_db.keys())
    
    while len(final_recs_objs) < 3 and menu_keys and attempts < 50:
        attempts += 1
        rnd_key = random.choice(menu_keys)
        
        if rnd_key not in seen_names:
            final_recs_objs.append(sanitize_item(menu_db[rnd_key], "You might also like"))
            seen_names.add(rnd_key)

    return final_recs_objs[:3]

# ==========================================
# 4. EXECUTION
# ==========================================
if __name__ == "__main__":
    try:
        input_data = sys.stdin.read()
        if not input_data.strip():
            input_data = "[]"

        result = get_recommendations(input_data)
        print(json.dumps(result))
    except Exception as e:
        # sys.stderr.write(str(e)) # Uncomment for debugging
        print("[]")