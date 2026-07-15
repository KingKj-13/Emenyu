#!/usr/bin/env node
'use strict';
// Idempotent import: emenyu-carmella/data/carmella-menu-data.json -> this
// tenant's OWN Postgres database (emenyu_carmella_production, never the live
// Carmella or Trump databases). Safe to re-run — wipes and rebuilds this
// tenant's rows in one transaction. Menu content is never hand-typed.
//
//   node scripts/import-menu.js
//
// Requires this app's own .env DATABASE_URL and Images/<img> to already
// exist locally (copied from the live Carmella build's optimized renditions).
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '..', '.env'), quiet: true });

const { getPrisma } = require('../server/services/prismaClient');
const { getCategoryType } = require('../server/utils/helpers');

const RESTAURANT_ID = 'carmella-production';
const JSON_PATH = path.resolve(__dirname, '..', '..', '..', 'emenyu-carmella', 'data', 'carmella-menu-data.json');
const IMAGES_DIR = path.resolve(__dirname, '..', 'Images');

function slugify(value, fallback) {
  const slug = String(value || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);
  return slug || fallback;
}

function normalizeName(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

// carmella-menu-data.json references raw JPGs by original filename; the
// live Carmella build re-encodes every one to WebP under the same stem.
// Resolve to the optimized file when present, never the raw original.
function resolveImagePath(rawFilename) {
  if (!rawFilename) return '';
  const stem = rawFilename.replace(/\.[^.]+$/, '');
  const webp = `${stem}.webp`;
  if (fs.existsSync(path.join(IMAGES_DIR, webp))) {
    return `Images/${webp}`;
  }
  if (fs.existsSync(path.join(IMAGES_DIR, rawFilename))) {
    return `Images/${rawFilename}`;
  }
  return '';
}

async function wipeExisting(prisma) {
  await prisma.$transaction(async tx => {
    await tx.menuItemVariant.deleteMany({ where: { restaurantId: RESTAURANT_ID } });
    await tx.menuItem.deleteMany({ where: { restaurantId: RESTAURANT_ID } });
    await tx.menuCategory.deleteMany({ where: { restaurantId: RESTAURANT_ID } });
  });
}

async function importChapters(prisma, data, stats) {
  let chapterSortOrder = 0;

  for (const chapter of data.chapters) {
    const chapterSlug = slugify(chapter.id, `chapter-${chapterSortOrder}`);
    const chapterCategory = await prisma.menuCategory.create({
      data: {
        restaurantId: RESTAURANT_ID,
        title: chapter.name,
        slug: chapterSlug,
        path: `${RESTAURANT_ID}/${chapterSlug}`,
        intro: String(chapter.intro || ''),
        sortOrder: chapterSortOrder,
        visible: true,
        courseType: getCategoryType(chapter.name),
        metadata: { chapterId: chapter.id }
      }
    });
    chapterSortOrder += 1;
    stats.chapters += 1;

    let sectionSortOrder = 0;
    for (const section of chapter.sections) {
      const sectionSlug = slugify(`${chapter.id}-${section.name}`, `section-${sectionSortOrder}`);
      const sectionCategory = await prisma.menuCategory.create({
        data: {
          restaurantId: RESTAURANT_ID,
          title: section.name,
          slug: sectionSlug,
          path: `${RESTAURANT_ID}/${chapterSlug}/${sectionSlug}`,
          parentId: chapterCategory.id,
          sortOrder: sectionSortOrder,
          visible: true,
          courseType: getCategoryType(section.name)
        }
      });
      sectionSortOrder += 1;
      stats.sections += 1;

      let itemSortOrder = 0;
      for (const item of section.items) {
        // Dietary/allergy tags (e.g. "vegetarian", "contains-nuts") live in
        // metadata and round-trip through to the client as item.tags — the
        // JSON source has no separate allergens field to map.
        const metadata = {
          jsonId: item.id,
          ...(Array.isArray(item.tags) && item.tags.length ? { tags: item.tags } : {})
        };

        await prisma.menuItem.create({
          data: {
            restaurantId: RESTAURANT_ID,
            categoryId: sectionCategory.id,
            name: item.name,
            normalizedName: normalizeName(item.name),
            description: String(item.desc || item.description || ''),
            story: String(item.story || ''),
            subtitle: String(item.subtitle || ''),
            price: Number(item.price) || 0,
            imagePath: resolveImagePath(item.img),
            visible: true,
            available: item.availability !== 'unavailable',
            availability: String(item.availability || 'available'),
            sortOrder: itemSortOrder,
            metadata,
            ...(Array.isArray(item.variants) && item.variants.length > 0
              ? {
                  variants: {
                    create: item.variants.map((variant, variantIndex) => ({
                      restaurantId: RESTAURANT_ID,
                      name: variant.name,
                      price: Number(variant.price) || 0,
                      imagePath: resolveImagePath(variant.img),
                      isAddon: Boolean(variant.isAddon),
                      sortOrder: variantIndex
                    }))
                  }
                }
              : {})
          }
        });
        itemSortOrder += 1;
        stats.items += 1;
        stats.variants += Array.isArray(item.variants) ? item.variants.length : 0;
        if (!resolveImagePath(item.img)) stats.missingImages.push(item.id);
      }
    }
  }
}

async function main() {
  const data = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
  const prisma = getPrisma();
  const stats = { chapters: 0, sections: 0, items: 0, variants: 0, missingImages: [] };

  console.log(`[import-carmella-production] connecting as restaurantId=${RESTAURANT_ID}`);
  await wipeExisting(prisma);
  await importChapters(prisma, data, stats);

  console.log(JSON.stringify({ status: 'ok', ...stats }, null, 2));
  await prisma.$disconnect();
}

main().catch(error => {
  console.error('[import-carmella-production] failed:', error.message);
  process.exit(1);
});
