-- Carmella Phase 1 schema (ARCHITECTURE_DECISIONS.md AD-002). Additive only —
-- no columns dropped, no types changed on existing columns. Written by hand
-- (not via `prisma migrate dev`) because the local dev database also hosts
-- tables owned by the off-limits luxury/ Alembic-managed schema
-- (AppRelease/BrainOutput/ContentVersion/DiningSession/LuxuryItemContent/
-- alembic_version); Prisma's own diff/reset tooling would have proposed
-- dropping those. This script touches only the tables listed below.

-- MenuCategory: chapter narrative intro line (Carmella's "chapters").
ALTER TABLE "MenuCategory" ADD COLUMN "intro" TEXT NOT NULL DEFAULT '';

-- MenuItem: narrative story/subtitle text, and a 3-state availability field
-- alongside the existing `available` boolean (kept for Trump's admin UI).
ALTER TABLE "MenuItem" ADD COLUMN "story" TEXT NOT NULL DEFAULT '';
ALTER TABLE "MenuItem" ADD COLUMN "subtitle" TEXT NOT NULL DEFAULT '';
ALTER TABLE "MenuItem" ADD COLUMN "availability" TEXT NOT NULL DEFAULT 'available';

-- MenuItemVariant: multi-choice items (e.g. Carmella's "Amy's Choice") with an
-- isAddon flag distinguishing add-ons from alternative variants. Net-new.
CREATE TABLE "MenuItemVariant" (
  "id" SERIAL NOT NULL,
  "restaurantId" TEXT NOT NULL DEFAULT 'trump',
  "itemId" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "price" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "imagePath" TEXT NOT NULL DEFAULT '',
  "isAddon" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MenuItemVariant_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MenuItemVariant_restaurantId_itemId_sortOrder_idx" ON "MenuItemVariant"("restaurantId", "itemId", "sortOrder");

ALTER TABLE "MenuItemVariant" ADD CONSTRAINT "MenuItemVariant_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DayPart: time-windowed content (greeting, lead chapters, suggestion strip,
-- chat chips) driving Carmella's morning/midday/golden-hour engine. Net-new —
-- Trump has no analog today.
CREATE TABLE "DayPart" (
  "id" SERIAL NOT NULL,
  "restaurantId" TEXT NOT NULL DEFAULT 'trump',
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "fromTime" TEXT NOT NULL,
  "toTime" TEXT NOT NULL,
  "greeting" TEXT NOT NULL DEFAULT '',
  "leadChapters" JSONB,
  "gaspardChips" JSONB,
  "suggestStrip" JSONB,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "DayPart_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DayPart_restaurantId_slug_key" ON "DayPart"("restaurantId", "slug");
CREATE INDEX "DayPart_restaurantId_sortOrder_idx" ON "DayPart"("restaurantId", "sortOrder");

-- RecommendationBundle: fixed all-in total price override (null = sum items,
-- Trump's current behavior) and a day-part filter (Carmella's "Gaspard's
-- Tables"). MenuItemRecommendation needs NO schema change for pairings —
-- Carmella's pairings reuse it with recType='PAIRING' (see model comment).
ALTER TABLE "RecommendationBundle" ADD COLUMN "total" DOUBLE PRECISION;
ALTER TABLE "RecommendationBundle" ADD COLUMN "daypart" TEXT NOT NULL DEFAULT '';

CREATE INDEX "RecommendationBundle_restaurantId_daypart_idx" ON "RecommendationBundle"("restaurantId", "daypart");
