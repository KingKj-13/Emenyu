'use strict';
// Demo Live Ticker — OPT-IN ONLY (enabled by passing { enabled: true }, wired in
// server.js behind TRUMP_DEMO_LIVE_MODE=true). Keeps the floor looking alive for
// sales demos: primes a few tables mid-service on startup, then keeps nudging
// things forward indefinitely — placing new orders on idle tables, advancing
// kitchen tickets through the exact same forward-only flow real kitchen staff
// use (kitchenController's STATUS_FLOW), occasionally raising a "guest wants
// the bill" call, and occasionally running a birthday+dessert moment.
//
// Every row it writes is tagged (`demo_ticker_` filename prefix, notes/payload
// marked demoSeed/[DEMO]) so it never touches real orders and purges
// independently of the demo_seed_/demo_live_/demo_month_ batches. It only ever
// looks at/writes table1..table14 and skips any table that already has a real
// (non-ticker) active order on it — it must stay inert the moment Trump takes
// a real paying guest on a table it would otherwise touch.
//
// This module owns no long-lived DB connection setup beyond the shared Prisma
// client and is safe to start/stop repeatedly (e.g. across pm2 reloads) — all
// state is derived fresh from the DB each tick, nothing is kept in memory that
// would be lost/stale across a restart.

const { getPrisma } = require('./prismaClient');
const { PrismaOrderService } = require('./prismaOrderService');

const TICKER_PREFIX = 'demo_ticker_';
const REAL_TABLES = Array.from({ length: 14 }, (_, i) => `table${i + 1}`);
const WAITERS = ['Thabo', 'Lerato', 'James'];
const STATUS_FLOW = { new: 'preparing', preparing: 'ready', ready: 'served' };
const MAX_CONCURRENT = 10; // out of 14 — a full floor 24/7 doesn't read as real
const TICK_MIN_MS = 25_000;
const TICK_MAX_MS = 55_000;
const BILL_CALL_DELAY_MS = 4 * 60 * 1000; // fire a bill-call this long after a table's order goes 'served'
const BILL_CALL_WINDOW_MS = 20 * 60 * 1000; // ...stop offering it once it's this stale (a fresh order will have replaced it by then)
const VAT_RATE = parseFloat(process.env.TRUMP_VAT_RATE || '0.15');
const SERVICE_RATE = parseFloat(process.env.TRUMP_SERVICE_RATE || '0.05');
const BIRTHDAY_CHANCE = 0.12;

const r2 = n => Math.round(n * 100) / 100;
const pickRandom = arr => arr[Math.floor(Math.random() * arr.length)];
function weightedPick(pool) {
  const total = pool.reduce((s, p) => s + p.w, 0);
  let r = Math.random() * total;
  for (const p of pool) { r -= p.w; if (r <= 0) return p; }
  return pool[pool.length - 1];
}

// Real menu items/prices, verbatim — the same names already validated against
// the live Trump menu by seed-demo-orders.js / seed-demo-live.js.
const BASKETS = [
  [{ n: 'RIBEYE 380g' }, { n: 'STEAKHOUSE CHIPS' }, { n: 'CREAMED SPINACH' }],
  [{ n: 'GARLIC LEMON CALAMARI' }, { n: 'SEAFOOD PASTA' }],
  [{ n: 'FIRECRACKER CHICKEN WINGS (400g)', q: 2 }, { n: 'CASTLE', q: 2 }],
  [{ n: 'CHEESE BURGER', q: 2 }, { n: 'SOFT DRINKS', q: 2 }],
  [{ n: 'TOMAHAWK 850g - 900g' }, { n: 'RUSTENBURG' }],
  [{ n: 'SPRINGBOK CARPACCIO' }, { n: 'FILLET 260g' }, { n: 'DURBANVILLE HILLS' }],
  [{ n: "LAMB CHOPS 4's 500g" }, { n: 'MASHED POTATOES' }, { n: 'LANZERAC' }],
  [{ n: 'CHICKEN PASTA' }, { n: 'NEDERBURG' }],
  [{ n: 'T-BONE 500g' }, { n: 'STEAKHOUSE CHIPS' }, { n: 'TOKARA' }]
];
const BIRTHDAY_DESSERT = { n: 'CAPE MALVA PUDDING' };

