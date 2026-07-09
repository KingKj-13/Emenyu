#!/usr/bin/env node
'use strict';
// Phase 6 — seed a realistic LIVE service snapshot on top of the existing history
// (seed-demo-orders.js). Adds currently-occupied tables with believable stories
// (birthday, business dinner, family), matching waiter assignments/shifts, a live
// birthday celebration flag, guest-intel records, and guest ratings against the
// existing 18 historical demo orders so "guest satisfaction" has real numbers.
//
//   node scripts/seed-demo-live.js            # DRY RUN — preview, writes nothing
//   node scripts/seed-demo-live.js --apply    # write everything below
//   node scripts/seed-demo-live.js --purge    # remove everything this script added
//
// Tagging (so --purge only ever touches rows this script created):
//   Orders            filename prefix 'demo_live_' (separate from seed-demo-orders.js's
//                      'demo_seed_' prefix so the two layers purge independently)
//   WaiterAssignment  reason contains '[DEMO]'
//   Shift             metadata.demoSeed === true
//   WaiterTask (new)  payload.demoSeed === true
//   Guest             notes starts '[DEMO]'
//   RecommendationEvent  sessionId starts 'demo-'
//   OrderRating       attached to existing demo_seed_ orders — purge leaves the
//                      rating in place (it's real feedback shape on real demo
//                      orders) but --purge removes ratings whose comment is one
//                      we authored, tracked via a `[DEMO]`-prefixed comment marker
//                      that's stripped for display... instead we just tag via a
//                      dedicated marker appended (zero-width) — see RATING_TAG.
//
// Pre-existing test/stale debris found during Phase 6 recon is retired (never
// hard-deleted): a stale, trivial active order sitting on table2 and three open
// WaiterTasks that no longer make sense against the new story are moved to a
// terminal status. Nothing is deleted; everything is reversible by hand if needed.

const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env'), quiet: true });
dotenv.config({ path: path.resolve(__dirname, '..', '.env'), quiet: true });
dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env.local'), override: true, quiet: true });

const { getPrisma } = require('../server/services/prismaClient');
const { PrismaOrderService } = require('../server/services/prismaOrderService');
const { createWaiterWorkflowService } = require('../server/services/waiterWorkflowService');
const { ShiftService } = require('../server/services/shiftService');
const { TableOwnershipService } = require('../server/services/tableOwnershipService');

const RESTAURANT_ID = process.env.TRUMP_RESTAURANT_ID || 'trump';
const VAT_RATE = parseFloat(process.env.TRUMP_VAT_RATE || '0.15');
const SERVICE_RATE = parseFloat(process.env.TRUMP_SERVICE_RATE || '0.05');
const APPLY = process.argv.includes('--apply');
const PURGE = process.argv.includes('--purge');
const LIVE_PREFIX = 'demo_live_';
const RATING_TAG = ' ​'; // trailing zero-width space marks a rating we authored

const r2 = n => Math.round(n * 100) / 100;
const config = { restaurantId: RESTAURANT_ID };

