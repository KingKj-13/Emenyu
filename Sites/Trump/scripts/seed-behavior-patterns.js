#!/usr/bin/env node
// Test-data generator for the EXISTING guest-engagement + order system.
// Writes nothing new: every row goes through the same tables and shapes
// server/services/viewAnalyticsService.js and server/services/prismaOrderService.js
// already read/write for real guest sessions and real orders. No schema, API,
// or dashboard changes.
//
// Two phases:
//   1. General realistic "noise" -- ~18 tables, lunch + dinner service,
//      table-session narratives (browse -> sometimes video -> sometimes order),
//      using the real menu across a wide popularity spread.
//   2. Deliberate pattern top-up -- five real dishes pushed to specific,
//      reportable interest-vs-purchase signatures (see PATTERN_ITEMS below).
//      Baselines are read first so the printed deltas are honest about what
//      already existed vs. what this run added.
//
// Usage: node scripts/seed-behavior-patterns.js [restaurantId]
process.env.TZ = 'Africa/Johannesburg';

const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const { PrismaOrderService } = require('../server/services/prismaOrderService');

const RESTAURANT_ID = process.argv[2] || 'trump';
const prisma = new PrismaClient();
const orderService = new PrismaOrderService({ restaurantId: RESTAURANT_ID, logger: console });

// ── real menu, [id, name, category, hasVideo, weight] ──────────────────────
const ITEMS = [
  [52, 'SIRLOIN 350g', 'SOUTH AFRICAN PRIME BEEF - OFF THE BONE', true, 10],
  [53, 'RUMP 400g', 'SOUTH AFRICAN PRIME BEEF - OFF THE BONE', true, 9],
  [55, 'FILLET 260g', 'SOUTH AFRICAN PRIME BEEF - OFF THE BONE', true, 8],
  [54, 'RIBEYE 380g', 'SOUTH AFRICAN PRIME BEEF - OFF THE BONE', true, 7],
  [58, 'T-BONE 500g', 'SOUTH AFRICAN PRIME BEEF - ON THE BONE', true, 8],
  [62, 'T-BONE 700g', 'SOUTH AFRICAN PRIME BEEF - ON THE BONE', true, 4],
  [68, 'T-BONE 850g - 900g', 'THE KINGS CUTS (21 Days Matured)', true, 3],
  [59, 'TOMAHAWK (FRENCH CUT) 650g', 'SOUTH AFRICAN PRIME BEEF - ON THE BONE', true, 5],
  [72, 'WAGYU SIRLOIN 300g', 'SOUTH AFRICAN WAGYU BEEF (Marbling Score 8-10+)', true, 6],
  [71, 'WAGYU FILLET 300g', 'SOUTH AFRICAN WAGYU BEEF (Marbling Score 8-10+)', true, 4],
  [70, 'WAGYU RIBEYE 300g', 'SOUTH AFRICAN WAGYU BEEF (Marbling Score 8-10+)', true, 4],
  [64, 'RUMP 600g', 'SOUTH AFRICAN PREMIUM CUTS - OFF THE BONE', false, 3],
  [104, 'MIXED GRILL', "SIGNATURE COMBO'S SINCE 1994", true, 5],
  [105, 'PRIME STEAK & PRAWNS (Surf & Turf)', "SIGNATURE COMBO'S SINCE 1994", true, 6],
  [91, 'LAMB RUMP 300g', 'LAMB', false, 4],
  [41, 'SEARED SALMON', 'SIGNATURE SEAFOOD', true, 5],
  [45, 'PRAWN & CALAMARI', 'SIGNATURE SEAFOOD', true, 4],
  [51, 'GRILLED HAKE', 'SIGNATURE SEAFOOD', false, 4],
  [118, 'CHICKEN BREAST', 'CHICKEN', false, 3],
  [111, 'CHEESE BURGER', 'STEAKHOUSE GOURMET BURGERS', false, 4],
  [3, 'FIRECRACKER CHICKEN WINGS (400g)', 'SMALL PLATES', false, 4],
  [126, 'BEEF FILLET PASTA', 'TRUMPS PASTAS', false, 3],
  [149, 'CHOCOLATE BROWNIE', 'DESSERT AND CAKES', false, 4],
  [280, 'CASTLE LAGER', 'BEERS LOCAL', false, 5],
  [288, 'HEINEKEN', 'BEERS IMPORTED', false, 4],
  [173, 'NEDERBURG', 'SAUVIGNON BLANC', false, 3],
  [388, 'MOJITO', 'CLASSIC COCKTAILS', false, 3],
  [431, 'CAPPUCCINO', 'HOT BEVERAGES & DOM PEDROS', false, 3],
];
const ITEM_BY_ID = new Map(ITEMS.map(i => [i[0], i]));

