/*
  Warnings:

  - The `discountPct`/`itemIds` columns on the `Special` table are replaced by
    a single `items` JSON column (per-item price/discount instead of one
    blanket discount across a flat id list). Existing rows are converted
    in place below before the old columns are dropped, so no data is lost.

*/
-- AlterTable
ALTER TABLE "AnalyticsEvent" ADD COLUMN     "isSeed" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Promotion" ADD COLUMN     "itemIds" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "Special" ADD COLUMN     "items" JSONB NOT NULL DEFAULT '[]';

-- DataMigration: fold each existing row's flat itemIds + blanket discountPct
-- into the new per-item items[] shape ({itemId, discountPct, specialPrice}),
-- before the source columns are dropped below.
UPDATE "Special"
SET "items" = COALESCE((
  SELECT jsonb_agg(jsonb_build_object('itemId', elem, 'discountPct', "discountPct", 'specialPrice', NULL))
  FROM jsonb_array_elements("itemIds") AS elem
), '[]'::jsonb)
WHERE jsonb_typeof("itemIds") = 'array' AND jsonb_array_length("itemIds") > 0;

-- AlterTable
ALTER TABLE "Special" DROP COLUMN "discountPct",
DROP COLUMN "itemIds";

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
