/*
  Warnings:

  - You are about to drop the column `discountPct` on the `Special` table. All the data in the column will be lost.
  - You are about to drop the column `itemIds` on the `Special` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "AnalyticsEvent" ADD COLUMN     "isSeed" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Promotion" ADD COLUMN     "itemIds" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "Special" DROP COLUMN "discountPct",
DROP COLUMN "itemIds",
ADD COLUMN     "items" JSONB NOT NULL DEFAULT '[]';

-- CreateTable
CREATE TABLE "ThemeSettings" (
    "id" SERIAL NOT NULL,
    "restaurantId" TEXT NOT NULL DEFAULT 'carmella-production',
    "autoEnabled" BOOLEAN NOT NULL DEFAULT false,
    "manualTheme" TEXT NOT NULL DEFAULT 'day',
    "dayStartTime" TEXT NOT NULL DEFAULT '06:00',
    "nightStartTime" TEXT NOT NULL DEFAULT '18:00',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ThemeSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ThemeSettings_restaurantId_key" ON "ThemeSettings"("restaurantId");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_restaurantId_isSeed_idx" ON "AnalyticsEvent"("restaurantId", "isSeed");
