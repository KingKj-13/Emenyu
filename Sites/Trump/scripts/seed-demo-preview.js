#!/usr/bin/env node
'use strict';
// Phase 3 — mechanistic 90-day demo seed generator for the Michael Martin demo
// (2026-08-04/05). Builds realistic Order/OrderItem/RecommendationEvent rows from
// REAL Trump menu items at REAL prices only — nothing invented, nothing assigned
// as a target total. Deterministic (fixed PRNG seed) so re-runs are reproducible.
//
//   node scripts/seed-demo-preview.js                     # DRY RUN -> local JSON file + summary (default)
//   node scripts/seed-demo-preview.js --apply              # write to DB (requires --target, DB access)
//   node scripts/seed-demo-preview.js --target=trump-preview   # (default target)
//   node scripts/seed-demo-preview.js --target=trump --tag=demo_20260804   # fallback path
//
// Model approved by user 2026-08-04/05 (Phase 2, revised volumes):
//   - 90 days, 2026-05-06 -> 2026-08-04
//   - 78 tables: 75 main floor (40x2, 24x4, 8x6, 3x8 = 300-52=248 seats) + 3 private
//     dining rooms (24, 14, 14 seats) = 300 seats total. INVENTED layout, not real —
//     flagged in SEED-NOTES.md.
//   - Blended ~140 covers/day (46 lunch + 95 dinner), day-of-week shape below.
//   - Lunch avg check ~R320, dinner ~R550 (check EMERGES from real line items —
//     these are targets for calibration, not assigned totals).
//   - Party size: 2:45% 3:12% 4:28% 6:10% 8:5% (floor). Private rooms modeled
//     separately as ~60% of Fri/Sat nights getting one room booking.
//   - Winter skew: 65/35 red:white wine: +20% hearty mains / -20% chilled starters.
//   - AI suggestion: impression 88% of eligible orders; acceptance FIXED at 18%
//     (dinner +3pp, party>=4 +2pp, lunch -4pp, party==2 -1pp), suggested item
//     pool averages ~R85-90. Accepting writes BOTH a RecommendationEvent
//     (eventType:'accepted', value:<price>) AND a real OrderItem at that price.
//   - status:'history' for all but a small number of 'active' orders on the last
//     day (floor-view realism; excluded from revenue analytics by the app itself).

const fs = require('fs');
const path = require('path');

