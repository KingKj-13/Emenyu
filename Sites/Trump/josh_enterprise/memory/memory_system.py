"""
Memory System — 3-Layer Architecture
======================================
Layer 1 — SessionMemory   : in-process dict, per-conversation state
Layer 2 — UserProfile     : SQLite, persists preferences across sessions
Layer 3 — KnowledgeMemory : JSON store for learned Q&A + unknown questions
"""

from __future__ import annotations

import json
import os
import sqlite3
import datetime
from dataclasses import dataclass, field, asdict
from typing import Any, Optional


# ===========================================================================
# Layer 1 — Session Memory
# ===========================================================================

@dataclass
class SessionState:
    user_id:           str      = ""
    conversation_id:   str      = ""
    dialogue_state:    str      = "neutral"
    history:           list     = field(default_factory=list)   # recent items shown
    cart:              list     = field(default_factory=list)
    last_food:         Optional[dict] = None
    last_drink:        Optional[dict] = None
    exclude:           list[str] = field(default_factory=list)
    no_alcohol:        bool      = False
    turn_count:        int       = 0
    pending_intent:    str       = ""   # intent waiting for clarification
    clarification_ctx: dict      = field(default_factory=dict)
    upsell_offered:    bool      = False

    # preference signals collected this session
    liked_foods:       list[str] = field(default_factory=list)
    disliked_foods:    list[str] = field(default_factory=list)

    def add_to_history(self, item: dict):
        self.history = [item] + [h for h in self.history if h.get("name") != item.get("name")]
        self.history = self.history[:10]

    def add_to_cart(self, item: dict):
        self.cart.append({**item, "added_at": datetime.datetime.utcnow().isoformat()})

    def to_context_summary(self) -> str:
        """Human-readable context for prompt injection."""
        parts = []
        if self.last_food:
            parts.append(f"Last food mentioned: {self.last_food.get('name')}")
        if self.last_drink:
            parts.append(f"Last drink mentioned: {self.last_drink.get('name')}")
        if self.exclude:
            parts.append(f"Exclusions: {', '.join(self.exclude)}")
        if self.cart:
            names = [i.get("name","?") for i in self.cart]
            parts.append(f"Cart: {', '.join(names)}")
        return "; ".join(parts) if parts else "fresh session"


class SessionMemory:
    """Thread-safe in-memory session store."""

    def __init__(self):
        self._sessions: dict[str, SessionState] = {}

    def get(self, uid: str) -> SessionState:
        if uid not in self._sessions:
            import uuid
            self._sessions[uid] = SessionState(
                user_id=uid,
                conversation_id=str(uuid.uuid4())[:8]
            )
        return self._sessions[uid]

    def clear(self, uid: str):
        self._sessions.pop(uid, None)

    def all_ids(self) -> list[str]:
        return list(self._sessions.keys())


# ===========================================================================
# Layer 2 — User Profile (SQLite)
# ===========================================================================

DB_PATH = "data/user_profiles.db"

_CREATE_SQL = """
CREATE TABLE IF NOT EXISTS user_profiles (
    user_id        TEXT PRIMARY KEY,
    preferences    TEXT DEFAULT '{}',
    order_history  TEXT DEFAULT '[]',
    updated_at     TEXT
);
"""


@dataclass
class UserProfile:
    user_id:       str
    preferences:   dict = field(default_factory=dict)
    order_history: list = field(default_factory=list)
    updated_at:    str  = ""

    # helpers
    def like(self, food: str):
        self.preferences.setdefault("liked", [])
        if food not in self.preferences["liked"]:
            self.preferences["liked"].append(food)

    def dislike(self, food: str):
        self.preferences.setdefault("disliked", [])
        if food not in self.preferences["disliked"]:
            self.preferences["disliked"].append(food)
        # also add to exclusions
        self.preferences.setdefault("exclude", [])
        if food not in self.preferences["exclude"]:
            self.preferences["exclude"].append(food)

    def add_order(self, item: dict):
        self.order_history.append({
            "name": item.get("name"),
            "price": item.get("price"),
            "ordered_at": datetime.datetime.utcnow().isoformat()
        })
        # auto-learn preference
        self.like(item.get("name",""))

    @property
    def exclusions(self) -> list[str]:
        return self.preferences.get("exclude", [])

    @property
    def liked(self) -> list[str]:
        return self.preferences.get("liked", [])


