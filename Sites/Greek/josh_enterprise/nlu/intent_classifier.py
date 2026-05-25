"""
Intent Classifier - Hybrid NLU Pipeline
========================================
Primary:   SentenceTransformer embeddings + cosine similarity
Secondary: Logistic Regression (sklearn) trained on labeled data
Output:    IntentResult(intent, confidence, all_scores)
"""

from __future__ import annotations

import json
import os
import pickle
import numpy as np
from dataclasses import dataclass, field
from typing import Optional
from pathlib import Path

# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class IntentResult:
    intent: str
    confidence: float
    runner_up: Optional[str] = None
    runner_up_confidence: float = 0.0
    all_scores: dict = field(default_factory=dict)
    method: str = "unknown"          # "embedding" | "sklearn" | "rule"
    multi_intents: list = field(default_factory=list)   # when two intents fire


# ---------------------------------------------------------------------------
# Rule-based seed patterns  (always available, no model needed)
# ---------------------------------------------------------------------------

INTENT_PATTERNS: dict[str, list[str]] = {
    "greet":             ["hi", "hello", "hey", "yassas", "kalimera", "howdy", "good morning", "good evening"],
    "recommend_food":    ["recommend", "suggest", "what should i eat", "what is good", "best dish",
                          "what do you have", "menu", "hungry", "starving", "famished", "what to eat",
                          "popular", "favourite", "favorite", "specials", "what's good"],
    "recommend_drink":   ["drink", "wine", "beer", "cocktail", "beverage", "thirsty", "something to drink",
                          "pairing", "pair with", "what wine", "non-alcoholic"],
    "dietary_filter":    ["vegetarian", "vegan", "gluten free", "gluten-free", "dairy free", "no meat",
                          "halal", "kosher", "nut allergy", "allergic", "intolerant", "avoid", "hate"],
    "price_inquiry":     ["how much", "price", "cost", "expensive", "cheap", "budget", "affordable",
                          "what does it cost", "rand", "r "],
    "item_detail":       ["what is", "tell me about", "describe", "ingredients", "calories",
                          "what's in", "allergens", "contain", "made of"],
    "add_to_cart":       ["add", "order", "i'll have", "i will have", "get me", "take it",
                          "yes please", "sounds good", "let's go", "i want"],
    "view_cart":         ["my cart", "what did i order", "order summary", "what have i ordered"],
    "upsell_accept":     ["yes", "sure", "ok", "okay", "go ahead", "why not", "sounds great"],
    "upsell_decline":    ["no", "no thanks", "not now", "skip", "just food", "just the meal"],
    "complaint":         ["wrong", "not what i wanted", "bad", "terrible", "disgusting", "remove",
                          "cancel", "mistake", "not right"],
    "farewell":          ["bye", "goodbye", "see you", "thank you", "thanks", "cheers", "done"],
    "knowledge_query":   ["what is greek", "history", "mythology", "origin of", "culture",
                          "traditional", "authentic", "greece"],
    "small_talk":        ["how are you", "what's your name", "who are you", "joke", "fun fact",
                          "nice", "great", "awesome"],
}


def _rule_score(text: str) -> dict[str, float]:
    """Fast pattern matching — returns raw match counts normalised to [0,1]."""
    t = text.lower()
    scores: dict[str, float] = {}
    for intent, patterns in INTENT_PATTERNS.items():
        hits = sum(1 for p in patterns if p in t)
        if hits:
            scores[intent] = min(hits / max(len(patterns) * 0.2, 1), 1.0)
    return scores


# ---------------------------------------------------------------------------
# Embedding-based classifier
# ---------------------------------------------------------------------------

class EmbeddingIntentClassifier:
    """
    Zero-shot intent classification using SentenceTransformers.
    Computes cosine sim between user query and per-intent example sentences.
    Falls back gracefully if the library is not installed.
    """

    _model = None
    _intent_embeddings: dict[str, np.ndarray] = {}

    INTENT_EXAMPLES: dict[str, list[str]] = {
        "greet":          ["Hello there!", "Hi how are you", "Hey good morning"],
        "recommend_food": ["What food do you suggest?", "I'm hungry what should I eat",
                           "What are today's specials?", "Recommend something delicious"],
        "recommend_drink":["Can you suggest a wine?", "What drinks do you have",
                           "I need something to drink", "What pairs well with lamb?"],
        "dietary_filter": ["I am vegan", "No gluten please", "I'm allergic to nuts",
                           "Do you have vegetarian options?", "No dairy for me"],
        "price_inquiry":  ["How much does this cost?", "What is the price?",
                           "Is it expensive?", "Budget-friendly options?"],
        "item_detail":    ["What's in this dish?", "Tell me about the calamari",
                           "What are the ingredients?", "Does it contain dairy?"],
        "add_to_cart":    ["I'll have that", "Add it to my order", "Yes please I want it",
                           "Order the lamb chops", "Get me the steak"],
        "upsell_accept":  ["Sure why not", "Yes sounds great", "OK go ahead"],
        "upsell_decline": ["No thanks", "Just the food", "Skip the wine"],
        "complaint":      ["This is wrong", "Cancel my order", "That's not what I wanted"],
        "farewell":       ["Goodbye thanks", "Bye see you soon", "Thanks for the help"],
        "small_talk":     ["How are you doing", "What's your name", "Tell me a joke"],
    }

    @classmethod
    def _load_model(cls):
        if cls._model is not None:
            return True
        try:
            from sentence_transformers import SentenceTransformer
            cls._model = SentenceTransformer("all-MiniLM-L6-v2")
            cls._build_intent_vectors()
            return True
        except ImportError:
            return False

    @classmethod
    def _build_intent_vectors(cls):
        for intent, examples in cls.INTENT_EXAMPLES.items():
            vecs = cls._model.encode(examples, normalize_embeddings=True)
            cls._intent_embeddings[intent] = vecs.mean(axis=0)

    @classmethod
    def classify(cls, text: str) -> Optional[dict[str, float]]:
        if not cls._load_model():
            return None
        vec = cls._model.encode([text], normalize_embeddings=True)[0]
        scores = {}
        for intent, centroid in cls._intent_embeddings.items():
            scores[intent] = float(np.dot(vec, centroid))
        return scores


