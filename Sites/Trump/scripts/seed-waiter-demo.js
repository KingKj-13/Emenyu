#!/usr/bin/env node
/*
 * Seed demo data for the AI waiter app (Aurum & Ember showcase).
 *
 * Idempotent: re-running deletes prior seed rows (marked by filename prefix /
 * notes marker) and recreates them. Picks REAL menu items from the DB so
 * analytics (sales-by-course, favorites, opportunities) stay consistent. The
 * "Aurum & Ember" branding is purely the configurable display name, not a menu
 * rewrite — this never alters the shared guest-facing menu.
 *
 * Usage: node Sites/Trump/scripts/seed-waiter-demo.js
 */
const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env'), quiet: true });
dotenv.config({ path: path.resolve(__dirname, '..', '.env'), quiet: true });

const { PrismaClient } = require('@prisma/client');

const RESTAURANT_ID = process.env.TRUMP_RESTAURANT_ID || 'trump';
const SEED_MARKER = 'seed_waiter_demo';
const WAITERS = ['Demetri', 'Sophia', 'Marcus', 'Lena'];
const SECTION_TABLES = [5, 7, 12, 18, 21, 24];

// Fallback catalogue used only if the DB menu is empty, so the demo still works.
const FALLBACK = {
  STARTER: [['Coal-Roasted Oysters', 168], ['Charred Calamari', 145], ['Bone-Marrow Gremolata', 95]],
  MAIN: [['Dry-Aged Tomahawk', 595], ['Centre-Cut Fillet', 425], ['Crispy Lamb Chops', 385]],
  WINE: [['Reserve Cabernet 2018', 420], ['Porcupine Ridge Shiraz', 95], ['Chardonnay Reserve', 180]],
  DRINK: [['Old Fashioned', 110], ['Craft Lager', 65]],
  DESSERT: [['Honey-Smoked Baklava', 95], ['Dark Chocolate Fondant', 110]]
};

const prisma = new PrismaClient();
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = arr => arr[rand(0, arr.length - 1)];
const round2 = n => Number(n.toFixed(2));

async function loadMenuByCourse() {
  const byCourse = { STARTER: [], MAIN: [], WINE: [], DRINK: [], DESSERT: [] };
  try {
    const items = await prisma.menuItem.findMany({
      where: { restaurantId: RESTAURANT_ID, visible: true, price: { gt: 0 } },
      select: { name: true, price: true, category: { select: { courseType: true } } }
    });
    for (const item of items) {
      const course = (item.category?.courseType || 'MAIN').toUpperCase();
      if (byCourse[course]) byCourse[course].push({ name: item.name, price: item.price });
    }
  } catch {
    /* fall through to fallback */
  }
  for (const course of Object.keys(byCourse)) {
    if (byCourse[course].length === 0) {
      byCourse[course] = FALLBACK[course].map(([name, price]) => ({ name, price }));
    }
  }
  return byCourse;
}

function buildOrderItems(menu) {
  const items = [];
  const add = (course, n = 1) => {
    const choice = pick(menu[course]);
    if (choice) items.push({ name: choice.name, price: choice.price, quantity: n });
  };
  add('MAIN', rand(1, 2));
  if (Math.random() > 0.4) add('STARTER');
  if (Math.random() > 0.35) add('WINE', rand(1, 2));
  if (Math.random() > 0.6) add('DRINK');
  if (Math.random() > 0.5) add('DESSERT');
  return items;
}

