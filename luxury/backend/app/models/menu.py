"""Menu models — map to existing Prisma ``MenuCategory`` and ``MenuItem`` tables."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class MenuCategory(Base):
    __tablename__ = "MenuCategory"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    restaurantId: Mapped[str] = mapped_column(String, nullable=False, default="trump")
    title: Mapped[str] = mapped_column(String, nullable=False)
    slug: Mapped[str] = mapped_column(String, nullable=False)
    path: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    parentId: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sortOrder: Mapped[int] = mapped_column(Integer, default=0)
    visible: Mapped[bool] = mapped_column(Boolean, default=True)
    courseType: Mapped[str | None] = mapped_column(String, nullable=True, default="MAIN")
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSONB, nullable=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updatedAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class MenuItem(Base):
    __tablename__ = "MenuItem"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    restaurantId: Mapped[str] = mapped_column(String, nullable=False, default="trump")
    categoryId: Mapped[int] = mapped_column(Integer, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    normalizedName: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str] = mapped_column(String, default="")
    price: Mapped[float] = mapped_column(Float, default=0)
    calories: Mapped[str] = mapped_column(String, default="")
    allergens: Mapped[str] = mapped_column(String, default="")
    spice: Mapped[str] = mapped_column(String, default="")
    imagePath: Mapped[str] = mapped_column(String, default="")
    videoPath: Mapped[str] = mapped_column(String, default="")
    youtubeId: Mapped[str] = mapped_column(String, default="")
    imageVisible: Mapped[bool] = mapped_column(Boolean, default=True)
    videoVisible: Mapped[bool] = mapped_column(Boolean, default=True)
    visible: Mapped[bool] = mapped_column(Boolean, default=True)
    available: Mapped[bool] = mapped_column(Boolean, default=True)
    chefPick: Mapped[bool] = mapped_column(Boolean, default=False)
    popular: Mapped[bool] = mapped_column(Boolean, default=False)
    sourceTitle: Mapped[str] = mapped_column(String, default="")
    sortOrder: Mapped[int] = mapped_column(Integer, default=0)
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSONB, nullable=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updatedAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
