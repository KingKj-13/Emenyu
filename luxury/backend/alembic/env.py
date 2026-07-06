"""Alembic environment configuration — async-aware.

IMPORTANT: This migration setup ONLY manages tables owned by the Luxury
Edition (table names starting with 'Luxury', 'Content', 'App', 'Brain',
'Dining').  It does NOT touch existing Prisma-managed tables.
"""

from __future__ import annotations

import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool
from sqlalchemy.ext.asyncio import create_async_engine

# Import Base so all models are registered
from app.models.base import Base
import app.models  # noqa: F401 — ensure all models are imported

from app.config import get_settings

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

# Tables managed by this Alembic setup (Luxury-only)
LUXURY_TABLES = {
    "LuxuryItemContent",
    "ContentVersion",
    "AppRelease",
    "BrainOutput",
    "DiningSession",
}


def include_object(obj, name, type_, reflected, compare_to):  # type: ignore[no-untyped-def]
    """Only include luxury-owned tables in auto-generated migrations."""
    if type_ == "table":
        return name in LUXURY_TABLES
    return True


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode — emit SQL to stdout."""
    settings = get_settings()
    url = settings.sync_database_url
    context.configure(
        url=url,
        target_metadata=target_metadata,
        include_object=include_object,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection) -> None:  # type: ignore[no-untyped-def]
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        include_object=include_object,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """Run migrations using an async engine."""
    settings = get_settings()
    connectable = create_async_engine(
        settings.database_url,
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