// ---------------------------------------------------------------------------
// 1. Currently-occupied tables. Every basket is a believable story built from
//    real menu items/prices (looked up live against production). `ago` = how
//    many minutes ago the order was placed; `kitchen` = current kitchenStatus.
// ---------------------------------------------------------------------------
const ACTIVE_TABLES = [
  {
    t: 'table2', w: 'Thabo', cov: 4, ago: 42, kitchen: 'preparing',
    note: 'Birthday — cake candle requested, do not mention to guests until dessert.',
    items: [
      { n: "L'ORMARINS BRUT CLASSIQUE", q: 2 },
      { n: 'SPRINGBOK CARPACCIO' },
      { n: 'TOMAHAWK 850g - 900g' },
      { n: 'CAPE MALVA PUDDING' },
      { n: 'DEATH BY CHOCOLATE CAKE' },
    ],
    guest: { name: 'Sarah M.', vip: false, loyaltyTier: 'Gold', visitCount: 6, lifetimeSpend: 8450, avgSpend: 1408, notes: '[DEMO] Birthday regular — always orders Cap Classique.' },
  },
  {
    t: 'table5', w: 'Lerato', cov: 3, ago: 28, kitchen: 'preparing',
    note: 'Business dinner — quiet table requested, no interruptions during discussion.',
    items: [
      { n: 'WAGYU RIBEYE 300g', q: 2 },
      { n: 'WAGYU FILLET 300g' },
      { n: 'LE RICHE' },
      { n: 'AMERICANO COFFEE', q: 3 },
    ],
    guest: { name: 'David K.', vip: true, loyaltyTier: 'Platinum', visitCount: 14, lifetimeSpend: 34200, avgSpend: 2443, notes: '[DEMO] Monthly business-dinner regular — always books table 5, prefers Wagyu.' },
  },
  {
    t: 'table8', w: 'James', cov: 5, ago: 12, kitchen: 'new',
    note: 'Family with young kids — burgers well-done, ice cream for the kids.',
    items: [
      { n: 'GARLIC LEMON CALAMARI' },
      { n: 'FIRECRACKER CHICKEN WINGS (400g)' },
      { n: 'CHEESE BURGER', q: 2 },
      { n: 'CHICKEN PASTA' },
      { n: 'BBQ / PERI-PERI CHICKEN BURGER' },
      { n: 'SOFT DRINKS', q: 3 },
      { n: 'DUO OF ICE CREAM', q: 2 },
    ],
  },
  {
    t: 'table3', w: 'Thabo', cov: 2, ago: 22, kitchen: 'ready',
    note: 'Couple, anniversary-adjacent — light seafood dinner.',
    items: [
      { n: 'GARLIC LEMON CALAMARI' },
      { n: 'NEDERBURG' },
    ],
  },
  {
    t: 'table11', w: 'James', cov: 2, ago: 15, kitchen: 'new',
    note: 'Regulars — always order the Tomahawk to share.',
    items: [
      { n: 'TOMAHAWK 850g - 900g' },
      { n: 'RUSTENBURG' },
    ],
  },
  {
    t: 'table6', w: 'Lerato', cov: 3, ago: 65, kitchen: 'served',
    note: 'Casual after-work table, lingering over drinks.',
    items: [
      { n: 'FIRECRACKER CHICKEN WINGS (400g)', q: 2 },
      { n: 'CASTLE', q: 3 },
    ],
  },
];

// ---------------------------------------------------------------------------
// 2. Ratings against the existing 18 historical demo_seed_ orders (identified
//    by their exact item lines, resolved at runtime — never hardcoded IDs).
// ---------------------------------------------------------------------------
// `match` is the COMPLETE distinct item-name set for the target order (matched by
// exact set equality, not subset — several baskets share 2-3 overlapping items,
// e.g. RIBEYE 380g + STEAKHOUSE CHIPS + TOKARA appears with an extra CREAMED
// SPINACH in one order and without it in another).
const RATINGS = [
  { match: ['T-BONE 500g', 'STEAKHOUSE CHIPS', 'TOKARA', 'DEATH BY CHOCOLATE CAKE'], rating: 5, comment: 'The T-bone was cooked exactly how we asked, and that chocolate cake is dangerous. Thank you James!' },
  { match: ['GARLIC LEMON CALAMARI', 'SEAFOOD PASTA', 'NEDERBURG'], rating: 5, comment: 'Seafood pasta was fresh and the wine pairing suggestion was spot on.' },
  { match: ['RIBEYE 380g', 'CREAMED SPINACH', 'STEAKHOUSE CHIPS', 'TOKARA'], rating: 4, comment: 'Great steak — service was a little slow bringing the wine, but a lovely evening overall.' },
  { match: ["LAMB CHOPS 4's 500g", 'MASHED POTATOES', 'LANZERAC'], rating: 5, comment: "Lamb chops fell off the bone. Best meal we've had in months." },
  { match: ['RIBEYE 380g', 'TOKARA', 'DEATH BY CHOCOLATE CAKE'], rating: 5, comment: 'Thabo recommended the Tokara with our ribeye and it was perfect.' },
  { match: ['SPRINGBOK CARPACCIO', 'FILLET 260g', 'DURBANVILLE HILLS'], rating: 4, comment: 'Carpaccio was excellent, fillet a touch over medium-rare but still delicious.' },
  { match: ['RIBEYE 380g', 'STEAKHOUSE CHIPS', 'TOKARA'], rating: 5, comment: 'Celebrated our anniversary here — James took great care of us all night.' },
  { match: ['RIBEYE 380g', 'MASHED POTATOES', 'TOKARA'], rating: 3, comment: 'Food was good but we waited a while for the bill at the end.' },
  { match: ['TOMAHAWK (FRENCH CUT) 650g', 'STEAKHOUSE CHIPS', 'CREAMED SPINACH', 'ANTHONIJ RUPERT OPTIMA'], rating: 5, comment: "The tomahawk is enormous and incredible value for the quality. We'll be back." },
  { match: ['GARLIC LEMON CALAMARI', 'GREEK SALAD', 'NEDERBURG'], rating: 4, comment: 'Lovely light dinner, calamari was perfectly fried.' },
];

