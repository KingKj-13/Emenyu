"""User model — maps to the existing Prisma ``User`` table.

Column names and types mirror the Prisma schema exactly so both the Node.js
backend and this FastAPI backend can read/write the same rows.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class User(Base):
    __tablename__ = "User"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    password: Mapped[str] = mapped_column(String, nullable=False)
    role: Mapped[str] = mapped_column(String, nullable=False, index=True)
    label: Mapped[str | None] = mapped_column(String, nullable=True)
    suspended: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    suspendedAt: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    sessionInvalidBefore: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    createdBy: Mapped[str] = mapped_column(String, default="system")
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updatedAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
