#!/usr/bin/env node
'use strict';
// 6-month realistic demo dataset generator for the isolated `trump-preview`
// tenant (restaurantId='trump-preview'). Built from REAL Trump menu items at
// REAL prices only — nothing invented, nothing assigned as a target total.
// Deterministic (fixed PRNG seed) so re-runs are reproducible.
//
//   node scripts/seed-demo-preview.js                  # DRY RUN -> local JSON summary (default, no DB)
//   node scripts/seed-demo-preview.js --apply           # write to DB — trump-preview ONLY
//
// Safety: --apply is hard-blocked for any target other than 'trump-preview'.
// This script must never write demo rows into the real restaurantId='trump'
// tenant. Re-running --apply first wipes all restaurantId='trump-preview' rows
// (across every model below) so the run is idempotent — never duplicates, never
// touches anything under restaurantId='trump'. Use rollback-demo-preview.js for
// a standalone wipe without reseeding.
//
// Coverage: Tables, Guests (loyalty), Orders + OrderItems + OrderStatusHistory
// (kitchen ticket trail) + OrderRatings (feedback), Reservations (incl.
// cancelled/no-show), RecommendationEvents (AI), WaiterAssignments + Shifts.
// Payment method + refund flags live in Order.raw (no dedicated columns exist
// in the schema for either — see prisma/schema.prisma).

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env'), quiet: true });
dotenv.config({ path: path.resolve(__dirname, '..', '.env'), quiet: true });
// Local dev override: .env.local (gitignored) repoints DATABASE_URL at the local
// database so build/test work never touches prod. No-op in production (no file).
dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env.local'), override: true, quiet: true });

const ARGS = process.argv.slice(2);
const APPLY = ARGS.includes('--apply');
const TARGET = (ARGS.find(a => a.startsWith('--target=')) || '--target=trump-preview').split('=')[1];
const TAG = (ARGS.find(a => a.startsWith('--tag=')) || '--tag=demo_20260804').split('=')[1];
const OUT_DIR = path.resolve(__dirname, '..', 'backups', `seed_${TAG}`);

