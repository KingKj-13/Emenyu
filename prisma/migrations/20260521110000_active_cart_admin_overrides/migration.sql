-- AlterTable: add adminOverrides JSONB column to ActiveCartState
-- Nullable with no default — existing rows get NULL, treated as empty array by application code.
ALTER TABLE "ActiveCartState" ADD COLUMN "adminOverrides" JSONB;