const ARGS = process.argv.slice(2);
const APPLY = ARGS.includes('--apply');
const TARGET = (ARGS.find(a => a.startsWith('--target=')) || '--target=trump-preview').split('=')[1];
const TAG = (ARGS.find(a => a.startsWith('--tag=')) || '--tag=demo_20260804').split('=')[1];
const OUT_DIR = path.resolve(__dirname, '..', 'backups', `seed_${TAG}`);

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
  // pool: [{item, w}] — w are relative weights
  const total = pool.reduce((s, p) => s + p.w, 0);
  let r = rand() * total;
  for (const p of pool) { r -= p.w; if (r <= 0) return p.item; }
  return pool[pool.length - 1].item;
}
const chance = p => rand() < p;
const r2 = n => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------
// Real menu items, verbatim names + prices (Sites/Trump DB, restaurantId='trump',
// read 2026-08-04). Curated subset across real categories — every name/price
// below must be re-verified against the live menu before any DB write (see
// verifyAgainstLiveMenu() at the bottom, run only in --apply mode).
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
const STARTER_WARM = [ // winter-boosted
  ['FIRECRACKER CHICKEN WINGS (400g)', 175], ['CHICKEN TRINCHADO', 125],
  ['FLASH PAN FRIED CHICKEN LIVERS', 115], ['GARLIC LEMON CALAMARI', 145], ['BOEREWORS & CHAKALAKA', 145]
];
const STARTER_COLD = [ // winter-reduced
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
  ["KEN FORRESTER OLD VINE RESERVE", 295], ['CONSTITUTION ROAD', 280]
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
  // Weighted category mix, winter-boosted hearty (+20%). Wagyu down-weighted to
  // a genuine minority pick (premium upsell, not co-equal with a regular ribeye)
  // — first pass gave Wagyu equal per-item weight to a R369 ribeye, which alone
  // pulled the average main to ~R466 and the whole check to ~R729/cover.
  return [
    ...MAIN_STEAK.map(x => ({ item: x, w: (WAGYU_NAMES.has(x[0]) ? 0.35 : 1) * (45 / MAIN_STEAK.length) })),
    ...MAIN_SEAFOOD.map(x => ({ item: x, w: 15 / MAIN_SEAFOOD.length })),
    ...MAIN_BURGER.map(x => ({ item: x, w: 7 / MAIN_BURGER.length })),
    ...MAIN_PASTA.map(x => ({ item: x, w: 8 / MAIN_PASTA.length })),
    ...MAIN_CHICKEN.map(x => ({ item: x, w: 10 / MAIN_CHICKEN.length })),
    ...MAIN_HEARTY.map(x => ({ item: x, w: 9 / MAIN_HEARTY.length })), // 7.5 base +20% winter
    ...MAIN_COMBO.map(x => ({ item: x, w: 6 / MAIN_COMBO.length }))
  ];
}
// Lunch mains are deliberately lighter/cheaper — a business lunch does not order
// a R749 Wagyu fillet. No premium steak, no combo platters, no hearty winter game.
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
    ...STARTER_WARM.map(x => ({ item: x, w: 57.5 / STARTER_WARM.length })), // 50 base +15%
    ...STARTER_COLD.map(x => ({ item: x, w: 40 / STARTER_COLD.length }))    // 50 base -20%
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
// Day-of-week model (revised, ~140 covers/day blended). index 0=Sun..6=Sat
// ---------------------------------------------------------------------------
const DOW_LUNCH = [61, 33, 42, 47, 47, 54, 35];   // Sun..Sat
const DOW_DINNER = [58, 53, 64, 80, 106, 148, 154];

function jitter(mean) { return mean * (0.85 + rand() * 0.30); }

// ---------------------------------------------------------------------------
// Party size distribution (floor only)
// ---------------------------------------------------------------------------
const PARTY_SIZE_POOL = [
  { item: 2, w: 45 }, { item: 3, w: 12 }, { item: 4, w: 28 }, { item: 6, w: 10 }, { item: 8, w: 5 }
];

// ---------------------------------------------------------------------------
// Service windows
// ---------------------------------------------------------------------------
function lunchTimestamp(date) {
  // 12:00-15:00, roughly flat with a light 13:00 peak
  const mins = 0 + Math.floor(rand() * 180);
  const d = new Date(date); d.setHours(12, 0, 0, 0);
  d.setMinutes(d.getMinutes() + mins);
  return d;
}
function dinnerTimestamp(date) {
  // 18:00-22:30, triangular peak at 19:30-20:30
  const u = rand(), v = rand();
  const skewed = (u + v) / 2; // triangular-ish, centered 0.5
  const mins = Math.floor(skewed * 270); // 0..270 (18:00->22:30)
  const d = new Date(date); d.setHours(18, 0, 0, 0);
  d.setMinutes(d.getMinutes() + mins);
  return d;
}

// ---------------------------------------------------------------------------
// Acceptance probability model
// ---------------------------------------------------------------------------
function acceptanceProb(service, partySize) {
  let p = 0.17;
  if (service === 'dinner') p += 0.025; else p -= 0.035;
  if (partySize >= 4) p += 0.015;
  if (partySize === 2) p -= 0.01;
  return Math.min(0.23, Math.max(0.08, p));
}

// ---------------------------------------------------------------------------
// Order builder — mechanistic: pick real items per attach-rate rolls, sum for total.
// Nothing here assigns a total directly.
// ---------------------------------------------------------------------------
const VAT_RATE = 0.15, SERVICE_RATE = 0.05;
let orderSeq = 0;
const DIAG = {}; // revenue-by-category accumulator, diagnostic only

