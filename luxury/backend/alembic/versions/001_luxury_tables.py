"""Create luxury-specific tables

Revision ID: 001_luxury_tables
Revises: None
Create Date: 2026-07-04
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "001_luxury_tables"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── LuxuryItemContent ─────────────────────────────────────────────────
    op.create_table(
        "LuxuryItemContent",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("restaurantId", sa.String, nullable=False),
        sa.Column("menuItemId", sa.Integer, nullable=False),
        sa.Column("heroImagePath", sa.String, server_default=""),
        sa.Column("heroVideoPath", sa.String, server_default=""),
        sa.Column("ingredientStory", sa.Text, server_default=""),
        sa.Column("originStory", sa.Text, server_default=""),
        sa.Column("chefStory", sa.Text, server_default=""),
        sa.Column("editorialNotes", sa.Text, server_default=""),
        sa.Column("toneStyle", sa.String, server_default="luxury"),
        sa.Column("mediaVersion", sa.Integer, server_default="1"),
        sa.Column("metadata", JSONB, nullable=True),
        sa.Column("createdAt", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updatedAt", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("restaurantId", "menuItemId", name="uq_luxury_content_item"),
    )
    op.create_index("ix_luxury_content_restaurant", "LuxuryItemContent", ["restaurantId"])

    # ── ContentVersion ────────────────────────────────────────────────────
    op.create_table(
        "ContentVersion",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("restaurantId", sa.String, nullable=False),
        sa.Column("scope", sa.String, nullable=False),
        sa.Column("version", sa.Integer, nullable=False, server_default="1"),
        sa.Column("changedAt", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("summary", sa.String, server_default=""),
        sa.UniqueConstraint("restaurantId", "scope", name="uq_content_version_scope"),
    )

    # ── AppRelease ────────────────────────────────────────────────────────
    op.create_table(
        "AppRelease",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("restaurantId", sa.String, server_default=""),
        sa.Column("appType", sa.String, nullable=False),
        sa.Column("versionCode", sa.Integer, nullable=False),
        sa.Column("versionName", sa.String, nullable=False),
        sa.Column("apkUrl", sa.String, nullable=False),
        sa.Column("releaseNotes", sa.String, server_default=""),
        sa.Column("minVersionCode", sa.Integer, server_default="0"),
        sa.Column("active", sa.Boolean, server_default=sa.text("true")),
        sa.Column("createdAt", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("appType", "versionCode", name="uq_app_release_version"),
    )

    # ── BrainOutput ───────────────────────────────────────────────────────
    op.create_table(
        "BrainOutput",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("restaurantId", sa.String, nullable=False),
        sa.Column("sourceItemId", sa.Integer, nullable=False),
        sa.Column("outputType", sa.String, nullable=False),
        sa.Column("targetItemId", sa.Integer, nullable=False),
        sa.Column("expectedValue", sa.Float, server_default="0"),
        sa.Column("confidence", sa.Float, server_default="0"),
        sa.Column("explanation", sa.Text, server_default=""),
        sa.Column("scriptProfessional", sa.Text, server_default=""),
        sa.Column("scriptFriendly", sa.Text, server_default=""),
        sa.Column("scriptLuxury", sa.Text, server_default=""),
        sa.Column("computedAt", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("metadata", JSONB, nullable=True),
    )
    op.create_index(
        "ix_brain_output_source",
        "BrainOutput",
        ["restaurantId", "sourceItemId", "outputType"],
    )

    # ── DiningSession ─────────────────────────────────────────────────────
    op.create_table(
        "DiningSession",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("restaurantId", sa.String, nullable=False),
        sa.Column("tableId", sa.String, nullable=False),
        sa.Column("state", sa.String, server_default="WELCOME"),
        sa.Column("guestId", sa.Integer, nullable=True),
        sa.Column("covers", sa.Integer, server_default="0"),
        sa.Column("waiterName", sa.String, server_default=""),
        sa.Column("stateHistory", JSONB, nullable=True),
        sa.Column("experienceConfig", JSONB, nullable=True),
        sa.Column("startedAt", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("endedAt", sa.DateTime(timezone=True), nullable=True),
        sa.Column("metadata", JSONB, nullable=True),
        sa.Column("createdAt", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updatedAt", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_dining_session_active", "DiningSession", ["restaurantId", "tableId", "endedAt"])


def downgrade() -> None:
    op.drop_table("DiningSession")
    op.drop_table("BrainOutput")
    op.drop_table("AppRelease")
    op.drop_table("ContentVersion")
    op.drop_table("LuxuryItemContent")
