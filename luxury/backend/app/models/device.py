"""Device model — maps to existing Prisma ``Device`` table.

Used for both customer tablet device registration (passwordless) and
staff waiter tablet refresh-token management.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Device(Base):
    __tablename__ = "Device"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    restaurantId: Mapped[str] = mapped_column(String, default="trump")
    deviceId: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    username: Mapped[str] = mapped_column(String, nullable=False)
    deviceName: Mapped[str] = mapped_column(String, default="")
    platform: Mapped[str] = mapped_column(String, default="")
    refreshTokenHash: Mapped[str] = mapped_column(String, nullable=False)
    refreshExpiresAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    pushToken: Mapped[str] = mapped_column(String, default="")
    pushProvider: Mapped[str] = mapped_column(String, default="")
    lastSeenAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    revokedAt: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updatedAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
