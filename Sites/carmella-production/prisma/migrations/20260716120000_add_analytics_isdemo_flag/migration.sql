-- AlterTable
ALTER TABLE "AnalyticsEvent" ADD COLUMN     "isDemo" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "AnalyticsEvent_restaurantId_isDemo_idx" ON "AnalyticsEvent"("restaurantId", "isDemo");
