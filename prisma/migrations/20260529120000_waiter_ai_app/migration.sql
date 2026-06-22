-- Waiter AI app: guest intelligence, upsell tracking, order -> guest link.
-- Written idempotently (IF NOT EXISTS) so it is safe to deploy once approved.

-- AlterTable: link orders to a guest (nullable, backward compatible)
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "guestId" INTEGER;

-- CreateTable: Guest (returning-guest intelligence)
CREATE TABLE IF NOT EXISTS "Guest" (
    "id" SERIAL NOT NULL,
    "restaurantId" TEXT NOT NULL DEFAULT 'trump',
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "vip" BOOLEAN NOT NULL DEFAULT false,
    "loyaltyTier" TEXT NOT NULL DEFAULT '',
    "dietary" TEXT NOT NULL DEFAULT '',
    "allergies" TEXT NOT NULL DEFAULT '',
    "preferences" JSONB,
    "notes" TEXT NOT NULL DEFAULT '',
    "visitCount" INTEGER NOT NULL DEFAULT 0,
    "lifetimeSpend" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgSpend" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastVisitAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Guest_pkey" PRIMARY KEY ("id")
);

-- CreateTable: UpsellEvent (real upsell-rate tracking)
CREATE TABLE IF NOT EXISTS "UpsellEvent" (
    "id" SERIAL NOT NULL,
    "restaurantId" TEXT NOT NULL DEFAULT 'trump',
    "waiterName" TEXT NOT NULL DEFAULT '',
    "tableId" TEXT NOT NULL DEFAULT '',
    "orderId" INTEGER,
    "suggestedItem" TEXT NOT NULL DEFAULT '',
    "accepted" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL DEFAULT 'coach',
    "value" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UpsellEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Guest_restaurantId_vip_idx" ON "Guest"("restaurantId", "vip");
CREATE INDEX IF NOT EXISTS "Guest_restaurantId_name_idx" ON "Guest"("restaurantId", "name");
CREATE INDEX IF NOT EXISTS "UpsellEvent_restaurantId_waiterName_createdAt_idx" ON "UpsellEvent"("restaurantId", "waiterName", "createdAt");
CREATE INDEX IF NOT EXISTS "UpsellEvent_restaurantId_accepted_idx" ON "UpsellEvent"("restaurantId", "accepted");
CREATE INDEX IF NOT EXISTS "Order_restaurantId_waiterName_status_idx" ON "Order"("restaurantId", "waiterName", "status");
CREATE INDEX IF NOT EXISTS "Order_guestId_idx" ON "Order"("guestId");

-- AddForeignKey (guard against re-runs)
DO $$ BEGIN
  ALTER TABLE "Order" ADD CONSTRAINT "Order_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "Guest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
