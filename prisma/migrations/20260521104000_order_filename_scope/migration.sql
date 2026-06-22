-- Scope order filename uniqueness to the JSON source folder to preserve legacy
-- cases where the same filename exists in both active orders and history.
DROP INDEX IF EXISTS "Order_filename_key";

CREATE UNIQUE INDEX "Order_restaurantId_sourceKind_filename_key"
ON "Order"("restaurantId", "sourceKind", "filename");
