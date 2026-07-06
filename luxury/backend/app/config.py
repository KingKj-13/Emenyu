"""Application configuration via environment variables.

All settings are validated at startup through Pydantic BaseSettings.
The DATABASE_URL uses the asyncpg driver to connect to the same PostgreSQL
instance as the existing EMenu Node.js backend.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Validated, typed application settings loaded from environment / .env file."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Database ──────────────────────────────────────────────────────────
    database_url: str = "postgresql+asyncpg://postgres:password@127.0.0.1:5432/emenyu"

    # ── Restaurant Identity ───────────────────────────────────────────────
    restaurant_id: str = "luxury_trump"
    restaurant_name: str = "Trump Luxury Edition"

    # ── JWT / Security ────────────────────────────────────────────────────
    jwt_secret_key: str = "change-me-generate-with-openssl-rand-base64-48"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60
    refresh_token_expire_days: int = 30

    # ── Server ────────────────────────────────────────────────────────────
    host: str = "0.0.0.0"
    port: int = 8000
    debug: bool = False
    log_level: str = "info"

    # ── CORS ──────────────────────────────────────────────────────────────
    allowed_origins: str = "https://emenyu.com,http://localhost:5173"

    # ── Media ─────────────────────────────────────────────────────────────
    media_root: str = "./media"
    media_url_prefix: str = "/luxury/media"

    # ── App Releases ──────────────────────────────────────────────────────
    releases_dir: str = "./releases"
    releases_url_prefix: str = "/luxury/releases"

    # ── Shared Content ────────────────────────────────────────────────────
    hero_pairings_path: str = ""

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]

    @property
    def sync_database_url(self) -> str:
        """Synchronous URL for Alembic migrations (swap asyncpg → psycopg2)."""
        return self.database_url.replace("+asyncpg", "")

    @property
    def media_path(self) -> Path:
        return Path(self.media_root)

    @property
    def releases_path(self) -> Path:
        return Path(self.releases_dir)


@lru_cache
def get_settings() -> Settings:
    """Cached singleton — reloads only on process restart."""
    return Settings()
