-- DropForeignKey
ALTER TABLE "MenuItemRecommendation" DROP CONSTRAINT "MenuItemRecommendation_sourceItemId_fkey";

-- DropForeignKey
ALTER TABLE "MenuItemRecommendation" DROP CONSTRAINT "MenuItemRecommendation_targetItemId_fkey";

-- AlterTable
ALTER TABLE "WaiterAssignment" ADD COLUMN     "assignedBy" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "changeType" TEXT NOT NULL DEFAULT 'assign',
ADD COLUMN     "previousWaiter" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "reason" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "WaiterTask" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "Shift" (
    "id" SERIAL NOT NULL,
    "restaurantId" TEXT NOT NULL DEFAULT 'trump',
    "username" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'waiter',
    "status" TEXT NOT NULL DEFAULT 'active',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "startedBy" TEXT NOT NULL DEFAULT '',
    "endedBy" TEXT NOT NULL DEFAULT '',
    "endReason" TEXT NOT NULL DEFAULT '',
    "assignedTables" JSONB,
    "ordersHandled" INTEGER NOT NULL DEFAULT 0,
    "revenueHandled" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "responseMetrics" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" SERIAL NOT NULL,
    "restaurantId" TEXT NOT NULL DEFAULT 'trump',
    "actor" TEXT NOT NULL DEFAULT 'system',
    "actorRole" TEXT NOT NULL DEFAULT '',
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL DEFAULT '',
    "targetId" TEXT NOT NULL DEFAULT '',
    "summary" TEXT NOT NULL DEFAULT '',
    "reason" TEXT NOT NULL DEFAULT '',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" SERIAL NOT NULL,
    "restaurantId" TEXT NOT NULL DEFAULT 'trump',
    "source" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "priority" INTEGER NOT NULL DEFAULT 3,
    "recipientRole" TEXT NOT NULL DEFAULT '',
    "recipientUser" TEXT NOT NULL DEFAULT '',
    "tableId" TEXT NOT NULL DEFAULT '',
    "readAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Shift_restaurantId_status_startedAt_idx" ON "Shift"("restaurantId", "status", "startedAt");

-- CreateIndex
CREATE INDEX "Shift_restaurantId_username_status_idx" ON "Shift"("restaurantId", "username", "status");

-- CreateIndex
CREATE INDEX "AuditLog_restaurantId_createdAt_idx" ON "AuditLog"("restaurantId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_restaurantId_action_idx" ON "AuditLog"("restaurantId", "action");

-- CreateIndex
CREATE INDEX "AuditLog_restaurantId_actor_idx" ON "AuditLog"("restaurantId", "actor");

-- CreateIndex
CREATE INDEX "AuditLog_restaurantId_targetType_targetId_idx" ON "AuditLog"("restaurantId", "targetType", "targetId");

-- CreateIndex
CREATE INDEX "Notification_restaurantId_recipientRole_readAt_createdAt_idx" ON "Notification"("restaurantId", "recipientRole", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_restaurantId_recipientUser_readAt_idx" ON "Notification"("restaurantId", "recipientUser", "readAt");

-- CreateIndex
CREATE INDEX "Notification_restaurantId_source_createdAt_idx" ON "Notification"("restaurantId", "source", "createdAt");

-- CreateIndex
CREATE INDEX "WaiterAssignment_restaurantId_tableId_assignedAt_idx" ON "WaiterAssignment"("restaurantId", "tableId", "assignedAt");

-- RenameIndex
ALTER INDEX "RecommendationBundle_active_idx" RENAME TO "RecommendationBundle_restaurantId_active_priority_idx";

-- RenameIndex
ALTER INDEX "RecommendationBundle_rot_idx" RENAME TO "RecommendationBundle_restaurantId_rotationGroup_idx";

-- RenameIndex
ALTER INDEX "RecommendationBundleItem_bundle_idx" RENAME TO "RecommendationBundleItem_bundleId_sortOrder_idx";

-- RenameIndex
ALTER INDEX "RecommendationEvent_name_idx" RENAME TO "RecommendationEvent_restaurantId_recommendedName_idx";

-- RenameIndex
ALTER INDEX "RecommendationEvent_rot_idx" RENAME TO "RecommendationEvent_restaurantId_rotationGroup_idx";

-- RenameIndex
ALTER INDEX "RecommendationEvent_src_idx" RENAME TO "RecommendationEvent_restaurantId_source_idx";

-- RenameIndex
ALTER INDEX "RecommendationEvent_type_idx" RENAME TO "RecommendationEvent_restaurantId_eventType_createdAt_idx";
