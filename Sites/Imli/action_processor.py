# action_processor.py
import json
import os
import re
import datetime
import time

# --- Configuration ---
ORDERS_DIR = "orders"
os.makedirs(ORDERS_DIR, exist_ok=True) 

VAT_RATE = 0.15 
SERVICE_RATE = 0.05 

def normalize_input_text(text):
    """Cleans input text for matching."""
    if not text: return ""
    text = re.sub(r'[^\w\s]', '', text).strip().lower()
    text = re.sub(r'\b(a|an|the|and|i have|i will have|id like|let us|lets)\b', ' ', text) 
    text = re.sub(r'\b(grams|gram)\b', 'g', text)
    text = re.sub(r'\b(stake|rumstate)\b', 'steak', text)
    text = re.sub(r'\b(king clip)\b', 'kingklip', text)
    return re.sub(r'\s+', ' ', text).strip()

def find_items_in_text(text, all_item_names, item_map):
    found_items = []
    text_lower = normalize_input_text(text)
    sorted_names = sorted(all_item_names, key=len, reverse=True)
    qty_map = {'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5}

    for item_key in sorted_names:
        if item_key in text_lower:
            item_data = item_map[item_key]
            qty = 1
            
            # Check for quantity word before item
            preceding_text = text_lower.split(item_key)[0].strip()
            if preceding_text:
                last_word = preceding_text.split()[-1]
                if last_word.isdigit():
                    qty = int(last_word)
                elif last_word in qty_map:
                    qty = qty_map[last_word]

            found_items.append({
                "name": item_data['original_name'], 
                "price": item_data['price'], 
                "qty": qty,
                "clean_key": item_key # Useful for duplicate checking
            })
            text_lower = text_lower.replace(item_key, "", 1)

    return found_items

def get_cart_subtotal(cart):
    total = 0.0
    for item in cart:
        total += float(item.get("price", 0)) * item.get("qty", 1)
    return total

# --- NEW: ACTIVE CART MANAGEMENT (Persistence) ---

def get_active_file_path(table_number):
    return os.path.join(ORDERS_DIR, f"active_table_{table_number}.json")

def save_active_cart(cart, table_number):
    """Saves the current cart to a temporary file immediately."""
    filepath = get_active_file_path(table_number)
    try:
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(cart, f, indent=2)
    except Exception as e:
        print(f"Error saving active cart: {e}")

def load_active_cart(table_number):
    """Loads the cart from the temporary file if it exists."""
    filepath = get_active_file_path(table_number)
    if os.path.exists(filepath):
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                return json.load(f)
        except:
            return []
    return []

def delete_active_cart(table_number):
    """Removes the temporary file after successful checkout."""
    filepath = get_active_file_path(table_number)
    if os.path.exists(filepath):
        os.remove(filepath)

# --- CHECKOUT LOGIC ---

def save_order_to_json(cart, table_number="1"):
    if not cart:
        return False, "Cart is empty", 0.0

    try:
        subtotal = get_cart_subtotal(cart)
        vat_amount = round(subtotal * VAT_RATE, 2)
        service_amount = round(subtotal * SERVICE_RATE, 2)
        final_total = round(subtotal + vat_amount + service_amount, 2)

        timestamp = datetime.datetime.now().isoformat() + "Z"
        unique_id = int(time.time() * 1000) 
        filename = f"order_table_{table_number}_{unique_id}.json"

        order_data = {
            "table_number": str(table_number),
            "items": cart,
            "timestamp": timestamp,
            "totals": {
                "subtotal": subtotal,
                "vat": vat_amount,
                "service": service_amount,
                "tip": 0,
                "total": final_total
            },
            "filename": filename,
            "status": "pending"
        }

        full_path = os.path.join(ORDERS_DIR, filename)
        with open(full_path, "w", encoding="utf-8") as f:
            json.dump(order_data, f, indent=2)
            
        # CLEAR THE TEMP FILE NOW
        delete_active_cart(table_number)

        return True, "Success", final_total

    except Exception as e:
        print(f"Error saving: {e}")
        return False, str(e), 0.0