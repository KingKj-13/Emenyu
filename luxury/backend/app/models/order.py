"""Order models — map to existing Prisma Order, OrderItem, OrderStatusHistory,
OrderRating, and ActiveCartState tables.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Float, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Order(Base):
    __tablename__ = "Order"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    restaurantId: Mapped[str] = mapped_column(String, default="trump")
    filename: Mapped[str] = mapped_column(String, nullable=False)
    tableId: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[str] = mapped_column(String, default="active")
    kitchenStatus: Mapped[str] = mapped_column(String, default="new")
    waiterName: Mapped[str] = mapped_column(String, default="")
    notes: Mapped[str] = mapped_column(String, default="")
    subtotal: Mapped[float] = mapped_column(Float, default=0)
    vat: Mapped[float] = mapped_column(Float, default=0)
    service: Mapped[float] = mapped_column(Float, default=0)
    tip: Mapped[float] = mapped_column(Float, default=0)
    total: Mapped[float] = mapped_column(Float, default=0)
    covers: Mapped[int] = mapped_column(Integer, default=0)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    sourceKind: Mapped[str] = mapped_column(String, default="orders")
    clientOrderId: Mapped[str] = mapped_column(String, default="")
    guestId: Mapped[int | None] = mapped_column(Integer, nullable=True)
    raw: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updatedAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class OrderItem(Base):
    __tablename__ = "OrderItem"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    orderId: Mapped[int] = mapped_column(Integer, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    price: Mapped[float] = mapped_column(Float, default=0)
    quantity: Mapped[float] = mapped_column(Float, default=1)
    note: Mapped[str] = mapped_column(String, default="")
    imagePath: Mapped[str] = mapped_column(String, default="")
    description: Mapped[str] = mapped_column(String, default="")
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSONB, nullable=True)
    sortOrder: Mapped[int] = mapped_column(Integer, default=0)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updatedAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class OrderStatusHistory(Base):
    __tablename__ = "OrderStatusHistory"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    orderId: Mapped[int] = mapped_column(Integer, nullable=False)
    fromStatus: Mapped[str] = mapped_column(String, default="")
    toStatus: Mapped[str] = mapped_column(String, nullable=False)
    actor: Mapped[str] = mapped_column(String, default="system")
    reason: Mapped[str] = mapped_column(String, default="")
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSONB, nullable=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class OrderRating(Base):
    __tablename__ = "OrderRating"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    restaurantId: Mapped[str] = mapped_column(String, default="trump")
    orderId: Mapped[int] = mapped_column(Integer, unique=True, nullable=False)
    rating: Mapped[int] = mapped_column(Integer, nullable=False)
    comment: Mapped[str] = mapped_column(String, default="")
    tableId: Mapped[str] = mapped_column(String, nullable=False)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ActiveCartState(Base):
    __tablename__ = "ActiveCartState"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    restaurantId: Mapped[str] = mapped_column(String, default="trump")
    tableId: Mapped[str] = mapped_column(String, nullable=False)
    cart: Mapped[dict] = mapped_column(JSONB, nullable=False)
    adminOverrides: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    updatedBy: Mapped[str] = mapped_column(String, default="system")
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updatedAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
