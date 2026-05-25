"""
🇬🇷 JOSH 10.0 - MYTHOS RESTAURANT AI SOMMELIER (INTERACTIVE & CONVERSATIONAL)
=====================================================================================
Production-ready Flask chatbot with:
✅ CONVERSATIONAL AI - talks like a real Greek waiter, not a bot
✅ Interactive item popout system (frontend integration)
✅ Wine sommelier pairings (flavor science-based)
✅ Food pairing expert (taste profiles, cuisines)
✅ Friendly Greek waiter personality with natural dialogue
✅ Session-based conversation memory
✅ Dietary/allergy filtering (INCLUDING VEGAN!)
✅ Smart fallback recommendations
✅ Admin learning system

Author: Josh | Restaurant: Mythos Greek
Prices in South African Rand (R)
"""

import json
import os
import glob
import random
import datetime
import requests
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


MENU_FILE = os.path.join(FOOD_DIR, "MythosMenu.json")
LEARNED_QA_FILE = os.path.join(DATA_DIR, "learned_qa.json")
UNKNOWN_QUESTIONS_FILE = os.path.join(DATA_DIR, "unknown_questions.json")


def ensure_files_exist():
    """Initialize JSON learning files."""
    if not os.path.exists(LEARNED_QA_FILE):
        with open(LEARNED_QA_FILE, 'w', encoding='utf-8') as f:
            json.dump({"qa_pairs": []}, f, indent=2)
    
    if not os.path.exists(UNKNOWN_QUESTIONS_FILE):
        with open(UNKNOWN_QUESTIONS_FILE, 'w', encoding='utf-8') as f:
            json.dump({"unknown": []}, f, indent=2)


ensure_files_exist()


# ==============================================================================
# 1. WINE SCIENCE ENGINE - FLAVOR PROFILING
# ==============================================================================
class WineFlavorProfiles:
    """Wine flavor profiles & pairing science."""
    
    def __init__(self):
        self.wines = {
            "Spier Signature Sauvignon Blanc": {
                "flavor_profile": "tropical, herbaceous, zesty",
                "weight": "light",
                "acidity": "high",
                "pairs_with": ["fish", "calamari", "seafood", "oyster", "prawn", "shrimp", "salad"],
                "avoid": ["beef", "lamb", "dark sauces"],
                "price": 95,
                "reason": "Bright acidity cuts through ocean flavors"
            },
            "Durbanville Hills Sauvignon Blanc": {
                "flavor_profile": "citrus, green apple, stone fruit",
                "weight": "light",
                "acidity": "high",
                "pairs_with": ["fish", "seafood", "chicken", "light poultry", "vegetables"],
                "avoid": ["red meat", "heavy cream"],
                "price": 80,
                "reason": "Crisp and refreshing, perfect for lighter dishes"
            },
            "Two Oceans Sauvignon Blanc": {
                "flavor_profile": "grapefruit, passionfruit, herbaceous",
                "weight": "light",
                "acidity": "high",
                "pairs_with": ["calamari", "squid", "mussels", "fish", "seafood"],
                "avoid": ["beef", "lamb"],
                "price": 120,
                "reason": "Perfect match for mollusks & crustaceans"
            },
            "Boschendal 1685 Chardonnay": {
                "flavor_profile": "butter, vanilla, oak, stone fruit",
                "weight": "full",
                "acidity": "medium",
                "pairs_with": ["chicken", "pasta", "cream sauces", "seafood"],
                "avoid": ["spicy dishes"],
                "price": 150,
                "reason": "Creamy texture matches buttery dishes"
            },
            "Nederburg The Winemasters Cabernet Sauvignon": {
                "flavor_profile": "dark cherry, plum, oak, tannins",
                "weight": "full",
                "acidity": "medium",
                "pairs_with": ["beef", "lamb", "steak", "meatballs", "rich meats"],
                "avoid": ["fish", "light poultry"],
                "price": 125,
                "reason": "Tannins grip onto rich meat flavors beautifully"
            },
            "KWV Roodeberg Red Blend": {
                "flavor_profile": "blackberry, spice, smooth tannins",
                "weight": "full",
                "acidity": "high",
                "pairs_with": ["beef", "lamb", "keftethes", "soutzoukakia", "grilled meats"],
                "avoid": ["delicate fish"],
                "price": 199,
                "reason": "Spicy notes match Greek meatballs & seasoning"
            },
            "Porcupine Ridge Shiraz": {
                "flavor_profile": "dark berry, pepper, bold",
                "weight": "full",
                "acidity": "high",
                "pairs_with": ["lamb chops", "beef strips", "spicy meats", "grilled proteins"],
                "avoid": ["fish", "seafood"],
                "price": 140,
                "reason": "Pepper notes complement charred, grilled meats"
            },
            "Fairview Pinotage": {
                "flavor_profile": "dark cherry, earthy, medium-bodied",
                "weight": "medium-full",
                "acidity": "high",
                "pairs_with": ["chicken", "beef", "lamb", "Mediterranean flavors"],
                "avoid": ["delicate seafood"],
                "price": 130,
                "reason": "Earthy notes match Greek herbs & olive oil"
            },
            "Nederburg Baronne Red Blend": {
                "flavor_profile": "cherry, plum, elegant, balanced",
                "weight": "medium-full",
                "acidity": "medium",
                "pairs_with": ["chicken", "beef", "pasta", "versatile"],
                "avoid": ["none - very versatile"],
                "price": 140,
                "reason": "Balanced blend works with most dishes"
            },
            "Simonsig Kaapse Vonkel Brut Cap Classique": {
                "flavor_profile": "brioche, citrus, elegant bubbles",
                "weight": "light-medium",
                "acidity": "high",
                "pairs_with": ["seafood", "appetizers", "meze", "celebrations"],
                "avoid": ["none - aperitif wine"],
                "price": 220,
                "reason": "Bubbles and acidity pair with everything festive"
            },
            "Castle Lager": {
                "flavor_profile": "crisp, malty, clean",
                "weight": "light",
                "acidity": "low",
                "pairs_with": ["chicken", "seafood", "light dishes", "spicy food"],
                "avoid": ["bold wines only"],
                "price": 24,
                "reason": "Carbonation cleanses palate between bites"
            },
            "Heineken": {
                "flavor_profile": "malty, balanced, smooth",
                "weight": "medium",
                "acidity": "low",
                "pairs_with": ["beef", "lamb", "grilled meats", "seafood"],
                "avoid": ["none"],
                "price": 28,
                "reason": "Classic pairing with Greek proteins"
            }
        }
    
    def get_wine_for_food(self, food_name, food_desc):
        """Recommend wine based on food item."""
        food_lower = (food_name + " " + food_desc).lower()
        
        if any(w in food_lower for w in ["prawn", "calamari", "squid", "fish", "oyster", "mussel", "seafood", "hake", "sole"]):
            return "Spier Signature Sauvignon Blanc"
        elif any(w in food_lower for w in ["beef", "tomahawk", "fillet", "steak", "rump"]):
            return "Nederburg The Winemasters Cabernet Sauvignon"
        elif any(w in food_lower for w in ["lamb", "chops", "souvlaki"]):
            return "Porcupine Ridge Shiraz"
        elif any(w in food_lower for w in ["chicken", "poultry", "pasta"]):
            return "Boschendal 1685 Chardonnay"
        elif any(w in food_lower for w in ["meatball", "keftethes", "soutzoukakia"]):
            return "KWV Roodeberg Red Blend"
        elif any(w in food_lower for w in ["meze", "appetizer", "starter"]):
            return "Simonsig Kaapse Vonkel Brut Cap Classique"
        else:
            return "Fairview Pinotage"


