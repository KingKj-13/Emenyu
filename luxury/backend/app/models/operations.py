"""Operations models — Shift, AuditLog, Notification, WaiterTask.

Map to existing Prisma tables for operational tracking.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Float, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Shift(Base):
    __tablename__ = "Shift"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    restaurantId: Mapped[str] = mapped_column(String, default="trump")
    username: Mapped[str] = mapped_column(String, nullable=False)
    role: Mapped[str] = mapped_column(String, default="waiter")
    status: Mapped[str] = mapped_column(String, default="active")
    startedAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    endedAt: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    startedBy: Mapped[str] = mapped_column(String, default="")
    endedBy: Mapped[str] = mapped_column(String, default="")
    endReason: Mapped[str] = mapped_column(String, default="")
    assignedTables: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    ordersHandled: Mapped[int] = mapped_column(Integer, default=0)
    revenueHandled: Mapped[float] = mapped_column(Float, default=0)
    responseMetrics: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSONB, nullable=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updatedAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class AuditLog(Base):
    __tablename__ = "AuditLog"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    restaurantId: Mapped[str] = mapped_column(String, default="trump")
    actor: Mapped[str] = mapped_column(String, default="system")
    actorRole: Mapped[str] = mapped_column(String, default="")
    action: Mapped[str] = mapped_column(String, nullable=False)
    targetType: Mapped[str] = mapped_column(String, default="")
    targetId: Mapped[str] = mapped_column(String, default="")
    summary: Mapped[str] = mapped_column(String, default="")
    reason: Mapped[str] = mapped_column(String, default="")
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSONB, nullable=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Notification(Base):
    __tablename__ = "Notification"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    restaurantId: Mapped[str] = mapped_column(String, default="trump")
    source: Mapped[str] = mapped_column(String, nullable=False)
    title: Mapped[str] = mapped_column(String, nullable=False)
    body: Mapped[str] = mapped_column(String, default="")
    priority: Mapped[int] = mapped_column(Integer, default=3)
    recipientRole: Mapped[str] = mapped_column(String, default="")
    recipientUser: Mapped[str] = mapped_column(String, default="")
    tableId: Mapped[str] = mapped_column(String, default="")
    readAt: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSONB, nullable=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class WaiterTask(Base):
    __tablename__ = "WaiterTask"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    restaurantId: Mapped[str] = mapped_column(String, default="trump")
    tableId: Mapped[str] = mapped_column(String, default="")
    waiterName: Mapped[str] = mapped_column(String, default="")
    type: Mapped[str] = mapped_column(String, nullable=False)
    title: Mapped[str] = mapped_column(String, nullable=False)
    message: Mapped[str] = mapped_column(String, default="")
    priority: Mapped[int] = mapped_column(Integer, default=3)
    status: Mapped[str] = mapped_column(String, default="open")
    payload: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    requestedBy: Mapped[str] = mapped_column(String, default="system")
    approvedBy: Mapped[str] = mapped_column(String, default="")
    dueAt: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    acknowledgedAt: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resolvedAt: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updatedAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