// ---------------------------------------------------------------------------
// 3. Recommendation events tied to specific items in the new active baskets —
//    a small, narratively-grounded set, not bulk-generated volume (3776 real
//    events already exist in production from real testing/usage).
// ---------------------------------------------------------------------------
const RECO_EVENTS = [
  { table: 'table2', name: "L'ORMARINS BRUT CLASSIQUE", recType: 'WINE', chef: true, value: 450, outcome: 'accepted', reason: 'Birthday — Cap Classique suggested to open the celebration.' },
  { table: 'table2', name: 'CAPE MALVA PUDDING', recType: 'DESSERT', chef: true, value: 115, outcome: 'accepted', reason: 'Birthday dessert suggestion.' },
  { table: 'table5', name: 'WAGYU FILLET 300g', recType: 'UPGRADE', chef: true, value: 749, outcome: 'accepted', reason: 'Upgrade suggested for the third diner.' },
  { table: 'table5', name: 'CAPE MALVA PUDDING', recType: 'DESSERT', chef: false, value: 0, outcome: 'dismissed', reason: 'Business table declined dessert — heading back to the office.' },
  { table: 'table8', name: 'DUO OF ICE CREAM', recType: 'DESSERT', chef: false, value: 198, outcome: 'accepted', reason: 'Kids dessert suggestion.' },
  { table: 'table8', name: 'STRAWBERRY LEMONADE', recType: 'DRINK', chef: false, value: 0, outcome: 'dismissed', reason: 'Mocktail upsell declined — kids already had soft drinks.' },
  { table: 'table3', name: 'NEDERBURG', recType: 'WINE', chef: false, value: 195, outcome: 'accepted', reason: 'Sauvignon Blanc suggested with calamari.' },
  { table: 'table11', name: 'RUSTENBURG', recType: 'WINE', chef: true, value: 310, outcome: 'accepted', reason: 'Cabernet suggested to pair with the Tomahawk.' },
];

function minutesAgo(mins) {
  const d = new Date();
  d.setMinutes(d.getMinutes() - mins);
  return d;
}

async function resolveMenu(prisma) {
  const menu = await prisma.menuItem.findMany({
    where: { restaurantId: RESTAURANT_ID },
    select: { name: true, price: true, imagePath: true },
  });
  const byName = new Map(menu.map(m => [m.name.toLowerCase(), m]));
  return spec => {
    const m = byName.get(spec.n.toLowerCase());
    if (!m) throw new Error(`menu item not found: ${spec.n}`);
    return m;
  };
}

