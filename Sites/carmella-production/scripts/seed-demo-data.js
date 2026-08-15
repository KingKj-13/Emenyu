#!/usr/bin/env node
'use strict';
// Generates realistic historical demo data so Analytics, Live Carts, Popular
// Items, Peak Hours, Deal/Happy-Hour/Specials Performance, and customer
// activity all look like a busy restaurant, purely for demonstration --
// never touches application logic, only ever writes rows tagged so they can
// be told apart from real activity and removed safely (see
// clear-demo-data.js).
//
// Safe to re-run: every run clears its own previously-generated rows first,
// then regenerates a fresh batch, so running it twice never doubles up.
//
//   node scripts/seed-demo-data.js
//
// Tagging:
//   - AnalyticsEvent rows: isDemo = true (separate from isSeed, which is the
//     dashboard's own automatic below-threshold filler -- see
//     analyticsController.js's ensureAnalyticsSeed; the two never interact).
//   - ActiveCartState/Table rows: tableId prefixed "demo-active-"/
//     "demo-abandoned-" -- distinct from any real guest table (table1,
//     table21, etc.), so they're unmistakable in the Admin Live Carts view
//     and trivial to filter out.
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '..', '.env'), quiet: true });

const { getPrisma } = require('../server/services/prismaClient');

const RESTAURANT_ID = 'carmella-production';

// `ActiveCartState.updatedAt` is `@updatedAt` -- Prisma always recomputes it
// to "now" on write regardless of what's passed to create/update, so
// backdating it (for the active-cart spread and the abandoned-cart stale
// window below) has to go through a raw UPDATE afterward. `SET LOCAL TIME
// ZONE 'UTC'` + the UPDATE are pinned to the SAME physical connection via
// `$transaction` -- a lone top-of-script `SET TIME ZONE` does NOT reliably
// protect this, since Prisma can dispatch a later query to a different
// pooled connection that never saw it, silently corrupting the write by
// whatever that connection's own default session timezone happens to be.
async function forceUpdatedAt(prisma, tableId, updatedAt) {
  await prisma.$transaction([
    prisma.$executeRawUnsafe("SET LOCAL TIME ZONE 'UTC'"),
    prisma.$executeRawUnsafe(
      'UPDATE "ActiveCartState" SET "updatedAt" = $1::timestamptz WHERE "restaurantId" = $2 AND "tableId" = $3',
      updatedAt.toISOString(), RESTAURANT_ID, tableId
    )
  ]);
}
const SESSION_COUNT = 100;
const ACTIVE_CART_COUNT = 20;
const ABANDONED_CART_COUNT = 10;
const STALE_CART_MS = 3 * 60 * 60 * 1000; // matches cartService.js's own threshold

// ── Popularity weighting ──────────────────────────────────────────────────
// Keyword-matched against item name (case-insensitive substring), not a
// stored tag -- this catalog doesn't have a "popularity tier" field, so this
// mirrors the same fuzzy, name-based classification approach already used
// elsewhere in this codebase (categoryClassifier.js's own keyword matching).
const VERY_POPULAR_KEYWORDS = ['coffee', 'cappuccino', 'latte', 'espresso', 'milkshake', 'steak', 'fillet', 'sirloin', 'pasta', 'breakfast', 'orzo', 'bolognese', 'basilico'];
const MEDIUM_KEYWORDS = ['fish', 'salmon', 'prawn', 'calamari', 'chicken', 'cocktail', 'martini', 'mojito', 'spritz'];
const RARE_KEYWORDS = ['moët', 'moet', 'dom perignon', 'cristal', 'champagne', 'hennessy', 'grey goose', 'johnnie walker'];

function popularityWeight(item, priceP90) {
  const n = item.name.toLowerCase();
  if (RARE_KEYWORDS.some(k => n.includes(k)) || item.price >= priceP90) return 1;
  if (VERY_POPULAR_KEYWORDS.some(k => n.includes(k))) return 9;
  if (MEDIUM_KEYWORDS.some(k => n.includes(k))) return 4;
  return 3;
}

function weightedPick(weightedItems) {
  const total = weightedItems.reduce((s, w) => s + w.weight, 0);
  let roll = Math.random() * total;
  for (const w of weightedItems) {
    roll -= w.weight;
    if (roll <= 0) return w.item;
  }
  return weightedItems[weightedItems.length - 1].item;
}

