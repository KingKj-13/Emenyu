"""Media Pipeline — preloading, caching, asset versioning, and offline support.

The pipeline manages the lifecycle of media assets (hero images, cinematic
videos) from server storage to tablet cache.  It provides:

1. **Asset manifest** — a versioned inventory of all media files the tablet
   needs, with sizes for download budgeting.
2. **Versioned paths** — media URLs include a version query param so tablets
   know when to re-download a changed asset.
3. **Preload hints** — ordered list of assets to download first (based on
   dining state and popularity).
4. **Storage abstraction** — filesystem today, CDN-ready for future migration.
"""

from __future__ import annotations

import os
from pathlib import Path

import structlog

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.config import get_settings
from app.models.luxury import LuxuryItemContent
from app.schemas.dining import DiningState

logger = structlog.get_logger()



class MediaPipeline:
    """Manages media asset delivery with versioning and preload ordering.

    All file operations use the configured ``media_root`` directory.
    The ``media_url_prefix`` is prepended to paths when building URLs.
    """

    def __init__(self) -> None:
        self._settings = get_settings()
        self._root = Path(self._settings.media_root)
        self._url_prefix = self._settings.media_url_prefix.rstrip("/")

    def resolve_url(self, relative_path: str, version: int = 1) -> str:
        """Convert a relative media path to a versioned URL.

        Example: ``hero/tomahawk.jpg`` → ``/luxury/media/hero/tomahawk.jpg?v=3``
        """
        if not relative_path:
            return ""
        clean = relative_path.lstrip("/")
        return f"{self._url_prefix}/{clean}?v={version}"

    def resolve_path(self, relative_path: str) -> Path:
        """Convert a relative media path to an absolute filesystem path."""
        return self._root / relative_path.lstrip("/")

    def file_exists(self, relative_path: str) -> bool:
        """Check if a media file exists on disk."""
        if not relative_path:
            return False
        return self.resolve_path(relative_path).is_file()

    def file_size(self, relative_path: str) -> int:
        """Get file size in bytes, or 0 if the file doesn't exist."""
        path = self.resolve_path(relative_path)
        try:
            return path.stat().st_size if path.is_file() else 0
        except OSError:
            return 0

    async def build_manifest(
        self,
        version: int = 1,
        since_version: int = 0,
        db: AsyncSession | None = None,
    ) -> dict:
        """Build a media manifest for tablet preloading.

        If since_version is provided and a db session is available, it filters
        for assets modified since that version using database records.
        """
        assets: list[dict] = []
        total_size = 0

        # Optional: load database modified media version items
        changed_paths: set[str] = set()
        if since_version > 0 and db is not None:
            result = await db.execute(
                select(LuxuryItemContent).where(
                    LuxuryItemContent.restaurantId == self._settings.restaurant_id,
                    LuxuryItemContent.mediaVersion > since_version,
                )
            )
            for row in result.scalars().all():
                if row.heroImagePath:
                    changed_paths.add(row.heroImagePath.lstrip("/"))
                if row.heroVideoPath:
                    changed_paths.add(row.heroVideoPath.lstrip("/"))

        if self._root.is_dir():
            for root_dir, _dirs, files in os.walk(self._root):
                for filename in files:
                    file_path = Path(root_dir) / filename
                    relative = str(file_path.relative_to(self._root)).replace("\\", "/")
                    
                    # If since_version delta sync is active, skip unchanged items
                    if since_version > 0 and changed_paths and relative not in changed_paths:
                        continue

                    import hashlib
                    size = file_path.stat().st_size
                    ext = file_path.suffix.lower()
                    media_type = "video" if ext in {".mp4", ".webm", ".mov"} else "image"

                    # Calculate SHA256 hash
                    sha256_hash = hashlib.sha256()
                    with open(file_path, "rb") as f:
                        for chunk in iter(lambda: f.read(4096), b""):
                            sha256_hash.update(chunk)
                    file_hash = sha256_hash.hexdigest()

                    assets.append({
                        "path": relative,
                        "url": self.resolve_url(relative, version),
                        "type": media_type,
                        "version": version,
                        "size_bytes": size,
                        "sha256": file_hash,
                    })
                    total_size += size

        return {
            "restaurant_id": self._settings.restaurant_id,
            "version": version,
            "since_version": since_version,
            "assets": assets,
            "total_size_bytes": total_size,
        }


    def get_preload_order(self, dining_state: DiningState, items: list[dict] | None = None) -> list[str]:
        """Compute the optimal preload order for media assets.

        Priority:
        1. Hero images for the current dining state's course
        2. Hero videos for popular/chef_pick items
        3. Remaining images
        4. Remaining videos

        This allows tablets to display content as fast as possible even on
        slower connections.
        """
        if not items:
            return []

        images: list[tuple[int, str]] = []
        videos: list[tuple[int, str]] = []

        for item in items:
            score = 0
            if item.get("chef_pick"):
                score += 2
            if item.get("popular"):
                score += 1

            hero_img = item.get("hero_image_path", "")
            hero_vid = item.get("hero_video_path", "")
            if hero_img:
                images.append((score, hero_img))
            if hero_vid:
                videos.append((score, hero_vid))

        # Sort by score descending
        images.sort(key=lambda x: x[0], reverse=True)
        videos.sort(key=lambda x: x[0], reverse=True)

        # Images first (faster to load), then videos
        return [path for _, path in images] + [path for _, path in videos]

    def ensure_directories(self) -> None:
        """Create the media directory structure if it doesn't exist."""
        for subdir in ["hero", "video", "category", "chef"]:
            (self._root / subdir).mkdir(parents=True, exist_ok=True)
