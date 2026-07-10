#!/usr/bin/env node
'use strict';
// Seed the public "Demo Steakhouse" tenant — a fully isolated restaurantId
// ('demo-steakhouse') sharing Trump's Postgres DB, used only by the public
// sales/investor demo (emenyu.com/demo/menu, /demo/waiter, /demo/admin).
// No restaurant-specific branding in any item/category name.
//
//   node scripts/seed-demo-restaurant.js            # dry run (preview)
//   node scripts/seed-demo-restaurant.js --apply    # clear + recreate everything
//   node scripts/seed-demo-restaurant.js --clear    # remove all demo-steakhouse rows
//
// Mirrors the existing precedent: seed-bundles.js (bundles), seed-chef-recommendations.js
// (per-item recs, derived from seeded items rather than hand-listed), seed-demo-orders.js
// (PrismaOrderService.saveOrder for historical + live orders), setup-wizard.js (table upsert).

const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env'), quiet: true });
dotenv.config({ path: path.resolve(__dirname, '..', '.env'), quiet: true });
// Local dev override: .env.local (gitignored) repoints DATABASE_URL at the local
// database so this never touches prod unless explicitly pointed there.
dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env.local'), override: true, quiet: true });

const { getPrisma } = require('../server/services/prismaClient');
const { PrismaOrderService } = require('../server/services/prismaOrderService');
const { getCategoryType } = require('../server/utils/helpers');

const RESTAURANT_ID = 'demo-steakhouse';
const APPLY = process.argv.includes('--apply');
const CLEAR = process.argv.includes('--clear');