class UserProfileStore:

    def __init__(self, db_path: str = DB_PATH):
        os.makedirs(os.path.dirname(db_path) or ".", exist_ok=True)
        self._db = db_path
        self._init_db()

    def _init_db(self):
        with sqlite3.connect(self._db) as conn:
            conn.execute(_CREATE_SQL)

    def get(self, uid: str) -> UserProfile:
        with sqlite3.connect(self._db) as conn:
            row = conn.execute(
                "SELECT preferences, order_history, updated_at FROM user_profiles WHERE user_id=?",
                (uid,)
            ).fetchone()
        if row:
            return UserProfile(
                user_id=uid,
                preferences=json.loads(row[0] or "{}"),
                order_history=json.loads(row[1] or "[]"),
                updated_at=row[2] or "",
            )
        return UserProfile(user_id=uid)

    def save(self, profile: UserProfile):
        now = datetime.datetime.utcnow().isoformat()
        with sqlite3.connect(self._db) as conn:
            conn.execute("""
                INSERT INTO user_profiles (user_id, preferences, order_history, updated_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(user_id) DO UPDATE SET
                    preferences=excluded.preferences,
                    order_history=excluded.order_history,
                    updated_at=excluded.updated_at
            """, (
                profile.user_id,
                json.dumps(profile.preferences),
                json.dumps(profile.order_history[-50:]),  # keep last 50
                now,
            ))


# ===========================================================================
# Layer 3 — Knowledge Memory
# ===========================================================================

LEARNED_QA_PATH   = "data/learned_qa.json"
UNKNOWN_Q_PATH    = "data/unknown_questions.json"


class KnowledgeMemory:
    """Persistent learned Q&A + unknown question log."""

    # ---- unknown questions ------------------------------------------------

    def log_unknown(self, question: str, uid: str):
        data = self._load(UNKNOWN_Q_PATH, {"unknown": []})
        existing = {q["question"] for q in data["unknown"]}
        if question not in existing:
            data["unknown"].append({
                "question":  question,
                "user_id":   uid,
                "timestamp": datetime.datetime.utcnow().isoformat(),
                "answered":  False,
            })
            self._save(UNKNOWN_Q_PATH, data)

    def get_unknown(self) -> list[dict]:
        return self._load(UNKNOWN_Q_PATH, {"unknown": []})["unknown"]

    # ---- learned answers --------------------------------------------------

    def lookup(self, question: str) -> Optional[str]:
        q_l = question.lower().strip()
        for qa in self._load(LEARNED_QA_PATH, {"qa_pairs": []})["qa_pairs"]:
            if qa["question"].lower().strip() == q_l:
                return qa["answer"]
        return None

    def teach(self, question: str, answer: str):
        data = self._load(LEARNED_QA_PATH, {"qa_pairs": []})
        # overwrite if exists
        for qa in data["qa_pairs"]:
            if qa["question"].lower().strip() == question.lower().strip():
                qa["answer"] = answer
                qa["updated_at"] = datetime.datetime.utcnow().isoformat()
                self._save(LEARNED_QA_PATH, data)
                return
        data["qa_pairs"].append({
            "question":   question,
            "answer":     answer,
            "learned_at": datetime.datetime.utcnow().isoformat(),
        })
        self._save(LEARNED_QA_PATH, data)

    # ---- helpers ----------------------------------------------------------

    @staticmethod
    def _load(path: str, default: Any) -> Any:
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        if not os.path.exists(path):
            return default
        try:
            with open(path, encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return default

    @staticmethod
    def _save(path: str, data: Any):
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)


# ===========================================================================
# Unified memory facade
# ===========================================================================

class MemorySystem:
    def __init__(self):
        self.session   = SessionMemory()
        self.profiles  = UserProfileStore()
        self.knowledge = KnowledgeMemory()

    def get_session(self, uid: str) -> SessionState:
        return self.session.get(uid)

    def get_profile(self, uid: str) -> UserProfile:
        return self.profiles.get(uid)

    def merge_exclusions(self, uid: str) -> list[str]:
        """Combine session + profile exclusions."""
        sess    = self.session.get(uid)
        profile = self.profiles.get(uid)
        combined = list(set(sess.exclude + profile.exclusions))
        return combined


# Global singleton
_memory: Optional[MemorySystem] = None

def get_memory() -> MemorySystem:
    global _memory
    if _memory is None:
        _memory = MemorySystem()
    return _memory
