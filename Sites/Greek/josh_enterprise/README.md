# 🇬🇷 JOSH 11.0 — Mythos Enterprise AI Assistant

> **NLU + Dialogue Engine + Semantic Search — fully local, no external APIs**

---

## Architecture

```
User message
     │
     ▼
┌─────────────────────────────────────────────────────────────┐
│  NLU PIPELINE                                                │
│  ┌─────────────────┐  ┌──────────────────┐  ┌────────────┐ │
│  │ Intent Classifier│  │ Entity Extractor  │  │ Semantic   │ │
│  │                 │  │                  │  │ Engine     │ │
│  │ 1. Embeddings   │  │ 1. spaCy ruler   │  │            │ │
│  │ 2. sklearn LR   │  │ 2. Regex fallback│  │ Sentence-  │ │
│  │ 3. Rule patterns│  │                  │  │ Transformers│ │
│  │                 │  │ FOOD_TYPE        │  │ (or TF-IDF)│ │
│  │ confidence score│  │ DIETARY_RESTRICT │  │            │ │
│  │ multi-intent    │  │ PRICE_RANGE      │  │ cosine sim │ │
│  │                 │  │ DRINK_TYPE       │  │ on menu    │ │
│  └────────┬────────┘  └────────┬─────────┘  └─────┬──────┘ │
│           └───────────────┬────┘                  │         │
│                           ▼                       │         │
│                      NLUResult                    │         │
└───────────────────────────┼───────────────────────┼─────────┘
                            │                       │
                            ▼                       ▼
┌─────────────────────────────────────────────────────────────┐
│  MEMORY SYSTEM                                               │
│  ┌──────────────┐  ┌──────────────────┐  ┌───────────────┐  │
│  │ Session      │  │ User Profile     │  │ Knowledge     │  │
│  │ (in-memory)  │  │ (SQLite)         │  │ (JSON)        │  │
│  │              │  │                  │  │               │  │
│  │ state        │  │ liked foods      │  │ learned Q&A   │  │
│  │ cart         │  │ past orders      │  │ unknown Qs    │  │
│  │ exclusions   │  │ exclusions       │  │               │  │
│  │ last_food    │  │                  │  │               │  │
│  └──────┬───────┘  └─────────┬────────┘  └───────┬───────┘  │
└─────────┼────────────────────┼───────────────────┼──────────┘
          └────────────────────┼───────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────┐
│  DIALOGUE MANAGER                                            │
│                                                              │
│  State Machine:   neutral → asked_preference →              │
│                   recommending → upselling →                 │
│                   checkout → farewell                        │
│                                                              │
│  Policy:          (state + intent + confidence + entities)   │
│                   → Action                                   │
│                                                              │
│  Actions: GREET | RECOMMEND_FOOD | RECOMMEND_DRINK |        │
│           UPSELL_DRINK | CONFIRM_ORDER | ASK_PREFERENCE |   │
│           CLARIFY_DIETARY | HANDLE_COMPLAINT | FAREWELL …   │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│  RECOMMENDER v2                                              │
│                                                              │
│  score = 0.60·semantic + 0.20·popularity + 0.20·dietary_fit │
│                                                              │
│  Wine pairing by food-keyword matching                       │
│  Allergen/dietary exclusion                                  │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│  RESPONSE GENERATOR                                          │
│                                                              │
│  Personality templates × random pools                        │
│  Context-aware: references last food, dietary restrictions   │
│  Wine pairing suggestion inline                              │
│  Upsell hook after confirmation                              │
└─────────────────────────────────────────────────────────────┘
```

---

## File Structure

```
josh_enterprise/
├── api/
│   └── app.py                  ← Flask entry point (run this)
├── nlu/
│   ├── __init__.py             ← analyze() entry point
│   ├── intent_classifier.py    ← Embedding + sklearn + rule fusion
│   ├── entity_extractor.py     ← spaCy EntityRuler + regex
│   └── semantic_engine.py      ← SentenceTransformers menu index
├── dialogue/
│   ├── dialogue_manager.py     ← State machine + policy
│   └── response_generator.py  ← Personality + templates
├── memory/
│   └── memory_system.py        ← Session / SQLite / JSON layers
├── recommender/
│   └── recommender_v2.py       ← Semantic search + wine pairings
├── training/
│   └── intent_training_data.json
├── data/                       ← auto-created: DB, embeddings cache
├── food/                       ← place MythosMenu.json here
├── orders/                     ← order JSON files for popularity
├── example_conversations.py    ← demo (no menu needed)
└── requirements.txt
```

---

## Quick Start

### 1. Install dependencies

```bash
# Full install (with GPU-accelerated embeddings)
pip install -r requirements.txt

# Minimal install (TF-IDF fallback, no torch)
pip install flask flask-cors scikit-learn numpy spacy
```

### 2. Place your menu file

```bash
cp /path/to/MythosMenu.json josh_enterprise/food/MythosMenu.json
```

### 3. Run the demo (no menu needed)

