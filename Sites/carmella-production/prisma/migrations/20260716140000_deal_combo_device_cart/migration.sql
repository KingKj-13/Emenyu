-- AlterTable
ALTER TABLE "Promotion" ADD COLUMN     "dealPrice" DOUBLE PRECISION,
ADD COLUMN     "isDealOfDay" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ComboSpecial" (
    "id" SERIAL NOT NULL,
    "restaurantId" TEXT NOT NULL DEFAULT 'carmella-production',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "bannerImage" TEXT NOT NULL DEFAULT '',
    "itemIds" JSONB NOT NULL DEFAULT '[]',
    "drinkItemIds" JSONB NOT NULL DEFAULT '[]',
    "comboPrice" DOUBLE PRECISION NOT NULL,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "startTime" TEXT NOT NULL DEFAULT '',
    "endTime" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComboSpecial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TableDevice" (
    "id" SERIAL NOT NULL,
    "restaurantId" TEXT NOT NULL DEFAULT 'carmella-production',
    "tableId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "deviceNumber" INTEGER NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TableDevice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ComboSpecial_restaurantId_active_idx" ON "ComboSpecial"("restaurantId", "active");

-- CreateIndex
CREATE INDEX "TableDevice_restaurantId_tableId_deviceNumber_idx" ON "TableDevice"("restaurantId", "tableId", "deviceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "TableDevice_restaurantId_tableId_deviceId_key" ON "TableDevice"("restaurantId", "tableId", "deviceId");

-- CreateIndex
CREATE INDEX "Promotion_restaurantId_isDealOfDay_idx" ON "Promotion"("restaurantId", "isDealOfDay");