# ---------------------------------------------------------------------------
# sklearn classifier (trained on labeled data)
# ---------------------------------------------------------------------------

class SKLearnIntentClassifier:
    """Logistic Regression over TF-IDF features."""

    def __init__(self, model_path: str = "data/intent_model.pkl"):
        self.model_path = model_path
        self._pipeline = None

    def _load(self):
        if self._pipeline is None and os.path.exists(self.model_path):
            with open(self.model_path, "rb") as f:
                self._pipeline = pickle.load(f)

    def classify(self, text: str) -> Optional[dict[str, float]]:
        self._load()
        if self._pipeline is None:
            return None
        probs = self._pipeline.predict_proba([text])[0]
        classes = self._pipeline.classes_
        return dict(zip(classes, probs.tolist()))

    def train(self, texts: list[str], labels: list[str]):
        from sklearn.pipeline import Pipeline
        from sklearn.feature_extraction.text import TfidfVectorizer
        from sklearn.linear_model import LogisticRegression

        self._pipeline = Pipeline([
            ("tfidf", TfidfVectorizer(ngram_range=(1, 2), max_features=8000)),
            ("clf",   LogisticRegression(max_iter=500, C=5.0, class_weight="balanced")),
        ])
        self._pipeline.fit(texts, labels)
        os.makedirs(os.path.dirname(self.model_path) or ".", exist_ok=True)
        with open(self.model_path, "wb") as f:
            pickle.dump(self._pipeline, f)
        return self

    @staticmethod
    def load_training_data(path: str = "training/intent_training_data.json"):
        if not os.path.exists(path):
            return [], []
        with open(path) as f:
            data = json.load(f)
        texts, labels = [], []
        for entry in data:
            texts.append(entry["text"])
            labels.append(entry["intent"])
        return texts, labels


# ---------------------------------------------------------------------------
# Master classifier — fuses all signals
# ---------------------------------------------------------------------------

CONFIDENCE_THRESHOLD = 0.45

class IntentClassifier:
    """
    Fuses rule, embedding, and sklearn signals.
    Priority: embedding > sklearn > rule
    Falls back gracefully when models not available.
    """

    def __init__(self):
        self._sk = SKLearnIntentClassifier()
        self._trained = False

    # ---- public API --------------------------------------------------------

    def classify(self, text: str) -> IntentResult:
        text = text.strip()
        if not text:
            return IntentResult("unknown", 0.0)

        # 1. Rule scores (always available)
        rule_scores = _rule_score(text)

        # 2. Embedding scores
        emb_scores = EmbeddingIntentClassifier.classify(text) or {}

        # 3. sklearn scores
        sk_scores = self._sk.classify(text) or {}

        # --- fuse ---
        all_intents = set(rule_scores) | set(emb_scores) | set(sk_scores)
        fused: dict[str, float] = {}
        for intent in all_intents:
            r = rule_scores.get(intent, 0.0)
            e = emb_scores.get(intent, 0.0)
            s = sk_scores.get(intent, 0.0)
            # weighted blend: embedding > sklearn > rule
            if emb_scores:
                fused[intent] = 0.55 * e + 0.30 * s + 0.15 * r
            elif sk_scores:
                fused[intent] = 0.60 * s + 0.40 * r
            else:
                fused[intent] = r

        if not fused:
            return IntentResult("unknown", 0.0)

        sorted_intents = sorted(fused.items(), key=lambda x: x[1], reverse=True)
        top_intent, top_conf = sorted_intents[0]
        runner = sorted_intents[1] if len(sorted_intents) > 1 else (None, 0.0)

        # multi-intent: if runner-up is within 15% of top and both above threshold
        multi = []
        if runner[0] and runner[1] >= CONFIDENCE_THRESHOLD and top_conf - runner[1] < 0.15:
            multi = [top_intent, runner[0]]

        method = "embedding" if emb_scores else ("sklearn" if sk_scores else "rule")

        if top_conf < CONFIDENCE_THRESHOLD:
            top_intent = "unknown"

        return IntentResult(
            intent=top_intent,
            confidence=round(top_conf, 3),
            runner_up=runner[0],
            runner_up_confidence=round(runner[1], 3),
            all_scores={k: round(v, 3) for k, v in fused.items()},
            method=method,
            multi_intents=multi,
        )

    def train_from_file(self, path: str = "training/intent_training_data.json"):
        texts, labels = SKLearnIntentClassifier.load_training_data(path)
        if texts:
            self._sk.train(texts, labels)
            self._trained = True
            print(f"✅ Intent model trained on {len(texts)} examples.")
        else:
            print("⚠️  No training data found. Using rule-based fallback only.")


# Singleton
_classifier: Optional[IntentClassifier] = None

def get_classifier() -> IntentClassifier:
    global _classifier
    if _classifier is None:
        _classifier = IntentClassifier()
        _classifier.train_from_file()
    return _classifier