// ── Time-of-day weighting ────────────────────────────────────────────────
// Breakfast 07:00-10:30, lunch 12:00-15:00, dinner 18:00-21:30 are peaks;
// 09:30-11:30, 15:00-17:30, and after 22:00 are quiet; everything else is a
// mid-level baseline. Expressed per half-hour slot (0-47) so the peak/quiet
// windows (which don't fall on whole hours) apply precisely.
function halfHourWeight(slot) {
  const hour = slot / 2;
  if (hour >= 7 && hour < 10.5) return 8;   // breakfast peak
  if (hour >= 12 && hour < 15) return 9;    // lunch peak
  if (hour >= 18 && hour < 21.5) return 10; // dinner peak (busiest)
  if (hour >= 9.5 && hour < 11.5) return 1; // quiet
  if (hour >= 15 && hour < 17.5) return 1;  // quiet
  if (hour >= 22 || hour < 6) return 1;     // quiet / closed overnight
  return 3; // baseline
}

function weightedHalfHourSlot() {
  const weights = Array.from({ length: 48 }, (_, slot) => halfHourWeight(slot));
  const total = weights.reduce((s, w) => s + w, 0);
  let roll = Math.random() * total;
  for (let slot = 0; slot < weights.length; slot++) {
    roll -= weights[slot];
    if (roll <= 0) return slot;
  }
  return 24; // noon fallback
}

// Weekends noticeably busier -- bias which of the last 30 days a session
// lands on, not just the hour within a day.
function weightedDaysAgo() {
  const weights = Array.from({ length: 30 }, (_, daysAgo) => {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    const dow = d.getDay(); // 0 Sun .. 6 Sat
    return (dow === 0 || dow === 6) ? 2.2 : 1;
  });
  const total = weights.reduce((s, w) => s + w, 0);
  let roll = Math.random() * total;
  for (let i = 0; i < weights.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return i;
  }
  return 0;
}

// Carmella is in Johannesburg -- SAST, UTC+2, no daylight saving, so this
// offset is a safe constant. The peak/quiet windows above are meant in the
// restaurant's own local wall-clock time ("dinner is 6-9:30pm" means local
// time, not UTC), so a slot/day-offset must be converted to a UTC instant
// explicitly like this -- NOT via Date's setHours()/setMinutes(), which
// silently use whatever local timezone the *Node process* happens to be
// running under (fine on a dev machine that happens to also be set to
// Africa/Johannesburg, but wrong the moment this runs on a server configured
// for UTC or any other zone, as most cloud hosts are).
const SAST_OFFSET_MS = 2 * 60 * 60 * 1000;
function slotToUtcInstant(dayUtcMidnight, slot) {
  const localMs = Math.floor(slot / 2) * 3600000 + ((slot % 2) * 30 + Math.floor(Math.random() * 30)) * 60000 + Math.floor(Math.random() * 60) * 1000;
  return new Date(dayUtcMidnight.getTime() + localMs - SAST_OFFSET_MS);
}

const TABLE_POOL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 16, 18, 20, 21, 22, 24];
function pickTable() {
  // A handful of tables (window seats, booths) get disproportionately more
  // traffic than the rest -- not perfectly uniform, matching "randomly
  // distribute... realistic guest counts" rather than an even split.
  const favored = [1, 3, 7, 12, 18, 21];
  const pool = Math.random() < 0.45 ? favored : TABLE_POOL;
  return `table${pool[Math.floor(Math.random() * pool.length)]}`;
}

function guestCountForTable() {
  const roll = Math.random();
  if (roll < 0.15) return 1;
  if (roll < 0.55) return 2;
  if (roll < 0.8) return 4;
  if (roll < 0.93) return 3;
  return 6;
}