wine_science = WineFlavorProfiles()


# ==============================================================================
# 2. KNOWLEDGE ENGINE
# ==============================================================================
class KnowledgeEngine:
    """Search Wikipedia for Greek culture, food, history facts."""
    
    def __init__(self):
        self.greece_keywords = [
            'greece', 'greek', 'athens', 'sparta', 'moussaka', 'souvlaki', 
            'ouzo', 'gyro', 'tzatziki', 'feta', 'mediterranean', 'olympus',
            'ancient', 'myth', 'mythology', 'orthodox', 'olive', 'wine'
        ]
    
    def is_knowledge_question(self, msg):
        """Check if user is asking a knowledge question."""
        knowledge_triggers = ['what is', 'what are', 'tell me', 'who is', 'how to', 
                             'explain', 'why', 'when was', 'where is', 'what about']
        return any(trigger in msg.lower() for trigger in knowledge_triggers)
    
    def search_wikipedia(self, query):
        """Search Wikipedia for information."""
        try:
            search_url = "https://en.wikipedia.org/w/api.php"
            params = {
                'action': 'query',
                'list': 'search',
                'srsearch': query,
                'format': 'json',
                'utf8': True,
                'srnamespace': 0
            }
            
            response = requests.get(search_url, params=params, timeout=3)
            results = response.json().get('query', {}).get('search', [])
            
            if results:
                title = results[0]['title']
                snippet = results[0]['snippet'].replace('<span class="searchmatch">', '').replace('</span>', '')
                
                article_url = "https://en.wikipedia.org/w/api.php"
                article_params = {
                    'action': 'query',
                    'titles': title,
                    'prop': 'extracts',
                    'explaintext': True,
                    'format': 'json'
                }
                
                article_response = requests.get(article_url, params=article_params, timeout=3)
                pages = article_response.json().get('query', {}).get('pages', {})
                
                if pages:
                    page_id = list(pages.keys())[0]
                    extract = pages[page_id].get('extract', '').split('\n')[0]
                    
                    return {
                        'title': title,
                        'snippet': snippet,
                        'extract': extract[:300] + '...' if len(extract) > 300 else extract,
                        'found': True
                    }
        except Exception as e:
            print(f"⚠️ Knowledge search error: {e}")
        
        return {'found': False, 'error': 'Could not find information'}


knowledge_engine = KnowledgeEngine()