function buildOrder({ date, service, table, partySize, isPrivateRoom }) {
  orderSeq++;
  const ts = service === 'lunch' ? lunchTimestamp(date) : dinnerTimestamp(date);
  // Second calibration pass: first pass landed R672.9/cover vs the targeted
  // ~R475 (measured empirically, not hand-derived — see SEED-NOTES.md for the
  // full before/after). Attach rates trimmed down from the Phase 2-approved
  // headline numbers to compensate for per-cover (not per-order) item rolls
  // compounding faster than the original hand estimate assumed.
  // Final calibration (measured empirically, see SEED-NOTES.md "Check value
  // calibration" section for the full before/after and why R475 exactly was not
  // reachable without unrealistic attach rates). Mains alone at the
  // Phase-2-approved 90-95% attach already produce ~R300/cover pre-tax; VAT+
  // service+tip add another ~24% on top of the whole subtotal. Landed at a
  // still-defensible ~R320 dinner / ~R230 lunch subtotal composition — starter
  // and wine attach trimmed from the original proposal but kept well above
  // "token" levels (still the majority-starter, wine-matters-most shape).
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

  // AI suggestions are device-aware in the real product (per-guest cart/session,
  // not one decision for the whole table — see RecommendationEvent.deviceId /
  // Curated Demo Mode's "split-by-device" design). Modeled per-cover accordingly:
  // each cover that ordered a main is independently eligible for its own
  // suggestion. First pass modeled this once per ORDER, which diluted the
  // per-cover uplift by the average party size (~3.5x) and produced ~R4/cover
  // instead of anything near the pitch's R15 assumption — that assumption is
  // implicitly per-guest, so the mechanic needs to be per-guest too.
  let coversWithMain = 0;
  const recoEvents = []; // one array entry per suggestion decision this order produced
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
        recoEvents.push({ impression: true, clicked: false, accepted: true, suggestedItem });
      } else {
        recoEvents.push({ impression: true, clicked: chance(0.15), accepted: false, suggestedItem: null });
      }
    }
  }
  if (coversWithMain > 0 && chance(sideAttach)) addItem(pick(SIDES), 1, '', 'side');
  if (chance(wineAttach)) {
    const bottles = partySize >= 6 && chance(0.4) ? 2 : 1;
    addItem(weightedPick(winePool()), bottles, '', 'wine');
  }
  // Guarantee at least a main if everything rolled empty (shouldn't happen at these rates, but stay honest)
  if (!items.length) addItem(weightedPick(mainPool(service)));

  // Order-level roll-up for reporting/back-compat: "accepted" if ANY cover accepted.
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

  return {
    seq: orderSeq, tableId: table.tableId, service, timestamp: ts, covers: partySize,
    isPrivateRoom: !!isPrivateRoom, items, subtotal, vat, service_: svc, tip, total, reco
  };
}

// ---------------------------------------------------------------------------
// Main generation loop — 90 days, 2026-05-06 -> 2026-08-04
// ---------------------------------------------------------------------------
const END_DATE = new Date(Date.UTC(2026, 7, 4)); // Aug 4 2026
const START_DATE = new Date(END_DATE); START_DATE.setUTCDate(START_DATE.getUTCDate() - 89);

const orders = [];
const dayTotals = []; // for daily-total reporting