async function seedActiveTables(prisma, resolve) {
  const orderService = new PrismaOrderService({ restaurantId: RESTAURANT_ID });
  const ownership = new TableOwnershipService({ config });
  const preview = [];
  let revenue = 0;

  for (let i = 0; i < ACTIVE_TABLES.length; i++) {
    const b = ACTIVE_TABLES[i];
    const items = b.items.map(spec => {
      const m = resolve(spec);
      return { name: m.name, price: Number(m.price) || 0, qty: spec.q || 1, img: m.imagePath || '', description: '' };
    });
    const subtotal = r2(items.reduce((s, it) => s + it.price * it.qty, 0));
    const vat = r2(subtotal * VAT_RATE);
    const service = r2(subtotal * SERVICE_RATE);
    const total = r2(subtotal + vat + service);
    const ts = minutesAgo(b.ago);
    const filename = `${LIVE_PREFIX}${b.t}_${ts.getTime()}_${i}.json`;
    const order = {
      table_number: b.t, waiterName: b.w, covers: b.cov,
      notes: `[DEMO] ${b.note}`,
      demoSeed: true, timestamp: ts.toISOString(),
      items, totals: { subtotal, vat, service, tip: 0, total },
    };
    revenue += total;
    preview.push(`  ${b.t.padEnd(8)} ${b.w.padEnd(7)} ${String(b.ago).padStart(3)}m ago  ${b.kitchen.padEnd(9)} R${total.toFixed(2).padStart(9)}  ${items.map(it => `${it.qty}x ${it.name}`).join(', ')}`);

    if (APPLY) {
      const saved = await orderService.saveOrder(order, b.t, filename, 'orders');
      if (!saved) throw new Error(`saveOrder failed for ${filename}`);
      const row = await prisma.order.findFirst({ where: { restaurantId: RESTAURANT_ID, filename: saved }, select: { id: true } });
      await prisma.order.update({ where: { id: row.id }, data: { kitchenStatus: b.kitchen } });
      await ownership.assign(b.t, b.w, { assignedBy: b.w, changeType: 'assign', reason: '[DEMO] seeded live table' });

      if (b.guest) {
        const guest = await prisma.guest.create({
          data: {
            restaurantId: RESTAURANT_ID, name: b.guest.name, vip: b.guest.vip,
            loyaltyTier: b.guest.loyaltyTier, visitCount: b.guest.visitCount,
            lifetimeSpend: b.guest.lifetimeSpend, avgSpend: b.guest.avgSpend,
            lastVisitAt: minutesAgo(60 * 24 * 30), notes: b.guest.notes,
          },
        });
        const existingTable = await prisma.table.findUnique({ where: { restaurantId_tableId: { restaurantId: RESTAURANT_ID, tableId: b.t } }, select: { metadata: true } });
        const meta = existingTable?.metadata && typeof existingTable.metadata === 'object' ? existingTable.metadata : {};
        await prisma.table.update({ where: { restaurantId_tableId: { restaurantId: RESTAURANT_ID, tableId: b.t } }, data: { metadata: { ...meta, guestId: guest.id } } });
      }
    }
  }

  return { preview, revenue };
}

async function seedShifts(prisma) {
  const shiftService = new ShiftService({ config });
  const waiters = [
    { name: 'Thabo', tables: ['table2', 'table3'] },
    { name: 'Lerato', tables: ['table5', 'table6'] },
    { name: 'James', tables: ['table8', 'table11'] },
  ];
  const lines = [];
  for (const w of waiters) {
    lines.push(`  ${w.name.padEnd(8)} active shift, tables: ${w.tables.join(', ')}`);
    if (APPLY) {
      const existing = await shiftService.getActiveShift(w.name);
      if (existing) { lines.push(`    (already has an active shift — left as-is)`); continue; }
      const shift = await shiftService.startShift(w.name, { role: 'waiter', startedBy: w.name, assignedTables: w.tables });
      await prisma.shift.update({ where: { id: shift.id }, data: { metadata: { demoSeed: true } } });
    }
  }
  return lines;
}

async function seedBirthdayTask() {
  const workflow = createWaiterWorkflowService({ config, socketService: null });
  if (APPLY) {
    await workflow.createTask({
      tableId: 'table2', waiterName: 'Thabo', type: 'birthday',
      title: 'Birthday dessert approved',
      message: 'Complimentary Cape Malva Pudding with a candle — approved. Present it naturally, do not mention the approval process.',
      priority: 1, requestedBy: 'manager',
      payload: { itemName: 'Cape Malva Pudding with a candle', reason: 'Birthday detected', demoSeed: true },
    });
  }
  return '  table2 -> live birthday celebration flag (type=birthday, open)';
}

