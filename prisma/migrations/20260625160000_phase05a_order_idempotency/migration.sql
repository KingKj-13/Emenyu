-- Phase 05A — order idempotency. Additive, backward-compatible: existing orders get
-- clientOrderId='' (no key). The PARTIAL unique index enforces "at most one order per
-- (restaurant, clientOrderId)" only for non-empty keys, so legacy '' rows never collide.
ALTER TABLE "Order" ADD COLUMN "clientOrderId" TEXT NOT NULL DEFAULT '';

-- Non-unique lookup index (matches the Prisma @@index).
CREATE INDEX "Order_restaurantId_clientOrderId_idx" ON "Order"("restaurantId", "clientOrderId");

-- Idempotency guard: a repeated submit with the same clientOrderId cannot create a
-- second order. Partial (WHERE <> '') so the empty default is exempt.
CREATE UNIQUE INDEX "Order_restaurantId_clientOrderId_key"
  ON "Order"("restaurantId", "clientOrderId")
  WHERE "clientOrderId" <> '';
