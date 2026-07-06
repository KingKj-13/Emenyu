"""Analytics models — map to existing Prisma RecommendationEvent and UpsellEvent."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class RecommendationEvent(Base):
    __tablename__ = "RecommendationEvent"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    restaurantId: Mapped[str] = mapped_column(String, default="trump")
    eventType: Mapped[str] = mapped_column(String, nullable=False)
    source: Mapped[str] = mapped_column(String, default="")
    recType: Mapped[str] = mapped_column(String, default="")
    recommendedItemId: Mapped[int | None] = mapped_column(Integer, nullable=True)
    recommendedName: Mapped[str] = mapped_column(String, default="")
    originatingItemId: Mapped[int | None] = mapped_column(Integer, nullable=True)
    originatingName: Mapped[str] = mapped_column(String, default="")
    rotationGroup: Mapped[str] = mapped_column(String, default="")
    sessionId: Mapped[str] = mapped_column(String, default="")
    mode: Mapped[str] = mapped_column(String, default="customer")
    chef: Mapped[bool] = mapped_column(Boolean, default=False)
    value: Mapped[float] = mapped_column(Float, default=0)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class UpsellEvent(Base):
    __tablename__ = "UpsellEvent"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    restaurantId: Mapped[str] = mapped_column(String, default="trump")
    waiterName: Mapped[str] = mapped_column(String, default="")
    tableId: Mapped[str] = mapped_column(String, default="")
    orderId: Mapped[int | None] = mapped_column(Integer, nullable=True)
    suggestedItem: Mapped[str] = mapped_column(String, default="")
    accepted: Mapped[bool] = mapped_column(Boolean, default=False)
    source: Mapped[str] = mapped_column(String, default="coach")
    value: Mapped[float] = mapped_column(Float, default=0)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
