"""Async SQLAlchemy engine and session factory.

Connects to the same PostgreSQL database as the existing EMenu Node.js backend.
Uses asyncpg for non-blocking I/O.  All request-scoped sessions are created via
the ``get_db`` dependency and auto-closed at the end of the request.
"""

from __future__ import annotations

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.config import get_settings

_settings = get_settings()

engine = create_async_engine(
    _settings.database_url,
    echo=_settings.debug,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,
    pool_recycle=3600,
)

async_session_factory = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency — yields a request-scoped async session."""
    async with async_session_factory() as session:
        try:
            yield session
        finally:
            await session.close()