```bash
cd josh_enterprise
python example_conversations.py
```

### 4. Start the server

```bash
cd josh_enterprise
python api/app.py
```

Server starts on **http://localhost:5001**

---

## API Usage

### Chat
```bash
curl -X POST http://localhost:5001/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "I want something vegan and gluten-free"}'
```

Response:
```json
{
  "reply": "Got it! No gluten-free, vegan for you. I'll make sure...",
  "suggested": [{"name": "...", "price": 95, ...}],
  "debug": {"action": "recommend_food", "state": "recommending", "turn": 2}
}
```

### Admin: Teach the bot
```bash
curl -X POST http://localhost:5001/admin/teach \
  -H "Content-Type: application/json" \
  -d '{"question": "do you have a kids menu", "answer": "Yes! Ask your waiter for our kids options."}'
```

### Admin: Retrain intent model
```bash
# 1. Add examples to training/intent_training_data.json
# 2. Hit the endpoint:
curl -X POST http://localhost:5001/admin/retrain
```

---

## Multilingual Support (Greek ↔ English)

### How it works

Every incoming message goes through a 3-stage language pipeline **before** NLU:

```
User message (Greek or English)
        │
        ▼
┌─────────────────────────────────────┐
│  Language Detection                 │
│  1. Greek Unicode char ratio        │  ← instant, no model
│  2. langdetect (statistical)        │  ← fallback
└──────────────┬──────────────────────┘
               │  detected_lang = "el" | "en"
               ▼
┌─────────────────────────────────────┐
│  Greek → English Translation        │
│  1. argostranslate (offline neural) │  ← best quality, ~50 MB
│  2. Restaurant vocab dict (200+ phrases) │  ← instant fallback
│  3. Passthrough                     │  ← if nothing matches
└──────────────┬──────────────────────┘
               │  english_text
               ▼
         NLU Pipeline (always English)
               │
               ▼
┌─────────────────────────────────────┐
│  Response Generation                │
│  lang="el" → Greek template pools  │
│  lang="en" → English templates      │
└─────────────────────────────────────┘
```

### Setup

```bash
# Install deps
pip install langdetect argostranslate

# Download language packs ONCE (requires internet, ~100 MB total)
python install_languages.py

# After that — fully offline forever
```

### Without argostranslate (zero setup)

The vocabulary fallback covers **200+ Greek restaurant phrases** instantly with no model download. Most customer conversations work perfectly.

### Example

```bash
# Greek input
curl -X POST http://localhost:5001/chat \
  -d '{"message": "Θέλω κάτι με αρνί χωρίς γαλακτοκομικά"}'

# Response comes back in Greek:
# "Τέλεια επιλογή! Ορίστε το Αρνί Κλεφτικό..."
# debug: {"lang": "el", ...}
```

### Supported phrases (vocabulary mode)

- All greetings and farewells
- Food items: αρνί, μοσχάρι, θαλασσινά, γαρίδες, καλαμάρι...
- Dishes: μουσακάς, σουβλάκι, σπανακόπιτα, κεφτέδες...
- Dietary: χορτοφάγος, βίγκαν, χωρίς γλουτένη, αλλεργία...
- Drinks: κρασί, μπύρα, ούζο, καφές, φραπέ...
- Actions: θέλω, φέρτε μου, προσθέστε, ακυρώστε...



| Capability | Current | Next Step |
|---|---|---|
| Intent model | sklearn LR + embeddings | Fine-tune BERT on your data |
| Entity extraction | spaCy EntityRuler | Train custom NER model |
| Response generation | Templates | Connect local LLM (Ollama) |
| Embeddings | all-MiniLM-L6-v2 | Upgrade to larger model |
| Memory | SQLite | PostgreSQL for production |

### Connecting a local LLM (Ollama)

```python
import ollama

def llm_response(prompt: str) -> str:
    response = ollama.chat(
        model="llama3.2",
        messages=[{"role": "user", "content": prompt}]
    )
    return response["message"]["content"]
```

Use `llm_response()` inside `response_generator.py` for fully dynamic replies.

---

## What Changed from JOSH 10.0

| Feature | v10 | v11 |
|---|---|---|
| Intent detection | `if/elif` keyword matching | NLU pipeline (embedding + sklearn + rules) |
| Entity extraction | `if keyword in msg` | spaCy EntityRuler with synonym normalisation |
| Menu search | `SequenceMatcher` fuzzy | Dense embedding cosine similarity |
| Recommendation score | Not present | `0.60·semantic + 0.20·pop + 0.20·dietary` |
| Dialogue state | Single `session['state']` string | Typed `State` enum + transition table |
| Memory | Dict in RAM | 3-layer: session + SQLite + JSON |
| Confidence | Not present | Per-intent scores + threshold gating |
| Multi-intent | Not possible | Detected when two intents within 15% |
| Explainability | None | `_explanation` field on every result |
| Admin retraining | Q&A only | Full intent model retrain endpoint |
