#!/usr/bin/env python3
"""
example_conversations.py
========================
Demonstrates the full NLU + Dialogue + Memory pipeline
without requiring the menu file or Flask.

Run:  python example_conversations.py
"""

import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.chdir(os.path.dirname(os.path.abspath(__file__)))
os.makedirs("data", exist_ok=True)

from nlu import analyze
from dialogue.dialogue_manager import get_dialogue_manager, Action
from dialogue.response_generator import get_response_generator
from memory.memory_system import get_memory

memory    = get_memory()
dialogue  = get_dialogue_manager()
responder = get_response_generator()

DEMO_UID = "demo_user"


def chat(msg: str) -> str:
    session  = memory.get_session(DEMO_UID)
    nlu      = analyze(msg)
    action, _ = dialogue.process(
        session, nlu.top_intent, nlu.confidence,
        nlu.entities, nlu.intent.multi_intents
    )
    # No real menu items in demo — just show action + generated reply stub
    reply = responder.generate(action=action, session=session, items=[], wine=None)
    return f"[{action.value.upper()}] {reply}"


def demo():
    conversations = [
        # --- Conversation 1: Standard recommendation flow ---
        ("--- Conversation 1: Standard recommendation flow ---", None),
        ("Hi there!", None),
        ("I'm really hungry", None),
        ("I love lamb", None),
        ("Sure, go for the wine pairing!", None),
        ("That sounds perfect, add it", None),
        ("Thanks, bye!", None),

        # --- Conversation 2: Dietary restrictions ---
        ("--- Conversation 2: Dietary filtering ---", None),
        ("Hello!", None),
        ("I'm vegan, what can I have?", None),
        ("Something budget-friendly please", None),

        # --- Conversation 3: Multi-intent ---
        ("--- Conversation 3: Multi-intent + entities ---", None),
        ("I want something vegan and gluten-free", None),
        ("No alcohol for me", None),
        ("What's popular today?", None),

        # --- Conversation 4: Knowledge + small talk ---
        ("--- Conversation 4: Knowledge & small talk ---", None),
        ("Hey", None),
        ("What is moussaka?", None),
        ("How are you?", None),
        ("What's your name?", None),
    ]

    print("\n" + "="*65)
    print("🇬🇷  JOSH 11.0 — NLU Pipeline Demo")
    print("="*65)

    for msg, _ in conversations:
        if msg.startswith("---"):
            # Reset session for new conversation
            memory.session.clear(DEMO_UID)
            print(f"\n\n{msg}")
            continue

        nlu = analyze(msg)
        print(f"\n👤 User:   {msg}")
        print(f"   NLU:   intent={nlu.top_intent}  conf={nlu.confidence:.2f}  "
              f"foods={nlu.entities.food_types}  "
              f"dietary={nlu.entities.dietary_restrictions}")
        reply = chat(msg)
        print(f"🤖 Josh:   {reply}")


if __name__ == "__main__":
    demo()