# ==============================================================================
# 3. CONVERSATIONAL PERSONALITY ENGINE
# ==============================================================================
class ConversationalGreekPersonality:
    """REAL conversations, not bot-like responses."""
    
    def __init__(self):
        self.greetings = [
            "Yassas! 🇬🇷 Welcome to Mythos, my friend! How's your day been?",
            "Kalimera! The kitchen is buzzing today. What brings you in?",
            "Opa! Welcome, welcome! First time here or are you a regular?",
            "Efharisto for stopping by! I'm Josh, your waiter. Can I help you discover something amazing?",
            "Kaliséra! You picked a good day to join us. What sounds good?",
            "Welcome! Prepare yourself for a real Greek feast. What are you in the mood for?",
            "Hey there! Let me tell you, we've got some incredible dishes today.",
        ]
        
        self.food_questions = [
            "What kind of flavors are you craving? Something light or hearty?",
            "Are you a seafood person or do you prefer meat? I can point you in the right direction!",
            "How hungry are you? We've got small plates or full meals!",
            "Any dietary preferences I should know about? Allergies, vegetarian, anything?",
            "First time trying Greek food, or are you a fan already?",
        ]
        
        self.follow_ups = [
            "How does that sound to you?",
            "Want me to tell you more, or should we just go for it?",
            "Does that appeal to you?",
            "Interested? I can tell you why it's so good!",
            "Trust me on this one - what do you think?",
        ]
        
        self.confirmations = [
            "Excellent choice, my friend! You have great taste!",
            "Polígala! (Very good!) Now we're talking!",
            "Perfect! The Chef will be delighted!",
            "Now THAT is what I like to hear! Wonderful selection!",
            "Bravo! You know Greek food! Smart choice!",
        ]
        
        self.wine_dialogues = [
            "Now, shall we find the perfect drink to go with this? Trust me, the right wine makes ALL the difference!",
            "You know what would make this AMAZING? The right pairing. Want me to suggest something?",
            "Listen, I've seen people's faces light up when they taste the perfect pairing with this dish. Let me help you!",
            "Can I recommend a wine that will take this to the next level?",
            "The secret to a great meal? The right drink! What do you say?",
        ]
    
    def greet(self):
        greeting = random.choice(self.greetings)
        if random.choice([True, False]):
            greeting += f"\n\n{random.choice(self.food_questions)}"
        return greeting
    
    def ask_preferences(self):
        return random.choice(self.food_questions)
    
    def present_item(self, item_name, description):
        """Present item conversationally."""
        starters = [
            f"You know what's calling your name? Our **{item_name}**.",
            f"I've got something special for you: **{item_name}**.",
            f"Trust me on this - **{item_name}** is EXACTLY what you need.",
            f"Picture this: **{item_name}** with fresh herbs and perfection. That's our **{item_name}**.",
            f"Let me tell you about **{item_name}**...",
        ]
        
        reply = random.choice(starters)
        reply += f"\n\n{description}"
        reply += f"\n\n{random.choice(self.follow_ups)}"
        return reply
    
    def confirm_with_enthusiasm(self, item_name):
        return f"{random.choice(self.confirmations)} **{item_name}** - *chef's kiss* 👌"
    
    def suggest_pairing(self, wine_name, wine_obj):
        """Suggest wine pairing conversationally."""
        starters = [
            f"Now listen, with this dish, you NEED **{wine_name}**.",
            f"Here's the thing - **{wine_name}** was practically made for this.",
            f"I'm telling you, pair this with **{wine_name}** and your taste buds will thank me.",
            f"The magic pairing? **{wine_name}**. Trust me.",
            f"You want to know the secret? **{wine_name}** with this dish is *perfection*.",
        ]
        
        reply = random.choice(starters)
        reply += f"\n\n💡 *Why?* {wine_obj.get('reason', 'Perfect match!')}"
        return reply
    
    def show_item_popup(self, item):
        """Return item data for frontend popup."""
        return {
            "action": "show_popup",
            "item": {
                "name": item.get('name'),
                "description": item.get('description', ''),
                "price": item.get('price'),
                "calories": item.get('calories', 'N/A'),
                "allergens": item.get('allergens', 'None'),
                "image": item.get('img', ''),
                "video": item.get('video', '')
            }
        }
    
    def allergen_acknowledgment(self, excluded):
        responses = [
            f"Got you! No {', '.join(excluded)} - I'll make sure to keep those off your plate.",
            f"No problem at all! No {', '.join(excluded)} for you. I'll remember that.",
            f"Smart thinking! I'll steer you clear of {', '.join(excluded)}. What else can I recommend?",
            f"You're safe with me! Zero {', '.join(excluded)} in anything I suggest for you.",
        ]
        return random.choice(responses)


personality = ConversationalGreekPersonality()