async function retireStaleDebris(prisma) {
  const lines = [];

  const staleOrder = await prisma.order.findFirst({
    where: { restaurantId: RESTAURANT_ID, tableId: 'table2', status: 'active', waiterName: '', NOT: { filename: { startsWith: LIVE_PREFIX } } },
    select: { id: true, filename: true, total: true, timestamp: true },
  });
  if (staleOrder) {
    lines.push(`  stale active order #${staleOrder.id} on table2 (R${staleOrder.total}, ${staleOrder.timestamp.toISOString().slice(0, 10)}, no waiter) -> retire to status=history`);
    if (APPLY) {
      await prisma.order.update({ where: { id: staleOrder.id }, data: { status: 'history', notes: '[DEMO cleanup] retired stale test order to allow live birthday table seeding' } });
    }
  }

  const staleTasks = await prisma.waiterTask.findMany({
    where: { restaurantId: RESTAURANT_ID, status: 'open', OR: [{ tableId: 'table5', type: 'birthday' }, { tableId: 'table3', type: 'vegetarian' }, { tableId: 'smoketest2' }] },
    select: { id: true, tableId: true, type: true, createdAt: true },
  });
  for (const task of staleTasks) {
    lines.push(`  open WaiterTask #${task.id} (${task.tableId}, type=${task.type}, ${task.createdAt.toISOString().slice(0, 10)}) -> resolve (stale, conflicts with new story)`);
    if (APPLY) await prisma.waiterTask.update({ where: { id: task.id }, data: { status: 'resolved', resolvedAt: new Date() } });
  }

  return lines;
}

async function seedRatings(prisma) {
  const orders = await prisma.order.findMany({
    where: { restaurantId: RESTAURANT_ID, filename: { startsWith: 'demo_seed_' } },
    select: { id: true, tableId: true, items: { select: { name: true } } },
  });
  const lines = [];
  for (const spec of RATINGS) {
    const target = new Set(spec.match);
    const order = orders.find(o => {
      const names = new Set(o.items.map(it => it.name));
      return names.size === target.size && spec.match.every(name => names.has(name));
    });
    if (!order) { lines.push(`  [skip] no historical order matches ${JSON.stringify(spec.match)}`); continue; }
    const existing = await prisma.orderRating.findUnique({ where: { orderId: order.id } });
    if (existing) { lines.push(`  [skip] order #${order.id} (${order.tableId}) already rated`); continue; }
    lines.push(`  order #${order.id} (${order.tableId}) -> ${spec.rating}* "${spec.comment}"`);
    if (APPLY) {
      await prisma.orderRating.create({
        data: { restaurantId: RESTAURANT_ID, orderId: order.id, tableId: order.tableId, rating: spec.rating, comment: spec.comment + RATING_TAG },
      });
    }
  }
  return lines;
}

async function seedRecoEvents(prisma) {
  const lines = [];
  for (let i = 0; i < RECO_EVENTS.length; i++) {
    const ev = RECO_EVENTS[i];
    const sessionId = `demo-${ev.table}-${i}`;
    lines.push(`  ${ev.table.padEnd(8)} ${ev.name.padEnd(28)} ${ev.outcome.padEnd(10)} R${ev.value}  (${ev.reason})`);
    if (APPLY) {
      const ts = minutesAgo(ACTIVE_TABLES.find(t => t.t === ev.table)?.ago || 20);
      await prisma.recommendationEvent.createMany({
        data: [
          { restaurantId: RESTAURANT_ID, eventType: 'impression', source: 'chef', recType: ev.recType, recommendedName: ev.name, sessionId, mode: 'waiter', chef: ev.chef, value: 0, createdAt: ts },
          { restaurantId: RESTAURANT_ID, eventType: ev.outcome, source: 'chef', recType: ev.recType, recommendedName: ev.name, sessionId, mode: 'waiter', chef: ev.chef, value: ev.value, createdAt: ts },
        ],
      });
    }
  }
  return lines;
}

