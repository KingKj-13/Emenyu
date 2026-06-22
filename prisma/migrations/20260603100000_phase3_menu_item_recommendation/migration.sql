-- Phase 3: per-item, chef-controlled recommendations.
-- Idempotent (IF NOT EXISTS / guarded FK) so it is safe to deploy more than once.

CREATE TABLE IF NOT EXISTS "MenuItemRecommendation" (
    "id" SERIAL NOT NULL,
    "restaurantId" TEXT NOT NULL DEFAULT 'trump',
    "sourceItemId" INTEGER NOT NULL,
    "targetItemId" INTEGER NOT NULL,
    "recType" TEXT NOT NULL,
    "beverageKind" TEXT NOT NULL DEFAULT 'NONE',
    "priority" INTEGER NOT NULL DEFAULT 100,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "season" TEXT NOT NULL DEFAULT 'ALL_YEAR',
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "rotationGroup" TEXT NOT NULL DEFAULT '',
    "reason" TEXT NOT NULL DEFAULT '',
    "createdBy" TEXT NOT NULL DEFAULT 'system',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MenuItemRecommendation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MenuItemRecommendation_uniq"
    ON "MenuItemRecommendation"("restaurantId", "sourceItemId", "targetItemId", "recType");
CREATE INDEX IF NOT EXISTS "MenuItemRecommendation_src_idx"
    ON "MenuItemRecommendation"("restaurantId", "sourceItemId", "active");
CREATE INDEX IF NOT EXISTS "MenuItemRecommendation_rot_idx"
    ON "MenuItemRecommendation"("restaurantId", "rotationGroup");

DO $$ BEGIN
  ALTER TABLE "MenuItemRecommendation"
    ADD CONSTRAINT "MenuItemRecommendation_sourceItemId_fkey"
    FOREIGN KEY ("sourceItemId") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "MenuItemRecommendation"
    ADD CONSTRAINT "MenuItemRecommendation_targetItemId_fkey"
    FOREIGN KEY ("targetItemId") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
