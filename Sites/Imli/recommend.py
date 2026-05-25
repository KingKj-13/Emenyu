# recommend.py
# (Analyzes the 'orders' folder to make the robot smart)

import json
import os
import glob
from collections import defaultdict

# --- CONFIGURATION ---
# This must match the folder where action_processor saves files
ORDERS_DIR = "orders" 

def _load_live_history():
    """
    Reads all the individual receipt files in the orders folder
    and combines them into a list for analysis.
    """
    all_orders = []
    
    # Check if folder exists
    if not os.path.exists(ORDERS_DIR):
        return []

    # Get all .json files in D:\Projects\Foundyourfood\orders
    search_path = os.path.join(ORDERS_DIR, "*.json")
    files = glob.glob(search_path)
    
    for file_path in files:
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                # We expect data to be a dict (one order)
                if isinstance(data, dict):
                    all_orders.append(data)
        except Exception:
            pass # Skip corrupt files
            
    return all_orders

def get_popular_items(top_n=3):
    """Returns a list of the most ordered items."""
    item_counts = defaultdict(int)
    history = _load_live_history()

    # If no history, return defaults so the robot isn't silent
    if not history:
        return ["Burger", "Chips", "Coke"]

    for order in history:
        items = order.get('items', [])
        for item in items:
            # Use 'original_name' if available, otherwise 'name'
            name = item.get('original_name') or item.get('name')
            qty = item.get('qty', 1)
            if name:
                item_counts[name.strip()] += qty

    # Sort by popularity
    sorted_items = sorted(item_counts.items(), key=lambda x: x[1], reverse=True)
    
    # Return just the names
    return [name for name, count in sorted_items[:top_n]]

def get_complementary_items(target_item, top_n=2):
    """
    If user orders 'Burger', this checks what ELSE people usually buy with burgers.
    """
    target_lower = target_item.lower().strip()
    pair_counts = defaultdict(int)
    history = _load_live_history()
    
    if not history:
        return []

    for order in history:
        # Get all item names in this specific order
        cart_items = []
        for item in order.get('items', []):
            name = item.get('original_name') or item.get('name')
            if name:
                cart_items.append(name.strip())
        
        # Check if the target item is in this cart
        # (We use 'in' to match "Burger" with "Cheese Burger")
        has_target = any(target_lower in x.lower() for x in cart_items)
        
        if has_target:
            # Tally up the OTHER items in this cart
            for other_item in cart_items:
                if target_lower not in other_item.lower(): # Don't recommend itself
                    pair_counts[other_item] += 1

    # Sort and return
    sorted_pairs = sorted(pair_counts.items(), key=lambda x: x[1], reverse=True)
    return [name for name, count in sorted_pairs[:top_n]]