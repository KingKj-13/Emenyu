-- Phase 4: recommendation lifecycle analytics events.
-- Idempotent (IF NOT EXISTS) so it is safe to deploy more than once. No foreign
-- keys on the *ItemId columns: the engine is name-keyed and items may be deleted
-- (that is surfaced by `npm run reco:health`, not enforced by the DB).

CREATE TABLE IF NOT EXISTS "RecommendationEvent" (
    "id" SERIAL NOT NULL,
    "restaurantId" TEXT NOT NULL DEFAULT 'trump',
    "eventType" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT '',
    "recType" TEXT NOT NULL DEFAULT '',
    "recommendedItemId" INTEGER,
    "recommendedName" TEXT NOT NULL DEFAULT '',
    "originatingItemId" INTEGER,
    "originatingName" TEXT NOT NULL DEFAULT '',
    "rotationGroup" TEXT NOT NULL DEFAULT '',
    "sessionId" TEXT NOT NULL DEFAULT '',
    "mode" TEXT NOT NULL DEFAULT 'customer',
    "chef" BOOLEAN NOT NULL DEFAULT false,
    "value" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecommendationEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "RecommendationEvent_type_idx"
    ON "RecommendationEvent"("restaurantId", "eventType", "createdAt");
CREATE INDEX IF NOT EXISTS "RecommendationEvent_name_idx"
    ON "RecommendationEvent"("restaurantId", "recommendedName");
CREATE INDEX IF NOT EXISTS "RecommendationEvent_rot_idx"
    ON "RecommendationEvent"("restaurantId", "rotationGroup");
CREATE INDEX IF NOT EXISTS "RecommendationEvent_src_idx"
    ON "RecommendationEvent"("restaurantId", "source");
