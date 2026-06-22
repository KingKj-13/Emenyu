-- Add PostgreSQL-backed menu models while preserving JSON compatibility.
CREATE TABLE "MenuCategory" (
    "id" SERIAL NOT NULL,
    "restaurantId" TEXT NOT NULL DEFAULT 'trump',
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "parentId" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MenuCategory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MenuItem" (
    "id" SERIAL NOT NULL,
    "restaurantId" TEXT NOT NULL DEFAULT 'trump',
    "categoryId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "price" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "calories" TEXT NOT NULL DEFAULT '',
    "allergens" TEXT NOT NULL DEFAULT '',
    "spice" TEXT NOT NULL DEFAULT '',
    "imagePath" TEXT NOT NULL DEFAULT '',
    "videoPath" TEXT NOT NULL DEFAULT '',
    "imageVisible" BOOLEAN NOT NULL DEFAULT true,
    "videoVisible" BOOLEAN NOT NULL DEFAULT true,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "chefPick" BOOLEAN NOT NULL DEFAULT false,
    "popular" BOOLEAN NOT NULL DEFAULT false,
    "sourceTitle" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MenuItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FeaturedItem" (
    "id" SERIAL NOT NULL,
    "restaurantId" TEXT NOT NULL DEFAULT 'trump',
    "group" TEXT NOT NULL,
    "itemId" INTEGER,
    "itemName" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeaturedItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Recommendation" (
    "id" SERIAL NOT NULL,
    "restaurantId" TEXT NOT NULL DEFAULT 'trump',
    "description" TEXT NOT NULL DEFAULT '',
    "items" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Recommendation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RestaurantMenuSettings" (
    "id" SERIAL NOT NULL,
    "restaurantId" TEXT NOT NULL DEFAULT 'trump',
    "settings" JSONB,
    "source" TEXT NOT NULL DEFAULT 'json-hybrid',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RestaurantMenuSettings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MenuCategory_path_key" ON "MenuCategory"("path");
CREATE INDEX "MenuCategory_restaurantId_parentId_sortOrder_idx" ON "MenuCategory"("restaurantId", "parentId", "sortOrder");
CREATE INDEX "MenuCategory_restaurantId_slug_idx" ON "MenuCategory"("restaurantId", "slug");
CREATE INDEX "MenuCategory_visible_idx" ON "MenuCategory"("visible");

CREATE INDEX "MenuItem_restaurantId_normalizedName_idx" ON "MenuItem"("restaurantId", "normalizedName");
CREATE INDEX "MenuItem_restaurantId_categoryId_sortOrder_idx" ON "MenuItem"("restaurantId", "categoryId", "sortOrder");
CREATE INDEX "MenuItem_visible_idx" ON "MenuItem"("visible");
CREATE INDEX "MenuItem_chefPick_idx" ON "MenuItem"("chefPick");
CREATE INDEX "MenuItem_popular_idx" ON "MenuItem"("popular");

CREATE INDEX "FeaturedItem_restaurantId_group_sortOrder_idx" ON "FeaturedItem"("restaurantId", "group", "sortOrder");
CREATE INDEX "FeaturedItem_itemId_idx" ON "FeaturedItem"("itemId");
CREATE INDEX "FeaturedItem_active_idx" ON "FeaturedItem"("active");

CREATE INDEX "Recommendation_restaurantId_active_sortOrder_idx" ON "Recommendation"("restaurantId", "active", "sortOrder");

CREATE UNIQUE INDEX "RestaurantMenuSettings_restaurantId_key" ON "RestaurantMenuSettings"("restaurantId");

ALTER TABLE "MenuCategory"
ADD CONSTRAINT "MenuCategory_parentId_fkey"
FOREIGN KEY ("parentId") REFERENCES "MenuCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MenuItem"
ADD CONSTRAINT "MenuItem_categoryId_fkey"
FOREIGN KEY ("categoryId") REFERENCES "MenuCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
