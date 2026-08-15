#!/usr/bin/env node
'use strict';
// Idempotent import: emenyu-carmella/data/carmella-menu-data.json -> Postgres
// (restaurantId='carmella'). Safe to re-run — every run wipes and rebuilds this
// tenant's rows in dependency order inside one transaction, so a re-import can
// never leave half-old/half-new data. Menu content is NEVER hand-typed; this
// script is the only path from the JSON source of truth into the DB the app
// actually serves from (see emenyu-carmella/CLAUDE.md).
//
//   node scripts/import-menu.js
//
// Requires Sites/Carmella/.env's DATABASE_URL (dedicated emenyu_carmella DB —
// never the shared Trump/Demo database) and Images/<img> to already exist
// (run scripts/media-optimize.js --dir ../../Carmella --optimize first).
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '..', '.env'), quiet: true });

const { getPrisma } = require('../../Trump/server/services/prismaClient');
const { getCategoryType } = require('../../Trump/server/utils/helpers');

const RESTAURANT_ID = 'carmella';
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

// carmella-menu-data.json references raw JPGs by their original filename
// (e.g. "045_marrakech_flame.jpg"); media-optimize.js re-encodes every one to
// WebP under the same stem. Resolve to the optimized file when it exists so a
// fresh import always points at the served, optimized asset — never the raw
// original — without requiring the JSON itself to know about the optimize step.
function resolveImagePath(rawFilename) {
  if (!rawFilename) return '';
  const stem = rawFilename.replace(/\.[^.]+$/, '');
  const webp = `${stem}.webp`;
  if (fs.existsSync(path.join(IMAGES_DIR, webp))) {
    return `/Images/${webp}`;
  }
  if (fs.existsSync(path.join(IMAGES_DIR, rawFilename))) {
    return `/Images/${rawFilename}`;
  }
  return '';
}

async function wipeExisting(prisma) {
  await prisma.$transaction(async tx => {
    await tx.recommendationBundleItem.deleteMany({ where: { bundle: { restaurantId: RESTAURANT_ID } } });
    await tx.recommendationBundle.deleteMany({ where: { restaurantId: RESTAURANT_ID } });
    await tx.menuItemRecommendation.deleteMany({ where: { restaurantId: RESTAURANT_ID } });
    await tx.menuItemVariant.deleteMany({ where: { restaurantId: RESTAURANT_ID } });
    await tx.menuItem.deleteMany({ where: { restaurantId: RESTAURANT_ID } });
    await tx.menuCategory.deleteMany({ where: { restaurantId: RESTAURANT_ID } });
    await tx.dayPart.deleteMany({ where: { restaurantId: RESTAURANT_ID } });
  });
}

async function importChapters(prisma, data, stats) {
  const jsonItemIdToDbId = new Map();
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
        const metadata = {
          jsonId: item.id,
          ...(Array.isArray(item.tags) && item.tags.length ? { tags: item.tags } : {})
        };

        const created = await prisma.menuItem.create({
          data: {
            restaurantId: RESTAURANT_ID,
            categoryId: sectionCategory.id,
            name: item.name,
            normalizedName: normalizeName(item.name),
            description: String(item.desc || item.description || ''),
            story: String(item.story || ''),
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
        jsonItemIdToDbId.set(item.id, created.id);
        itemSortOrder += 1;
        stats.items += 1;
        stats.variants += Array.isArray(item.variants) ? item.variants.length : 0;
        if (!resolveImagePath(item.img)) stats.missingImages.push(item.id);
      }
    }
  }

  return jsonItemIdToDbId;
}

async function importDayParts(prisma, data, stats) {
  let sortOrder = 0;
  for (const daypart of data.dayparts) {
    await prisma.dayPart.create({
      data: {
        restaurantId: RESTAURANT_ID,
        slug: daypart.id,
        name: daypart.name,
        fromTime: daypart.from,
        toTime: daypart.to,
        greeting: String(daypart.greeting || ''),
        leadChapters: daypart.leadChapters || [],
        gaspardChips: daypart.gaspardChips || [],
        suggestStrip: daypart.suggestStrip || null,
        sortOrder
      }
    });
    sortOrder += 1;
    stats.dayparts += 1;
  }
}

