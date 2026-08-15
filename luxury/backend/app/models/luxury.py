"""Luxury-specific models — NEW tables created by Alembic (not Prisma).

These tables are owned exclusively by the Luxury Edition backend.
They follow the same ``restaurantId`` multi-tenant pattern for consistency.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class LuxuryItemContent(Base):
    """Extended editorial content for a menu item — hero media, stories, etc.

    One row per (restaurantId, menuItemId). The ``mediaVersion`` field is
    incremented on every media change and drives the content-sync protocol:
    tablets compare their cached version to the server's version and fetch
    deltas only when they differ.
    """

    __tablename__ = "LuxuryItemContent"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    restaurantId: Mapped[str] = mapped_column(String, nullable=False)
    menuItemId: Mapped[int] = mapped_column(Integer, nullable=False)
    heroImagePath: Mapped[str] = mapped_column(String, default="")
    heroVideoPath: Mapped[str] = mapped_column(String, default="")
    ingredientStory: Mapped[str] = mapped_column(Text, default="")
    originStory: Mapped[str] = mapped_column(Text, default="")
    chefStory: Mapped[str] = mapped_column(Text, default="")
    editorialNotes: Mapped[str] = mapped_column(Text, default="")
    toneStyle: Mapped[str] = mapped_column(String, default="luxury")
    mediaVersion: Mapped[int] = mapped_column(Integer, default=1)
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSONB, nullable=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updatedAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class ContentVersion(Base):
    """Per-scope monotonic version counter for the content-sync protocol.

    Scopes: ``menu``, ``content``, ``recommendations``, ``config``.
    Tablets poll ``GET /sync/versions`` and compare to their local cache to
    decide whether to fetch deltas.  WebSocket pushes also carry the new
    version number so connected tablets can react immediately.
    """

    __tablename__ = "ContentVersion"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    restaurantId: Mapped[str] = mapped_column(String, nullable=False)
    scope: Mapped[str] = mapped_column(String, nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    changedAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    summary: Mapped[str] = mapped_column(String, default="")


class AppRelease(Base):
    """APK version registry for the self-update mechanism.

    Each row represents a published build.  Tablets check
    ``GET /app/check-update`` on launch and periodically; when
    ``currentVersionCode < minVersionCode`` the update is forced.
    """

    __tablename__ = "AppRelease"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    restaurantId: Mapped[str] = mapped_column(String, default="")
    appType: Mapped[str] = mapped_column(String, nullable=False)
    versionCode: Mapped[int] = mapped_column(Integer, nullable=False)
    versionName: Mapped[str] = mapped_column(String, nullable=False)
    apkUrl: Mapped[str] = mapped_column(String, nullable=False)
    releaseNotes: Mapped[str] = mapped_column(String, default="")
    minVersionCode: Mapped[int] = mapped_column(Integer, default=0)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class BrainOutput(Base):
    """Cached output from the Recommendation Brain.

    Stores the computed pairing/upgrade/replacement for a source item so the
    Brain can serve repeat queries instantly and the admin dashboard can audit
    what the Brain recommended.
    """

    __tablename__ = "BrainOutput"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    restaurantId: Mapped[str] = mapped_column(String, nullable=False)
    sourceItemId: Mapped[int] = mapped_column(Integer, nullable=False)
    outputType: Mapped[str] = mapped_column(String, nullable=False)
    targetItemId: Mapped[int] = mapped_column(Integer, nullable=False)
    expectedValue: Mapped[float] = mapped_column(Float, default=0)
    confidence: Mapped[float] = mapped_column(Float, default=0)
    explanation: Mapped[str] = mapped_column(Text, default="")
    scriptProfessional: Mapped[str] = mapped_column(Text, default="")
    scriptFriendly: Mapped[str] = mapped_column(Text, default="")
    scriptLuxury: Mapped[str] = mapped_column(Text, default="")
    computedAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSONB, nullable=True)


class DiningSession(Base):
    """Tracks a single dining session for the Dining State Machine.

    Created when guests are seated (or a table is activated).  The ``state``
    field holds the current position in the dining journey:
    WELCOME → APERITIF → STARTERS → MAINS → DESSERT → DIGESTIF → FINISHED.

    ``stateHistory`` is a JSONB array of ``{state, enteredAt, exitedAt}``
    objects that capture the full timeline for analytics.
    """

    __tablename__ = "DiningSession"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    restaurantId: Mapped[str] = mapped_column(String, nullable=False)
    tableId: Mapped[str] = mapped_column(String, nullable=False)
    state: Mapped[str] = mapped_column(String, default="WELCOME")
    guestId: Mapped[int | None] = mapped_column(Integer, nullable=True)
    covers: Mapped[int] = mapped_column(Integer, default=0)
    waiterName: Mapped[str] = mapped_column(String, default="")
    stateHistory: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    experienceConfig: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    startedAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    endedAt: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSONB, nullable=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updatedAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
