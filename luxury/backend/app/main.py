"""EMenu Luxury Edition — FastAPI application entry point.

Start with: ``uvicorn app.main:app --reload``
"""

from __future__ import annotations

from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI

from app.brain.engine import brain
from app.config import get_settings
from app.core.exceptions import register_exception_handlers
from app.core.middleware import configure_logging, register_middleware
from app.database import async_session_factory
from app.orchestrator.media_pipeline import MediaPipeline

logger = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):  # type: ignore[no-untyped-def]
    """Application lifecycle — startup and shutdown hooks."""
    settings = get_settings()

    # Startup
    configure_logging()
    logger.info("starting", restaurant_id=settings.restaurant_id, port=settings.port)

    # Ensure media directories exist
    pipeline = MediaPipeline()
    pipeline.ensure_directories()

    # Initialize recommendation brain (stub in Phase 1)
    async with async_session_factory() as session:
        await brain.initialize(session)

    logger.info("ready")

    yield

    # Shutdown
    logger.info("shutting_down")


def create_app() -> FastAPI:
    """Application factory — assembles the FastAPI app with all routes,
    middleware, and exception handlers.
    """
    settings = get_settings()

    app = FastAPI(
        title="EMenu Luxury Edition API",
        description=(
            "Backend API for the EMenu Luxury Edition — a premium fine-dining "
            "tablet experience with immersive editorial content, intelligent "
            "recommendations, and real-time synchronization."
        ),
        version="0.1.0",
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/openapi.json",
        lifespan=lifespan,
    )

    # Middleware
    register_middleware(app)

    # Exception handlers
    register_exception_handlers(app)

    # Routes
    from app.api.auth import router as auth_router
    from app.api.content import router as content_router
    from app.api.dining import router as dining_router
    from app.api.health import router as health_router
    from app.api.menu import router as menu_router
    from app.api.recommendations import router as brain_router
    from app.api.updates import router as updates_router
    from app.api.ws import router as ws_router
    from app.api.tables import router as tables_router
    from app.api.orders import router as orders_router
    from app.api.admin import router as admin_router
    from app.api.menu_admin import router as menu_admin_router
    from app.api.demo import router as demo_router

    api_prefix = "/api/v1"
    app.include_router(health_router)
    app.include_router(auth_router, prefix=api_prefix)
    app.include_router(menu_router, prefix=api_prefix)
    app.include_router(content_router, prefix=api_prefix)
    app.include_router(dining_router, prefix=api_prefix)
    app.include_router(brain_router, prefix=api_prefix)
    app.include_router(updates_router, prefix=api_prefix)
    app.include_router(tables_router, prefix=api_prefix)
    app.include_router(orders_router, prefix=api_prefix)
    app.include_router(admin_router, prefix=api_prefix)
    app.include_router(menu_admin_router, prefix=api_prefix)
    app.include_router(demo_router, prefix=api_prefix)
    app.include_router(ws_router)

    return app


app = create_app()