if (APPLY && TARGET !== 'trump-preview') {
  console.error(`REFUSING: --apply is only allowed with --target=trump-preview (got '${TARGET}'). ` +
    'This script must never write demo rows into the live trump tenant.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Deterministic PRNG (mulberry32) — fixed seed so every run is reproducible.
// ---------------------------------------------------------------------------
const SEED = 20260804;
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(SEED);
const pick = arr => arr[Math.floor(rand() * arr.length)];
function weightedPick(pool) {
  const total = pool.reduce((s, p) => s + p.w, 0);
  let r = rand() * total;
  for (const p of pool) { r -= p.w; if (r <= 0) return p.item; }
  return pool[pool.length - 1].item;
}
const chance = p => rand() < p;
const r2 = n => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------
// Real menu items, verbatim names + prices (Sites/Trump DB, restaurantId='trump',
// read 2026-08-04). Curated subset across real categories — re-verified against
// the live menu before any DB write (see verifyAgainstLiveMenu(), --apply only).
// ---------------------------------------------------------------------------
const MAIN_STEAK = [
  ['RIBEYE 380g', 369], ['FILLET 260g', 329], ['SIRLOIN 350g', 269], ['RUMP 400g', 269],
  ['T-BONE 500g', 329], ['TOMAHAWK (FRENCH CUT) 650g', 499], ['RIBEYE ON THE BONE', 449],
  ['WAGYU RIBEYE 300g', 699], ['WAGYU FILLET 300g', 749], ['WAGYU SIRLOIN 300g', 699]
];
const MAIN_SEAFOOD = [
  ['SEARED SALMON', 435], ['KINGKLIP FILLET', 365], ['HAKE & CALAMARI', 319],
  ['GRILLED HAKE', 275], ['PRAWN & CALAMARI', 339], ['HAKE & PRAWN', 349], ['FALKLANDS CALAMARI', 285]
];
const MAIN_BURGER = [
  ['CHEESE BURGER', 209], ['BACON AND CHEESE BURGER', 219], ['BBQ / PERI-PERI BEEF BURGER', 199],
  ['JALAPENO CHILLI AND CHEESE BURGER', 219], ["BACON, EGG & CHEESE BURGER", 229]
];
const MAIN_PASTA = [
  ['SPAGHETTI BOLOGNESE', 219], ['CHICKEN PASTA', 235], ['ALFREDO', 225],
  ['SEAFOOD PASTA', 279], ['BEEF FILLET PASTA', 289]
];
const MAIN_CHICKEN = [
  ['HALF CHICKEN', 199], ['CHICKEN BREAST', 225], ['MUSHROOM SAUCE CHICKEN BREAST', 239], ['FULL CHICKEN', 329]
];
const MAIN_HEARTY = [ // winter-boosted
  ["LAMB CHOPS 4's 500g", 399], ['LAMB SHANK ±850g', 449], ['PORK TOMAHAWK ±600g', 349],
  ['FULL RACK PORK LOIN RIBS ±600g', 429], ['OXTAIL', 379], ['BEEF RIBS (2 pce) 600g', 349],
  ['KUDU ±450g', 389], ['SPRINGBOK ±450g', 389]
];
const MAIN_COMBO = [
  ['MIXED GRILL', 469], ['PRIME STEAK & LAMB CHOPS', 449],
  ['PRIME STEAK & PRAWNS (Surf & Turf)', 529], ['RUMP STEAK, BOEREWORS AND RIBS', 499]
];
const STARTER_WARM = [
  ['FIRECRACKER CHICKEN WINGS (400g)', 175], ['CHICKEN TRINCHADO', 125],
  ['FLASH PAN FRIED CHICKEN LIVERS', 115], ['GARLIC LEMON CALAMARI', 145], ['BOEREWORS & CHAKALAKA', 145]
];
const STARTER_COLD = [
  ['SPRINGBOK CARPACCIO', 175], ['TRUMPS SALMON SASHIMI', 199],
  ['CALIFORNIA ROLL - SALMON (8pc)', 189], ['GREEK SALAD', 165], ['CAPRESE & AVOCADO SALAD', 149]
];
const DESSERT = [
  ['DUO OF ICE CREAM', 99], ['CAPE MALVA PUDDING', 115], ['RED VELVET CAKE', 115],
  ['DEATH BY CHOCOLATE CAKE', 119], ['CHOCOLATE BROWNIE', 115]
];
const WINE_RED = [
  ['TRUMPS', 225], ['ZONNEBLOEM', 240], ['DURBANVILLE HILLS', 225], ['RUSTENBURG', 310],
  ['MEERLUST RED', 395], ['WARWICK THREE CAPE LADIES', 350], ['KLEINE ZALZE VINEYARD SELECTION', 295]
];
const WINE_WHITE = [
  ['NEDERBURG', 195], ['DURBANVILLE HILLS', 225], ['DIEMERSDAL', 260],
  ["KEN FORRESTER OLD VINE RESERVE", 295], ['CONSTITUTION ROAD', 310]
];
const BEER = [['CASTLE', 45], ['CASTLE LITE', 45], ['STELLA ARTOIS', 55], ['HEINEKEN', 55], ['CORONA', 65]];
const COCKTAIL = [['MARGARITA', 145], ['MOJITO', 145], ['COSMOPOLITAN', 145]];
const SOFT = [['SOFT DRINKS', 35], ['ICE TEA', 39], ['FRUIT JUICES', 45]];
const MOCKTAIL = [['ORIGINAL LEMONADE', 65], ['CUCUMBER LEMONADE', 69]];
const COFFEE_DIGESTIF = [['CAPPUCCINO', 45], ['CAFÉ LATTE', 45], ['ESPRESSO DOUBLE', 45], ['IRISH COFFEE', 99], ['DOM PEDRO', 99]];
const SIDES = [['MASHED POTATOES', 65], ['CREAMED SPINACH', 65], ['ONION RINGS', 65], ['STEAKHOUSE CHIPS', 65], ['SAUTÉED MUSHROOMS WITH FRESH HERBS', 69], ['SAVOURY RICE', 55]];
const ENHANCEMENTS = [['GARLIC & SAGE BUTTER', 49], ['MUSHROOM TRUFFLE BUTTER', 49], ['THREE PEPPERCORN SAUCE', 49], ['CHIMICHURRI', 49]];

const AI_SUGGESTION_POOL = [
  ...ENHANCEMENTS.map(([n, p]) => ({ item: [n, p], w: 30 / ENHANCEMENTS.length })),
  ...SIDES.map(([n, p]) => ({ item: [n, p], w: 25 / SIDES.length })),
  ...DESSERT.map(([n, p]) => ({ item: [n, p], w: 25 / DESSERT.length })),
  ...STARTER_WARM.map(([n, p]) => ({ item: [n, p], w: 20 / STARTER_WARM.length }))
];

const WAGYU_NAMES = new Set(['WAGYU RIBEYE 300g', 'WAGYU FILLET 300g', 'WAGYU SIRLOIN 300g']);
const LUNCH_LIGHT_STEAK = [['SIRLOIN 350g', 269], ['RUMP 400g', 269]];

function dinnerMainPool() {
  return [
    ...MAIN_STEAK.map(x => ({ item: x, w: (WAGYU_NAMES.has(x[0]) ? 0.35 : 1) * (45 / MAIN_STEAK.length) })),
    ...MAIN_SEAFOOD.map(x => ({ item: x, w: 15 / MAIN_SEAFOOD.length })),
    ...MAIN_BURGER.map(x => ({ item: x, w: 7 / MAIN_BURGER.length })),
    ...MAIN_PASTA.map(x => ({ item: x, w: 8 / MAIN_PASTA.length })),
    ...MAIN_CHICKEN.map(x => ({ item: x, w: 10 / MAIN_CHICKEN.length })),
    ...MAIN_HEARTY.map(x => ({ item: x, w: 9 / MAIN_HEARTY.length })),
    ...MAIN_COMBO.map(x => ({ item: x, w: 6 / MAIN_COMBO.length }))
  ];
}
function lunchMainPool() {
  return [
    ...MAIN_BURGER.map(x => ({ item: x, w: 32 / MAIN_BURGER.length })),
    ...MAIN_PASTA.map(x => ({ item: x, w: 22 / MAIN_PASTA.length })),
    ...MAIN_CHICKEN.map(x => ({ item: x, w: 20 / MAIN_CHICKEN.length })),
    ...LUNCH_LIGHT_STEAK.map(x => ({ item: x, w: 18 / LUNCH_LIGHT_STEAK.length })),
    ...MAIN_SEAFOOD.filter(x => x[1] <= 320).map(x => ({ item: x, w: 8 / 3 }))
  ];
}
function mainPool(service) { return service === 'lunch' ? lunchMainPool() : dinnerMainPool(); }
function starterPool() {
  return [
    ...STARTER_WARM.map(x => ({ item: x, w: 57.5 / STARTER_WARM.length })),
    ...STARTER_COLD.map(x => ({ item: x, w: 40 / STARTER_COLD.length }))
  ];
}
function winePool() {
  return [
    ...WINE_RED.map(x => ({ item: x, w: 65 / WINE_RED.length })),
    ...WINE_WHITE.map(x => ({ item: x, w: 35 / WINE_WHITE.length }))
  ];
}
function drinkPool() {
  return [
    ...BEER.map(x => ({ item: x, w: 40 / BEER.length })),
    ...COCKTAIL.map(x => ({ item: x, w: 25 / COCKTAIL.length })),
    ...SOFT.map(x => ({ item: x, w: 25 / SOFT.length })),
    ...MOCKTAIL.map(x => ({ item: x, w: 10 / MOCKTAIL.length }))
  ];
}

// ---------------------------------------------------------------------------
// Table layout (invented for the demo — see SEED-NOTES.md)
// ---------------------------------------------------------------------------
function buildTables() {
  const tables = [];
  let n = 1;
  const spec = [[2, 40], [4, 24], [6, 8], [8, 3]];
  for (const [covers, count] of spec) {
    for (let i = 0; i < count; i++) {
      tables.push({ tableId: `pv${n}`, displayName: `Table ${n}`, covers, room: 'floor' });
      n++;
    }
  }
  tables.push({ tableId: 'pv-pd1', displayName: 'Private Dining 1', covers: 24, room: 'private', band: [20, 28] });
  tables.push({ tableId: 'pv-pd2', displayName: 'Private Dining 2', covers: 14, room: 'private', band: [12, 16] });
  tables.push({ tableId: 'pv-pd3', displayName: 'Private Dining 3', covers: 14, room: 'private', band: [12, 16] });
  return tables;
}
const TABLES = buildTables();
const FLOOR_TABLES = TABLES.filter(t => t.room === 'floor');
const PRIVATE_ROOMS = TABLES.filter(t => t.room === 'private');

function bestFitFloorTable(partySize) {
  const fit = FLOOR_TABLES.filter(t => t.covers >= partySize).sort((a, b) => a.covers - b.covers);
  return fit.length ? fit[0] : FLOOR_TABLES[FLOOR_TABLES.length - 1];
}

// ---------------------------------------------------------------------------
// Guests — recurring customer pool (loyalty). A handful get a higher selection
// weight so repeat visits + lifetime spend emerge naturally into VIP territory
// instead of being hand-assigned.
// ---------------------------------------------------------------------------
const GUEST_FIRST = ['Thandiwe', 'Nomvula', 'Sipho', 'Lerato', 'Kagiso', 'Boitumelo', 'Naledi', 'Kabelo', 'Zanele',
  'Ayesha', 'Priya', 'Imran', 'Fatima', 'Michael', 'Sarah', 'James', 'Emma', 'Peter', 'Johan', 'Marike', 'David',
  'Rachel', 'Daniel', 'Chloe', 'Ahmed', 'Yusuf', 'Nadia', 'Karabo', 'Refilwe', 'Thabo', 'Lindiwe', 'Bongani',
  'Precious', 'Mpho', 'Tumi', 'Sizwe', 'Nokuthula', 'Andile', 'Grace', 'Christo', 'Anél', 'Werner', 'Palesa'];
const GUEST_LAST = ['Nkosi', 'Khumalo', 'Dlamini', 'Van der Merwe', 'Botha', 'Patel', 'Naidoo', 'Pillay', 'Mokoena',
  'Sithole', 'Mahlangu', 'Van Wyk', 'Steyn', 'Wilson', 'Smith', 'Ndlovu', 'Mabaso', 'Radebe', 'Govender', 'Ismail',
  'Abrahams', 'Petersen', 'Fourie', 'Kruger', 'de Villiers', 'Molefe', 'Zulu', 'Mthembu', 'Chetty', 'Okafor'];

function buildGuestPool(count) {
  const seen = new Set();
  const guests = [];
  let attempts = 0;
  while (guests.length < count && attempts < count * 20) {
    attempts++;
    const name = `${pick(GUEST_FIRST)} ${pick(GUEST_LAST)}`;
    if (seen.has(name)) continue;
    seen.add(name);
    const idx = guests.length;
    guests.push({
      key: `g${idx}`,
      name,
      phone: `0${6 + Math.floor(rand() * 3)}${String(Math.floor(rand() * 10000000)).padStart(7, '0')}`,
      email: chance(0.5) ? `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@example.co.za` : '',
      dietary: chance(0.12) ? pick(['Vegetarian', 'Pescatarian', 'Halal', 'Gluten-free']) : '',
      allergies: chance(0.08) ? pick(['Shellfish', 'Nuts', 'Dairy']) : '',
      // Top 7 slots get a much higher selection weight -> naturally become the
      // frequent/VIP regulars once order participation is aggregated.
      weight: idx < 7 ? 6 : (idx < 30 ? 2 : 1)
    });
  }
  return guests;
}
// Pool sized so that, at the ~22% guest-attach rate below, the median guest
// visits a handful of times over 6 months and only the weighted top slice
// reads as a true regular/VIP — a small pool would flatten everyone into
// "visits weekly", which doesn't happen in a real restaurant's book.
const GUEST_POOL = buildGuestPool(500);
const GUEST_WEIGHTED = GUEST_POOL.map(g => ({ item: g, w: g.weight }));

// ---------------------------------------------------------------------------
// Waiters — recurring named roster (free-text waiterName fields, no User rows
// created — User is not restaurant-scoped and this must never touch real
// staff/login accounts).
// ---------------------------------------------------------------------------
const WAITER_NAMES = ['Thabo', 'Lerato', 'James', 'Naledi', 'Sipho', 'Ayesha', 'Kabelo', 'Zanele', 'Michael'];

// ---------------------------------------------------------------------------
// Day-of-week model (~140 covers/day blended). index 0=Sun..6=Sat
// ---------------------------------------------------------------------------
const DOW_LUNCH = [61, 33, 42, 47, 47, 54, 35];   // Sun..Sat
const DOW_DINNER = [58, 53, 64, 80, 106, 148, 154];

function jitter(mean) { return mean * (0.85 + rand() * 0.30); }

const PARTY_SIZE_POOL = [
  { item: 2, w: 45 }, { item: 3, w: 12 }, { item: 4, w: 28 }, { item: 6, w: 10 }, { item: 8, w: 5 }
];

function lunchTimestamp(date) {
  const mins = 0 + Math.floor(rand() * 180);
  const d = new Date(date); d.setUTCHours(12, 0, 0, 0);
  d.setUTCMinutes(d.getUTCMinutes() + mins);
  return d;
}
function dinnerTimestamp(date) {
  const u = rand(), v = rand();
  const skewed = (u + v) / 2;
  const mins = Math.floor(skewed * 270);
  const d = new Date(date); d.setUTCHours(18, 0, 0, 0);
  d.setUTCMinutes(d.getUTCMinutes() + mins);
  return d;
}

function acceptanceProb(service, partySize) {
  let p = 0.17;
  if (service === 'dinner') p += 0.025; else p -= 0.035;
  if (partySize >= 4) p += 0.015;
  if (partySize === 2) p -= 0.01;
  return Math.min(0.23, Math.max(0.08, p));
}

const PAYMENT_POOL = [
  { item: 'card', w: 55 }, { item: 'cash', w: 20 }, { item: 'mobile', w: 15 }, { item: 'split', w: 10 }
];

const RATING_COMMENTS = {
  5: ["Best steak in Sandton, hands down.", "Service was warm and attentive all night.", "Perfect date-night spot, will be back.", "Our waiter made the evening — five stars."],
  4: ["Really good, kitchen was a touch slow but worth the wait.", "Great food, drinks list is excellent.", "Lovely evening, would happily return."],
  3: ["Food was fine, service was a bit inconsistent.", "Decent but not what I remembered from last time.", "Table was ready late but the meal made up for it."],
  2: ["Steak was overcooked and it took a while to fix.", "Kitchen seemed overwhelmed, long wait between courses."],
  1: ["Order came out wrong and nobody checked on us after.", "Not up to standard tonight, disappointing service."]
};
const RATING_POOL = [{ item: 5, w: 45 }, { item: 4, w: 35 }, { item: 3, w: 12 }, { item: 2, w: 5 }, { item: 1, w: 3 }];

// ---------------------------------------------------------------------------
// Order builder — mechanistic: pick real items per attach-rate rolls, sum for
// total. Nothing here assigns a total directly. Also assigns a guest, waiter,
// payment method, refund flag, and an optional rating for this order.
// ---------------------------------------------------------------------------
const VAT_RATE = 0.15, SERVICE_RATE = 0.05;
let orderSeq = 0;
const DIAG = {};

function buildOrder({ date, service, table, partySize, isPrivateRoom, onDutyWaiters }) {
  orderSeq++;
  const ts = service === 'lunch' ? lunchTimestamp(date) : dinnerTimestamp(date);
  const mainAttach = service === 'dinner' ? 0.95 : 0.90;
  const starterAttach = service === 'dinner' ? 0.45 : 0.25;
  const dessertAttach = service === 'dinner' ? 0.22 : 0.09;
  const drinkAttach = service === 'dinner' ? 0.50 : 0.60;
  const coffeeAttach = service === 'dinner' ? 0.16 : 0.22;
  const sideAttach = service === 'dinner' ? 0.24 : 0.15;
  const wineAttach = service === 'dinner' ? 0.38 : 0.12;

  const items = [];
  const addItem = ([name, price], qty = 1, note = '', tag = 'other') => {
    const existing = items.find(it => it.name === name && it.note === note);
    if (existing) existing.quantity += qty;
    else items.push({ name, price, quantity: qty, note });
    DIAG[tag] = (DIAG[tag] || 0) + price * qty;
  };

  let coversWithMain = 0;
  const recoEvents = [];
  for (let c = 0; c < partySize; c++) {
    let hasMain = false;
    if (chance(mainAttach)) { addItem(weightedPick(mainPool(service)), 1, '', 'main'); coversWithMain++; hasMain = true; }
    if (chance(starterAttach)) addItem(weightedPick(starterPool()), 1, '', 'starter');
    if (chance(dessertAttach)) addItem(pick(DESSERT), 1, '', 'dessert');
    if (chance(drinkAttach)) addItem(weightedPick(drinkPool()), 1, '', 'drink');
    if (chance(coffeeAttach)) addItem(pick(COFFEE_DIGESTIF), 1, '', 'coffee');

    if (hasMain && chance(0.88)) {
      if (chance(acceptanceProb(service, partySize))) {
        const suggestedItem = weightedPick(AI_SUGGESTION_POOL);
        addItem(suggestedItem, 1, '[AI suggestion accepted]', 'aiAccept');
        recoEvents.push({ impression: true, clicked: true, accepted: true, suggestedItem });
      } else {
        recoEvents.push({ impression: true, clicked: chance(0.15), accepted: false, suggestedItem: weightedPick(AI_SUGGESTION_POOL) });
      }
    }
  }
  if (coversWithMain > 0 && chance(sideAttach)) addItem(pick(SIDES), 1, '', 'side');
  if (chance(wineAttach)) {
    const bottles = partySize >= 6 && chance(0.4) ? 2 : 1;
    addItem(weightedPick(winePool()), bottles, '', 'wine');
  }
  if (!items.length) addItem(weightedPick(mainPool(service)));

  const reco = {
    impression: recoEvents.some(e => e.impression),
    accepted: recoEvents.some(e => e.accepted),
    acceptedCount: recoEvents.filter(e => e.accepted).length,
    events: recoEvents
  };

  const subtotal = r2(items.reduce((s, it) => s + it.price * it.quantity, 0));
  const vat = r2(subtotal * VAT_RATE);
  const svc = r2(subtotal * SERVICE_RATE);
  const tip = chance(0.4) ? r2(subtotal * 0.10) : 0;
  const total = r2(subtotal + vat + svc + tip);

  // Guest assignment — ~22% of orders belong to a known/repeat guest; the rest
  // are walk-ins (guestKey null). Weighted toward the top-slot regulars/VIPs.
  const guestKey = chance(0.22) ? weightedPick(GUEST_WEIGHTED).key : null;
  const waiterName = pick(onDutyWaiters || WAITER_NAMES);
  const paymentMethod = weightedPick(PAYMENT_POOL);
  const refunded = chance(0.015);
  const rating = chance(0.35) ? weightedPick(RATING_POOL) : null;
  const comment = rating && chance(0.4) ? pick(RATING_COMMENTS[rating]) : '';

  return {
    seq: orderSeq, tableId: table.tableId, service, timestamp: ts, covers: partySize,
    isPrivateRoom: !!isPrivateRoom, items, subtotal, vat, service_: svc, tip, total, reco,
    guestKey, waiterName, paymentMethod, refunded, rating, comment
  };
}

// ---------------------------------------------------------------------------
// Main generation loop — 182 days (~6 months), ending yesterday.
// ---------------------------------------------------------------------------
const END_DATE = new Date(Date.UTC(2026, 7, 4)); // Aug 4 2026 (yesterday, per system date)
const START_DATE = new Date(END_DATE); START_DATE.setUTCDate(START_DATE.getUTCDate() - 181); // ~6 months

// Roster a subset of the full waiter list onto each service (lunch/dinner get
// independently drawn crews) instead of pooling every waiter into every order
// — a real floor runs on a rotating roster, not all 9 staff every single shift.
function pickOnDutyRoster() {
  const count = 3 + Math.floor(rand() * 3); // 3-5 on duty
  const pool = [...WAITER_NAMES];
  const roster = [];
  while (roster.length < count && pool.length) {
    const idx = Math.floor(rand() * pool.length);
    roster.push(pool.splice(idx, 1)[0]);
  }
  return roster;
}

const orders = [];
const dayTotals = [];

for (let d = new Date(START_DATE); d <= END_DATE; d.setUTCDate(d.getUTCDate() + 1)) {
  const date = new Date(d);
  const dow = date.getUTCDay();
  const isFriOrSat = dow === 5 || dow === 6;

  let dayRevenue = 0, dayCovers = 0, dayOrders = 0;

  for (const service of ['lunch', 'dinner']) {
    const onDutyWaiters = pickOnDutyRoster();
    const mean = service === 'lunch' ? DOW_LUNCH[dow] : DOW_DINNER[dow];
    const targetCovers = Math.round(jitter(mean));
    let covered = 0;
    while (covered < targetCovers) {
      const partySize = weightedPick(PARTY_SIZE_POOL);
      const table = bestFitFloorTable(partySize);
      const order = buildOrder({ date, service, table, partySize, onDutyWaiters });
      orders.push(order);
      covered += partySize;
      dayRevenue += order.total; dayCovers += partySize; dayOrders++;
    }
    if (service === 'dinner' && isFriOrSat && chance(0.6)) {
      const room = pick(PRIVATE_ROOMS);
      const size = room.band[0] + Math.floor(rand() * (room.band[1] - room.band[0] + 1));
      const order = buildOrder({ date, service, table: room, partySize: size, isPrivateRoom: true, onDutyWaiters });
      orders.push(order);
      dayRevenue += order.total; dayCovers += size; dayOrders++;
    }
  }

  dayTotals.push({ date: date.toISOString().slice(0, 10), revenue: r2(dayRevenue), covers: dayCovers, orders: dayOrders });
}

const sortedByCovers = [...dayTotals].sort((a, b) => a.covers - b.covers);
const quietestDay = sortedByCovers[0];
const busiestDay = sortedByCovers[sortedByCovers.length - 1];

// A handful of 'active' orders on the final day for floor-view realism.
const activeOrders = [];
for (let i = 0; i < 10; i++) {
  const partySize = weightedPick(PARTY_SIZE_POOL);
  const table = bestFitFloorTable(partySize);
  const order = buildOrder({ date: END_DATE, service: 'dinner', table, partySize });
  order.statusOverride = 'active';
  order.rating = null; order.comment = ''; // no ratings on in-progress orders
  activeOrders.push(order);
}

const allOrders = [...orders, ...activeOrders];

// ---------------------------------------------------------------------------
// Guest aggregation — computed purely from generated order participation.
// ---------------------------------------------------------------------------
const guestStats = new Map(); // key -> {orders:[], }
for (const o of orders) { // history orders only — active orders haven't "visited" yet in any settled sense
  if (!o.guestKey) continue;
  if (!guestStats.has(o.guestKey)) guestStats.set(o.guestKey, []);
  guestStats.get(o.guestKey).push(o);
}
const guestsUsed = GUEST_POOL.filter(g => guestStats.has(g.key)).map(g => {
  const os = guestStats.get(g.key);
  const visitCount = os.length;
  const lifetimeSpend = r2(os.reduce((s, o) => s + o.total, 0));
  const avgSpend = r2(lifetimeSpend / visitCount);
  const lastVisitAt = new Date(Math.max(...os.map(o => o.timestamp.getTime())));
  // Thresholds calibrated against this seed's actual order-value scale
  // (avg order ~R1700-2500, table orders not per-cover) — see dry-run output,
  // not a priori guesses.
  const vip = lifetimeSpend >= 35000 || visitCount >= 18;
  const loyaltyTier = lifetimeSpend >= 35000 ? 'Platinum' : lifetimeSpend >= 14000 ? 'Gold' : lifetimeSpend >= 4000 ? 'Silver' : 'Bronze';
  return { ...g, visitCount, lifetimeSpend, avgSpend, lastVisitAt, vip, loyaltyTier };
});

// ---------------------------------------------------------------------------
// Reservations — most materialize into an order (status='completed'); a
// separate batch never shows up (cancelled/no-show), spread across the period.
// ---------------------------------------------------------------------------
const reservations = [];
for (const o of orders) {
  if (o.service !== 'dinner') continue;
  const p = o.guestKey ? 0.55 : 0.12; // guest-linked dinners book ahead more often than walk-ins
  if (!chance(p)) continue;
  const guest = o.guestKey ? GUEST_POOL.find(g => g.key === o.guestKey) : null;
  reservations.push({
    name: guest ? guest.name : `Walk-in party (${pick(WAITER_NAMES)}'s table)`,
    phone: guest ? guest.phone : '',
    partySize: o.covers,
    date: o.timestamp,
    status: 'completed',
    tableId: o.tableId,
    notes: '[DEMO] materialized into an order'
  });
}
// Cancellations / no-shows that never became an order.
const NO_SHOW_NAMES = ['Corporate booking', 'Anniversary party', 'Birthday group', 'Family dinner', 'Business lunch'];
let cancelCount = Math.round(reservations.length * 0.08 / 0.92); // ~8% of all reservation attempts
for (let i = 0; i < cancelCount; i++) {
  const d = new Date(START_DATE.getTime() + rand() * (END_DATE.getTime() - START_DATE.getTime()));
  const isDinner = chance(0.75);
  const ts = isDinner ? dinnerTimestamp(d) : lunchTimestamp(d);
  reservations.push({
    name: `${pick(GUEST_FIRST)} ${pick(GUEST_LAST)}`, phone: '', partySize: weightedPick(PARTY_SIZE_POOL),
    date: ts, status: chance(0.35) ? 'no_show' : 'cancelled', tableId: '',
    notes: `[DEMO] ${pick(NO_SHOW_NAMES)} — did not arrive`
  });
}

// ---------------------------------------------------------------------------
// Waiter shifts — one row per (waiter, calendar day) they worked, aggregated
// from the orders they were assigned in buildOrder().
// ---------------------------------------------------------------------------
const shiftMap = new Map(); // "waiter|date" -> {orders:[]}
for (const o of orders) {
  const dayKey = o.timestamp.toISOString().slice(0, 10);
  const k = `${o.waiterName}|${dayKey}`;
  if (!shiftMap.has(k)) shiftMap.set(k, []);
  shiftMap.get(k).push(o);
}

// ---------------------------------------------------------------------------
// Summary computation — EVERYTHING below is computed from the generated data.
// ---------------------------------------------------------------------------
const totalOrders = orders.length;
const totalCovers = orders.reduce((s, o) => s + o.covers, 0);
const totalRevenue = r2(orders.reduce((s, o) => s + o.total, 0));
const avgCheckPerCover = r2(totalRevenue / totalCovers);

const allEvents = orders.flatMap(o => o.reco.events);
const impressionEvents = allEvents.filter(e => e.impression);
const acceptedEvents = allEvents.filter(e => e.accepted);
const acceptanceRate = impressionEvents.length ? r2(acceptedEvents.length / impressionEvents.length) : 0;

const accepted = orders.filter(o => o.reco.accepted);
const notAccepted = orders.filter(o => !o.reco.accepted);
const avgOrderValueAccepted = accepted.length ? r2(accepted.reduce((s, o) => s + o.total, 0) / accepted.length) : 0;
const avgOrderValueNotAccepted = notAccepted.length ? r2(notAccepted.reduce((s, o) => s + o.total, 0) / notAccepted.length) : 0;
const upliftA_pct = avgOrderValueNotAccepted ? r2(((avgOrderValueAccepted - avgOrderValueNotAccepted) / avgOrderValueNotAccepted) * 100) : 0;

const acceptedSuggestionRevenue = r2(acceptedEvents.reduce((s, e) => s + e.suggestedItem[1], 0));
const upliftB1_perCover = r2(acceptedSuggestionRevenue / totalCovers);

const dishRevenue = new Map();
for (const o of orders) for (const it of o.items) dishRevenue.set(it.name, (dishRevenue.get(it.name) || 0) + it.price * it.quantity);
const topDishes = [...dishRevenue.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, rev]) => ({ name, revenue: r2(rev) }));