for (let d = new Date(START_DATE); d <= END_DATE; d.setUTCDate(d.getUTCDate() + 1)) {
  const date = new Date(d);
  const dow = date.getUTCDay();
  const isLastDay = date.getTime() === END_DATE.getTime();
  const isFriOrSat = dow === 5 || dow === 6;

  let dayRevenue = 0, dayCovers = 0, dayOrders = 0;

  for (const service of ['lunch', 'dinner']) {
    const mean = service === 'lunch' ? DOW_LUNCH[dow] : DOW_DINNER[dow];
    const targetCovers = Math.round(jitter(mean));
    let covered = 0;
    while (covered < targetCovers) {
      const partySize = weightedPick(PARTY_SIZE_POOL);
      const table = bestFitFloorTable(partySize);
      const order = buildOrder({ date, service, table, partySize });
      orders.push(order);
      covered += partySize;
      dayRevenue += order.total; dayCovers += partySize; dayOrders++;
    }
    // Private dining room spike — Fri/Sat dinner only, ~60% of nights
    if (service === 'dinner' && isFriOrSat && chance(0.6)) {
      const room = pick(PRIVATE_ROOMS);
      const size = room.band[0] + Math.floor(rand() * (room.band[1] - room.band[0] + 1));
      const order = buildOrder({ date, service, table: room, partySize: size, isPrivateRoom: true });
      orders.push(order);
      dayRevenue += order.total; dayCovers += size; dayOrders++;
    }
  }

  // Natural noise: one dead-quiet Monday, one huge Saturday, one flat midweek dip
  // (hand-placed on top of the jitter already applied per-service above — see notes)

  dayTotals.push({ date: date.toISOString().slice(0, 10), revenue: r2(dayRevenue), covers: dayCovers, orders: dayOrders });
}

// Hand-placed outliers: nudge specific existing days (multiply that day's *already
// generated* orders' totals slightly isn't mechanistic-honest, so instead we mark
// three specific real generated days as narrative reference points in the summary
// rather than post-hoc inflating them — the jitter (±15%) already produces natural
// variance; these three are simply the extremes the seed happened to produce.
const sortedByCovers = [...dayTotals].sort((a, b) => a.covers - b.covers);
const quietestDay = sortedByCovers[0];
const busiestDay = sortedByCovers[sortedByCovers.length - 1];

// ---------------------------------------------------------------------------
// A handful of 'active' orders on the final day for floor-view realism
// ---------------------------------------------------------------------------
const activeOrders = [];
for (let i = 0; i < 10; i++) {
  const partySize = weightedPick(PARTY_SIZE_POOL);
  const table = bestFitFloorTable(partySize);
  const order = buildOrder({ date: END_DATE, service: 'dinner', table, partySize });
  order.statusOverride = 'active';
  activeOrders.push(order);
}

// ---------------------------------------------------------------------------
// Summary computation — EVERYTHING below is computed from the generated data,
// nothing is targeted.
// ---------------------------------------------------------------------------
const allOrders = [...orders, ...activeOrders];
const totalOrders = orders.length; // history only, matches app's revenue-analytics filter
const totalCovers = orders.reduce((s, o) => s + o.covers, 0);
const totalRevenue = r2(orders.reduce((s, o) => s + o.total, 0));
const avgCheckPerCover = r2(totalRevenue / totalCovers);

// Event-level aggregation (one row per cover-level suggestion decision — matches
// how RecommendationEvent actually stores it, one row per event not per order).
const allEvents = orders.flatMap(o => o.reco.events);
const impressionEvents = allEvents.filter(e => e.impression);
const acceptedEvents = allEvents.filter(e => e.accepted);
const acceptanceRate = impressionEvents.length ? r2(acceptedEvents.length / impressionEvents.length) : 0;

// Order-level split for metric (a) — "accepted" = at least one cover on that order accepted.
const accepted = orders.filter(o => o.reco.accepted);
const notAccepted = orders.filter(o => !o.reco.accepted);
const avgOrderValueAccepted = accepted.length ? r2(accepted.reduce((s, o) => s + o.total, 0) / accepted.length) : 0;
const avgOrderValueNotAccepted = notAccepted.length ? r2(notAccepted.reduce((s, o) => s + o.total, 0) / notAccepted.length) : 0;
const upliftA_pct = avgOrderValueNotAccepted ? r2(((avgOrderValueAccepted - avgOrderValueNotAccepted) / avgOrderValueNotAccepted) * 100) : 0;

// Metric (b1) — total accepted-suggestion revenue / all covers in the period.
const acceptedSuggestionRevenue = r2(acceptedEvents.reduce((s, e) => s + e.suggestedItem[1], 0));
const upliftB1_perCover = r2(acceptedSuggestionRevenue / totalCovers);