async function purge(prisma) {
  const orders = await prisma.order.deleteMany({ where: { restaurantId: RESTAURANT_ID, filename: { startsWith: LIVE_PREFIX } } });
  console.log(`orders: removed ${orders.count} (filename prefix '${LIVE_PREFIX}')`);

  const assigns = await prisma.waiterAssignment.deleteMany({ where: { restaurantId: RESTAURANT_ID, reason: { contains: '[DEMO]' } } });
  console.log(`waiterAssignment: removed ${assigns.count}`);

  const shifts = await prisma.shift.findMany({ where: { restaurantId: RESTAURANT_ID }, select: { id: true, metadata: true } });
  const demoShiftIds = shifts.filter(s => s.metadata && typeof s.metadata === 'object' && s.metadata.demoSeed === true).map(s => s.id);
  if (demoShiftIds.length) {
    const removed = await prisma.shift.deleteMany({ where: { id: { in: demoShiftIds } } });
    console.log(`shift: removed ${removed.count}`);
  } else console.log('shift: none to remove');

  const tasks = await prisma.waiterTask.findMany({ where: { restaurantId: RESTAURANT_ID, type: 'birthday', tableId: 'table2' }, select: { id: true, payload: true } });
  const demoTaskIds = tasks.filter(t => t.payload && typeof t.payload === 'object' && t.payload.demoSeed === true).map(t => t.id);
  if (demoTaskIds.length) {
    const removed = await prisma.waiterTask.deleteMany({ where: { id: { in: demoTaskIds } } });
    console.log(`waiterTask: removed ${removed.count}`);
  } else console.log('waiterTask: none to remove');

  const guests = await prisma.guest.deleteMany({ where: { restaurantId: RESTAURANT_ID, notes: { startsWith: '[DEMO]' } } });
  console.log(`guest: removed ${guests.count}`);

  const ratings = await prisma.orderRating.deleteMany({ where: { restaurantId: RESTAURANT_ID, comment: { endsWith: RATING_TAG } } });
  console.log(`orderRating: removed ${ratings.count}`);

  const events = await prisma.recommendationEvent.deleteMany({ where: { restaurantId: RESTAURANT_ID, sessionId: { startsWith: 'demo-' } } });
  console.log(`recommendationEvent: removed ${events.count}`);

  console.log('\nNote: stale-debris retirement (stale table2 order -> history, stale WaiterTasks -> resolved) was a status change, not a delete — restore by hand if needed.');
}

async function main() {
  const prisma = getPrisma();

  if (PURGE) {
    if (!APPLY) { console.log('Pass --purge --apply together to actually purge. Nothing done.'); await prisma.$disconnect(); return; }
    await purge(prisma);
    await prisma.$disconnect();
    return;
  }

  const resolve = await resolveMenu(prisma);
  const cleanupLines = await retireStaleDebris(prisma);
  const { preview: tablePreview, revenue } = await seedActiveTables(prisma, resolve);
  const shiftLines = await seedShifts(prisma);
  const birthdayLine = await seedBirthdayTask();
  const ratingLines = await seedRatings(prisma);
  const recoLines = await seedRecoEvents(prisma);

  console.log(`\n${APPLY ? 'SEEDED' : 'DRY RUN'} — restaurantId='${RESTAURANT_ID}'\n`);
  console.log(`Stale debris retirement:\n${cleanupLines.length ? cleanupLines.join('\n') : '  (none found)'}\n`);
  console.log(`Active tables (${ACTIVE_TABLES.length}, R${revenue.toFixed(2)} on the floor right now):\n${tablePreview.join('\n')}\n`);
  console.log(`Shifts:\n${shiftLines.join('\n')}\n`);
  console.log(`Celebration flag:\n${birthdayLine}\n`);
  console.log(`Guest ratings:\n${ratingLines.join('\n')}\n`);
  console.log(`Recommendation events:\n${recoLines.join('\n')}\n`);

  if (APPLY) console.log('Remove anytime with: node scripts/seed-demo-live.js --purge --apply');
  await prisma.$disconnect();
}

main().catch(e => { console.error('seed failed:', e); process.exit(1); });