// The five deliberate-pattern subjects. `orderPrice` duplicated here (rather
// than looked up) so order totals are correct without a menu query.
const PATTERN_ITEMS = {
  highInterestLowPurchase: { id: 71, name: 'WAGYU FILLET 300g', price: 749, category: ITEM_BY_ID.get(71)[2] },
  highInterestHighPurchase: { id: 52, name: 'SIRLOIN 350g', price: 269, category: ITEM_BY_ID.get(52)[2] },
  lowInterestHighPurchase: { id: 53, name: 'RUMP 400g', price: 269, category: ITEM_BY_ID.get(53)[2] },
  highVideoLowPurchase: { id: 59, name: 'TOMAHAWK (FRENCH CUT) 650g', price: 499, category: ITEM_BY_ID.get(59)[2] },
  highRepeatLowPurchase: { id: 70, name: 'WAGYU RIBEYE 300g', price: 699, category: ITEM_BY_ID.get(70)[2] },
};

const TABLES = Array.from({ length: 18 }, (_, i) => `table${i + 1}`);
const WAITERS = ['Thabo', 'Amanda', 'Liam', 'Zanele', 'Priya'];
const LOCALES = ['en', 'en', 'en', 'en', 'af', 'de', 'fr', 'pt-BR', 'zh-Hans'];
const DEVICES = ['phone', 'phone', 'phone', 'tablet', 'desktop'];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min, max) { return min + Math.floor(Math.random() * (max - min + 1)); }
function weightedPick(list) {
  const total = list.reduce((s, r) => s + r[4], 0);
  let r = Math.random() * total;
  for (const row of list) { r -= row[4]; if (r <= 0) return row; }
  return list[list.length - 1];
}
function sessionId() { return crypto.randomBytes(10).toString('hex'); }
function orderFilename(key) { return `pattern-seed_${crypto.createHash('sha1').update(key).digest('hex').slice(0, 16)}.json`; }

const events = []; // batched ViewEvent rows
let ordersCreated = 0;
let orderItemsCreated = 0;

function pushEvent(row) { events.push(row); }

/** VIDEO_PLAY + (optionally) VIDEO_PROGRESS/VIDEO_COMPLETE, matching exactly
 *  what useVideoEngagement.ts fires client-side: PROGRESS at the halfway
 *  point, COMPLETE within 0.3s of the end. `completionProb` is the fraction
 *  of plays that make it all the way through THIS loop (matching real
 *  behavior: a looping video either gets watched to the wrap-around or gets
 *  abandoned partway -- a continuous random "fraction watched" almost never
 *  lands within the 0.5s-of-the-end window COMPLETE requires, which silently
 *  produces a near-zero completion rate no matter how "high engagement" the
 *  caller intends). Plays that don't complete get a genuinely partial watch,
 *  drawn from partialRange (default a wide abandon-anywhere spread). */
function playVideo(common, id, name, at, loopLen, completionProb, partialRange = [0.1, 0.7]) {
  pushEvent({ ...common, eventType: 'VIDEO_PLAY', menuItemId: id, label: name, createdAt: at(0) });
  const completes = Math.random() < completionProb;
  const watchedSec = completes
    ? loopLen // watched the loop through to the wrap-around
    : loopLen * (partialRange[0] + Math.random() * (partialRange[1] - partialRange[0]));
  if (watchedSec >= loopLen / 2) {
    pushEvent({ ...common, eventType: 'VIDEO_PROGRESS', menuItemId: id, label: name, positionSec: Math.round(loopLen / 2), createdAt: at(loopLen / 2) });
  }
  if (completes) {
    pushEvent({ ...common, eventType: 'VIDEO_COMPLETE', menuItemId: id, label: name, positionSec: Math.round(loopLen), createdAt: at(loopLen) });
  }
  return watchedSec;
}

function openItem(common, id, name, category, at, dwellMs) {
  pushEvent({ ...common, eventType: 'ITEM_VIEW', menuItemId: id, label: name, categoryName: category, dwellMs, createdAt: at(0) });
}

