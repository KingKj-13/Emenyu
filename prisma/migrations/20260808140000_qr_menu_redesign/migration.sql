-- QR-menu redesign — ADDITIVE ONLY.
--
-- Adds: Translation, MediaAsset, CowCut, CowCutItem, ViewEvent.
-- Touches no existing table, column, index or row.
--
-- NOTE FOR ANYONE REGENERATING THIS FILE:
-- `prisma migrate diff` emits a DropTable prologue for six tables that live in
-- the production database but not in this schema:
--
--   AppRelease, BrainOutput, ContentVersion, DiningSession,
--   LuxuryItemContent, alembic_version
--
-- They are NOT ours to drop. `alembic_version` and `LuxuryItemContent` belong
-- to the Trump_Lux Python backend (uvicorn, port 8010, live at
-- emenyu.com/Trump_Lux/) which manages its own schema with Alembic. Dropping
-- alembic_version would strand that service's migration history.
--
-- That prologue has been deliberately removed. If you regenerate this file,
-- remove it again — do not "fix" the schema by adding those models here.


-- CreateTable
CREATE TABLE "Translation" (
    "id" SERIAL NOT NULL,
    "restaurantId" TEXT NOT NULL DEFAULT 'trump',
    "entityType" TEXT NOT NULL,
    "entityId" INTEGER NOT NULL,
    "locale" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'human',
    "reviewed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Translation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" SERIAL NOT NULL,
    "restaurantId" TEXT NOT NULL DEFAULT 'trump',
    "entityType" TEXT NOT NULL,
    "entityId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "posterUrl" TEXT NOT NULL DEFAULT '',
    "alt" TEXT NOT NULL DEFAULT '',
    "caption" TEXT NOT NULL DEFAULT '',
    "width" INTEGER,
    "height" INTEGER,
    "durationSec" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CowCut" (
    "id" SERIAL NOT NULL,
    "restaurantId" TEXT NOT NULL DEFAULT 'trump',
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "altName" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "texture" TEXT NOT NULL DEFAULT '',
    "bestFor" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CowCut_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CowCutItem" (
    "id" SERIAL NOT NULL,
    "cutId" INTEGER NOT NULL,
    "menuItemId" INTEGER NOT NULL,
    "matchType" TEXT NOT NULL DEFAULT 'PRIMARY',
    "label" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CowCutItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ViewEvent" (
    "id" SERIAL NOT NULL,
    "restaurantId" TEXT NOT NULL DEFAULT 'trump',
    "eventType" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "menuItemId" INTEGER,
    "categoryId" INTEGER,
    "cutSlug" TEXT,
    "tableId" TEXT NOT NULL DEFAULT '',
    "label" TEXT NOT NULL DEFAULT '',
    "categoryName" TEXT NOT NULL DEFAULT '',
    "dwellMs" INTEGER,
    "positionSec" INTEGER,
    "deviceType" TEXT NOT NULL DEFAULT '',
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ViewEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Translation_restaurantId_locale_idx" ON "Translation"("restaurantId", "locale");

-- CreateIndex
CREATE INDEX "Translation_entityType_entityId_idx" ON "Translation"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "Translation_entityType_entityId_locale_field_key" ON "Translation"("entityType", "entityId", "locale", "field");

-- CreateIndex
CREATE INDEX "MediaAsset_restaurantId_entityType_entityId_sortOrder_idx" ON "MediaAsset"("restaurantId", "entityType", "entityId", "sortOrder");

-- CreateIndex
CREATE INDEX "MediaAsset_restaurantId_kind_idx" ON "MediaAsset"("restaurantId", "kind");

-- CreateIndex
CREATE INDEX "CowCut_restaurantId_active_sortOrder_idx" ON "CowCut"("restaurantId", "active", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "CowCut_restaurantId_slug_key" ON "CowCut"("restaurantId", "slug");

-- CreateIndex
CREATE INDEX "CowCutItem_menuItemId_idx" ON "CowCutItem"("menuItemId");

-- CreateIndex
CREATE UNIQUE INDEX "CowCutItem_cutId_menuItemId_key" ON "CowCutItem"("cutId", "menuItemId");

-- CreateIndex
CREATE INDEX "ViewEvent_restaurantId_createdAt_idx" ON "ViewEvent"("restaurantId", "createdAt");

-- CreateIndex
CREATE INDEX "ViewEvent_restaurantId_eventType_createdAt_idx" ON "ViewEvent"("restaurantId", "eventType", "createdAt");

-- CreateIndex
CREATE INDEX "ViewEvent_restaurantId_menuItemId_createdAt_idx" ON "ViewEvent"("restaurantId", "menuItemId", "createdAt");

-- CreateIndex
CREATE INDEX "ViewEvent_restaurantId_cutSlug_createdAt_idx" ON "ViewEvent"("restaurantId", "cutSlug", "createdAt");

-- CreateIndex
CREATE INDEX "ViewEvent_restaurantId_locale_createdAt_idx" ON "ViewEvent"("restaurantId", "locale", "createdAt");

-- CreateIndex
CREATE INDEX "ViewEvent_sessionId_idx" ON "ViewEvent"("sessionId");

-- AddForeignKey
ALTER TABLE "CowCutItem" ADD CONSTRAINT "CowCutItem_cutId_fkey" FOREIGN KEY ("cutId") REFERENCES "CowCut"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CowCutItem" ADD CONSTRAINT "CowCutItem_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

