"""
Semantic Engine — SentenceTransformers Menu Search
====================================================
Replaces fuzzy SequenceMatcher with cosine similarity over dense embeddings.

Features:
  - Embed menu items once, cache to disk
  - Query → embedding → top-k most similar items
  - Score = α·semantic + β·popularity + γ·dietary_fit
  - ✅ FIX: Diversity injection — avoids same item every query
  - Falls back to TF-IDF if sentence_transformers not installed
"""

from __future__ import annotations

import json
import os
import pickle
import random
import numpy as np
from dataclasses import dataclass
from typing import Any, Optional


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class RankedItem:
    item: dict
    score: float
    semantic_score: float
    popularity_score: float
    dietary_fit: float
    explanation: str = ""


# ---------------------------------------------------------------------------
# Embedding backend
# ---------------------------------------------------------------------------

CACHE_PATH = "data/menu_embeddings.pkl"
MODEL_NAME  = "paraphrase-MiniLM-L3-v2"


class _EmbeddingBackend:
    _model = None
    _available = None

    @classmethod
    def available(cls) -> bool:
        if cls._available is None:
            try:
                from sentence_transformers import SentenceTransformer  # noqa
                cls._available = True
            except ImportError:
                cls._available = False
        return cls._available

    @classmethod
    def get_model(cls):
        if cls._model is None and cls.available():
            from sentence_transformers import SentenceTransformer
            cls._model = SentenceTransformer(MODEL_NAME)
        return cls._model

    @classmethod
    def encode(cls, texts: list[str], normalize: bool = True) -> Optional[np.ndarray]:
        model = cls.get_model()
        if model is None:
            return None
        return model.encode(texts, normalize_embeddings=normalize, show_progress_bar=False)


# ---------------------------------------------------------------------------
# TF-IDF fallback
# ---------------------------------------------------------------------------

class _TfidfBackend:
    def __init__(self, corpus: list[str]):
        from sklearn.feature_extraction.text import TfidfVectorizer
        self._vec = TfidfVectorizer(ngram_range=(1, 2), max_features=10000)
        self._mat = self._vec.fit_transform(corpus)

    def query_scores(self, query: str) -> np.ndarray:
        from sklearn.metrics.pairwise import cosine_similarity
        q_vec = self._vec.transform([query])
        return cosine_similarity(q_vec, self._mat)[0]


# ---------------------------------------------------------------------------
# Semantic Engine
# ---------------------------------------------------------------------------