// Startup priming — a handful of distinct tables at staggered "ago" ages so the
// floor already looks mid-service the moment the ticker is enabled, instead of
// slowly filling up over the first several minutes.
const PRIME = [
  { ago: 8, status: 'new' },
  { ago: 14, status: 'new', birthday: true }, // guaranteed birthday moment on startup, not left to chance
  { ago: 19, status: 'preparing' },
  { ago: 26, status: 'preparing' },
  { ago: 34, status: 'ready' },
  { ago: 42, status: 'ready' },
  { ago: 55, status: 'served' } // already past BILL_CALL_DELAY_MS — a bill-call is eligible on the very first tick
];

function minutesAgo(mins) {
  return new Date(Date.now() - mins * 60000);
}

function createDemoLiveTicker({ config, socketService, notificationService, waiterWorkflowService, logger }) {
  const restaurantId = config.restaurantId;
  const orderService = new PrismaOrderService({ restaurantId });
  let menuByName = null;
  let timer = null;
  let running = false;

  async function resolveMenu() {
    const prisma = getPrisma();
    const menu = await prisma.menuItem.findMany({
      where: { restaurantId },
      select: { name: true, price: true, imagePath: true }
    });
    return new Map(menu.map(m => [m.name.toLowerCase(), m]));
  }

  function buildItems(basketSpec, includeBirthdayDessert) {
    const specs = includeBirthdayDessert ? [...basketSpec, BIRTHDAY_DESSERT] : basketSpec;
    const items = [];
    for (const spec of specs) {
      const m = menuByName.get(spec.n.toLowerCase());
      if (!m) { logger?.warn('demo_live_ticker_menu_item_missing', { name: spec.n }); continue; }
      items.push({ name: m.name, price: Number(m.price) || 0, qty: spec.q || 1, img: m.imagePath || '', description: '' });
    }
    return items;
  }

  async function placeOrder(tableId, { ago = 0, forceKitchenStatus = null, forceBirthday = false } = {}) {
    if (!menuByName || !menuByName.size) return null;
    const isBirthday = forceBirthday || Math.random() < BIRTHDAY_CHANCE;
    const items = buildItems(pickRandom(BASKETS), isBirthday);
    if (!items.length) return null;

    const waiterName = pickRandom(WAITERS);
    const subtotal = r2(items.reduce((s, it) => s + it.price * it.qty, 0));
    const vat = r2(subtotal * VAT_RATE);
    const service = r2(subtotal * SERVICE_RATE);
    const total = r2(subtotal + vat + service);
    const ts = ago > 0 ? minutesAgo(ago) : new Date();
    const seq = Math.floor(Math.random() * 1e6);
    const filename = `${TICKER_PREFIX}${tableId}_${ts.getTime()}_${seq}.json`;
    const order = {
      table_number: tableId, waiterName, covers: 1 + Math.floor(Math.random() * 4),
      notes: isBirthday ? '[DEMO] Birthday — cake candle requested, present the dessert naturally.' : '',
      demoSeed: true, timestamp: ts.toISOString(),
      items, totals: { subtotal, vat, service, tip: 0, total }
    };

    const saved = await orderService.saveOrder(order, tableId, filename, 'orders');
    if (!saved) return null;

    socketService.emitOrderPlaced(order);

    if (isBirthday && waiterWorkflowService) {
      await waiterWorkflowService.createTask({
        tableId, waiterName, type: 'birthday',
        title: 'Birthday dessert approved',
        message: 'Complimentary Cape Malva Pudding with a candle — approved. Present it naturally, do not mention the approval process.',
        priority: 1, requestedBy: 'manager',
        payload: { itemName: 'Cape Malva Pudding with a candle', reason: 'Birthday detected', demoSeed: true }
      }).catch(err => logger?.warn('demo_live_ticker_birthday_task_failed', { error: err?.message }));
    }

    if (forceKitchenStatus && forceKitchenStatus !== 'new') {
      await advanceToStatus(saved, forceKitchenStatus);
    }

    return saved;
  }

  async function advanceToStatus(filename, targetStatus) {
    const prisma = getPrisma();
    const row = await prisma.order.findFirst({ where: { restaurantId, filename }, select: { id: true, tableId: true, kitchenStatus: true } });
    if (!row) return;
    let current = row.kitchenStatus;
    while (current !== targetStatus && STATUS_FLOW[current]) {
      const next = STATUS_FLOW[current];
      await applyKitchenStatus(row.id, row.tableId, next);
      current = next;
    }
  }

  async function applyKitchenStatus(orderId, tableId, nextStatus) {
    const prisma = getPrisma();
    const updated = await prisma.order.update({ where: { id: orderId }, data: { kitchenStatus: nextStatus }, include: { items: true } });
    socketService.emitKitchenStatusUpdate(updated.id, updated.tableId, nextStatus, updated);

    if (nextStatus === 'ready') {
      const displayTable = String(tableId).replace(/^table/i, 'Table ').toUpperCase();
      notificationService?.notify({
        source: 'system', title: `${displayTable} order ready`, body: `${displayTable}'s order is ready to serve.`,
        priority: 2, recipientRole: 'waiter', tableId
      });
    }

    if (nextStatus === 'served') {
      await orderService.moveOrder('orders', 'history', updated.filename, 'system');
      socketService.emitOrderUpdated();
      await socketService.emitTableHistory(tableId).catch(() => {});
    }
  }

  async function primeFloor() {
    const shuffled = [...REAL_TABLES].sort(() => Math.random() - 0.5);
    const chosen = shuffled.slice(0, PRIME.length);
    for (let i = 0; i < chosen.length; i++) {
      const spec = PRIME[i];
      await placeOrder(chosen[i], { ago: spec.ago, forceKitchenStatus: spec.status, forceBirthday: !!spec.birthday }).catch(err =>
        logger?.warn('demo_live_ticker_prime_failed', { table: chosen[i], error: err?.message }));
    }
    logger?.info('demo_live_ticker_primed', { tables: chosen });
  }

  async function tick() {
    const prisma = getPrisma();

    const [activeTicked, anyActive, recentServed] = await Promise.all([
      prisma.order.findMany({
        where: { restaurantId, status: 'active', filename: { startsWith: TICKER_PREFIX } },
        select: { id: true, tableId: true, filename: true, kitchenStatus: true }
      }),
      prisma.order.findMany({
        where: { restaurantId, status: 'active', tableId: { in: REAL_TABLES } },
        select: { tableId: true }
      }),
      prisma.order.findMany({
        where: { restaurantId, filename: { startsWith: TICKER_PREFIX }, status: 'history', kitchenStatus: 'served' },
        select: { id: true, tableId: true, timestamp: true, raw: true },
        orderBy: { timestamp: 'desc' },
        take: 20
      })
    ]);

    const occupied = new Set(anyActive.map(o => o.tableId));
    const freeTables = REAL_TABLES.filter(t => !occupied.has(t));
    const advanceable = activeTicked.filter(o => STATUS_FLOW[o.kitchenStatus]);
    const now = Date.now();
    const billable = recentServed.filter(o => {
      const age = now - new Date(o.timestamp).getTime();
      const alreadyCalled = o.raw && typeof o.raw === 'object' && o.raw.billCalledAt;
      return !alreadyCalled && age > BILL_CALL_DELAY_MS && age < BILL_CALL_WINDOW_MS;
    });

    const actions = [];
    if (advanceable.length) {
      const order = pickRandom(advanceable);
      actions.push({ w: 5, run: () => applyKitchenStatus(order.id, order.tableId, STATUS_FLOW[order.kitchenStatus]) });
    }
    if (freeTables.length && activeTicked.length < MAX_CONCURRENT) {
      actions.push({ w: 3, run: () => placeOrder(pickRandom(freeTables)) });
    }
    if (billable.length) {
      const order = pickRandom(billable);
      actions.push({ w: 2, run: async () => {
        socketService.emitBillRequested(order.tableId);
        await prisma.order.update({
          where: { id: order.id },
          data: { raw: { ...(order.raw && typeof order.raw === 'object' ? order.raw : {}), billCalledAt: new Date().toISOString() } }
        });
      } });
    }

    if (!actions.length) return;
    await weightedPick(actions).run();
  }

  function scheduleNext() {
    const delay = TICK_MIN_MS + Math.random() * (TICK_MAX_MS - TICK_MIN_MS);
    timer = setTimeout(async () => {
      try { await tick(); } catch (err) { logger?.error('demo_live_ticker_tick_failed', { error: err?.message }); }
      scheduleNext();
    }, delay);
    timer.unref(); // never block process shutdown on its own
  }

  async function start() {
    if (running) return;
    running = true;
    logger?.warn('demo_live_ticker_starting', { restaurantId });
    try {
      menuByName = await resolveMenu();
      await primeFloor();
    } catch (err) {
      logger?.error('demo_live_ticker_start_failed', { error: err?.message });
    }
    scheduleNext();
  }

  function stop() {
    if (timer) clearTimeout(timer);
    timer = null;
    running = false;
  }

  return { start, stop };
}

module.exports = { createDemoLiveTicker };
