-- Party-size / covers capture (Phase 1 owner dashboard).
-- Table.covers: the current party size, set by the waiter at seating.
-- Order.covers: the party size stamped onto each order, so per-cover spend can be
-- aggregated over any historical period.
ALTER TABLE "Table" ADD COLUMN "covers" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN "covers" INTEGER NOT NULL DEFAULT 0;
