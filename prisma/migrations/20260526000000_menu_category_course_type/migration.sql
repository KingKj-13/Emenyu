-- Add courseType to MenuCategory for explicit course separation (STARTER/MAIN/DRINK/WINE/DESSERT)
ALTER TABLE "MenuCategory" ADD COLUMN IF NOT EXISTS "courseType" TEXT DEFAULT 'MAIN';
CREATE INDEX IF NOT EXISTS "MenuCategory_restaurantId_courseType_idx" ON "MenuCategory"("restaurantId", "courseType");