const hourCounts = new Array(24).fill(0);
for (const o of orders) hourCounts[o.timestamp.getUTCHours()]++;
const busiestHour = hourCounts.indexOf(Math.max(...hourCounts));

const ratedOrders = orders.filter(o => o.rating != null);
const avgRating = ratedOrders.length ? r2(ratedOrders.reduce((s, o) => s + o.rating, 0) / ratedOrders.length) : 0;

const summary = {
  seed: SEED, target: TARGET, tag: TAG, period: { start: START_DATE.toISOString().slice(0, 10), end: END_DATE.toISOString().slice(0, 10) },
  totalOrders, totalCovers, avgCoversPerDay: r2(totalCovers / dayTotals.length),
  avgCheckPerCover, totalRevenue, monthlyRevenueEstimate: r2(totalRevenue / (dayTotals.length / 30.4)),
  suggestionAcceptanceRate: acceptanceRate,
  avgOrderValueAccepted, avgOrderValueNotAccepted, upliftA_pct,
  acceptedSuggestionRevenue, upliftB1_perCover,
  topDishesByRevenue: topDishes,
  busiestDay: { date: busiestDay.date, covers: busiestDay.covers, revenue: busiestDay.revenue },
  quietestDay: { date: quietestDay.date, covers: quietestDay.covers, revenue: quietestDay.revenue },
  busiestHourUTC: busiestHour,
  activeOrdersCount: activeOrders.length,
  privateRoomBookings: orders.filter(o => o.isPrivateRoom).length,
  guests: { total: guestsUsed.length, vip: guestsUsed.filter(g => g.vip).length,
    byTier: ['Platinum', 'Gold', 'Silver', 'Bronze'].map(t => ({ tier: t, count: guestsUsed.filter(g => g.loyaltyTier === t).length })) },
  reservations: { total: reservations.length, completed: reservations.filter(r => r.status === 'completed').length,
    cancelled: reservations.filter(r => r.status === 'cancelled').length, noShow: reservations.filter(r => r.status === 'no_show').length },
  ratings: { count: ratedOrders.length, avgRating },
  refundedOrders: orders.filter(o => o.refunded).length,
  waiterShifts: shiftMap.size,
  paymentMix: PAYMENT_POOL.map(p => ({ method: p.item, count: orders.filter(o => o.paymentMethod === p.item).length }))
};

