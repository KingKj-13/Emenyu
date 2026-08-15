"""Guest model — maps to existing Prisma ``Guest`` table."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Guest(Base):
    __tablename__ = "Guest"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    restaurantId: Mapped[str] = mapped_column(String, default="trump")
    name: Mapped[str] = mapped_column(String, nullable=False)
    phone: Mapped[str] = mapped_column(String, default="")
    email: Mapped[str] = mapped_column(String, default="")
    vip: Mapped[bool] = mapped_column(Boolean, default=False)
    loyaltyTier: Mapped[str] = mapped_column(String, default="")
    dietary: Mapped[str] = mapped_column(String, default="")
    allergies: Mapped[str] = mapped_column(String, default="")
    preferences: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    notes: Mapped[str] = mapped_column(String, default="")
    visitCount: Mapped[int] = mapped_column(Integer, default=0)
    lifetimeSpend: Mapped[float] = mapped_column(Float, default=0)
    avgSpend: Mapped[float] = mapped_column(Float, default=0)
    lastVisitAt: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updatedAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
