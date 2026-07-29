-- Curated Demo Mode — one-time-redemption "make-good" reward QR. New table,
-- additive, no existing data touched.
CREATE TABLE "RewardCode" (
    "id" SERIAL NOT NULL,
    "restaurantId" TEXT NOT NULL DEFAULT 'trump',
    "tableId" TEXT NOT NULL DEFAULT '',
    "deviceId" TEXT NOT NULL DEFAULT '',
    "codeHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'issued',
    "reason" TEXT NOT NULL DEFAULT '',
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "redeemedAt" TIMESTAMP(3),
    "redeemedBy" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "RewardCode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RewardCode_codeHash_key" ON "RewardCode"("codeHash");
CREATE INDEX "RewardCode_restaurantId_deviceId_idx" ON "RewardCode"("restaurantId", "deviceId");
CREATE INDEX "RewardCode_restaurantId_status_idx" ON "RewardCode"("restaurantId", "status");
