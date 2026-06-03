// Seed / update chef-controlled recommendations (Phase 3, Task 1).
//
//   node scripts/seed-chef-recommendations.js            # dry run (resolve + preview)
//   node scripts/seed-chef-recommendations.js --apply     # upsert rows (idempotent)
//   node scripts/seed-chef-recommendations.js --clear     # remove seed-created rows
//
// Resolves real menu items by name and links steak/seafood sources to:
//   - several wines in ONE rotation group (so the engine rotates between them),
//   - a side, a sauce, and a dessert.
// Idempotent via the (restaurantId, sourceItemId, targetItemId, recType) unique key.

const path = require('path');

const dotenv = require('dotenv');

// DATABASE_URL lives in the repo-root .env (three levels up from Sites/Trump/scripts).
dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env'), quiet: true });
dotenv.config({ path: path.resolve(__dirname, '..', '.env'), quiet: true });

const { PrismaClient } = require('@prisma/client');
const classifier = require('../server/services/categoryClassifier');

const RESTAURANT_ID = process.env.TRUMP_RESTAURANT_ID || 'trump';
const APPLY = process.argv.includes('--apply');
const CLEAR = process.argv.includes('--clear');

function norm(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

async function main() {
  const prisma = new PrismaClient();

  if (CLEAR) {
    const res = await prisma.menuItemRecommendation.deleteMany({ where: { restaurantId: RESTAURANT_ID, createdBy: 'seed' } });
    console.log(`Removed ${res.count} seed-created chef recommendations.`);
    await prisma.$disconnect();
    process.exit(0);
  }

  const rawItems = await prisma.menuItem.findMany({
    where: { restaurantId: RESTAURANT_ID, visible: true, available: true },
    select: { id: true, name: true, category: { select: { title: true, parent: { select: { title: true } } } } }
  });
  if (rawItems.length === 0) {
    console.log('No visible menu items found — nothing to seed.');
    await prisma.$disconnect();
    process.exit(0);
  }

  // Classify with category context so brand-only wine names resolve to WINE and
  // spirits (e.g. "Don Julio Blanco") are never mistaken for white wine.
  const items = rawItems.map(i => ({
    id: i.id,
    name: i.name,
    categoryType: classifier.categoryType({ name: i.name, category: i.category?.title, subcategory: i.category?.parent?.title })
  }));

  const find = re => items.filter(i => re.test(i.name.toLowerCase()));
  const wines = items.filter(i => i.categoryType === 'WINE');
  const redMatch = wines.filter(i => /shiraz|cabernet|merlot|pinotage|malbec|syrah|\bred\b/.test(i.name.toLowerCase()));
  const whiteMatch = wines.filter(i => /sauvignon|chardonnay|chenin|riesling|colombard|viognier|blanc|\bwhite\b/.test(i.name.toLowerCase()));
  const redWines = (redMatch.length ? redMatch : wines).slice(0, 3);
  const whiteWines = (whiteMatch.length ? whiteMatch : wines).slice(0, 3);
  const sides = find(/chips|fries|onion rings|garlic bread|creamy spinach|\bside/).slice(0, 2);
  const sauces = find(/pepper sauce|mushroom sauce|garlic butter|cheese sauce/).slice(0, 1);
  const desserts = find(/malva|cheese ?cake|ice cream|chocolate|baklava|brownie|pudding|red velvet/).slice(0, 2);

  const steaks = find(/ribeye|rump|sirloin|fillet|tomahawk|t-bone|wagyu|steak/)
    .filter(i => !/salad|pasta|sauce|burger/.test(i.name.toLowerCase())).slice(0, 4);
  const seafoods = find(/prawn|calamari|salmon|kingklip|hake|sole|linefish|seafood/)
    .filter(i => !/salad|sauce/.test(i.name.toLowerCase())).slice(0, 3);

  const specs = [];
  const addBeverages = (sourceId, targets, group, reason) =>
    targets.forEach((t, idx) => specs.push({
      sourceItemId: sourceId, targetItemId: t.id, recType: 'BEVERAGE',
      beverageKind: 'WINE', priority: 100 - idx * 10, rotationGroup: group, reason
    }));
  const addOne = (sourceId, target, recType, reason) => {
    if (target) specs.push({ sourceItemId: sourceId, targetItemId: target.id, recType, beverageKind: 'NONE', priority: 90, rotationGroup: '', reason });
  };

  steaks.forEach(s => {
    addBeverages(s.id, redWines, `chef:${norm(s.name)}:reds`, 'Bold red — built to stand up to grilled beef.');
    addOne(s.id, sides[0], 'SIDE', 'A classic steakhouse side.');
    addOne(s.id, sauces[0], 'SIDE', 'Drizzle it over — takes it up a notch.');
    addOne(s.id, desserts[0], 'DESSERT', 'The sweet finish guests remember.');
  });
  seafoods.forEach(s => {
    addBeverages(s.id, whiteWines, `chef:${norm(s.name)}:whites`, 'Crisp white — a classic match for seafood.');
    addOne(s.id, sides[0], 'SIDE', 'A light side to balance the plate.');
    addOne(s.id, desserts[1] || desserts[0], 'DESSERT', 'A refreshing way to finish.');
  });

  const seen = new Set();
  const unique = specs
    .filter(sp => sp.sourceItemId !== sp.targetItemId)
    .filter(sp => {
      const k = `${sp.sourceItemId}|${sp.targetItemId}|${sp.recType}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

  console.log(`Resolved sources: ${steaks.length} steak, ${seafoods.length} seafood.`);
  console.log(`Resolved targets: ${redWines.length} reds, ${whiteWines.length} whites, ${sides.length} sides, ${sauces.length} sauces, ${desserts.length} desserts.`);
  console.log(`Prepared ${unique.length} chef recommendation rows.`);

  if (!APPLY) {
    console.log('\nDry run. Re-run with --apply to upsert these rows.');
    await prisma.$disconnect();
    process.exit(0);
  }

  for (const sp of unique) {
    await prisma.menuItemRecommendation.upsert({
      where: {
        restaurantId_sourceItemId_targetItemId_recType: {
          restaurantId: RESTAURANT_ID, sourceItemId: sp.sourceItemId, targetItemId: sp.targetItemId, recType: sp.recType
        }
      },
      create: { restaurantId: RESTAURANT_ID, createdBy: 'seed', ...sp },
      update: { priority: sp.priority, beverageKind: sp.beverageKind, rotationGroup: sp.rotationGroup, reason: sp.reason, active: true }
    });
  }

  const total = await prisma.menuItemRecommendation.count({ where: { restaurantId: RESTAURANT_ID } });
  console.log(`\nUpserted ${unique.length} rows. Table now holds ${total} chef recommendations.`);
  await prisma.$disconnect();
  process.exit(0);
}

main().catch(error => {
  console.error(error && error.message ? error.message : String(error));
  process.exit(2);
});