// ── phase timing helpers ────────────────────────────────────────────────
const DAYS_BACK = 10;
function serviceStart(dayOffset, period) {
  const day = new Date(Date.now() - dayOffset * 86400000);
  const [h, m] = period === 'lunch' ? [12 + Math.random() * 2.5, 0] : [17.5 + Math.random() * 4.5, 0];
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(h), Math.round((h % 1) * 60) + m);
}

// ── archetypes: what a table orders, by profile ─────────────────────────
const NOISE_FOOD = ITEMS.filter(i => i[2] !== 'BEERS LOCAL' && i[2] !== 'BEERS IMPORTED' && i[2] !== 'SAUVIGNON BLANC' && i[2] !== 'CLASSIC COCKTAILS' && i[2] !== 'HOT BEVERAGES & DOM PEDROS' && i[2] !== 'DESSERT AND CAKES');
const DRINKS = ITEMS.filter(i => ['BEERS LOCAL', 'BEERS IMPORTED', 'SAUVIGNON BLANC', 'CLASSIC COCKTAILS'].includes(i[2]));
const DESSERTS = ITEMS.filter(i => i[2] === 'DESSERT AND CAKES');
const HOT_DRINKS = ITEMS.filter(i => i[2] === 'HOT BEVERAGES & DOM PEDROS');

const PROFILES = {
  solo: { rounds: 1, mainsPerRound: [1, 1], drinks: [1, 1], dessertChance: 0.2 },
  couple: { rounds: randInt(1, 2), mainsPerRound: [2, 2], drinks: [1, 3], dessertChance: 0.5 },
  business: { rounds: randInt(1, 2), mainsPerRound: [2, 4], drinks: [2, 4], dessertChance: 0.25 },
  family: { rounds: 2, mainsPerRound: [3, 5], drinks: [2, 5], dessertChance: 0.6 },
  group: { rounds: randInt(2, 3), mainsPerRound: [5, 8], drinks: [4, 8], dessertChance: 0.7 },
};

async function placeOrder(tableId, waiter, itemsForOrder, timestamp, orderKey) {
  const filename = orderFilename(orderKey);
  const payload = {
    table_number: tableId,
    waiterName: waiter,
    notes: 'Seeded test data (behavior-pattern verification)',
    timestamp: timestamp.toISOString(),
    covers: randInt(1, 6),
    items: itemsForOrder.map(([id, name, , price], idx) => ({ name, price, quantity: itemsForOrder[idx][4] })),
  };
  const saved = await orderService.saveOrder(payload, tableId, filename, 'history');
  if (saved) {
    ordersCreated += 1;
    orderItemsCreated += itemsForOrder.length;
  }
  return saved;
}

/** One table's full dining session: browsing (item opens + occasional video),
 *  then one or more real orders placed from a SUBSET of what was browsed --
 *  never everything looked at gets ordered, which is the whole point. */
