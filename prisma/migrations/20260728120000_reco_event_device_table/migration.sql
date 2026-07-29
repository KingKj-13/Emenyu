-- Device-aware recommendations: RecommendationEvent gains deviceId/tableId
-- alongside the existing analytics-only sessionId, so events can be sliced
-- per guest device/table. Additive, backward-compatible: existing rows get
-- deviceId='' / tableId='' (no ownership data), matching the sessionId
-- default already on this table.
ALTER TABLE "RecommendationEvent" ADD COLUMN "deviceId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "RecommendationEvent" ADD COLUMN "tableId" TEXT NOT NULL DEFAULT '';

-- Lookup index (matches the Prisma @@index([restaurantId, deviceId])).
CREATE INDEX "RecommendationEvent_restaurantId_deviceId_idx" ON "RecommendationEvent"("restaurantId", "deviceId");