async function clearPriorSeed() {
  // Remove previously seeded orders + their items, upsell events, and guests.
  const prior = await prisma.order.findMany({
    where: { restaurantId: RESTAURANT_ID, filename: { startsWith: SEED_MARKER } },
    select: { id: true }
  });
  const ids = prior.map(o => o.id);
  if (ids.length) {
    await prisma.orderItem.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.orderStatusHistory.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.order.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.upsellEvent.deleteMany({ where: { restaurantId: RESTAURANT_ID, suggestedItem: { contains: '' }, source: { in: ['coach', 'pairing', 'sommelier', 'opportunity'] } } });
  console.log(`Cleared ${ids.length} prior seed orders.`);
}

let orderSeq = 0;
async function createHistoryOrder({ waiterName, tableId, items, daysAgo, guestId = null }) {
  const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
  const tip = round2(subtotal * (0.1 + Math.random() * 0.08));
  const total = round2(subtotal);
  const ts = new Date();
  ts.setDate(ts.getDate() - daysAgo);
  ts.setHours(rand(17, 22), rand(0, 59), 0, 0);
  const filename = `${SEED_MARKER}_${Date.now()}_${orderSeq++}.json`;

  await prisma.order.create({
    data: {
      restaurantId: RESTAURANT_ID,
      filename,
      tableId,
      status: 'history',
      sourceKind: 'history',
      kitchenStatus: 'served',
      waiterName,
      guestId,
      subtotal: round2(subtotal),
      tip,
      total,
      timestamp: ts,
      raw: { items, waiterName, table_number: tableId },
      items: { create: items.map((i, idx) => ({ name: i.name, price: i.price, quantity: i.quantity, sortOrder: idx })) }
    }
  });
  return { total, tip };
}

async function ensureTable(tableId, metadata) {
  await prisma.table.upsert({
    where: { restaurantId_tableId: { restaurantId: RESTAURANT_ID, tableId } },
    create: { restaurantId: RESTAURANT_ID, tableId, displayName: tableId.replace('table', 'Table '), metadata },
    update: { metadata }
  });
}

async function seedGuests(menu) {
  const wineName = (menu.WINE[0] || {}).name || 'Reserve Cabernet 2018';
  const mainName = (menu.MAIN[0] || {}).name || 'Dry-Aged Tomahawk';
  const dessertName = (menu.DESSERT[0] || {}).name || 'Honey-Smoked Baklava';
  const defs = [
    { name: 'Jonathan Pierce', vip: true, allergies: '', loyaltyTier: 'Black', preferences: { favoriteWine: wineName, favoriteMain: mainName, favoriteDessert: dessertName, avoids: ['Seafood'], preferredSeating: 'Window' }, notes: 'Anniversary regular. Always opens with Champagne.' },
    { name: 'Amara Ndlovu', vip: true, allergies: 'Nuts', loyaltyTier: 'Gold', preferences: { favoriteWine: wineName, favoriteMain: mainName, avoids: ['Nuts'], preferredSeating: 'Quiet corner' }, notes: 'Nut allergy — confirm dessert.' },
    { name: 'The Bezuidenhouts', vip: false, allergies: '', loyaltyTier: 'Silver', preferences: { favoriteMain: mainName, favoriteDessert: dessertName }, notes: 'Family of four, often books a high chair.' },
    { name: 'Daniel Okafor', vip: false, allergies: 'Gluten', loyaltyTier: '', preferences: { avoids: ['Gluten'] }, notes: 'Gluten-free; loves the steaks.' },
    { name: 'Priya Naidoo', vip: true, allergies: '', loyaltyTier: 'Gold', preferences: { favoriteWine: wineName, favoriteDessert: dessertName, preferredSeating: 'Booth' }, notes: 'Wine-led. High average check.' },
    { name: 'Sipho & Lerato', vip: false, allergies: '', loyaltyTier: 'Silver', preferences: { favoriteMain: mainName }, notes: 'Date-night couple, monthly.' },
    { name: 'Elena Rossi', vip: false, allergies: 'Shellfish', loyaltyTier: '', preferences: { avoids: ['Shellfish'] }, notes: 'Prefers the fillet, no seafood.' },
    { name: 'Thabo Molefe', vip: true, allergies: '', loyaltyTier: 'Black', preferences: { favoriteWine: wineName, favoriteMain: mainName, favoriteDessert: dessertName }, notes: 'Top spender. Trusts the sommelier.' }
  ];

  const guests = [];
  for (const def of defs) {
    const existing = await prisma.guest.findFirst({ where: { restaurantId: RESTAURANT_ID, name: def.name } });
    const data = {
      restaurantId: RESTAURANT_ID,
      name: def.name,
      vip: def.vip,
      allergies: def.allergies,
      loyaltyTier: def.loyaltyTier,
      preferences: def.preferences,
      notes: def.notes
    };
    const guest = existing
      ? await prisma.guest.update({ where: { id: existing.id }, data })
      : await prisma.guest.create({ data });
    guests.push(guest);
  }
  console.log(`Seeded ${guests.length} guests.`);
  return guests;
}

async function recomputeGuest(guestId) {
  const orders = await prisma.order.findMany({
    where: { restaurantId: RESTAURANT_ID, guestId, status: 'history' },
    select: { total: true, timestamp: true }
  });
  const visitCount = orders.length;
  const lifetimeSpend = round2(orders.reduce((s, o) => s + (o.total || 0), 0));
  const avgSpend = visitCount ? round2(lifetimeSpend / visitCount) : 0;
  const lastVisitAt = orders.reduce((l, o) => (!l || o.timestamp > l ? o.timestamp : l), null);
  await prisma.guest.update({ where: { id: guestId }, data: { visitCount, lifetimeSpend, avgSpend, lastVisitAt } });
}

async function seedUpsellEvents(menu) {
  const data = [];
  const picks = [...menu.WINE, ...menu.DESSERT, ...menu.STARTER];
  // Demetri: ~14 offered today, ~9 accepted (≈64%, matching the showcase).
  for (let i = 0; i < 14; i++) {
    const choice = pick(picks) || { name: 'Reserve Cabernet 2018', price: 420 };
    data.push({
      restaurantId: RESTAURANT_ID, waiterName: 'Demetri', tableId: `table${pick(SECTION_TABLES)}`,
      suggestedItem: choice.name, accepted: i < 9, source: pick(['coach', 'pairing', 'sommelier', 'opportunity']),
      value: i < 9 ? choice.price : 0, createdAt: new Date()
    });
  }
  for (const w of ['Sophia', 'Marcus', 'Lena']) {
    const offered = rand(6, 10);
    const accepted = rand(3, offered - 1);
    for (let i = 0; i < offered; i++) {
      const choice = pick(picks) || { name: 'Reserve Cabernet 2018', price: 420 };
      data.push({
        restaurantId: RESTAURANT_ID, waiterName: w, tableId: `table${rand(1, 30)}`,
        suggestedItem: choice.name, accepted: i < accepted, source: 'coach',
        value: i < accepted ? choice.price : 0, createdAt: new Date()
      });
    }
  }
  await prisma.upsellEvent.createMany({ data });
  console.log(`Seeded ${data.length} upsell events.`);
}

async function tagDietary(menu) {
  // Mark a few real items with GF/DF tags so the menu cards show dietary badges.
  try {
    const steaks = await prisma.menuItem.findMany({
      where: { restaurantId: RESTAURANT_ID, OR: [{ name: { contains: 'Fillet', mode: 'insensitive' } }, { name: { contains: 'Tomahawk', mode: 'insensitive' } }, { name: { contains: 'Oyster', mode: 'insensitive' } }, { name: { contains: 'Calamari', mode: 'insensitive' } }] },
      select: { id: true, name: true, metadata: true }
    });
    for (const item of steaks) {
      const meta = item.metadata && typeof item.metadata === 'object' ? item.metadata : {};
      const dietary = /calamari/i.test(item.name) ? ['GF', 'DF'] : ['GF'];
      await prisma.menuItem.update({ where: { id: item.id }, data: { metadata: { ...meta, dietary } } });
    }
    console.log(`Tagged ${steaks.length} items with dietary badges.`);
  } catch {
    console.log('Skipped dietary tagging (menu not available).');
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL not set — aborting.');
    process.exit(1);
  }
  console.log(`Seeding waiter demo for restaurant "${RESTAURANT_ID}"...`);
  const menu = await loadMenuByCourse();
  await clearPriorSeed();
  const guests = await seedGuests(menu);

  // Guest visit history (spread over the last few months) so intel is real.
  for (const guest of guests) {
    const visits = guest.vip ? rand(6, 12) : rand(2, 5);
    for (let v = 0; v < visits; v++) {
      await createHistoryOrder({
        waiterName: pick(WAITERS),
        tableId: `table${pick(SECTION_TABLES)}`,
        items: buildOrderItems(menu),
        daysAgo: rand(2, 120),
        guestId: guest.id
      });
    }
    await recomputeGuest(guest.id);
  }

  // Shift volume: today (for the Today dashboard) + trailing 14 days (baseline/leaderboard).
  const totals = {};
  for (const waiter of WAITERS) {
    totals[waiter] = 0;
    // Demetri is the head waiter — bigger book.
    const todayTables = waiter === 'Demetri' ? 14 : rand(6, 10);
    for (let i = 0; i < todayTables; i++) {
      const r = await createHistoryOrder({ waiterName: waiter, tableId: `table${rand(1, 30)}`, items: buildOrderItems(menu), daysAgo: 0 });
      totals[waiter] += r.total;
    }
    for (let d = 1; d <= 14; d++) {
      const n = waiter === 'Demetri' ? rand(8, 14) : rand(4, 9);
      for (let i = 0; i < n; i++) {
        await createHistoryOrder({ waiterName: waiter, tableId: `table${rand(1, 30)}`, items: buildOrderItems(menu), daysAgo: d });
      }
    }
  }
  console.log('Today sales by waiter:', Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, round2(v)])));

  await seedUpsellEvents(menu);
  await tagDietary(menu);

  // Floor metadata: party sizes + a VIP seated at table 7 (the screenshot's table).
  for (const n of SECTION_TABLES) {
    await ensureTable(`table${n}`, { guests: rand(2, 6) });
  }
  const vipGuest = guests.find(g => g.vip);
  if (vipGuest) await ensureTable('table7', { guests: 2, guestId: vipGuest.id });

  console.log('✓ Waiter demo seed complete.');
}

main()
  .catch(err => {
    console.error('Seed failed:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