class SemanticEngine:

    def __init__(self):
        self._items: list[dict] = []
        self._texts: list[str] = []
        self._embeddings: Optional[np.ndarray] = None
        self._tfidf: Optional[_TfidfBackend] = None
        self._popularity: dict[str, float] = {}

    # ---- index building ---------------------------------------------------

    def _item_text(self, item: dict) -> str:
        name = item.get("name", "")
        desc = item.get("description", "")
        tags = " ".join(item.get("tags", []))
        return f"{name}. {desc}. {tags}".strip()

    def build_index(self, items: list[dict], popularity: Optional[dict[str, float]] = None):
        self._items = items
        self._texts = [self._item_text(i) for i in items]
        self._popularity = popularity or {}

        if os.path.exists(CACHE_PATH):
            try:
                with open(CACHE_PATH, "rb") as f:
                    cached = pickle.load(f)
                if cached.get("texts") == self._texts:
                    self._embeddings = cached["embeddings"]
                    print("✅ Loaded cached menu embeddings.")
                    return
            except Exception:
                pass

        embs = _EmbeddingBackend.encode(self._texts)
        if embs is not None:
            self._embeddings = embs
            os.makedirs(os.path.dirname(CACHE_PATH) or ".", exist_ok=True)
            with open(CACHE_PATH, "wb") as f:
                pickle.dump({"texts": self._texts, "embeddings": embs}, f)
            print(f"✅ Built & cached embeddings for {len(items)} menu items.")
        else:
            try:
                self._tfidf = _TfidfBackend(self._texts)
                print("⚠️  sentence_transformers not found — using TF-IDF similarity.")
            except ImportError:
                print("⚠️  Neither sentence_transformers nor sklearn found. Falling back to name matching.")

    # ---- scoring helpers --------------------------------------------------

    def _semantic_scores(self, query: str) -> np.ndarray:
        n = len(self._items)
        if n == 0:
            return np.array([])

        if self._embeddings is not None:
            q_emb = _EmbeddingBackend.encode([query])
            if q_emb is not None:
                return (q_emb @ self._embeddings.T)[0]

        if self._tfidf is not None:
            return self._tfidf.query_scores(query)

        q_l = query.lower()
        scores = np.zeros(n)
        for i, item in enumerate(self._items):
            name = item.get("name", "").lower()
            scores[i] = 1.0 if q_l in name else (0.5 if any(w in name for w in q_l.split()) else 0.0)
        return scores

    def _popularity_score(self, item: dict) -> float:
        return self._popularity.get(item.get("name", ""), 0.0)

    def _dietary_fit(self, item: dict, exclude: list[str]) -> float:
        if not exclude:
            return 1.0
        combined = (
            item.get("name", "") + " " +
            item.get("description", "") + " " +
            item.get("allergens", "")
        ).lower()
        for excl in exclude:
            if excl.lower() in combined:
                return 0.0
        return 1.0

    # ---- public query API -------------------------------------------------

    def query(
        self,
        text: str,
        top_k: int = 5,
        exclude: Optional[list[str]] = None,
        alpha: float = 0.60,
        beta:  float = 0.20,
        gamma: float = 0.20,
        threshold: float = 0.15,
        diversity_pool: int = 8,       # ✅ FIX: pick from top-N pool randomly
        diversity_noise: float = 0.03, # ✅ FIX: tiny score jitter for variety
    ) -> list[RankedItem]:
        if not self._items:
            return []

        exclude = exclude or []
        sem = self._semantic_scores(text)
        results: list[RankedItem] = []

        for i, item in enumerate(self._items):
            s_score = float(sem[i]) if len(sem) > i else 0.0
            p_score = self._popularity_score(item)
            d_fit   = self._dietary_fit(item, exclude)

            if d_fit == 0.0:
                continue

            # ✅ FIX: Add tiny noise to break deterministic ties
            noise = random.uniform(-diversity_noise, diversity_noise)
            composite = alpha * s_score + beta * p_score + gamma * d_fit + noise

            if composite >= threshold:
                explanation = self._explain(item, s_score, p_score, d_fit)
                results.append(RankedItem(
                    item=item,
                    score=round(composite, 3),
                    semantic_score=round(s_score, 3),
                    popularity_score=round(p_score, 3),
                    dietary_fit=d_fit,
                    explanation=explanation,
                ))

        # ✅ FIX: Sort, take top diversity_pool, then randomly sample top_k from that pool
        # This ensures variety while still keeping results relevant
        results.sort(key=lambda r: r.score, reverse=True)
        pool = results[:max(top_k, diversity_pool)]
        if len(pool) > top_k:
            # Weighted random sample — higher scores more likely but not guaranteed
            weights = [r.score for r in pool]
            total = sum(weights)
            if total > 0:
                weights = [w / total for w in weights]
                indices = np.random.choice(len(pool), size=min(top_k, len(pool)), replace=False, p=weights)
                selected = [pool[i] for i in sorted(indices)]
                selected.sort(key=lambda r: r.score, reverse=True)
                return selected

        return pool[:top_k]

    def _explain(self, item: dict, sem: float, pop: float, diet: float) -> str:
        parts = []
        if sem > 0.6:
            parts.append("strong flavor/name match")
        elif sem > 0.35:
            parts.append("partial flavor match")
        if pop > 0.5:
            parts.append("very popular with guests")
        elif pop > 0.2:
            parts.append("popular choice")
        if diet == 1.0:
            parts.append("fits dietary requirements")
        return "; ".join(parts) or "general recommendation"

    # ---- convenience wrappers ---------------------------------------------

    def top_items(self, text: str, n: int = 3, exclude: Optional[list[str]] = None) -> list[dict]:
        return [r.item for r in self.query(text, top_k=n, exclude=exclude)]

    def best_match(self, text: str, exclude: Optional[list[str]] = None) -> Optional[RankedItem]:
        results = self.query(text, top_k=1, exclude=exclude)
        return results[0] if results else None


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------

_engine: Optional[SemanticEngine] = None


def get_semantic_engine() -> SemanticEngine:
    global _engine
    if _engine is None:
        _engine = SemanticEngine()
    return _engine