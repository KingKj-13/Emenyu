#!/usr/bin/env node
'use strict';
// One-time content seed: clears out placeholder/test Promotion, Special, and
// ComboSpecial rows (none of this tenant's promotional data was real,
// finished content yet -- generic titles like "lunch"/"12" with descriptions
// like "wow" were exploratory admin-UI testing, not guest-facing copy), then
// seeds one real Deal of the Day and five real Combo Offers using actual
// catalog items, in the Carmella brand voice.
//
// Safe to re-run: clears its own previously-seeded rows (matched by title)
// before recreating them, so running it twice never duplicates.
//
//   node scripts/seed-deal-and-combos.js
const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname, '..', '.env'), quiet: true });
const { getPrisma } = require('../server/services/prismaClient');
const RESTAURANT_ID = 'carmella-production';

const DEAL_TITLE = "Sir Gaspard's Table";
const COMBO_TITLES = ['A Day in Paris', 'Breakfast Combo', 'Steak Night', 'Wine & Cheese', 'Family Feast'];

async function main() {
  const prisma = getPrisma();
  console.log(`[seed-deal-and-combos] connecting to ${RESTAURANT_ID}...`);

  // Wipe ALL existing Promotion/Special rows -- every row currently in these
  // tables is placeholder admin-UI test data (generic titles, no real copy),
  // not finished guest-facing content. ComboSpecial is already empty.
  const clearedPromos = await prisma.promotion.deleteMany({ where: { restaurantId: RESTAURANT_ID } });
  const clearedSpecials = await prisma.special.deleteMany({ where: { restaurantId: RESTAURANT_ID } });
  const clearedCombos = await prisma.comboSpecial.deleteMany({ where: { restaurantId: RESTAURANT_ID, title: { in: COMBO_TITLES } } });
  console.log(`cleared ${clearedPromos.count} promotions, ${clearedSpecials.count} specials, ${clearedCombos.count} prior seeded combos`);

  async function itemId(name) {
    const item = await prisma.menuItem.findFirst({ where: { restaurantId: RESTAURANT_ID, name } });
    if (!item) throw new Error(`seed item not found: ${name}`);
    return item.id;
  }

  // ── Deal of the Day ──────────────────────────────────────────────────────
  // Wine pricing note: most bottles here have ONLY a "Bottle" variant (no
  // by-the-glass option), and effectivePrice() always resolves to the
  // CHEAPEST variant on the item -- so a bottle-only wine in a one-person
  // deal blows the "original price" up to a full bottle and makes the
  // savings look absurd. Warwick The First Lady Cabernet Sauvignon has a
  // real Glass variant (R95), which is what makes this a sane by-the-glass
  // deal instead.
  const bordeauxFlame = await itemId('Bordeaux Flame');
  const warwickCab = await itemId('Warwick The First Lady Cabernet Sauvignon');
  const brownie = await itemId('Chocolate Brownie');

  await prisma.promotion.create({
    data: {
      restaurantId: RESTAURANT_ID,
      title: DEAL_TITLE,
      description: "Sir Gaspard's own pairing for tonight — a flame-grilled Bordeaux Flame, a glass of Cabernet, and something sweet to finish.",
      badge: 'CHEF SPECIAL',
      itemIds: [bordeauxFlame, warwickCab, brownie],
      dealPrice: 375,
      isDealOfDay: true,
      active: true,
      startTime: '00:00',
      endTime: '23:59'
    }
  });
  console.log(`created Deal of the Day: "${DEAL_TITLE}"`);

  // ── Combo Offers ─────────────────────────────────────────────────────────
  const combos = [
    {
      title: 'A Day in Paris',
      description: 'A croissant, a cappuccino, and nowhere to be — the quiet café morning, at your table.',
      itemIds: [await itemId('A Day in Paris')],
      drinkItemIds: [await itemId('Cappuccino'), await itemId('Green Juice')],
      comboPrice: 155
    },
    {
      title: 'Breakfast Combo',
      description: 'The full Carmella breakfast, with a cappuccino and a fresh green juice alongside.',
      itemIds: [await itemId("Carmella's Breakfast")],
      drinkItemIds: [await itemId('Cappuccino'), await itemId('Green Juice')],
      comboPrice: 205
    },
    {
      title: 'Steak Night',
      description: 'Two flame-grilled steaks and a bottle of Pinotage to share — a table built for a proper steak night.',
      itemIds: [await itemId('Iron Fillet'), await itemId('Bordeaux Flame')],
      drinkItemIds: [await itemId('Beyerskloof Pinotage')],
      comboPrice: 720
    },
    {
      title: 'Wine & Cheese',
      description: "Miko's cheese platter with a glass each of red and sparkling — a little tasting, unhurried.",
      itemIds: [await itemId("Miko's Cheese Platter")],
      drinkItemIds: [await itemId('Warwick The First Lady Cabernet Sauvignon'), await itemId('Boschendal N/V Brut')],
      comboPrice: 375
    },
    {
      title: 'Family Feast',
      description: 'Three platters for the table — cold meats, cheese, and a vegetarian spread — built for sharing.',
      itemIds: [await itemId('Best of the Best Platter'), await itemId("Helmut's Cold Meat Platter"), await itemId('Vegetarian Platter')],
      drinkItemIds: [],
      comboPrice: 650
    }
  ];

  for (const combo of combos) {
    const firstItem = await prisma.menuItem.findUnique({ where: { id: combo.itemIds[0] }, select: { imagePath: true } });
    await prisma.comboSpecial.create({
      data: {
        restaurantId: RESTAURANT_ID,
        title: combo.title,
        description: combo.description,
        bannerImage: firstItem?.imagePath || '',
        itemIds: combo.itemIds,
        drinkItemIds: combo.drinkItemIds,
        comboPrice: combo.comboPrice,
        active: true,
        startTime: '00:00',
        endTime: '23:59'
      }
    });
    console.log(`created combo: "${combo.title}" (${formatR(combo.comboPrice)})`);
  }

  console.log('done.');
  await prisma.$disconnect();
}

function formatR(n) { return `R${n}`; }

main().catch(async err => {
  console.error('[seed-deal-and-combos] failed:', err);
  process.exitCode = 1;
});