async function runTableSession(dayOffset, period, tableId) {
  const profileKey = pick(['solo', 'couple', 'business', 'family', 'group']);
  const profile = PROFILES[profileKey];
  const waiter = pick(WAITERS);
  const locale = pick(LOCALES);
  const deviceType = pick(DEVICES);
  const sid = sessionId();
  const common = { restaurantId: RESTAURANT_ID, sessionId: sid, locale, deviceType, tableId: '' };
  const start = serviceStart(dayOffset, period);
  let elapsed = 0;
  const at = offsetFromNow => new Date(start.getTime() + (elapsed + offsetFromNow) * 1000);

  pushEvent({ ...common, eventType: 'MENU_VIEW', createdAt: at(0) });
  elapsed += 5 + Math.random() * 10;

  const browsed = new Set();
  const browseCount = randInt(3, 9);
  for (let i = 0; i < browseCount; i++) {
    const [id, name, category, hasVideo] = weightedPick(NOISE_FOOD);
    browsed.add(id);
    const dwellMs = Math.round((6 + Math.random() * 60) * 1000);
    openItem(common, id, name, category, at, dwellMs);
    elapsed += dwellMs / 1000;
    if (hasVideo && Math.random() < 0.4) {
      const loopLen = 12 + Math.random() * 20;
      const watched = playVideo(common, id, name, at, loopLen, 0.3);
      elapsed += watched;
    }
  }

  for (let round = 0; round < profile.rounds; round++) {
    elapsed += 60 + Math.random() * 240; // gap before ordering
    const mainCount = randInt(...profile.mainsPerRound);
    const orderLines = [];
    const chosenIds = new Set();
    for (let i = 0; i < mainCount; i++) {
      // Bias toward items actually browsed this session, but not exclusively --
      // a real guest orders things a waiter recommends too, not just what
      // they tapped on.
      const [id, name, , , ] = Math.random() < 0.6 && browsed.size > 0
        ? ITEM_BY_ID.get([...browsed][randInt(0, browsed.size - 1)])
        : weightedPick(NOISE_FOOD);
      if (chosenIds.has(id)) continue;
      chosenIds.add(id);
      orderLines.push([id, name, null, priceOf(id), randInt(1, 2)]);
    }
    const drinkCount = randInt(...profile.drinks);
    for (let i = 0; i < drinkCount; i++) {
      const [id, name] = weightedPick(DRINKS);
      orderLines.push([id, name, null, priceOf(id), randInt(1, 2)]);
    }
    if (round === profile.rounds - 1 && Math.random() < profile.dessertChance) {
      const [id, name] = weightedPick(DESSERTS.length ? DESSERTS : HOT_DRINKS);
      orderLines.push([id, name, null, priceOf(id), 1]);
      const [hid, hname] = weightedPick(HOT_DRINKS);
      orderLines.push([hid, hname, null, priceOf(hid), randInt(1, 2)]);
    }
    if (orderLines.length > 0) {
      await placeOrder(tableId, waiter, orderLines, at(0), `${sid}-r${round}`);
    }
    elapsed += 5;
  }
}

function priceOf(id) {
  const prices = { 52: 269, 53: 269, 55: 329, 54: 369, 58: 329, 62: 429, 68: 639, 59: 499, 72: 699, 71: 749, 70: 699, 64: 355, 104: 469, 105: 529, 91: 349, 41: 435, 45: 339, 51: 275, 118: 225, 111: 209, 3: 175, 126: 289, 149: 115, 280: 45, 288: 60, 173: 195, 388: 145, 431: 45 };
  return prices[id] || 100;
}

