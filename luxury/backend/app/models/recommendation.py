"""Recommendation models — map to existing Prisma recommendation tables."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Recommendation(Base):
    __tablename__ = "Recommendation"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    restaurantId: Mapped[str] = mapped_column(String, default="trump")
    description: Mapped[str] = mapped_column(String, default="")
    items: Mapped[dict] = mapped_column(JSONB, nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    sortOrder: Mapped[int] = mapped_column(Integer, default=0)
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSONB, nullable=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updatedAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class MenuItemRecommendation(Base):
    __tablename__ = "MenuItemRecommendation"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    restaurantId: Mapped[str] = mapped_column(String, default="trump")
    sourceItemId: Mapped[int] = mapped_column(Integer, nullable=False)
    targetItemId: Mapped[int] = mapped_column(Integer, nullable=False)
    recType: Mapped[str] = mapped_column(String, nullable=False)
    beverageKind: Mapped[str] = mapped_column(String, default="NONE")
    priority: Mapped[int] = mapped_column(Integer, default=100)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    season: Mapped[str] = mapped_column(String, default="ALL_YEAR")
    startsAt: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    endsAt: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    rotationGroup: Mapped[str] = mapped_column(String, default="")
    reason: Mapped[str] = mapped_column(String, default="")
    createdBy: Mapped[str] = mapped_column(String, default="system")
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updatedAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class FeaturedItem(Base):
    __tablename__ = "FeaturedItem"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    restaurantId: Mapped[str] = mapped_column(String, default="trump")
    group: Mapped[str] = mapped_column(String, nullable=False)
    itemId: Mapped[int | None] = mapped_column(Integer, nullable=True)
    itemName: Mapped[str] = mapped_column(String, nullable=False)
    reason: Mapped[str] = mapped_column(String, default="")
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    sortOrder: Mapped[int] = mapped_column(Integer, default=0)
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSONB, nullable=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updatedAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class RecommendationBundle(Base):
    __tablename__ = "RecommendationBundle"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    restaurantId: Mapped[str] = mapped_column(String, default="trump")
    slug: Mapped[str] = mapped_column(String, default="")
    persona: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str] = mapped_column(String, default="")
    icon: Mapped[str] = mapped_column(String, default="")
    accent: Mapped[str] = mapped_column(String, default="")
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    priority: Mapped[int] = mapped_column(Integer, default=100)
    rotationGroup: Mapped[str] = mapped_column(String, default="")
    sortOrder: Mapped[int] = mapped_column(Integer, default=0)
    createdBy: Mapped[str] = mapped_column(String, default="system")
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updatedAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class RecommendationBundleItem(Base):
    __tablename__ = "RecommendationBundleItem"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    bundleId: Mapped[int] = mapped_column(Integer, nullable=False)
    course: Mapped[str] = mapped_column(String, default="")
    itemName: Mapped[str] = mapped_column(String, nullable=False)
    itemId: Mapped[int | None] = mapped_column(Integer, nullable=True)
    price: Mapped[float] = mapped_column(Float, default=0)
    sortOrder: Mapped[int] = mapped_column(Integer, default=0)
