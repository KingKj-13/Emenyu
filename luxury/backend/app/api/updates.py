"""Updates API — App release tracking and auto-updates."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select

from app.core.dependencies import DbSession, require_roles
from app.models.luxury import AppRelease

router = APIRouter(prefix="/app", tags=["App Updates"])


@router.get(
    "/check-update",
    summary="Check if an application update is available",
)
async def check_update(
    db: DbSession,
    appType: str = Query(..., description="customer_tablet | waiter_tablet"),
    currentVersionCode: int = Query(..., description="Integer version code of current install"),
) -> dict:
    """Compare the client's current version against the database registry.

    Returns download coordinates and update urgency.
    """
    # Query latest active release
    result = await db.execute(
        select(AppRelease)
        .where(
            AppRelease.appType == appType,
            AppRelease.active == True,  # noqa: E712
        )
        .order_by(AppRelease.versionCode.desc())
        .limit(1)
    )
    latest = result.scalar_one_or_none()

    if not latest:
        return {
            "updateAvailable": False,
            "forceUpdate": False,
            "latestVersion": None,
        }

    update_available = latest.versionCode > currentVersionCode
    # Force update if the client version is below the minimum required version code
    force_update = update_available and (currentVersionCode < latest.minVersionCode)

    return {
        "updateAvailable": update_available,
        "forceUpdate": force_update,
        "latestVersion": {
            "versionCode": latest.versionCode,
            "versionName": latest.versionName,
            "apkUrl": latest.apkUrl,
            "releaseNotes": latest.releaseNotes,
        } if update_available else None,
    }


@router.post(
    "/releases",
    summary="Register a new application release",
    dependencies=[Depends(require_roles("owner", "manager"))],
)
async def register_release(
    body: dict,
    db: DbSession,
) -> dict:
    """Upload/publish details of a new app update (APK metadata)."""
    release = AppRelease(
        appType=body["app_type"],
        versionCode=body["version_code"],
        versionName=body["version_name"],
        apkUrl=body["apk_url"],
        releaseNotes=body.get("release_notes", ""),
        minVersionCode=body.get("min_version_code", 0),
        active=body.get("active", True),
    )
    db.add(release)
    await db.commit()
    await db.refresh(release)

    return {
        "id": release.id,
        "app_type": release.appType,
        "version_code": release.versionCode,
        "version_name": release.versionName,
        "apk_url": release.apkUrl,
    }