// ── phase 2: deliberate pattern top-up ──────────────────────────────────
async function seedPattern(key, target) {
  const { id, name, price, category } = target;
  const common = () => ({ restaurantId: RESTAURANT_ID, sessionId: sessionId(), locale: pick(LOCALES), deviceType: pick(DEVICES), tableId: '' });

  if (key === 'highInterestLowPurchase') {
    // ~820 opens across ~600 unique sessions (some repeat), ~360 video plays
    // at a healthy but not exceptional completion rate, only 18 new orders.
    for (let s = 0; s < 620; s++) {
      const c = common();
      const day = randInt(0, DAYS_BACK - 1);
      const start = serviceStart(day, pick(['lunch', 'dinner']));
      const at = off => new Date(start.getTime() + off * 1000);
      const opens = Math.random() < 0.25 ? 2 : 1;
      for (let o = 0; o < opens; o++) openItem(c, id, name, category, off => at(off + o * 20), Math.round((10 + Math.random() * 50) * 1000));
      if (Math.random() < 0.5) playVideo(c, id, name, at, 15 + Math.random() * 18, 0.35);
    }
    for (let i = 0; i < 18; i++) {
      const day = randInt(0, DAYS_BACK - 1);
      const ts = serviceStart(day, pick(['lunch', 'dinner']));
      await placeOrder(pick(TABLES), pick(WAITERS), [[id, name, null, price, 1]], ts, `pattern-A-${i}`);
    }

  } else if (key === 'highInterestHighPurchase') {
    for (let s = 0; s < 560; s++) {
      const c = common();
      const day = randInt(0, DAYS_BACK - 1);
      const start = serviceStart(day, pick(['lunch', 'dinner']));
      const at = off => new Date(start.getTime() + off * 1000);
      openItem(c, id, name, category, at, Math.round((10 + Math.random() * 50) * 1000));
      if (Math.random() < 0.45) playVideo(c, id, name, at, 15 + Math.random() * 18, 0.55);
    }
    for (let i = 0; i < 85; i++) {
      const day = randInt(0, DAYS_BACK - 1);
      const ts = serviceStart(day, pick(['lunch', 'dinner']));
      await placeOrder(pick(TABLES), pick(WAITERS), [[id, name, null, price, randInt(1, 2)]], ts, `pattern-B-${i}`);
    }

  } else if (key === 'lowInterestHighPurchase') {
    for (let s = 0; s < 22; s++) {
      const c = common();
      const day = randInt(0, DAYS_BACK - 1);
      const start = serviceStart(day, pick(['lunch', 'dinner']));
      openItem(c, id, name, category, off => new Date(start.getTime() + off * 1000), Math.round((8 + Math.random() * 30) * 1000));
    }
    for (let i = 0; i < 155; i++) {
      const day = randInt(0, DAYS_BACK - 1);
      const ts = serviceStart(day, pick(['lunch', 'dinner']));
      await placeOrder(pick(TABLES), pick(WAITERS), [[id, name, null, price, randInt(1, 2)]], ts, `pattern-C-${i}`);
    }

  } else if (key === 'highVideoLowPurchase') {
    for (let s = 0; s < 55; s++) {
      const c = common();
      const day = randInt(0, DAYS_BACK - 1);
      const start = serviceStart(day, pick(['lunch', 'dinner']));
      const at = off => new Date(start.getTime() + off * 1000);
      openItem(c, id, name, category, at, Math.round((10 + Math.random() * 40) * 1000));
    }
    for (let s = 0; s < 410; s++) {
      const c = common();
      const day = randInt(0, DAYS_BACK - 1);
      const start = serviceStart(day, pick(['lunch', 'dinner']));
      const at = off => new Date(start.getTime() + off * 1000);
      // Deliberately high completion: this pattern is "watch it, still don't buy".
      playVideo(c, id, name, at, 20 + Math.random() * 15, 0.82);
    }
    for (let i = 0; i < 6; i++) {
      const day = randInt(0, DAYS_BACK - 1);
      const ts = serviceStart(day, pick(['lunch', 'dinner']));
      await placeOrder(pick(TABLES), pick(WAITERS), [[id, name, null, price, 1]], ts, `pattern-D-${i}`);
    }

  } else if (key === 'highRepeatLowPurchase') {
    // ~135 sessions, each opening the item 2-6 times (repeat consideration
    // within one visit) -- ~540 total opens skewed toward repeats.
    for (let s = 0; s < 135; s++) {
      const c = common();
      const day = randInt(0, DAYS_BACK - 1);
      const start = serviceStart(day, pick(['lunch', 'dinner']));
      const at = off => new Date(start.getTime() + off * 1000);
      const opens = randInt(2, 6);
      for (let o = 0; o < opens; o++) {
        openItem(c, id, name, category, off => at(off + o * 90), Math.round((8 + Math.random() * 40) * 1000));
      }
      if (Math.random() < 0.3) playVideo(c, id, name, at, 15 + Math.random() * 15, 0.22);
    }
    for (let i = 0; i < 11; i++) {
      const day = randInt(0, DAYS_BACK - 1);
      const ts = serviceStart(day, pick(['lunch', 'dinner']));
      await placeOrder(pick(TABLES), pick(WAITERS), [[id, name, null, price, 1]], ts, `pattern-E-${i}`);
    }
  }
}

async function main() {
  // Phase 1: general realistic noise -- ~170 table-sessions across 18 tables,
  // lunch + dinner, over the last 10 days.
  const SESSIONS = 170;
  for (let i = 0; i < SESSIONS; i++) {
    const day = randInt(0, DAYS_BACK - 1);
    const period = Math.random() < 0.35 ? 'lunch' : 'dinner';
    const tableId = pick(TABLES);
    await runTableSession(day, period, tableId);
    if (events.length > 4000) await flush();
  }
  await flush();

  // Phase 2: deliberate patterns.
  for (const [key, target] of Object.entries(PATTERN_ITEMS)) {
    await seedPattern(key, target);
    await flush();
  }

  console.log(JSON.stringify({
    restaurantId: RESTAURANT_ID,
    viewEventsInserted: totalEventsInserted,
    ordersCreated,
    orderItemsCreated,
  }, null, 2));

  await prisma.$disconnect();
  await orderService.close();
}

let totalEventsInserted = 0;
async function flush() {
  if (events.length === 0) return;
  const batch = events.splice(0, events.length);
  const BATCH = 500;
  for (let i = 0; i < batch.length; i += BATCH) {
    await prisma.viewEvent.createMany({ data: batch.slice(i, i + BATCH) });
  }
  totalEventsInserted += batch.length;
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