// ---------------------------------------------------------------------------
// Output (always written — cheap, and useful as a record even after --apply)
// ---------------------------------------------------------------------------
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, 'orders.json'), JSON.stringify(allOrders, null, 2));
fs.writeFileSync(path.join(OUT_DIR, 'tables.json'), JSON.stringify(TABLES, null, 2));
fs.writeFileSync(path.join(OUT_DIR, 'summary.json'), JSON.stringify(summary, null, 2));
fs.writeFileSync(path.join(OUT_DIR, 'daily-totals.json'), JSON.stringify(dayTotals, null, 2));
fs.writeFileSync(path.join(OUT_DIR, 'guests.json'), JSON.stringify(guestsUsed, null, 2));
fs.writeFileSync(path.join(OUT_DIR, 'reservations.json'), JSON.stringify(reservations, null, 2));

console.log(`\n=== ${APPLY ? 'APPLY' : 'DRY RUN'} — target=${TARGET} tag=${TAG} ===`);
console.log('Output dir:', OUT_DIR);
console.log('\n=== SUMMARY ===');
console.log(JSON.stringify(summary, null, 2));

console.log('\n=== DIAG: revenue by category, per cover ===');
for (const [tag, rev] of Object.entries(DIAG).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${tag.padEnd(10)} total=R${Math.round(rev)}  per-cover=R${(rev / totalCovers).toFixed(2)}`);
}

console.log('\n=== LAST 14 DAYS DAILY TOTALS ===');
for (const d of dayTotals.slice(-14)) console.log(`  ${d.date}  covers=${d.covers.toString().padStart(3)}  orders=${d.orders.toString().padStart(3)}  revenue=R${d.revenue}`);

if (!APPLY) {
  console.log('\nDRY RUN complete — nothing written to any database. Re-run with --apply to write to trump-preview.');
  process.exit(0);
}

// ---------------------------------------------------------------------------
// --apply — write everything to Postgres under restaurantId='trump-preview'.
// ---------------------------------------------------------------------------
async function verifyAgainstLiveMenu(prisma) {
  const menu = await prisma.menuItem.findMany({ where: { restaurantId: 'trump' }, select: { name: true, price: true } });
  const byName = new Map(menu.map(m => [m.name, Number(m.price)]));
  const usedNames = new Set();
  for (const list of [MAIN_STEAK, MAIN_SEAFOOD, MAIN_BURGER, MAIN_PASTA, MAIN_CHICKEN, MAIN_HEARTY, MAIN_COMBO,
    STARTER_WARM, STARTER_COLD, DESSERT, WINE_RED, WINE_WHITE, BEER, COCKTAIL, SOFT, MOCKTAIL, COFFEE_DIGESTIF,
    SIDES, ENHANCEMENTS]) {
    for (const [name, price] of list) usedNames.add(JSON.stringify([name, price]));
  }
  const mismatches = [];
  for (const entry of usedNames) {
    const [name, price] = JSON.parse(entry);
    if (!byName.has(name)) { mismatches.push(`MISSING from live menu: ${name}`); continue; }
    if (Math.abs(byName.get(name) - price) > 0.01) mismatches.push(`PRICE DRIFT: ${name} seed=${price} live=${byName.get(name)}`);
  }
  if (mismatches.length) {
    console.error(`\nverifyAgainstLiveMenu FAILED (${mismatches.length} issue(s)):`);
    mismatches.slice(0, 30).forEach(m => console.error('  ' + m));
    throw new Error('menu verification failed — aborting --apply before any write');
  }
  console.log(`verifyAgainstLiveMenu OK — ${usedNames.size} item/price pairs match the live trump menu.`);
}

async function wipeExistingPreview(prisma) {
  const before = await prisma.order.count({ where: { restaurantId: 'trump-preview' } });
  if (before === 0) { console.log('no prior trump-preview data — fresh seed.'); return; }
  console.log(`wiping ${before} prior trump-preview order(s) and related rows for a clean idempotent reseed...`);
  await prisma.order.deleteMany({ where: { restaurantId: 'trump-preview' } }); // cascades items/history/rating
  await prisma.recommendationEvent.deleteMany({ where: { restaurantId: 'trump-preview' } });
  await prisma.reservation.deleteMany({ where: { restaurantId: 'trump-preview' } });
  await prisma.waiterAssignment.deleteMany({ where: { restaurantId: 'trump-preview' } });
  await prisma.shift.deleteMany({ where: { restaurantId: 'trump-preview' } });
  await prisma.guest.deleteMany({ where: { restaurantId: 'trump-preview' } });
  await prisma.table.deleteMany({ where: { restaurantId: 'trump-preview' } });
  console.log('wipe complete.');
}

async function applyToDb() {
  const { getPrisma } = require('../server/services/prismaClient');
  const prisma = getPrisma();

  await verifyAgainstLiveMenu(prisma);
  await wipeExistingPreview(prisma);

  console.log('\n1/7 creating tables...');
  for (const t of TABLES) {
    await prisma.table.create({
      data: { restaurantId: 'trump-preview', tableId: t.tableId, displayName: t.displayName, covers: t.covers, status: 'active', metadata: { seedBatch: TAG, room: t.room } }
    });
  }

  console.log('2/7 creating guests...');
  const guestIdByKey = new Map();
  for (const g of guestsUsed) {
    const row = await prisma.guest.create({
      data: {
        restaurantId: 'trump-preview', name: g.name, phone: g.phone, email: g.email, vip: g.vip,
        loyaltyTier: g.loyaltyTier, dietary: g.dietary, allergies: g.allergies,
        visitCount: g.visitCount, lifetimeSpend: g.lifetimeSpend, avgSpend: g.avgSpend, lastVisitAt: g.lastVisitAt,
        notes: '[DEMO] seeded loyalty guest'
      }
    });
    guestIdByKey.set(g.key, row.id);
  }
  console.log(`   ${guestIdByKey.size} guest(s) created (${guestsUsed.filter(g => g.vip).length} VIP).`);

  console.log('3/7 creating orders (items, kitchen-ticket history, ratings)...');
  const recoEventRows = [];
  const waiterAssignmentRows = [];
  let created = 0;
  for (const o of allOrders) {
    const isActive = o.statusOverride === 'active';
    const status = isActive ? 'active' : 'history';
    const kitchenStatus = isActive ? 'preparing' : 'served';
    const ticketOpenedAt = new Date(o.timestamp.getTime() - 20 * 60 * 1000);
    const filename = `${TAG}_pv_${o.tableId}_${o.timestamp.getTime()}_${o.seq}.json`;

    const savedOrder = await prisma.order.create({
      data: {
        restaurantId: 'trump-preview', filename, tableId: o.tableId, status, kitchenStatus,
        waiterName: o.waiterName, notes: o.isPrivateRoom ? '[DEMO] private dining booking' : '',
        subtotal: o.subtotal, vat: o.vat, service: o.service_, tip: o.tip, total: o.total, covers: o.covers,
        timestamp: o.timestamp, sourceKind: status,
        guestId: o.guestKey ? guestIdByKey.get(o.guestKey) || null : null,
        raw: { seedBatch: TAG, paymentMethod: o.paymentMethod, refunded: o.refunded, refundReason: o.refunded ? pick(['kitchen error', 'guest complaint', 'duplicate charge']) : '' },
        items: { create: o.items.map((it, idx) => ({ name: it.name, price: it.price, quantity: it.quantity, note: it.note, sortOrder: idx })) },
        statusHistory: {
          create: isActive
            ? [{ toStatus: 'new', actor: 'system', reason: 'order_saved', createdAt: ticketOpenedAt }]
            : [
              { toStatus: 'new', actor: 'system', reason: 'order_saved', createdAt: ticketOpenedAt },
              { fromStatus: 'new', toStatus: 'served', actor: 'system', reason: 'kitchen_ticket_completed', createdAt: new Date(o.timestamp.getTime() - 2 * 60 * 1000) },
              { fromStatus: 'served', toStatus: 'history', actor: 'system', reason: 'order_closed', createdAt: o.timestamp }
            ]
        },
        rating: (!isActive && o.rating != null) ? { create: { restaurantId: 'trump-preview', rating: o.rating, comment: o.comment, tableId: o.tableId, createdAt: new Date(o.timestamp.getTime() + 15 * 60 * 1000) } } : undefined
      }
    });

    for (const e of o.reco.events) {
      const base = { restaurantId: 'trump-preview', source: 'ai_suggestion', recType: 'UPSELL', recommendedName: e.suggestedItem[0], sessionId: `${TAG}:order${o.seq}`, tableId: o.tableId, mode: 'customer' };
      recoEventRows.push({ ...base, eventType: 'impression', value: 0, createdAt: o.timestamp });
      if (e.clicked) recoEventRows.push({ ...base, eventType: 'click', value: 0, createdAt: o.timestamp });
      if (e.accepted) recoEventRows.push({ ...base, eventType: 'accepted', value: e.suggestedItem[1], createdAt: o.timestamp });
    }

    waiterAssignmentRows.push({
      restaurantId: 'trump-preview', tableId: o.tableId, waiterName: o.waiterName, status: isActive ? 'active' : 'released',
      assignedAt: new Date(o.timestamp.getTime() - 15 * 60 * 1000), releasedAt: isActive ? null : new Date(o.timestamp.getTime() + 30 * 60 * 1000),
      changeType: 'assign', assignedBy: 'system', metadata: { seedBatch: TAG }
    });

    created++;
    if (created % 500 === 0) console.log(`   ${created}/${allOrders.length} orders written...`);
  }
  console.log(`   ${created} orders written.`);

  console.log('4/7 creating recommendation events...');
  for (let i = 0; i < recoEventRows.length; i += 500) {
    await prisma.recommendationEvent.createMany({ data: recoEventRows.slice(i, i + 500) });
  }
  console.log(`   ${recoEventRows.length} recommendation event(s) created.`);

  console.log('5/7 creating waiter assignments...');
  for (let i = 0; i < waiterAssignmentRows.length; i += 500) {
    await prisma.waiterAssignment.createMany({ data: waiterAssignmentRows.slice(i, i + 500) });
  }
  console.log(`   ${waiterAssignmentRows.length} waiter assignment(s) created.`);

  console.log('6/7 creating shifts...');
  let shiftsCreated = 0;
  for (const [k, os] of shiftMap.entries()) {
    const [waiterName, dayKey] = k.split('|');
    const times = os.map(o => o.timestamp.getTime());
    const startedAt = new Date(Math.min(...times) - 30 * 60 * 1000);
    const endedAt = new Date(Math.max(...times) + 45 * 60 * 1000);
    const revenueHandled = r2(os.reduce((s, o) => s + o.total, 0));
    await prisma.shift.create({
      data: {
        restaurantId: 'trump-preview', username: waiterName, role: 'waiter', status: 'ended',
        startedAt, endedAt, startedBy: 'self', endedBy: 'self', endReason: 'shift_complete',
        ordersHandled: os.length, revenueHandled,
        metadata: { seedBatch: TAG, demoSeed: true, date: dayKey }
      }
    });
    shiftsCreated++;
  }
  console.log(`   ${shiftsCreated} shift(s) created.`);

  console.log('7/7 creating reservations...');
  const reservationRows = reservations.map(r => ({
    restaurantId: 'trump-preview', name: r.name, phone: r.phone, partySize: r.partySize, date: r.date,
    notes: r.notes, status: r.status, tableId: r.tableId
  }));
  for (let i = 0; i < reservationRows.length; i += 500) {
    await prisma.reservation.createMany({ data: reservationRows.slice(i, i + 500) });
  }
  console.log(`   ${reservationRows.length} reservation(s) created.`);

  console.log('\n=== VERIFICATION ===');
  const counts = {
    tables: await prisma.table.count({ where: { restaurantId: 'trump-preview' } }),
    guests: await prisma.guest.count({ where: { restaurantId: 'trump-preview' } }),
    orders: await prisma.order.count({ where: { restaurantId: 'trump-preview' } }),
    orderItems: await prisma.orderItem.count({ where: { order: { restaurantId: 'trump-preview' } } }),
    ratings: await prisma.orderRating.count({ where: { restaurantId: 'trump-preview' } }),
    reservations: await prisma.reservation.count({ where: { restaurantId: 'trump-preview' } }),
    recommendationEvents: await prisma.recommendationEvent.count({ where: { restaurantId: 'trump-preview' } }),
    waiterAssignments: await prisma.waiterAssignment.count({ where: { restaurantId: 'trump-preview' } }),
    shifts: await prisma.shift.count({ where: { restaurantId: 'trump-preview' } }),
    revenueSum: (await prisma.order.aggregate({ where: { restaurantId: 'trump-preview', status: 'history' }, _sum: { total: true } }))._sum.total
  };
  console.log(JSON.stringify(counts, null, 2));
  const untouchedTrump = await prisma.order.count({ where: { restaurantId: 'trump' } });
  console.log(`\nSanity: restaurantId='trump' order count unaffected by this run (informational, not before/after diffed here): ${untouchedTrump}`);

  fs.writeFileSync(path.join(OUT_DIR, 'apply-verification.json'), JSON.stringify(counts, null, 2));
  await prisma.$disconnect();
}

applyToDb().catch(e => { console.error('\nAPPLY FAILED:', e); process.exit(1); });
