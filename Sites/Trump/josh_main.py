# josh_main.py
import tts 
from stt import STT 
from recommend import get_popular_items, get_complementary_items 
import action_processor 
import json
import os
import time

# --- CONFIGURATION ---
TABLE_NUMBER = "1"  # This is "Table 1 Josh"
MENU_FILE_PATH = os.path.join("food", "TrumpMenu.json")
WAKE_WORDS = ["josh", "waiter", "excuse me", "hello josh"]
TIMEOUT_SECONDS = 30  

def play_wake_sound():
    try:
        import winsound
        winsound.Beep(1000, 200) 
    except:
        print("([PING] - Robot Woke Up)")

# --- Smart Menu Parsing ---
def parse_menu_items(node, menu_map, category_name="General"):
    try:
        if isinstance(node, dict):
            if "name" in node and "price" in node:
                original_name = node.get("name", "").strip()
                price = node.get("price")
                clean_key = action_processor.normalize_input_text(original_name)
                
                # Handle Duplicates by appending category
                if clean_key in menu_map and menu_map[clean_key]['price'] != price:
                    clean_key = f"{clean_key} {category_name.lower()}"
                
                if clean_key:
                    menu_map[clean_key] = {
                        'original_name': original_name, 
                        'price': price,
                        'qty': 1,
                        'category': category_name,
                        'clean_key': clean_key
                    }
                return 

            if "items" in node and isinstance(node["items"], list):
                parse_menu_items(node["items"], menu_map, category_name) 
            
            for key, value in node.items():
                if isinstance(value, (dict, list)) and key != "items":
                    parse_menu_items(value, menu_map, category_name=key)
                elif key == "items":
                    parse_menu_items(value, menu_map, category_name)
                
        elif isinstance(node, list):
            for item in node:
                parse_menu_items(item, menu_map, category_name)
    except Exception as e:
        print(f"Error parsing menu node: {e}")

# --- Main Class ---
class HeadlessWaiter:
    def __init__(self):
        print(f"System: Initializing Josh AI for Table {TABLE_NUMBER}...")
        self.listener = STT()
        self.menu_map = {} 
        self.load_menu()
        self.all_item_names = list(self.menu_map.keys())
        
        # --- PERSISTENCE: LOAD EXISTING CART ---
        self.cart = action_processor.load_active_cart(TABLE_NUMBER)
        if self.cart:
            print(f"System: Resumed active session. Found {len(self.cart)} items.")
        else:
            print("System: Starting fresh session.")

        self.is_awake = False
        self.last_interaction_time = 0

    def load_menu(self):
        try:
            print(f"System: Loading menu from '{MENU_FILE_PATH}'...")
            with open(MENU_FILE_PATH, 'r', encoding='utf-8') as f:
                data = json.load(f)
                parse_menu_items(data, self.menu_map)
            print(f"System: Menu loaded. {len(self.menu_map)} unique items found.")
        except Exception as e:
            print(f"CRITICAL ERROR: Could not load menu. {e}")
            self.menu_map = {}

    def run(self):
        print(f"\n--- JOSH IS READY (Table {TABLE_NUMBER}) ---")
        try:
            while True:
                spoken_text = self.listener.listen()
                if not spoken_text: continue
                
                print(f"You said: '{spoken_text}'") 
                text_lower = spoken_text.lower()
                current_time = time.time()

                if not self.is_awake:
                    if any(word in text_lower for word in WAKE_WORDS):
                        self.wake_up()
                else:
                    if current_time - self.last_interaction_time > TIMEOUT_SECONDS:
                        self.go_to_sleep()
                        continue
                    self.last_interaction_time = current_time 
                    self.process_command(text_lower, spoken_text)
        except KeyboardInterrupt:
            print("\nSystem: Powering down.")

    def wake_up(self):
        self.is_awake = True
        self.last_interaction_time = time.time()
        play_wake_sound()
        
        # Optional: Remind them if they have an open order
        if self.cart:
            tts.speak("Welcome back. I still have your previous order open.")
        else:
            tts.speak("Yes?") 

    def go_to_sleep(self):
        self.is_awake = False
        print("System: Timeout. Going to standby.")

    def update_cart_and_save(self):
        """Helper to save state immediately."""
        action_processor.save_active_cart(self.cart, TABLE_NUMBER)

    def process_command(self, text_lower, original_text):
        
        # 1. CHECKOUT
        if any(x in text_lower for x in ["check out", "bill", "total", "pay"]):
            if not self.cart:
                tts.speak("Your cart is empty.")
            else:
                success, msg, final_amt = action_processor.save_order_to_json(self.cart, TABLE_NUMBER)
                if success:
                    tts.speak(f"Order placed. Total is {final_amt} rand. Thank you.")
                    self.cart = [] # Clear memory
                    # Note: save_order_to_json already deletes the active file
                    self.go_to_sleep()
                else:
                    tts.speak(f"Error: {msg}")

        # 2. CART STATUS
        elif "cart" in text_lower or "read order" in text_lower:
            if not self.cart:
                tts.speak("Nothing ordered yet.")
            else:
                tts.speak("You currently have:")
                for item in self.cart:
                    tts.speak(f"{item['qty']} {item['name']}") 
                total = action_processor.get_cart_subtotal(self.cart)
                tts.speak(f"Subtotal is {total} rand.")

        # 3. RECOMMENDATIONS
        elif "recommend" in text_lower or "popular" in text_lower:
            recs = get_popular_items(top_n=3)
            tts.speak(f"I recommend {', '.join(recs)}.")

        # 4. EXIT
        elif "stop" in text_lower or "cancel" in text_lower:
            tts.speak("Okay.")
            self.go_to_sleep()

        # 5. ORDERING
        elif any(x in text_lower for x in ["have", "want", "add", "get", "like", "do", "order"]):
            
            found_items = action_processor.find_items_in_text(original_text, self.all_item_names, self.menu_map)
            
            if not found_items:
                tts.speak("Sorry, I didn't catch that item.")
                return

            for item in found_items:
                item_name = item['name']
                new_qty = item['qty']
                
                # --- DUPLICATE CHECK LOGIC ---
                existing_item = next((x for x in self.cart if x['name'] == item_name), None)
                
                if existing_item:
                    current_qty = existing_item['qty']
                    total_qty = current_qty + new_qty
                    
                    # Ask the specific question requested
                    tts.speak(f"You already have {current_qty} {item_name}. Do you want to order {total_qty} of this item?")
                    
                    # Listen for confirmation
                    confirm = self.listener.listen().lower()
                    print(f"Confirmation heard: {confirm}")
                    
                    if "yes" in confirm or "yeah" in confirm:
                        existing_item['qty'] = total_qty
                        tts.speak(f"Updated {item_name} to {total_qty}.")
                        self.update_cart_and_save()
                    else:
                        tts.speak(f"Okay, keeping it at {current_qty}.")
                        # Do not add
                    continue

                # --- Normal Add ---
                # Kingklip check
                if "kingklip" in item_name.lower():
                    tts.speak("Did you say Kingklip?")
                    confirmation = self.listener.listen().lower()
                    if "yes" not in confirmation: continue

                self.cart.append(item)
                tts.speak(f"Added {new_qty} {item_name}.")
                self.update_cart_and_save() # Save immediately
                
                # Upsell
                comps = get_complementary_items(item_name, top_n=1)
                if comps:
                    time.sleep(0.5)
                    tts.speak(f"Would you like {comps[0]} with that?")
        
        else:
            print(f"System: Ignored '{text_lower}'")

if __name__ == "__main__":
    bot = HeadlessWaiter()
    bot.run()