# ==============================================================================
# 4. LEARNING ENGINE
# ==============================================================================
class LearningEngine:
    """Stores unknown questions for admin to answer."""
    
    @staticmethod
    def add_unknown_question(question, user_id):
        """Log unknown question for admin review."""
        try:
            with open(UNKNOWN_QUESTIONS_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            if question not in [q['question'] for q in data['unknown']]:
                data['unknown'].append({
                    "question": question,
                    "user_id": user_id,
                    "timestamp": datetime.datetime.now().isoformat(),
                    "answered": False
                })
                
                with open(UNKNOWN_QUESTIONS_FILE, 'w', encoding='utf-8') as f:
                    json.dump(data, f, indent=2)
        except Exception as e:
            print(f"Error logging question: {e}")
    
    @staticmethod
    def get_learned_answer(question):
        """Check if we've learned this question."""
        try:
            with open(LEARNED_QA_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            question_lower = question.lower().strip()
            for qa in data['qa_pairs']:
                if qa['question'].lower() == question_lower:
                    return qa['answer']
        except:
            pass
        
        return None
    
    @staticmethod
    def add_learned_answer(question, answer):
        """Admin adds answer -> bot learns it."""
        try:
            with open(LEARNED_QA_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            data['qa_pairs'].append({
                "question": question,
                "answer": answer,
                "learned_at": datetime.datetime.now().isoformat()
            })
            
            with open(LEARNED_QA_FILE, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2)
        except Exception as e:
            print(f"Error adding answer: {e}")


learner = LearningEngine()


# ==============================================================================
# 5. RECOMMENDER ENGINE
# ==============================================================================
class RecommenderEngine:
    """Menu search with fuzzy matching & allergy filtering."""
    
    def __init__(self):
        self.all_items = []
        self.popular = []
        
        self.allergen_map = {
            'seafood': ['fish', 'hake', 'sole', 'sardine', 'kingklip', 'prawn', 'shrimp', 
                       'oyster', 'mussel', 'calamari', 'squid', 'shellfish', 'crustacean', 'mollusk'],
            'fish': ['fish', 'hake', 'sole', 'sardine', 'kingklip'],
            'shellfish': ['oyster', 'mussel'],
            'crustacean': ['prawn', 'shrimp'],
            'mollusk': ['calamari', 'squid'],
            'dairy': ['cheese', 'milk', 'feta', 'halloumi', 'cream', 'yogurt', 'butter'],
            'gluten': ['bread', 'pasta', 'phyllo'],
            'nuts': ['nuts', 'almond', 'pecan', 'walnut'],
            'egg': ['egg', 'eggs'],
            'pork': ['pork'],
            'beef': ['beef'],
            'lamb': ['lamb'],
            'meat': ['beef', 'chicken', 'lamb', 'pork', 'fish', 'seafood', 'prawn', 'calamari', 
                    'squid', 'oyster', 'mussel', 'keftethes', 'biftekia', 'souvlaki']
        }
    
    def load_menu(self):
        """Load menu from MythosMenu.json."""
        try:
            if not os.path.exists(MENU_FILE):
                print(f"❌ Menu file not found: {MENU_FILE}")
                return False
            
            with open(MENU_FILE, "r", encoding="utf-8") as f:
                raw = json.load(f)
            
            flat = []
            
            def flatten(node):
                if isinstance(node, list):
                    for item in node:
                        flatten(item)
                elif isinstance(node, dict):
                    if "items" in node:
                        for item in node["items"]:
                            if item.get("visible", True):
                                flat.append(item)
                    for value in node.values():
                        if value != node.get("items"):
                            flatten(value)
            
            flatten(raw)
            self.all_items = flat
            self.calc_popular()
            print(f"✅ Loaded {len(flat)} menu items from Mythos!")
            return True
        
        except Exception as e:
            print(f"❌ Error loading menu: {e}")
            return False
    
    def calc_popular(self):
        """Calculate popular items from recent orders."""
        try:
            counts = Counter()
            for order_file in sorted(glob.glob(os.path.join(ORDERS_DIR, "*.json")))[-50:]:
                try:
                    with open(order_file, 'r', encoding='utf-8') as f:
                        order = json.load(f)
                        for item in order.get('items', []):
                            counts[item.get('name', '')] += 1
                except:
                    pass
            
            if counts:
                popular_names = [name for name, _ in counts.most_common(10)]
                self.popular = [i for i in self.all_items if i.get('name') in popular_names]
            else:
                self.popular = self.all_items[:10]
        
        except Exception as e:
            print(f"⚠️ Could not calculate popular: {e}")
    
    def should_exclude_item(self, item, exclude_list):
        """Check if item should be excluded."""
        if not exclude_list:
            return False
        
        name = item.get('name', '').lower()
        desc = item.get('description', '').lower()
        allergens = item.get('allergens', '').lower()
        full_text = f"{name} {desc} {allergens}"
        
        for exc in exclude_list:
            exc_lower = exc.lower()
            
            if exc_lower in name or exc_lower in desc:
                return True
            
            if exc_lower in self.allergen_map:
                for keyword in self.allergen_map[exc_lower]:
                    if keyword in allergens or keyword in full_text:
                        return True
            
            if exc_lower in full_text:
                return True
        
        return False
    
    def search(self, query, threshold=0.5, exclude=None):
        """Fuzzy search with filtering."""
        if not query or not self.all_items:
            return []
        
        if exclude is None:
            exclude = []
        
        query = query.lower().strip()
        matches = []
        
        for item in self.all_items:
            if self.should_exclude_item(item, exclude):
                continue
            
            name = item.get('name', '').lower()
            desc = item.get('description', '').lower()
            full_text = f"{name} {desc}"
            
            score = 0.0
            if query == name:
                score = 1.0
            elif query in name:
                score = 0.9
            elif any(word == query for word in name.split()):
                score = 0.85
            elif query in desc:
                score = 0.7
            else:
                score = SequenceMatcher(None, query, name).ratio()
            
            if score >= threshold:
                matches.append((score, item))
        
        matches.sort(key=lambda x: x[0], reverse=True)
        return [m[1] for m in matches]
    
    def get_random_food(self, exclude=None):
        """Random food item."""
        food_keywords = ['wine', 'beer', 'cocktail', 'coffee', 'tea', 'water', 'juice', 'frappe', 'cappuccino', 'lager']
        candidates = [item for item in self.all_items 
                      if not any(kw in item.get('name', '').lower() for kw in food_keywords)]
        
        if exclude:
            candidates = [item for item in candidates if not self.should_exclude_item(item, exclude)]
        
        return random.choice(candidates) if candidates else None
    
    def get_random_drink(self, exclude=None):
        """Random drink item."""
        drink_keywords = ['wine', 'beer', 'cocktail', 'coffee', 'tea', 'water', 'juice', 'frappe', 'cappuccino', 'espresso', 'lager']
        candidates = [item for item in self.all_items 
                      if any(kw in item.get('name', '').lower() for kw in drink_keywords)]
        
        if exclude:
            candidates = [item for item in candidates if not self.should_exclude_item(item, exclude)]
        
        return random.choice(candidates) if candidates else None


recommender = RecommenderEngine()


# ==============================================================================
# 6. SESSION MANAGEMENT
# ==============================================================================
def clean_input(text):
    """Normalize text & fix typos."""
    if not text:
        return ""
    
    corrections = {
        "whats": "what is", "whos": "who is", "hwo": "how",
        "alkohol": "alcohol", "bier": "beer", "recommedn": "recommend",
        "dont": "do not", "wanna": "want to", "im": "i am",
        "youre": "you are", "starving": "hungry", "famished": "hungry"
    }
    
    words = text.lower().split()
    return " ".join([corrections.get(w, w) for w in words])


user_sessions = {}


def get_session(uid):
    """Get or create session."""
    if uid not in user_sessions:
        user_sessions[uid] = {
            "history": [],
            "order_history": [],
            "state": "neutral",
            "exclude": [],
            "cart": [],
            "last_food": None,
            "last_drink": None,
            "conversation_count": 0,
            "no_alcohol": False
        }
    return user_sessions[uid]


# ==============================================================================
# FLASK ROUTES
# ==============================================================================
@app.route('/chat', methods=['POST'])
def chat():
    """Main chat endpoint."""
    try:
        data = request.json or {}
        raw_msg = data.get('message', '').strip()
        
        if not raw_msg:
            return jsonify({"reply": personality.greet()})
        
        uid = request.remote_addr
        session = get_session(uid)
        msg = clean_input(raw_msg)
        session['conversation_count'] += 1
        
        print(f"\n[USER] {raw_msg}")
        print(f"[STATE] {session['state']} | [EXCLUDE] {session['exclude']} | [NO_ALCOHOL] {session['no_alcohol']}")
        
        # ===== GREETING (FIRST PRIORITY) =====
        greeting_words = ["hi", "hello", "hey", "yassas", "kalimera", "hiya", "sup", "yo", "greetings", "howdy"]
        if any(word in msg.split() for word in greeting_words) and len(msg.split()) <= 3:
            return jsonify({"reply": personality.greet()})
        
        # ===== CHECK LEARNED ANSWERS =====
        learned = learner.get_learned_answer(msg)
        if learned:
            return jsonify({"reply": learned})
        
        # ===== NO ALCOHOL PREFERENCE =====
        if any(x in msg for x in ["no alcohol", "dont want alcohol", "do not want alcohol", "i dont want alcohol", "without alcohol"]):
            session['no_alcohol'] = True
            session['exclude'].append('alcohol')
            return jsonify({"reply": "Perfect! No alcohol for you. Let me show you our non-alcoholic options or food menu instead. What sounds good?"})
        
        # ===== ALLERGIES/DISLIKES =====
        if any(x in msg for x in ["hate", "allergy", "allergic", "do not like", "dont like", "avoid", "no dairy", "no seafood", "no gluten", "no nuts", "no meat", "hate meat"]):
            bad = [w for w in ["beef", "chicken", "pork", "fish", "lamb", "seafood", "dairy", "nuts", 
                              "shellfish", "gluten", "egg", "prawn", "calamari", "squid", "oyster", "mussel", "meat"] 
                   if w in msg]
            
            # If user says "hate meat" or "no meat", add all meat types
            if "hate meat" in msg or "no meat" in msg or "dont like meat" in msg or "do not like meat" in msg:
                bad.extend(["beef", "chicken", "pork", "lamb", "fish", "seafood", "prawn", "calamari", "squid", "oyster", "mussel", "meat"])
            
            if bad:
                session['exclude'].extend(bad)
                session['exclude'] = list(set(session['exclude']))
                return jsonify({"reply": personality.allergen_acknowledgment(list(set(bad)))})
        
        # ===== VEGAN REQUEST =====
        if any(x in msg for x in ["vegan", "i am vegan", "im vegan", "i'm vegan"]):
            session['exclude'].extend(['meat', 'beef', 'chicken', 'lamb', 'pork', 'fish', 'seafood', 'dairy', 'egg', 'honey'])
            session['exclude'] = list(set(session['exclude']))
            
            # Find truly vegan items (no animal products)
            animal_keywords = ["beef", "chicken", "lamb", "pork", "fish", "prawn", "calamari", "squid", "oyster", 
                               "mussel", "meat", "cheese", "feta", "halloumi", "cream", "milk", "butter", "egg", 
                               "honey", "yogurt", "keftethes", "biftekia", "souvlaki"]
            
            vegan_items = [item for item in recommender.all_items 
                           if not any(keyword in item.get('name', '').lower() + " " + 
                                     item.get('description', '').lower() + " " + 
                                     item.get('allergens', '').lower() 
                                     for keyword in animal_keywords)]
            
            if vegan_items:
                best = vegan_items[0]
                reply = "Perfect! As a vegan, here's something completely plant-based for you:\n\n"
                reply += personality.present_item(best.get('name'), best.get('description', ''))
                reply += f"\n\n💰 **R{best.get('price')}**"
                reply += "\n\n🌱 *100% vegan-friendly!*"
                
                session['history'] = [best]
                return jsonify({
                    "reply": reply,
                    "suggested": [best]
                    # Removed **personality.show_item_popup(best) to stop auto popup
                })
            else:
                return jsonify({"reply": "I'm so sorry, but we don't currently have fully vegan options on our menu. Greek cuisine traditionally uses a lot of dairy and meat. Would you like to see our vegetarian options or dishes we can modify?"})
        
        # ===== VEGETARIAN/DIETARY REQUESTS =====
        if any(x in msg for x in ["vegetarian", "veg", "veggie", "no meat", "plant based", "plant-based"]):
            # Search for items without meat/fish keywords
            meat_keywords = ["beef", "chicken", "lamb", "pork", "fish", "prawn", "calamari", "meat", 
                             "keftethes", "biftekia", "souvlaki", "oyster", "mussel", "squid"]
            veg_items = [item for item in recommender.all_items 
                         if not any(meat in item.get('name', '').lower() + " " + item.get('description', '').lower() 
                                    for meat in meat_keywords)
                         and not recommender.should_exclude_item(item, session['exclude'])]
            
            if veg_items:
                best = veg_items[0]
                reply = "Perfect! Here's something vegetarian:\n\n"
                reply += personality.present_item(best.get('name'), best.get('description', ''))
                reply += f"\n\n💰 **R{best.get('price')}**"
                
                session['history'] = [best]
                return jsonify({
                    "reply": reply,
                    "suggested": [best]
                    # Removed **personality.show_item_popup(best) to stop auto popup
                })
        
        # ===== CONTEXT: "IN FOOD" or "FOOD SPECIALS" =====
        if any(x in msg for x in ["in food", "food special", "food menu", "authentic", "traditional", "greek food"]):
            items = [item for item in recommender.popular if not recommender.should_exclude_item(item, session['exclude'])][:3]
            # Filter out drinks
            food_only = [item for item in items if not any(kw in item.get('name', '').lower() 
                         for kw in ['wine', 'beer', 'cocktail', 'coffee', 'water', 'juice', 'lager'])]
            
            if food_only:
                reply = "Ah! You want authentic Greek food? Here are our specialties:\n"
                for i, item in enumerate(food_only, 1):
                    reply += f"\n**{i}. {item.get('name')}** - R{item.get('price')}\n   _{item.get('description', '')}_"
                
                reply += "\n\nThese are the dishes that transport you straight to Greece! Which one catches your eye?"
                session['history'] = food_only
                return jsonify({"reply": reply, "suggested": food_only})
        
        # ===== POSITIVE PREFERENCES (I LOVE/WANT SPECIFIC FOOD TYPE) =====
        if any(x in msg for x in ["love", "prefer", "like", "enjoy", "fan of"]):
            food_types = {
                "beef": ["beef", "steak", "tomahawk", "fillet", "rump", "biftekia"],
                "lamb": ["lamb", "chops", "souvlaki"],
                "chicken": ["chicken", "poultry"],
                "pork": ["pork"],
                "seafood": ["seafood", "fish", "prawn", "calamari", "hake", "sole"],
            }
            
            for food_type, keywords in food_types.items():
                if any(kw in msg for kw in keywords):
                    items = []
                    for keyword in keywords:
                        items.extend(recommender.search(keyword, threshold=0.6, exclude=session['exclude']))
                    
                    # Remove duplicates
                    seen = set()
                    unique_items = []
                    for item in items:
                        if item.get('name') not in seen:
                            seen.add(item.get('name'))
                            unique_items.append(item)
                    
                    if unique_items:
                        best = unique_items[0]
                        wine_pairing = wine_science.get_wine_for_food(best.get('name'), best.get('description', ''))
                        wine_obj = wine_science.wines.get(wine_pairing, {})
                        
                        reply = f"Ah, a {food_type} lover! Perfect! Let me show you:\n\n"
                        reply += personality.present_item(best.get('name'), best.get('description', ''))
                        reply += f"\n\n💰 **R{best.get('price')}**"
                        
                        if not session['no_alcohol']:
                            reply += f"\n\n{personality.suggest_pairing(wine_pairing, wine_obj)}"
                        
                        session['history'] = [best]
                        session['last_food'] = best
                        return jsonify({
                            "reply": reply,
                            "suggested": [best]
                            # Removed **personality.show_item_popup(best) to stop auto popup
                        })
        
        # ===== DRINK FLOW =====
        if session['state'] == "asked_drink":
            session['state'] = "neutral"
            is_alcohol = any(w in msg for w in ["alcohol", "wine", "beer", "whiskey", "yes", "sure"])
            is_soft = any(w in msg for w in ["non", "soft", "coffee", "tea", "juice", "water"])
            
            if (is_alcohol or not is_soft) and not session['no_alcohol']:
                drink_choices = ["Fairview Pinotage", "Nederburg Cabernet Sauvignon", "Castle Lager", "Heineken"]
                recommended_wine = random.choice(drink_choices)
                drink = recommender.search(recommended_wine, threshold=0.5, exclude=session['exclude'])
                if drink:
                    drink = drink[0]
                    reply = f"Perfect! **{drink.get('name')}** (R{drink.get('price')}) - you won't regret it!\n\n🔞 *For ages 18+, of course!*"
                    session['last_drink'] = drink
                    return jsonify({
                        "reply": reply,
                        "suggested": [drink]
                        # Removed **personality.show_item_popup(drink) to stop auto popup
                    })
            else:
                soft_options = ["Frappe", "Freddo Espresso", "Coffee", "Water", "Juice"]
                chosen = random.choice(soft_options)
                drink = recommender.search(chosen, threshold=0.5, exclude=session['exclude'])
                if drink:
                    drink = drink[0]
                    reply = f"Great choice! **{drink.get('name')}** (R{drink.get('price')}) - fresh and crisp!"
                    session['last_drink'] = drink
                    return jsonify({
                        "reply": reply,
                        "suggested": [drink]
                        # Removed **personality.show_item_popup(drink) to stop auto popup
                    })
        
        # ===== DRINK REQUEST =====
        if any(w in msg for w in ["drink", "thirsty", "beverage", "wine", "beer", "coffee", "tea"]) and "food" not in msg:
            if session['no_alcohol']:
                soft_options = ["Frappe", "Freddo Espresso", "Coffee", "Water", "Juice"]
                chosen = random.choice(soft_options)
                drink = recommender.search(chosen, threshold=0.5, exclude=session['exclude'])
                if drink:
                    drink = drink[0]
                    reply = f"Great choice! **{drink.get('name')}** (R{drink.get('price')}) - fresh and crisp!"
                    session['last_drink'] = drink
                    return jsonify({
                        "reply": reply,
                        "suggested": [drink]
                        # Removed **personality.show_item_popup(drink) to stop auto popup
                    })
            else:
                session['state'] = "asked_drink"
                return jsonify({"reply": "Smart thinking! 🍷 What sounds better - something with **Alcohol** or something fresh and **Non-Alcoholic**?"})
        
        # ===== SPECIALS REQUEST =====
        if any(w in msg for w in ["special", "specials", "whats special", "what is special", "todays special", "today's special"]):
            items = [item for item in recommender.popular if not recommender.should_exclude_item(item, session['exclude'])][:3]
            # Filter out drinks if "food" context or no_alcohol
            if session['no_alcohol'] or "food" in msg:
                items = [item for item in items if not any(kw in item.get('name', '').lower() 
                            for kw in ['wine', 'beer', 'cocktail', 'coffee', 'water', 'juice', 'lager'])]
            
            if items:
                reply = "Ah, you want the REAL deal? Let me tell you about our specials:\n"
                # New Code - ONLY bold the name, leave the number outside
                for i, item in enumerate(items, 1):
                    reply += f"\n{i}. **{item.get('name')}** - R{item.get('price')}\n   _{item.get('description', '')}_"
                
                reply += "\n\nThese are flying out of the kitchen today! Which one calls to you?"
                session['history'] = items
                return jsonify({"reply": reply, "suggested": items})
        
        # ===== HUNGRY =====
        if any(w in msg for w in ["hungry", "starving", "famished", "feast", "eat"]):
            items = [item for item in recommender.popular if not recommender.should_exclude_item(item, session['exclude'])]
            if items:
                best = items[0]
                wine_pairing = wine_science.get_wine_for_food(best.get('name'), best.get('description', ''))
                wine_obj = wine_science.wines.get(wine_pairing, {})
                
                reply = personality.present_item(best.get('name'), best.get('description', ''))
                reply += f"\n\n💰 **R{best.get('price')}**"
                
                if not session['no_alcohol']:
                    reply += f"\n\n{personality.suggest_pairing(wine_pairing, wine_obj)}"
                
                session['history'] = [best]
                session['last_food'] = best
                return jsonify({
                    "reply": reply,
                    "suggested": [best]
                    # Removed **personality.show_item_popup(best) to stop auto popup
                })
        
        # ===== POPULAR/BEST =====
        if any(w in msg for w in ["popular", "recommend", "best", "good", "favourite", "favorite", "what do you suggest"]):
            items = [item for item in recommender.popular if not recommender.should_exclude_item(item, session['exclude'])][:3]
            if items:
                reply = "Ah, you want the REAL deal? Let me tell you about our customer favorites:\n"
                for i, item in enumerate(items, 1):
                    reply += f"\n**{i}. {item.get('name')}** - R{item.get('price')}\n   _{item.get('description', '')}_"
                
                reply += "\n\nClick any of these to see more details, or tell me which one calls to you!"
                session['history'] = items
                return jsonify({"reply": reply, "suggested": items})
        
        # ===== ADD TO CART =====
        if any(x in msg for x in ["add", "yes", "sure", "ok", "sounds", "that", "it", "perfect", "let's go"]):
            if session['history']:
                item = session['history'][0]
                wine_pairing = wine_science.get_wine_for_food(item.get('name'), item.get('description', ''))
                wine_obj = wine_science.wines.get(wine_pairing, {})
                
                reply = personality.confirm_with_enthusiasm(item.get('name'))
                
                if not session['no_alcohol']:
                    reply += f"\n\n🍷 **With this, I'd pair it with {wine_pairing}** - {wine_obj.get('reason', '')}"
                
                if item.get('allergens'):
                    reply += f"\n\n⚠️ *Just so you know:* Contains {item.get('allergens')}"
                
                session['cart'].append(item)
                session['order_history'].append(item)
                return jsonify({"reply": reply, "action": "ADD_CART"})
        
        # ===== DIRECT ITEM SEARCH =====
        if any(w in msg.split() for w in ["want", "have", "get", "i'd", "can", "show", "try"]):
            query = msg
            for phrase in ["i want", "can i have", "get me", "do you have", "show me", "i'd like", "can we try"]:
                if phrase in query:
                    query = query.replace(phrase, "", 1).strip()
                    break
            
            # Skip very generic queries
            if query and len(query) > 4 and query not in ["something", "anything", "food", "drink"]:
                items = recommender.search(query, threshold=0.5, exclude=session['exclude'])
                if items:
                    best = items[0]
                    wine_pairing = wine_science.get_wine_for_food(best.get('name'), best.get('description', ''))
                    wine_obj = wine_science.wines.get(wine_pairing, {})
                    
                    reply = personality.present_item(best.get('name'), best.get('description', ''))
                    reply += f"\n\n💰 **R{best.get('price')}**"
                    
                    if not session['no_alcohol']:
                        reply += f"\n\n{personality.suggest_pairing(wine_pairing, wine_obj)}"
                    
                    session['history'] = [best]
                    session['last_food'] = best
                    return jsonify({
                        "reply": reply,
                        "suggested": [best]
                        # Removed **personality.show_item_popup(best) to stop auto popup
                    })
        
        # ===== GENERAL SEARCH =====
        items = recommender.search(msg, threshold=0.5, exclude=session['exclude'])
        if items:
            best = items[0]
            wine_pairing = wine_science.get_wine_for_food(best.get('name'), best.get('description', ''))
            wine_obj = wine_science.wines.get(wine_pairing, {})
            
            reply = personality.present_item(best.get('name'), best.get('description', ''))
            reply += f"\n\n💰 **R{best.get('price')}**"
            
            if not session['no_alcohol']:
                reply += f"\n\n{personality.suggest_pairing(wine_pairing, wine_obj)}"
            
            session['history'] = [best]
            return jsonify({
                "reply": reply,
                "suggested": [best]
                # Removed **personality.show_item_popup(best) to stop auto popup
            })
        
        # ===== KNOWLEDGE QUESTIONS =====
        if knowledge_engine.is_knowledge_question(msg):
            if not any(word in msg.lower() for word in ['menu', 'have', 'serve', 'order', 'price']):
                result = knowledge_engine.search_wikipedia(msg)
                if result['found']:
                    reply = f"📚 **{result['title']}**\n\n{result['extract']}\n\n"
                    reply += f"💡 Fun fact: {result['snippet'][:150]}...\n\n"
                    reply += "Want to order something delicious from our menu, or have more questions?"
                    return jsonify({"reply": reply})
        
        # ===== RANDOM FALLBACK =====
        if len(msg) < 20:
            if random.choice([True, False]):
                fallback = recommender.get_random_food(exclude=session['exclude'])
                if fallback:
                    reply = personality.present_item(fallback.get('name'), fallback.get('description', ''))
                    return jsonify({
                        "reply": reply,
                        "suggested": [fallback]
                        # Removed **personality.show_item_popup(fallback) to stop auto popup
                    })
            else:
                if not session['no_alcohol']:
                    fallback = recommender.get_random_drink(exclude=session['exclude'])
                    if fallback:
                        reply = f"Thirsty? Let me tell you about **{fallback.get('name')}** (R{fallback.get('price')})!\n\n{fallback.get('description', '')}"
                        return jsonify({
                            "reply": reply,
                            "suggested": [fallback]
                            # Removed **personality.show_item_popup(fallback) to stop auto popup
                        })
        
        # ===== UNKNOWN - LOG FOR ADMIN =====
        learner.add_unknown_question(msg, uid)
        reply = "You know what? That's a great question! Let me remember that and I'll have a better answer for you next time. 😊\n\nIn the meantime, ask me about anything on the **menu**, **wine pairings**, or what sounds good!"
        return jsonify({"reply": reply})
    
    except Exception as e:
        print(f"❌ Error: {e}")
        return jsonify({"reply": "Oops! Something went wrong there, but don't worry - try again, friend!"})


@app.route('/health', methods=['GET'])
def health():
    """Health check."""
    return jsonify({
        "status": "healthy ✅",
        "items": len(recommender.all_items),
        "users": len(user_sessions),
        "wines": len(wine_science.wines)
    })


@app.route('/menu', methods=['GET'])
def menu():
    """Return menu preview."""
    return jsonify({
        "total": len(recommender.all_items),
        "items": recommender.all_items[:20]
    })


@app.route('/cart/<uid>', methods=['GET'])
def get_cart(uid):
    """Get user's cart."""
    session = user_sessions.get(uid, {})
    return jsonify({"cart": session.get('cart', [])})


@app.route('/unknown-questions', methods=['GET'])
def get_unknown_questions():
    """ADMIN: Get unknown questions for review."""
    try:
        with open(UNKNOWN_QUESTIONS_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return jsonify(data['unknown'])
    except:
        return jsonify({"error": "No unknown questions yet"})


@app.route('/admin/teach', methods=['POST'])
def admin_teach():
    """ADMIN: Teach bot a new Q&A pair."""
    try:
        data = request.json or {}
        question = data.get('question', '').strip()
        answer = data.get('answer', '').strip()
        
        if question and answer:
            learner.add_learned_answer(question, answer)
            return jsonify({"status": "learned ✅", "question": question})
        else:
            return jsonify({"error": "Missing question or answer"}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == '__main__':
    print("=" * 80)
    print("🇬🇷 JOSH 10.0 - MYTHOS AI SOMMELIER (CONVERSATIONAL & INTERACTIVE) 🇬🇷")
    print("=" * 80)
    print("Features:")
    print("  ✅ CONVERSATIONAL AI (Talks like a real person)")
    print("  ✅ Interactive Item Popout (Click items for details)")
    print("  ✅ Wine Sommelier (flavor science-based pairings)")
    print("  ✅ Friendly Greek Waiter Personality")
    print("  ✅ Dietary/Allergy Filtering (VEGAN SUPPORT!)")
    print("  ✅ Session-based Memory")
    print("  ✅ Learning System (admin.html integration)")
    print("  ✅ ZERO 'I don't know' - Smart Fallbacks")
    print("\nEndpoints:")
    print("  POST /chat              - Chat with Josh")
    print("  GET  /menu              - View menu preview")
    print("  GET  /health            - Health check")
    print("  GET  /cart/<uid>        - User's cart")
    print("  GET  /unknown-questions - Admin: Unknown Qs")
    print("  POST /admin/teach       - Admin: Teach Answer")
    print("\n🚀 Starting on http://localhost:5001")
    print("=" * 80 + "\n")
    
    if recommender.load_menu():
        print(f"✅ {len(recommender.all_items)} menu items ready!")
        print(f"🍷 Wine sommelier with {len(wine_science.wines)} pairings loaded!\n")
        app.run(host='0.0.0.0', port=5001, debug=True)
    else:
        print("❌ Cannot start without menu file!")