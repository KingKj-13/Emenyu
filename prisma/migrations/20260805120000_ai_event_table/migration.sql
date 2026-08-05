-- AI Shared Event System — new table, additive, no existing data touched.
CREATE TABLE "AiEvent" (
    "id" SERIAL NOT NULL,
    "restaurantId" TEXT NOT NULL DEFAULT 'trump',
    "eventType" TEXT NOT NULL,
    "guestId" INTEGER,
    "tableId" TEXT NOT NULL DEFAULT '',
    "waiterName" TEXT NOT NULL DEFAULT '',
    "priority" INTEGER NOT NULL DEFAULT 3,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "recommendedAction" TEXT NOT NULL DEFAULT '',
    "suggestedWaiterMessage" TEXT NOT NULL DEFAULT '',
    "suggestedManagerAction" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'open',
    "source" TEXT NOT NULL DEFAULT 'system',
    "payload" JSONB,
    "waiterTaskId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "AiEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AiEvent_restaurantId_status_priority_createdAt_idx" ON "AiEvent"("restaurantId", "status", "priority", "createdAt");
CREATE INDEX "AiEvent_restaurantId_tableId_status_idx" ON "AiEvent"("restaurantId", "tableId", "status");
CREATE INDEX "AiEvent_restaurantId_eventType_idx" ON "AiEvent"("restaurantId", "eventType");
CREATE INDEX "AiEvent_restaurantId_guestId_idx" ON "AiEvent"("restaurantId", "guestId");
