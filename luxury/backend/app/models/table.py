"""Table and WaiterAssignment models — map to existing Prisma tables."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Table(Base):
    __tablename__ = "Table"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    restaurantId: Mapped[str] = mapped_column(String, default="trump")
    tableId: Mapped[str] = mapped_column(String, nullable=False)
    displayName: Mapped[str] = mapped_column(String, default="")
    status: Mapped[str] = mapped_column(String, default="active")
    covers: Mapped[int] = mapped_column(Integer, default=0)
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSONB, nullable=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updatedAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class WaiterAssignment(Base):
    __tablename__ = "WaiterAssignment"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    restaurantId: Mapped[str] = mapped_column(String, default="trump")
    tableId: Mapped[str] = mapped_column(String, nullable=False)
    waiterName: Mapped[str] = mapped_column(String, nullable=False)
    socketId: Mapped[str] = mapped_column(String, default="")
    status: Mapped[str] = mapped_column(String, default="active")
    assignedAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    releasedAt: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    changeType: Mapped[str] = mapped_column(String, default="assign")
    assignedBy: Mapped[str] = mapped_column(String, default="")
    previousWaiter: Mapped[str] = mapped_column(String, default="")
    reason: Mapped[str] = mapped_column(String, default="")
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSONB, nullable=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updatedAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