function slugify(value) {
  return String(value || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
function normalizedName(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

// ── Menu content — generic premium steakhouse, no restaurant-specific naming.
// Item names for 15 dishes are chosen to EXACTLY match (case-insensitive) the
// client's ITEM_VIDEO_MAP allowlist (client/src/lib/imageResolver.ts) — that's
// how resolveVideo() decides which dishes get a real short clip; it's a pure
// name lookup, not driven by any DB field. imagePath is stored WITHOUT a
// leading slash (e.g. "Images/x.jpg") so resolveImage() prepends *this
// build's* BASE_PATH (/demo) correctly — a leading-slash "/Trump/Images/..."
// value would double-prefix to "/demo/Trump/Images/..." and 404.
const CATEGORIES = [
  {
    title: 'Starters',
    items: [
      { name: 'Springbok Carpaccio', price: 125, description: 'Thinly sliced, parmesan, rocket, truffle oil.', allergens: 'Dairy', img: 'Images/springbok_carpaccio.jpg' },
      { name: 'Calamari Tubes & Tentacles', price: 145, description: 'Lightly fried, lemon aioli.', allergens: 'Shellfish, Gluten' },
      { name: 'Soup of the Day', price: 85, description: "Chef's daily selection.", allergens: 'Dairy' },
      { name: 'Beef Biltong Board', price: 135, description: 'Cured biltong, droëwors, mustard.', allergens: '' },
      { name: 'Flash Pan Fried Chicken Livers', price: 99, description: 'Peri-peri butter, toasted ciabatta.', allergens: 'Gluten, Dairy', img: 'Images/flash_pan_fried_chicken_livers.jpg' },
      { name: 'Chicken Trinchado', price: 125, description: 'Portuguese spiced chicken livers, chilli.', allergens: 'Gluten, Dairy', img: 'Images/chicken_trinchado.jpg' },
      { name: 'Firecracker Chicken Wings (400g)', price: 155, description: 'Sticky chilli glaze, sesame.', allergens: '', img: 'Images/firecracker_chicken_wings_400g.jpg', popular: true },
      { name: 'Boerewors & Chakalaka', price: 135, description: 'Chargrilled boerewors, spiced relish.', allergens: '', img: 'Images/boerewors_and_chakalaka.jpg' },
    ]
  },
  {
    title: 'Premium Steaks',
    items: [
      { name: 'Wagyu Ribeye 300g', price: 485, description: 'Full-blood Wagyu, chimichurri.', allergens: '', img: 'Images/wagyu_ribeye_300g.jpg', chefPick: true },
      { name: 'Ribeye 400g', price: 365, description: 'Dry-aged, bone marrow butter.', allergens: 'Dairy', popular: true },
      { name: 'Tomahawk 900g (for two)', price: 950, description: 'Charcoal grilled, rock salt.', allergens: '', chefPick: true },
      { name: 'Fillet 250g', price: 395, description: 'Center-cut tenderloin, peppercorn sauce.', allergens: 'Dairy' },
      { name: 'Sirloin 350g', price: 325, description: 'Grass-fed, garlic butter.', allergens: 'Dairy' },
      { name: 'T-Bone 500g', price: 445, description: 'Charcoal grilled, served with jus.', allergens: '', img: 'Images/t_bone_500g.jpg' },
      { name: 'Beef Ribs (3 pce) ±1kg', price: 385, description: 'Slow-braised, sticky glaze.', allergens: '', img: 'Images/beef_ribs_3_pce_1kg.jpg' },
      { name: 'Oxtail', price: 355, description: 'Slow-braised, red wine jus, gremolata.', allergens: '', img: 'Images/oxtail.jpg' },
      { name: 'Mixed Grill', price: 425, description: 'Steak, boerewors, chop, rib — the lot.', allergens: '', img: 'Images/mixed_grill.jpg', popular: true },
    ]
  },
  {
    title: 'Seafood',
    items: [
      { name: 'Kingklip & Prawn', price: 325, description: 'Line-caught kingklip, garlic prawns, lemon butter.', allergens: 'Fish, Shellfish, Dairy', img: 'Images/kingklip_and_prawn.jpg' },
      { name: 'Prawn Linguine', price: 325, description: 'Garlic, chilli, white wine.', allergens: 'Shellfish, Gluten' },
      { name: 'Butter Garlic Prawns', price: 295, description: 'Sizzling pan, toasted bread.', allergens: 'Shellfish, Dairy, Gluten', popular: true },
      { name: 'Seared Salmon', price: 310, description: 'Crispy skin, citrus beurre blanc.', allergens: 'Fish, Dairy' },
    ]
  },
  {
    title: 'Burgers',
    items: [
      { name: 'Classic Beef Burger', price: 145, description: 'Beef patty, cheddar, house sauce.', allergens: 'Gluten, Dairy' },
      { name: 'Bacon Cheeseburger', price: 165, description: 'Double beef, bacon, cheddar.', allergens: 'Gluten, Dairy', popular: true },
      { name: 'Mushroom Swiss Burger', price: 155, description: 'Sauteed mushroom, swiss cheese.', allergens: 'Gluten, Dairy' },
      { name: 'Veg Burger', price: 135, description: 'Grilled vegetable patty, avo.', allergens: 'Gluten' },
      { name: 'Jalapeno Chilli and Cheese Burger', price: 175, description: 'Double beef, jalapeno, molten cheese.', allergens: 'Gluten, Dairy', img: 'Images/jalapeno_chilli_and_cheese_burger.jpg' },
    ]
  },
  {
    title: 'Pastas',
    items: [
      { name: 'Beef Fillet Pasta', price: 289, description: 'Tagliatelle, creamy peppercorn sauce.', allergens: 'Gluten, Dairy' },
      { name: 'Chicken Alfredo', price: 245, description: 'Fettuccine, parmesan cream sauce.', allergens: 'Gluten, Dairy' },
      { name: 'Seafood Pasta', price: 310, description: 'Prawns, calamari, tomato & chilli.', allergens: 'Shellfish, Gluten, Dairy', img: 'Images/seafood_pasta.jpg' },
    ]
  },
  {
    title: 'Sides',
    items: [
      { name: 'Steakhouse Chips', price: 55, description: 'Triple-cooked, rock salt.', allergens: '' },
      { name: 'Creamed Spinach', price: 65, description: 'Nutmeg, parmesan.', allergens: 'Dairy' },
      { name: 'Mashed Potatoes', price: 55, description: 'Butter, cream.', allergens: 'Dairy' },
      { name: 'Onion Rings', price: 60, description: 'Beer-battered, crispy.', allergens: 'Gluten' },
    ]
  },
  {
    title: 'Desserts',
    items: [
      { name: 'Death By Chocolate Cake', price: 119, description: 'Molten centre, vanilla ice cream.', allergens: 'Gluten, Dairy, Eggs', popular: true },
      { name: 'Crème Brûlée', price: 99, description: 'Vanilla custard, caramelised sugar.', allergens: 'Dairy, Eggs' },
      { name: 'Cape Malva Pudding', price: 95, description: 'Warm sponge, butterscotch sauce.', allergens: 'Gluten, Dairy, Eggs', img: 'Images/cape_malva_pudding.jpg' },
      { name: 'Trio of Ice Cream', price: 89, description: "Chef's daily selection.", allergens: 'Dairy' },
      { name: 'Chocolate Brownie', price: 89, description: 'Warm, gooey centre, vanilla ice cream.', allergens: 'Gluten, Dairy, Eggs', img: 'Images/chocolate_brownie.jpg' },
    ]
  },
  {
    title: 'Red Wine',
    items: [
      { name: 'Cabernet Sauvignon', price: 225, description: 'Full-bodied, dark berry, oak.', allergens: 'Sulphites' },
      { name: 'Shiraz', price: 245, description: 'Peppery, dark fruit, smooth tannin.', allergens: 'Sulphites' },
      { name: 'Merlot', price: 210, description: 'Soft, plum, easy-drinking.', allergens: 'Sulphites' },
      { name: 'Pinotage', price: 230, description: 'South African classic, smoky red fruit.', allergens: 'Sulphites' },
    ]
  },
  {
    title: 'White Wine',
    items: [
      { name: 'Sauvignon Blanc', price: 195, description: 'Crisp, citrus, grassy notes.', allergens: 'Sulphites' },
      { name: 'Chardonnay', price: 210, description: 'Buttery, oaked, tropical fruit.', allergens: 'Sulphites' },
    ]
  },
  {
    title: 'Cocktails',
    items: [
      { name: 'Espresso Martini', price: 145, description: 'Vodka, coffee liqueur, espresso.', allergens: '' },
      { name: 'Mojito', price: 135, description: 'White rum, mint, lime, soda.', allergens: '' },
      { name: 'Margarita', price: 140, description: 'Tequila, triple sec, lime.', allergens: '' },
      { name: 'Old Fashioned', price: 155, description: 'Bourbon, bitters, orange.', allergens: '' },
    ]
  },
];

const GUESTS = [
  { name: 'Naledi M.', phone: '+27821110001', vip: true, loyaltyTier: 'Gold', visitCount: 14, lifetimeSpend: 18400, avgSpend: 1314 },
  { name: 'Sipho K.', phone: '+27821110002', vip: false, loyaltyTier: 'Silver', visitCount: 6, lifetimeSpend: 5200, avgSpend: 866 },
  { name: 'Amara P.', phone: '+27821110003', vip: true, loyaltyTier: 'Gold', visitCount: 21, lifetimeSpend: 27300, avgSpend: 1300 },
  { name: 'Liam R.', phone: '+27821110004', vip: false, loyaltyTier: '', visitCount: 2, lifetimeSpend: 1450, avgSpend: 725 },
  { name: 'Zanele T.', phone: '+27821110005', vip: false, loyaltyTier: 'Silver', visitCount: 8, lifetimeSpend: 6900, avgSpend: 862 },
];

const TABLE_COUNT = 10;

// Historical baskets for analytics / "ordered together" signal (kind='history').
const HISTORY_BASKETS = [
  { t: 'table2', w: 'Demo Waiter', cov: 2, days: 9, items: [{ n: 'Ribeye 400g' }, { n: 'Creamed Spinach' }, { n: 'Steakhouse Chips' }, { n: 'Cabernet Sauvignon' }] },
  { t: 'table4', w: 'Demo Waiter', cov: 2, days: 8, items: [{ n: 'Ribeye 400g' }, { n: 'Mashed Potatoes' }, { n: 'Cabernet Sauvignon' }] },
  { t: 'table6', w: 'Demo Waiter', cov: 4, days: 7, items: [{ n: 'Wagyu Ribeye 300g', q: 2 }, { n: 'Steakhouse Chips', q: 2 }, { n: 'Shiraz', q: 2 }] },
  { t: 'table3', w: 'Demo Waiter', cov: 2, days: 6, items: [{ n: 'Tomahawk 900g (for two)' }, { n: 'Onion Rings' }, { n: 'Pinotage' }, { n: 'Death By Chocolate Cake' }] },
  { t: 'table7', w: 'Demo Waiter', cov: 2, days: 5, items: [{ n: 'Butter Garlic Prawns' }, { n: 'Sauvignon Blanc' }] },
  { t: 'table1', w: 'Demo Waiter', cov: 2, days: 4, items: [{ n: 'Prawn Linguine' }, { n: 'Chardonnay' }] },
  { t: 'table8', w: 'Demo Waiter', cov: 5, days: 3, items: [{ n: 'Bacon Cheeseburger', q: 3 }, { n: 'Classic Beef Burger', q: 2 }, { n: 'Mojito', q: 3 }] },
  { t: 'table5', w: 'Demo Waiter', cov: 2, days: 2, items: [{ n: 'Beef Fillet Pasta' }, { n: 'Merlot' }, { n: 'Cape Malva Pudding' }] },
  { t: 'table9', w: 'Demo Waiter', cov: 3, days: 1, items: [{ n: 'Fillet 250g' }, { n: 'Sirloin 350g' }, { n: 'Steakhouse Chips' }, { n: 'Shiraz' }] },
];

// Live/in-progress orders so the waiter dashboard opens looking mid-service.
const LIVE_ORDERS = [
  { t: 'table2', w: 'Demo Waiter', cov: 2, items: [{ n: 'Wagyu Ribeye 300g' }, { n: 'Creamed Spinach' }, { n: 'Cabernet Sauvignon' }] },
  { t: 'table5', w: 'Demo Waiter', cov: 4, items: [{ n: 'Tomahawk 900g (for two)' }, { n: 'Steakhouse Chips' }, { n: 'Pinotage', q: 2 }] },
  { t: 'table7', w: 'Demo Waiter', cov: 2, items: [{ n: 'Seared Salmon' }, { n: 'Sauvignon Blanc' }] },
];

const r2 = n => Math.round(n * 100) / 100;

async function main() {
  const prisma = getPrisma();

  if (CLEAR) {
    // Order/ActiveCartState/WaiterAssignment reference Table with a RESTRICT
    // foreign key — must be cleared before Table, not raced in parallel with it.
    const assignments = await prisma.waiterAssignment.deleteMany({ where: { restaurantId: RESTAURANT_ID } });
    const carts = await prisma.activeCartState.deleteMany({ where: { restaurantId: RESTAURANT_ID } });
    const orders = await prisma.order.deleteMany({ where: { restaurantId: RESTAURANT_ID } });
    const [items, cats, bundles, recs, tables, guests] = await Promise.all([
      prisma.menuItem.deleteMany({ where: { restaurantId: RESTAURANT_ID } }),
      prisma.menuCategory.deleteMany({ where: { restaurantId: RESTAURANT_ID } }),
      prisma.recommendationBundle.deleteMany({ where: { restaurantId: RESTAURANT_ID } }),
      prisma.menuItemRecommendation.deleteMany({ where: { restaurantId: RESTAURANT_ID } }),
      prisma.table.deleteMany({ where: { restaurantId: RESTAURANT_ID } }),
      prisma.guest.deleteMany({ where: { restaurantId: RESTAURANT_ID } }),
    ]);
    console.log(`Cleared demo-steakhouse rows: ${items.count} items, ${cats.count} categories, ${bundles.count} bundles, ${recs.count} recs, ${tables.count} tables, ${guests.count} guests, ${orders.count} orders, ${assignments.count} assignments, ${carts.count} carts.`);
    await prisma.$disconnect();
    process.exit(0);
  }

  const totalItems = CATEGORIES.reduce((n, c) => n + c.items.length, 0);
  console.log(`Prepared ${CATEGORIES.length} categories / ${totalItems} items / ${GUESTS.length} guests / ${TABLE_COUNT} tables / ${HISTORY_BASKETS.length} historical orders / ${LIVE_ORDERS.length} live orders.`);

  if (!APPLY) {
    console.log('\nDry run. Re-run with --apply to write (idempotent — clears prior demo-steakhouse rows first), or --clear to remove everything.');
    await prisma.$disconnect();
    process.exit(0);
  }

  // Idempotent: wipe prior demo-steakhouse rows across every affected table, then recreate.
  // Order/ActiveCartState/WaiterAssignment reference Table with a RESTRICT
  // foreign key, so they must go first, not after.
  await prisma.waiterAssignment.deleteMany({ where: { restaurantId: RESTAURANT_ID } });
  await prisma.activeCartState.deleteMany({ where: { restaurantId: RESTAURANT_ID } });
  await prisma.order.deleteMany({ where: { restaurantId: RESTAURANT_ID } });
  await prisma.menuItem.deleteMany({ where: { restaurantId: RESTAURANT_ID } });
  await prisma.menuCategory.deleteMany({ where: { restaurantId: RESTAURANT_ID } });
  await prisma.recommendationBundle.deleteMany({ where: { restaurantId: RESTAURANT_ID } });
  await prisma.menuItemRecommendation.deleteMany({ where: { restaurantId: RESTAURANT_ID } });
  await prisma.table.deleteMany({ where: { restaurantId: RESTAURANT_ID } });
  await prisma.guest.deleteMany({ where: { restaurantId: RESTAURANT_ID } });

  // ── Categories + items ──────────────────────────────────────────────────────
  const itemsByName = new Map(); // normalizedName -> { id, name, categoryTitle }
  for (const [catIndex, cat] of CATEGORIES.entries()) {
    const slug = slugify(cat.title);
    const category = await prisma.menuCategory.create({
      data: {
        restaurantId: RESTAURANT_ID,
        title: cat.title,
        slug,
        path: `${RESTAURANT_ID}/${String(catIndex + 1).padStart(3, '0')}-${slug}`,
        sortOrder: catIndex,
        visible: true,
        courseType: getCategoryType(cat.title),
      }
    });

    for (const [itemIndex, item] of cat.items.entries()) {
      const created = await prisma.menuItem.create({
        data: {
          restaurantId: RESTAURANT_ID,
          categoryId: category.id,
          name: item.name,
          normalizedName: normalizedName(item.name),
          description: item.description || '',
          price: item.price,
          allergens: item.allergens || '',
          imagePath: item.img || '',
          videoPath: '',
          visible: true,
          available: true,
          chefPick: Boolean(item.chefPick),
          popular: Boolean(item.popular),
          sortOrder: catIndex * 10000 + itemIndex,
        }
      });
      itemsByName.set(created.normalizedName, { id: created.id, name: created.name, categoryTitle: cat.title });
    }
  }
  console.log(`Created ${CATEGORIES.length} categories, ${itemsByName.size} items.`);

  // ── Recommendation bundles (persona meal bundles) ───────────────────────────
  const findItem = name => itemsByName.get(normalizedName(name));
  const BUNDLES = [
    { slug: 'steak', persona: 'The Steak Lover', icon: '🥩', description: 'Flame-grilled, unapologetic.', accent: '#a52b2d',
      items: [{ course: 'Drink', n: 'Old Fashioned' }, { course: 'Starter', n: 'Beef Biltong Board' }, { course: 'Main', n: 'Ribeye 400g' }, { course: 'Dessert', n: 'Death By Chocolate Cake' }] },
    { slug: 'seafood', persona: 'The Seafood Lover', icon: '🦐', description: 'From the coast, line to plate.', accent: '#3a6e8f',
      items: [{ course: 'Drink', n: 'Chardonnay' }, { course: 'Starter', n: 'Calamari Tubes & Tentacles' }, { course: 'Main', n: 'Kingklip & Prawn' }, { course: 'Dessert', n: 'Crème Brûlée' }] },
    { slug: 'burger', persona: 'The Burger Lover', icon: '🍔', description: 'Casual and satisfying.', accent: '#b5651d',
      items: [{ course: 'Drink', n: 'Mojito' }, { course: 'Starter', n: 'Soup of the Day' }, { course: 'Main', n: 'Bacon Cheeseburger' }, { course: 'Dessert', n: 'Trio of Ice Cream' }] },
    { slug: 'pasta', persona: 'The Pasta Lover', icon: '🍝', description: 'Comfort, twirled to perfection.', accent: '#5c7a4f',
      items: [{ course: 'Drink', n: 'Sauvignon Blanc' }, { course: 'Starter', n: 'Springbok Carpaccio' }, { course: 'Main', n: 'Beef Fillet Pasta' }, { course: 'Dessert', n: 'Cape Malva Pudding' }] },
  ];
  for (const [i, b] of BUNDLES.entries()) {
    const items = b.items.map(it => findItem(it.n)).map((found, idx) => ({
      course: b.items[idx].course, itemName: found?.name || b.items[idx].n, itemId: found?.id || null,
      price: found ? CATEGORIES.flatMap(c => c.items).find(x => x.name === found.name)?.price || 0 : 0, sortOrder: idx
    }));
    await prisma.recommendationBundle.create({
      data: {
        restaurantId: RESTAURANT_ID, createdBy: 'seed', slug: b.slug, persona: b.persona, icon: b.icon,
        description: b.description, accent: b.accent, priority: 100, sortOrder: i, active: true,
        items: { create: items }
      }
    });
  }
  console.log(`Created ${BUNDLES.length} recommendation bundles.`);

  // ── Per-item chef recommendations, derived from the items just seeded ───────
  const all = [...itemsByName.values()];
  const find = re => all.filter(i => re.test(i.name.toLowerCase()));
  const redWines = find(/cabernet|shiraz|merlot|pinotage/);
  const whiteWines = find(/sauvignon blanc|chardonnay/);
  const sides = find(/chips|spinach|mashed potatoes|onion rings/);
  const desserts = find(/chocolate cake|brûlée|malva|ice cream/);
  const steaks = find(/wagyu|ribeye|tomahawk|fillet|sirloin|t-bone/);
  const seafoods = find(/kingklip|prawn|salmon/).filter(i => !/linguine/.test(i.name.toLowerCase()));

  const specs = [];
  const addBeverages = (sourceId, targets, group, reason) =>
    targets.forEach((t, idx) => specs.push({ sourceItemId: sourceId, targetItemId: t.id, recType: 'BEVERAGE', beverageKind: 'WINE', priority: 100 - idx * 10, rotationGroup: group, reason }));
  const addOne = (sourceId, target, recType, reason) => {
    if (target && target.id !== sourceId) specs.push({ sourceItemId: sourceId, targetItemId: target.id, recType, beverageKind: 'NONE', priority: 90, rotationGroup: '', reason });
  };
  steaks.forEach(s => {
    addBeverages(s.id, redWines.slice(0, 3), `chef:${normalizedName(s.name)}:reds`, 'Bold red — built to stand up to grilled beef.');
    addOne(s.id, sides[0], 'SIDE', 'A classic steakhouse side.');
    addOne(s.id, desserts[0], 'DESSERT', 'The sweet finish guests remember.');
  });
  seafoods.forEach(s => {
    addBeverages(s.id, whiteWines.slice(0, 3), `chef:${normalizedName(s.name)}:whites`, 'Crisp white — a classic match for seafood.');
    addOne(s.id, desserts[1] || desserts[0], 'DESSERT', 'A refreshing way to finish.');
  });
  for (const sp of specs) {
    await prisma.menuItemRecommendation.upsert({
      where: { restaurantId_sourceItemId_targetItemId_recType: { restaurantId: RESTAURANT_ID, sourceItemId: sp.sourceItemId, targetItemId: sp.targetItemId, recType: sp.recType } },
      create: { restaurantId: RESTAURANT_ID, createdBy: 'seed', ...sp },
      update: { priority: sp.priority, beverageKind: sp.beverageKind, rotationGroup: sp.rotationGroup, reason: sp.reason, active: true }
    });
  }
  console.log(`Created ${specs.length} chef recommendation rows.`);

  // ── Tables ───────────────────────────────────────────────────────────────────
  for (let n = 1; n <= TABLE_COUNT; n++) {
    await prisma.table.upsert({
      where: { restaurantId_tableId: { restaurantId: RESTAURANT_ID, tableId: `table${n}` } },
      update: {},
      create: { restaurantId: RESTAURANT_ID, tableId: `table${n}`, displayName: `Table ${n}` }
    });
  }
  console.log(`Ensured ${TABLE_COUNT} tables.`);

  // ── Guests ───────────────────────────────────────────────────────────────────
  for (const g of GUESTS) {
    await prisma.guest.create({
      data: {
        restaurantId: RESTAURANT_ID, name: g.name, phone: g.phone, vip: g.vip,
        loyaltyTier: g.loyaltyTier || '', visitCount: g.visitCount, lifetimeSpend: g.lifetimeSpend,
        avgSpend: g.avgSpend, lastVisitAt: new Date()
      }
    });
  }
  console.log(`Created ${GUESTS.length} guests.`);

  // ── Historical + live orders (also upserts each Table to status='active') ──
  const orderService = new PrismaOrderService({ restaurantId: RESTAURANT_ID });
  const priceOf = name => CATEGORIES.flatMap(c => c.items).find(i => i.name === name)?.price || 0;
  const buildOrder = (basket) => {
    const items = basket.items.map(spec => {
      const found = findItem(spec.n);
      const name = found?.name || spec.n;
      return { name, price: priceOf(name), qty: spec.q || 1, img: '', description: '' };
    });
    const subtotal = r2(items.reduce((s, it) => s + it.price * it.qty, 0));
    const vat = r2(subtotal * 0.15);
    const service = r2(subtotal * 0.05);
    const total = r2(subtotal + vat + service);
    return { items, subtotal, vat, service, total };
  };

  let seededHistory = 0;
  for (let i = 0; i < HISTORY_BASKETS.length; i++) {
    const b = HISTORY_BASKETS[i];
    const built = buildOrder(b);
    const ts = new Date();
    ts.setDate(ts.getDate() - b.days);
    ts.setHours(19 + (i % 3), 15 + ((i * 7) % 40), 0, 0);
    const filename = `demo_seed_${b.t}_${ts.getTime()}_${i}.json`;
    const order = {
      table_number: b.t, waiterName: b.w, covers: b.cov, notes: '[DEMO] seeded basket',
      demoSeed: true, timestamp: ts.toISOString(), items: built.items,
      totals: { subtotal: built.subtotal, vat: built.vat, service: built.service, tip: 0, total: built.total }
    };
    const saved = await orderService.saveOrder(order, b.t, filename, 'history');
    if (saved) seededHistory += 1;
  }
  console.log(`Seeded ${seededHistory} historical orders.`);

  let seededLive = 0;
  for (let i = 0; i < LIVE_ORDERS.length; i++) {
    const b = LIVE_ORDERS[i];
    const built = buildOrder(b);
    const filename = `demo_seed_live_${b.t}_${Date.now()}_${i}.json`;
    const order = {
      table_number: b.t, waiterName: b.w, covers: b.cov, notes: '[DEMO] live order',
      demoSeed: true, timestamp: new Date().toISOString(), items: built.items,
      totals: { subtotal: built.subtotal, vat: built.vat, service: built.service, tip: 0, total: built.total }
    };
    const saved = await orderService.saveOrder(order, b.t, filename, 'orders');
    if (saved) {
      seededLive += 1;
      await prisma.waiterAssignment.create({
        data: { restaurantId: RESTAURANT_ID, tableId: b.t, waiterName: b.w, status: 'active', changeType: 'assign', assignedBy: 'seed' }
      });
    }
  }
  console.log(`Seeded ${seededLive} live orders + waiter assignments (tables now show occupied).`);

  if (typeof orderService.close === 'function') await orderService.close();
  await prisma.$disconnect();
  console.log('\nDemo Steakhouse seed complete.');
}

main().catch(error => {
  console.error('Seed failed:', error.message);
  process.exit(2);
});
