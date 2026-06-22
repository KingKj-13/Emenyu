-- Add auth metadata required for the PostgreSQL-backed hybrid user system.
ALTER TABLE "User"
ADD COLUMN "label" TEXT,
ADD COLUMN "suspendedAt" TIMESTAMP(3),
ADD COLUMN "sessionInvalidBefore" BIGINT,
ADD COLUMN "createdBy" TEXT NOT NULL DEFAULT 'system',
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "User_role_idx" ON "User"("role");
CREATE INDEX "User_suspended_idx" ON "User"("suspended");
