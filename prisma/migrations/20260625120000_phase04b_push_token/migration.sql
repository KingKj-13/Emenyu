-- Phase 04B — native push delivery. Additive, backward-compatible: existing Device
-- rows default to empty push fields (= no push, polling fallback still works).
ALTER TABLE "Device" ADD COLUMN "pushToken" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Device" ADD COLUMN "pushProvider" TEXT NOT NULL DEFAULT '';
