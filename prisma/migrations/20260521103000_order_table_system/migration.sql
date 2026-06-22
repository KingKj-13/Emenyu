-- Add PostgreSQL-backed operational order and table models while preserving JSON compatibility.
CREATE TABLE "Table" (
    "id" SERIAL NOT NULL,
    "restaurantId" TEXT NOT NULL DEFAULT 'trump',
    "tableId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'active',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Table_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Order" (
    "id" SERIAL NOT NULL,
    "restaurantId" TEXT NOT NULL DEFAULT 'trump',
    "filename" TEXT NOT NULL,
    "tableId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "waiterName" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vat" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "service" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tip" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceKind" TEXT NOT NULL DEFAULT 'orders',
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrderItem" (
    "id" SERIAL NOT NULL,
    "orderId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "note" TEXT NOT NULL DEFAULT '',
    "imagePath" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "metadata" JSONB,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrderStatusHistory" (
    "id" SERIAL NOT NULL,
    "orderId" INTEGER NOT NULL,
    "fromStatus" TEXT NOT NULL DEFAULT '',
    "toStatus" TEXT NOT NULL,
    "actor" TEXT NOT NULL DEFAULT 'system',
    "reason" TEXT NOT NULL DEFAULT '',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderStatusHistory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ActiveCartState" (
    "id" SERIAL NOT NULL,
    "restaurantId" TEXT NOT NULL DEFAULT 'trump',
    "tableId" TEXT NOT NULL,
    "cart" JSONB NOT NULL,
    "updatedBy" TEXT NOT NULL DEFAULT 'system',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActiveCartState_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WaiterAssignment" (
    "id" SERIAL NOT NULL,
    "restaurantId" TEXT NOT NULL DEFAULT 'trump',
    "tableId" TEXT NOT NULL,
    "waiterName" TEXT NOT NULL,
    "socketId" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'active',
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaiterAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Table_restaurantId_tableId_key" ON "Table"("restaurantId", "tableId");
CREATE INDEX "Table_restaurantId_status_idx" ON "Table"("restaurantId", "status");

CREATE UNIQUE INDEX "Order_filename_key" ON "Order"("filename");
CREATE INDEX "Order_restaurantId_status_timestamp_idx" ON "Order"("restaurantId", "status", "timestamp");
CREATE INDEX "Order_restaurantId_tableId_status_idx" ON "Order"("restaurantId", "tableId", "status");
CREATE INDEX "Order_timestamp_idx" ON "Order"("timestamp");

CREATE INDEX "OrderItem_orderId_sortOrder_idx" ON "OrderItem"("orderId", "sortOrder");
CREATE INDEX "OrderItem_name_idx" ON "OrderItem"("name");

CREATE INDEX "OrderStatusHistory_orderId_createdAt_idx" ON "OrderStatusHistory"("orderId", "createdAt");
CREATE INDEX "OrderStatusHistory_toStatus_idx" ON "OrderStatusHistory"("toStatus");

CREATE UNIQUE INDEX "ActiveCartState_restaurantId_tableId_key" ON "ActiveCartState"("restaurantId", "tableId");
CREATE INDEX "ActiveCartState_restaurantId_updatedAt_idx" ON "ActiveCartState"("restaurantId", "updatedAt");

CREATE INDEX "WaiterAssignment_restaurantId_tableId_status_idx" ON "WaiterAssignment"("restaurantId", "tableId", "status");
CREATE INDEX "WaiterAssignment_restaurantId_waiterName_idx" ON "WaiterAssignment"("restaurantId", "waiterName");
CREATE INDEX "WaiterAssignment_socketId_idx" ON "WaiterAssignment"("socketId");

ALTER TABLE "Order"
ADD CONSTRAINT "Order_restaurantId_tableId_fkey"
FOREIGN KEY ("restaurantId", "tableId") REFERENCES "Table"("restaurantId", "tableId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OrderItem"
ADD CONSTRAINT "OrderItem_orderId_fkey"
FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrderStatusHistory"
ADD CONSTRAINT "OrderStatusHistory_orderId_fkey"
FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ActiveCartState"
ADD CONSTRAINT "ActiveCartState_restaurantId_tableId_fkey"
FOREIGN KEY ("restaurantId", "tableId") REFERENCES "Table"("restaurantId", "tableId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WaiterAssignment"
ADD CONSTRAINT "WaiterAssignment_restaurantId_tableId_fkey"
FOREIGN KEY ("restaurantId", "tableId") REFERENCES "Table"("restaurantId", "tableId") ON DELETE CASCADE ON UPDATE CASCADE;