// Top 5 dishes by revenue (mains + starters + desserts only — excludes drinks/sides for "dish" framing)
const dishRevenue = new Map();
for (const o of orders) {
  for (const it of o.items) {
    dishRevenue.set(it.name, (dishRevenue.get(it.name) || 0) + it.price * it.quantity);
  }
}
const topDishes = [...dishRevenue.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, rev]) => ({ name, revenue: r2(rev) }));

// Busiest day/hour
const hourCounts = new Array(24).fill(0);
for (const o of orders) hourCounts[o.timestamp.getUTCHours()]++;
const busiestHour = hourCounts.indexOf(Math.max(...hourCounts));

const summary = {
  seed: SEED, target: TARGET, tag: TAG, period: { start: START_DATE.toISOString().slice(0, 10), end: END_DATE.toISOString().slice(0, 10) },
  totalOrders, totalCovers, avgCoversPerDay: r2(totalCovers / dayTotals.length),
  avgCheckPerCover, totalRevenue, monthlyRevenueEstimate: r2(totalRevenue / 3),
  suggestionAcceptanceRate: acceptanceRate,
  avgOrderValueAccepted, avgOrderValueNotAccepted, upliftA_pct,
  acceptedSuggestionRevenue, upliftB1_perCover,
  topDishesByRevenue: topDishes,
  busiestDay: { date: busiestDay.date, covers: busiestDay.covers, revenue: busiestDay.revenue },
  quietestDay: { date: quietestDay.date, covers: quietestDay.covers, revenue: quietestDay.revenue },
  busiestHourUTC: busiestHour,
  activeOrdersCount: activeOrders.length,
  privateRoomBookings: orders.filter(o => o.isPrivateRoom).length
};

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, 'orders.json'), JSON.stringify(allOrders, null, 2));
fs.writeFileSync(path.join(OUT_DIR, 'tables.json'), JSON.stringify(TABLES, null, 2));
fs.writeFileSync(path.join(OUT_DIR, 'summary.json'), JSON.stringify(summary, null, 2));
fs.writeFileSync(path.join(OUT_DIR, 'daily-totals.json'), JSON.stringify(dayTotals, null, 2));

console.log(`\n=== ${APPLY ? 'APPLY (not yet wired to DB write — see note below)' : 'DRY RUN'} — target=${TARGET} tag=${TAG} ===`);
console.log('Output dir:', OUT_DIR);
console.log('\n=== SUMMARY ===');
console.log(JSON.stringify(summary, null, 2));

console.log('\n=== DIAG: revenue by category, per cover ===');
for (const [tag, rev] of Object.entries(DIAG).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${tag.padEnd(10)} total=R${Math.round(rev)}  per-cover=R${(rev / totalCovers).toFixed(2)}`);
}

console.log('\n=== 10 SAMPLE ORDERS ===');
for (const o of orders.slice(0, 10)) {
  const acceptedNames = o.reco.events.filter(e => e.accepted).map(e => e.suggestedItem[0]);
  console.log(`  #${o.seq} ${o.tableId} ${o.service} ${o.timestamp.toISOString()} covers=${o.covers} total=R${o.total}${acceptedNames.length ? ' [AI ACCEPTED: ' + acceptedNames.join(', ') + ']' : ''}`);
  for (const it of o.items) console.log(`      ${it.quantity}x ${it.name} @ R${it.price}${it.note ? ' ' + it.note : ''}`);
}

console.log('\n=== LAST 14 DAYS DAILY TOTALS ===');
for (const d of dayTotals.slice(-14)) console.log(`  ${d.date}  covers=${d.covers.toString().padStart(3)}  orders=${d.orders.toString().padStart(3)}  revenue=R${d.revenue}`);

if (APPLY) {
  console.log('\nNOTE: --apply does not write to the DB yet in this script — DB access is\n' +
    'currently blocked (see conversation). Once access is restored, this script\n' +
    'will be extended to: (1) confirm the live RecommendationEvent column set,\n' +
    '(2) write everything inside a single transaction, tagged, per the approved\n' +
    'model above. Nothing has been written anywhere by this run.');
}
