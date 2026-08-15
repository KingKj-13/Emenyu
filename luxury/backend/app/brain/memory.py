"""Recommendation Memory & Cooldown System.

Prevents duplicate suggestions at the same table and manages alert fatigue
by enforcing table-level recommendation cooldowns via Redis.
"""

from __future__ import annotations

import os
import redis.asyncio as redis
import structlog

logger = structlog.get_logger()

class RecommendationMemory:
    """Manages table-level shown-item history and waiter prompt cooldowns using Redis."""

    def __init__(self) -> None:
        redis_url = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
        self._redis = redis.from_url(redis_url, decode_responses=True)
        self._default_cooldown_seconds = 120

    async def add_shown(self, table_id: str, item_id: int) -> None:
        """Mark an item as shown to a table in the current session."""
        key = f"table:{table_id}:shown"
        await self._redis.sadd(key, str(item_id))
        await self._redis.expire(key, 86400)  # Expire after 24h as fallback

    async def was_shown(self, table_id: str, item_id: int) -> bool:
        """Check if an item has already been suggested to a table."""
        key = f"table:{table_id}:shown"
        return await self._redis.sismember(key, str(item_id))

    async def record_prompt(self, table_id: str, cooldown_seconds: int = 120) -> None:
        """Record that the waiter was prompted for a table (sets cooldown)."""
        key = f"table:{table_id}:cooldown"
        await self._redis.setex(key, cooldown_seconds, "active")

    async def is_in_cooldown(self, table_id: str) -> bool:
        """Check if a table is in the cooldown window to prevent waiter fatigue."""
        key = f"table:{table_id}:cooldown"
        return await self._redis.exists(key) > 0

    async def clear_table(self, table_id: str) -> None:
        """Reset history and cooldowns when guests leave (table is finished)."""
        await self._redis.delete(f"table:{table_id}:shown", f"table:{table_id}:cooldown")


# Global singleton instance (stateless wrapper for connection pool)
memory = RecommendationMemory()
