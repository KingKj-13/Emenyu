CREATE TABLE IF NOT EXISTS "WaiterTask" (
    "id" SERIAL NOT NULL,
    "restaurantId" TEXT NOT NULL DEFAULT 'trump',
    "tableId" TEXT NOT NULL DEFAULT '',
    "waiterName" TEXT NOT NULL DEFAULT '',
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL DEFAULT '',
    "priority" INTEGER NOT NULL DEFAULT 3,
    "status" TEXT NOT NULL DEFAULT 'open',
    "payload" JSONB,
    "requestedBy" TEXT NOT NULL DEFAULT 'system',
    "approvedBy" TEXT NOT NULL DEFAULT '',
    "dueAt" TIMESTAMP(3),
    "acknowledgedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaiterTask_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "WaiterTask_restaurantId_status_priority_createdAt_idx" ON "WaiterTask"("restaurantId", "status", "priority", "createdAt");
CREATE INDEX IF NOT EXISTS "WaiterTask_restaurantId_tableId_status_idx" ON "WaiterTask"("restaurantId", "tableId", "status");
CREATE INDEX IF NOT EXISTS "WaiterTask_restaurantId_waiterName_status_idx" ON "WaiterTask"("restaurantId", "waiterName", "status");
CREATE INDEX IF NOT EXISTS "WaiterTask_type_idx" ON "WaiterTask"("type");