async function main() {
  const prisma = getPrisma();
  console.log(`[seed-demo-data] connecting to ${RESTAURANT_ID}...`);

  // This DB's default session timezone is non-UTC (observed: Asia/Calcutta),
  // and a plain one-off `SET TIME ZONE` here does NOT reliably protect the
  // raw timestamptz writes done later in this script: Prisma can dispatch
  // later queries to a *different* pooled connection that never saw this
  // statement, silently corrupting those writes by the session offset again.
  // Proven by direct testing (writing the same instant 25x in a loop without
  // ever calling SET TIME ZONE reproduced an exact +330min/+5:30 corruption
  // on every single write). The only reliable fix is pinning `SET LOCAL TIME
  // ZONE 'UTC'` to the SAME connection as its write via a `$transaction` --
  // see the two cart-backdating loops below, which each do this per-write.
  // This is portable regardless of what a given database's (local or prod)
  // default session timezone happens to be.

  // Idempotent: clear any previous run's demo rows before generating a fresh
  // batch, so re-running never accumulates duplicates.
  const clearedEvents = await prisma.analyticsEvent.deleteMany({ where: { restaurantId: RESTAURANT_ID, isDemo: true } });
  const clearedCarts = await prisma.activeCartState.deleteMany({ where: { restaurantId: RESTAURANT_ID, tableId: { startsWith: 'demo-' } } });
  await prisma.table.deleteMany({ where: { restaurantId: RESTAURANT_ID, tableId: { startsWith: 'demo-' } } });
  console.log(`[seed-demo-data] cleared ${clearedEvents.count} prior demo events, ${clearedCarts.count} prior demo carts`);

  const items = await prisma.menuItem.findMany({
    where: { restaurantId: RESTAURANT_ID, available: true },
    select: { id: true, name: true, price: true, categoryId: true }
  });
  if (items.length === 0) {
    console.error('[seed-demo-data] no available menu items found -- nothing to seed against. Aborting.');
    process.exitCode = 1;
    return;
  }

  const sortedPrices = [...items.map(i => i.price)].sort((a, b) => a - b);
  const priceP90 = sortedPrices[Math.floor(sortedPrices.length * 0.9)] || Infinity;
  const weightedItems = items.map(item => ({ item, weight: popularityWeight(item, priceP90) }));

  // Bias interactions toward whatever Specials/Happy-Hours/Promotions are
  // CURRENTLY configured (queried live, not hardcoded) -- "40% viewed
  // specials, 15% of those ordered one" only means something against
  // whatever the real admin actually has active right now.
  const [specials, happyHours, promotions] = await Promise.all([
    prisma.special.findMany({ where: { restaurantId: RESTAURANT_ID } }),
    prisma.happyHour.findMany({ where: { restaurantId: RESTAURANT_ID } }),
    prisma.promotion.findMany({ where: { restaurantId: RESTAURANT_ID } })
  ]);
  const promoItemIds = new Set([
    ...specials.flatMap(s => (Array.isArray(s.items) ? s.items.map(e => e.itemId) : [])),
    ...happyHours.flatMap(h => h.itemIds || []),
    ...promotions.flatMap(p => p.itemIds || [])
  ]);
  const promoItems = items.filter(i => promoItemIds.has(i.id));
  console.log(`[seed-demo-data] ${items.length} available items, ${promoItems.length} currently in an active promo/special/happy-hour`);

  const events = [];
  let totalViews = 0;
  let totalAddToCart = 0;
  const now = Date.now();

  for (let s = 0; s < SESSION_COUNT; s++) {
    const sessionId = `demo_${s}_${Math.random().toString(36).slice(2, 9)}`;
    const daysAgo = weightedDaysAgo();
    const slot = weightedHalfHourSlot();
    const dayUtcMidnight = new Date(now - daysAgo * 86400000);
    dayUtcMidnight.setUTCHours(0, 0, 0, 0);
    const createdAt = slotToUtcInstant(dayUtcMidnight, slot);
    const tableId = pickTable();

    events.push({ restaurantId: RESTAURANT_ID, type: 'session_start', sessionId, tableId, isDemo: true, createdAt });

    // 40% of sessions specifically browse a currently-promoted item, when one exists.
    const viewsPromo = promoItems.length > 0 && Math.random() < 0.4;

    const viewCount = 3 + Math.floor(Math.random() * 3); // 3-5 views/session -> ~350-500 total across 100 sessions
    const viewedItems = [];
    for (let v = 0; v < viewCount; v++) {
      const item = (v === 0 && viewsPromo) ? promoItems[Math.floor(Math.random() * promoItems.length)] : weightedPick(weightedItems);
      viewedItems.push(item);
      const viewedAt = new Date(createdAt.getTime() + v * (30000 + Math.random() * 60000));
      events.push({ restaurantId: RESTAURANT_ID, type: 'item_view', itemId: item.id, categoryId: item.categoryId, sessionId, tableId, isDemo: true, createdAt: viewedAt });
      totalViews += 1;
    }

    // "Completed" sessions all add at least one item (that's what makes the
    // cart "completed" rather than a bounce); 1-3 items, averaging ~2/session
    // -> ~200 total across 100 sessions, comfortably inside 180-250.
    const addCount = 1 + Math.floor(Math.random() * 3);
    for (let a = 0; a < addCount; a++) {
      // Of sessions that viewed a promoted item, 15% overall (37.5% of the
      // 40% that viewed) go on to actually add it -- "40% viewed, 15%
      // ordered" read as a share of ALL sessions, not just the viewers.
      const addPromo = viewsPromo && a === 0 && Math.random() < 0.375;
      const item = addPromo ? viewedItems[0] : weightedPick(weightedItems);
      const addedAt = new Date(createdAt.getTime() + (viewCount + a) * (30000 + Math.random() * 60000));
      events.push({ restaurantId: RESTAURANT_ID, type: 'add_to_cart', itemId: item.id, categoryId: item.categoryId, sessionId, tableId, isDemo: true, createdAt: addedAt });
      totalAddToCart += 1;
    }
  }

  await prisma.analyticsEvent.createMany({ data: events });
  console.log(`[seed-demo-data] created ${SESSION_COUNT} sessions: ${totalViews} item_view, ${totalAddToCart} add_to_cart events`);

  // ── Active + abandoned carts ──
  // Real ActiveCartState rows (not synthetic analytics events) so they show
  // up in the actual Admin Live Carts view exactly the way a real table's
  // cart would. "Abandoned" carts get an updatedAt older than cartService's
  // own 3-hour stale window, so listActiveCarts() correctly excludes them --
  // same as a real cart nobody returned to.
  let activeCreated = 0;
  for (let i = 1; i <= ACTIVE_CART_COUNT; i++) {
    const tableId = `demo-active-${i}`;
    const guests = guestCountForTable();
    const cartSize = 1 + Math.floor(Math.random() * 4);
    const cart = Array.from({ length: cartSize }, () => {
      const item = weightedPick(weightedItems);
      return { name: item.name, price: item.price, qty: 1 + Math.floor(Math.random() * 2), note: '', img: '', description: '' };
    });
    const updatedAt = new Date(now - Math.floor(Math.random() * 60) * 60000); // within the last hour
    await prisma.table.upsert({
      where: { restaurantId_tableId: { restaurantId: RESTAURANT_ID, tableId } },
      create: { restaurantId: RESTAURANT_ID, tableId, displayName: `Demo Table ${i} (${guests} guests)` },
      update: {}
    });
    await prisma.activeCartState.upsert({
      where: { restaurantId_tableId: { restaurantId: RESTAURANT_ID, tableId } },
      create: { restaurantId: RESTAURANT_ID, tableId, cart, updatedBy: 'guest' },
      update: { cart }
    });
    await forceUpdatedAt(prisma, tableId, updatedAt);
    activeCreated += 1;
  }

  let abandonedCreated = 0;
  for (let i = 1; i <= ABANDONED_CART_COUNT; i++) {
    const tableId = `demo-abandoned-${i}`;
    const cartSize = 1 + Math.floor(Math.random() * 3);
    const cart = Array.from({ length: cartSize }, () => {
      const item = weightedPick(weightedItems);
      return { name: item.name, price: item.price, qty: 1, note: '', img: '', description: '' };
    });
    const updatedAt = new Date(now - (STALE_CART_MS + Math.floor(Math.random() * 5) * 3600000)); // 3-8h ago: past the stale window
    await prisma.table.upsert({
      where: { restaurantId_tableId: { restaurantId: RESTAURANT_ID, tableId } },
      create: { restaurantId: RESTAURANT_ID, tableId, displayName: `Demo Table (abandoned ${i})` },
      update: {}
    });
    await prisma.activeCartState.upsert({
      where: { restaurantId_tableId: { restaurantId: RESTAURANT_ID, tableId } },
      create: { restaurantId: RESTAURANT_ID, tableId, cart, updatedBy: 'guest' },
      update: { cart }
    });
    await forceUpdatedAt(prisma, tableId, updatedAt);
    abandonedCreated += 1;
  }

  console.log(`[seed-demo-data] created ${activeCreated} active carts, ${abandonedCreated} abandoned carts`);
  console.log('[seed-demo-data] done.');
  await prisma.$disconnect();
}

main().catch(async err => {
  console.error('[seed-demo-data] failed:', err);
  process.exitCode = 1;
});
