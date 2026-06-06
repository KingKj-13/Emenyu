-- Phase 5: database-backed recommended-order bundles (persona meal bundles).
-- Idempotent (IF NOT EXISTS / guarded FK) so it is safe to deploy more than once.

CREATE TABLE IF NOT EXISTS "RecommendationBundle" (
    "id" SERIAL NOT NULL,
    "restaurantId" TEXT NOT NULL DEFAULT 'trump',
    "slug" TEXT NOT NULL DEFAULT '',
    "persona" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "icon" TEXT NOT NULL DEFAULT '',
    "accent" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "rotationGroup" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT NOT NULL DEFAULT 'system',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecommendationBundle_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "RecommendationBundleItem" (
    "id" SERIAL NOT NULL,
    "bundleId" INTEGER NOT NULL,
    "course" TEXT NOT NULL DEFAULT '',
    "itemName" TEXT NOT NULL,
    "itemId" INTEGER,
    "price" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RecommendationBundleItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "RecommendationBundle_active_idx"
    ON "RecommendationBundle"("restaurantId", "active", "priority");
CREATE INDEX IF NOT EXISTS "RecommendationBundle_rot_idx"
    ON "RecommendationBundle"("restaurantId", "rotationGroup");
CREATE INDEX IF NOT EXISTS "RecommendationBundleItem_bundle_idx"
    ON "RecommendationBundleItem"("bundleId", "sortOrder");

DO $$ BEGIN
  ALTER TABLE "RecommendationBundleItem"
    ADD CONSTRAINT "RecommendationBundleItem_bundleId_fkey"
    FOREIGN KEY ("bundleId") REFERENCES "RecommendationBundle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