async function importBundles(prisma, data, jsonItemIdToDbId, stats) {
  let sortOrder = 0;
  for (const bundle of data.bundles) {
    const created = await prisma.recommendationBundle.create({
      data: {
        restaurantId: RESTAURANT_ID,
        slug: bundle.id,
        persona: String(bundle.name || 'gaspard'),
        description: String(bundle.line || ''),
        active: true,
        priority: 100,
        sortOrder,
        total: typeof bundle.total === 'number' ? bundle.total : null,
        daypart: String(bundle.daypart || '')
      }
    });
    sortOrder += 1;
    stats.bundles += 1;

    let itemSortOrder = 0;
    for (const itemId of bundle.itemIds || []) {
      const dbId = jsonItemIdToDbId.get(itemId);
      const name = data._itemNameById?.get(itemId) || itemId;
      const price = data._itemPriceById?.get(itemId) ?? 0;
      await prisma.recommendationBundleItem.create({
        data: {
          bundleId: created.id,
          itemName: name,
          itemId: dbId ?? null,
          price,
          sortOrder: itemSortOrder
        }
      });
      itemSortOrder += 1;
    }
  }
}

async function importPairings(prisma, data, jsonItemIdToDbId, stats) {
  let priority = 1000;
  for (const [sourceJsonId, pairings] of Object.entries(data.pairings || {})) {
    const sourceDbId = jsonItemIdToDbId.get(sourceJsonId);
    if (!sourceDbId) {
      stats.unmatchedPairingSources.push(sourceJsonId);
      continue;
    }
    for (const pairing of pairings) {
      const targetDbId = jsonItemIdToDbId.get(pairing.id);
      if (!targetDbId) {
        stats.unmatchedPairingTargets.push(pairing.id);
        continue;
      }
      await prisma.menuItemRecommendation.create({
        data: {
          restaurantId: RESTAURANT_ID,
          sourceItemId: sourceDbId,
          targetItemId: targetDbId,
          recType: 'PAIRING',
          priority,
          active: true,
          reason: String(pairing.note || '')
        }
      });
      stats.pairings += 1;
      priority -= 1;
    }
  }
}

async function main() {
  const data = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));

  // Build flat id->name/price lookups once (bundles reference item ids that
  // may not resolve if a bundle ships before its items are imported — not the
  // case here since chapters import first, but keeps bundle line items
  // readable/priced even if an id is ever missing).
  data._itemNameById = new Map();
  data._itemPriceById = new Map();
  data.chapters.forEach(chapter =>
    chapter.sections.forEach(section =>
      section.items.forEach(item => {
        data._itemNameById.set(item.id, item.name);
        // Variant-only items (coffees, wines by the glass) have no top-level
        // price — fall back to the cheapest non-addon variant so a bundle
        // referencing one (e.g. "morning-in-paris" -> cappuccino) shows a real
        // price, not R0. Mirrors prismaMenuService.js's effectivePrice().
        let price = Number(item.price) || 0;
        if (!price && Array.isArray(item.variants) && item.variants.length > 0) {
          const variantPrices = item.variants
            .filter(v => !v.isAddon)
            .map(v => Number(v.price) || 0)
            .filter(p => p > 0);
          price = variantPrices.length > 0 ? Math.min(...variantPrices) : 0;
        }
        data._itemPriceById.set(item.id, price);
      })
    )
  );

  const prisma = getPrisma();
  const stats = {
    chapters: 0, sections: 0, items: 0, variants: 0, dayparts: 0, bundles: 0,
    pairings: 0, missingImages: [], unmatchedPairingSources: [], unmatchedPairingTargets: []
  };

  console.log(`[import-carmella] connecting as restaurantId=${RESTAURANT_ID}`);
  await wipeExisting(prisma);
  const jsonItemIdToDbId = await importChapters(prisma, data, stats);
  await importDayParts(prisma, data, stats);
  await importBundles(prisma, data, jsonItemIdToDbId, stats);
  await importPairings(prisma, data, jsonItemIdToDbId, stats);

  console.log(JSON.stringify({
    status: 'ok',
    chapters: stats.chapters,
    sections: stats.sections,
    items: stats.items,
    variants: stats.variants,
    dayparts: stats.dayparts,
    bundles: stats.bundles,
    pairings: stats.pairings,
    missingImages: stats.missingImages,
    unmatchedPairingSources: stats.unmatchedPairingSources,
    unmatchedPairingTargets: stats.unmatchedPairingTargets
  }, null, 2));

  await prisma.$disconnect();
}

main().catch(error => {
  console.error('[import-carmella] failed:', error.message);
  process.exit(1);
});
