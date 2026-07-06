"""Content API — luxury editorial content management and sync."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.core.dependencies import CurrentUser, DbSession, require_roles
from app.services.content_service import ContentService

router = APIRouter(prefix="/content", tags=["Content"])


@router.get(
    "/items/{item_id}",
    summary="Get luxury content for a menu item",
)
async def get_content(item_id: int, db: DbSession, _user: CurrentUser) -> dict:
    """Read the editorial content (stories, hero media) for a specific item."""
    svc = ContentService(db)
    content = await svc.get_content(item_id)
    return content or {"menu_item_id": item_id, "message": "No luxury content yet"}


@router.put(
    "/items/{item_id}",
    summary="Update luxury content for a menu item",
    dependencies=[Depends(require_roles("owner", "manager"))],
)
async def upsert_content(item_id: int, body: dict, db: DbSession) -> dict:
    """Create or update editorial content for a menu item.

    Requires manager or owner role.  Increments the content version,
    which triggers WebSocket notifications to connected tablets.
    """
    svc = ContentService(db)
    return await svc.upsert_content(item_id, body)


@router.get(
    "/sync/versions",
    summary="Get content version numbers for sync",
)
async def get_versions(db: DbSession, _user: CurrentUser) -> dict:
    """Return current version numbers for each content scope.

    Tablets compare these to their cached versions to decide whether
    to fetch deltas.
    """
    svc = ContentService(db)
    return await svc.get_versions()


@router.get(
    "/sync/manifest",
    summary="Get media asset manifest for preloading",
)
async def get_media_manifest(
    db: DbSession,
    _user: CurrentUser,
    since_version: int = 0,
) -> dict:
    """Return the media manifest containing asset URLs, types, and sizes.

    Supports delta sync via since_version parameter.
    """
    from app.orchestrator.media_pipeline import MediaPipeline

    pipeline = MediaPipeline()
    return await pipeline.build_manifest(since_version=since_version, db=db)

