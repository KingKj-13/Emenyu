#!/usr/bin/env node
'use strict';
// Phase 2 — seed realistic DEMO order history so analytics + co-occurrence have
// data to read. Every order is stamped three ways for one-command removal:
//   filename prefix 'demo_seed_'  ·  raw.demoSeed = true  ·  notes starts '[DEMO]'
//
//   node scripts/seed-demo-orders.js            # DRY RUN — preview baskets, writes nothing
//   node scripts/seed-demo-orders.js --apply    # purge prior demo set, then seed
//
// Pairings are repeated on purpose (ribeye+Cabernet x5, calamari+crisp white x3,
// wings+draught x3) so the Phase 3 waiter "ordered-together" recs have signal.
// Tenant-scoped. Reuses PrismaOrderService.saveOrder so rows are identical to real
// completed orders (table upsert, items, status history, totals).

const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env'), quiet: true });
dotenv.config({ path: path.resolve(__dirname, '..', '.env'), quiet: true });
// Local dev override: .env.local (gitignored) repoints DATABASE_URL at the local
// database so build/test work never touches prod. No-op in production (no file).
dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env.local'), override: true, quiet: true });

const { getPrisma } = require('../server/services/prismaClient');
const { PrismaOrderService } = require('../server/services/prismaOrderService');

const RESTAURANT_ID = process.env.TRUMP_RESTAURANT_ID || 'trump';
const VAT_RATE = parseFloat(process.env.TRUMP_VAT_RATE || '0.15');
const SERVICE_RATE = parseFloat(process.env.TRUMP_SERVICE_RATE || '0.05');
const APPLY = process.argv.includes('--apply');
const DEMO_PREFIX = 'demo_seed_';

const r2 = n => Math.round(n * 100) / 100;

// Basket spec. `n` = exact item name; `c` = category title (pick a representative
// item from it — used for the wine/beer lists so names + prices stay real).
const BASKETS = [
  { t: 'table4', w: 'Thabo', cov: 2, days: 9, items: [{ n: 'RIBEYE 380g' }, { n: 'CREAMED SPINACH' }, { n: 'STEAKHOUSE CHIPS' }, { c: 'CABERNET SAUVIGNON' }] },
  { t: 'table7', w: 'Lerato', cov: 2, days: 8, items: [{ n: 'RIBEYE 380g' }, { n: 'MASHED POTATOES' }, { c: 'CABERNET SAUVIGNON' }] },
  { t: 'table2', w: 'James', cov: 4, days: 7, items: [{ n: 'RIBEYE 380g', q: 2 }, { n: 'STEAKHOUSE CHIPS', q: 2 }, { c: 'CABERNET SAUVIGNON', q: 2 }] },
  { t: 'table9', w: 'Thabo', cov: 2, days: 5, items: [{ n: 'RIBEYE 380g' }, { c: 'CABERNET SAUVIGNON' }, { n: 'DEATH BY CHOCOLATE CAKE' }] },
  { t: 'table5', w: 'Lerato', cov: 2, days: 2, items: [{ n: 'RIBEYE 380g' }, { n: 'CREAMED SPINACH' }, { c: 'CABERNET SAUVIGNON' }] },
  { t: 'table3', w: 'James', cov: 2, days: 8, items: [{ n: 'GARLIC LEMON CALAMARI' }, { c: 'SAUVIGNON BLANC' }] },
  { t: 'table6', w: 'Thabo', cov: 3, days: 6, items: [{ n: 'GARLIC LEMON CALAMARI' }, { n: 'GREEK SALAD' }, { c: 'SAUVIGNON BLANC' }] },
  { t: 'table1', w: 'Lerato', cov: 2, days: 1, items: [{ n: 'GARLIC LEMON CALAMARI' }, { n: 'SEAFOOD PASTA' }, { c: 'SAUVIGNON BLANC' }] },
  { t: 'table8', w: 'James', cov: 5, days: 7, items: [{ n: 'FIRECRACKER CHICKEN WINGS (400g)', q: 2 }, { c: 'DRAUGHTS', q: 4 }] },
  { t: 'table10', w: 'Thabo', cov: 4, days: 4, items: [{ n: 'FIRECRACKER CHICKEN WINGS (400g)' }, { c: 'DRAUGHTS', q: 3 }] },
  { t: 'table4', w: 'Lerato', cov: 3, days: 3, items: [{ n: 'FIRECRACKER CHICKEN WINGS (400g)' }, { n: 'BEEF BILTONG' }, { c: 'DRAUGHTS', q: 2 }] },
  { t: 'table11', w: 'James', cov: 2, days: 6, items: [{ n: 'TOMAHAWK (FRENCH CUT) 650g' }, { n: 'STEAKHOUSE CHIPS' }, { n: 'CREAMED SPINACH' }, { c: 'RED BLENDS' }] },
  { t: 'table12', w: 'Thabo', cov: 2, days: 5, items: [{ n: 'SPRINGBOK CARPACCIO' }, { n: 'FILLET 260g' }, { c: 'SHIRAZ' }] },
  { t: 'table2', w: 'Lerato', cov: 2, days: 4, items: [{ n: 'TRUMPS SALMON SASHIMI' }, { n: 'CALIFORNIA ROLL - SALMON (8pc)' }, { c: 'SAUVIGNON BLANC' }] },
  { t: 'table7', w: 'James', cov: 2, days: 3, items: [{ n: "LAMB CHOPS 4's 500g" }, { n: 'MASHED POTATOES' }, { c: 'PINOTAGE' }] },
  { t: 'table13', w: 'Thabo', cov: 1, days: 2, items: [{ n: 'VEG BURGER' }, { n: 'STEAKHOUSE CHIPS' }, { c: 'COLD BEVERAGES' }] },
  { t: 'table14', w: 'Lerato', cov: 1, days: 1, items: [{ n: 'CHEESE BURGER' }, { c: 'COLD BEVERAGES' }] },
  { t: 'table5', w: 'James', cov: 4, days: 0, items: [{ n: 'T-BONE 500g', q: 2 }, { n: 'STEAKHOUSE CHIPS', q: 2 }, { c: 'CABERNET SAUVIGNON' }, { n: 'DEATH BY CHOCOLATE CAKE', q: 2 }] },
];

function timestampFor(daysAgo, idx) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(19 + (idx % 3), 15 + (idx * 7) % 40, 0, 0); // plausible dinner service times
  return d;
}

async function main() {
  const prisma = getPrisma();
  const menu = await prisma.menuItem.findMany({
    where: { restaurantId: RESTAURANT_ID },
    select: { name: true, price: true, imagePath: true, category: { select: { title: true } } },
  });
  const byName = new Map(menu.map(m => [m.name.toLowerCase(), m]));
  const byCat = new Map();
  for (const m of menu) {
    const k = (m.category?.title || '').toLowerCase();
    if (!byCat.has(k)) byCat.set(k, []);
    byCat.get(k).push(m);
  }
  const resolve = (spec) => {
    if (spec.n) { const m = byName.get(spec.n.toLowerCase()); if (!m) throw new Error(`menu item not found: ${spec.n}`); return m; }
    const list = byCat.get(spec.c.toLowerCase()); if (!list || !list.length) throw new Error(`category empty/not found: ${spec.c}`);
    return list[0]; // representative item from the list
  };

  const orderService = new PrismaOrderService({ restaurantId: RESTAURANT_ID });

  if (APPLY) {
    const removed = await prisma.order.deleteMany({ where: { restaurantId: RESTAURANT_ID, filename: { startsWith: DEMO_PREFIX } } });
    if (removed.count) console.log(`cleared ${removed.count} prior demo order(s) before reseeding`);
  }

  let seeded = 0, revenue = 0;
  const preview = [];
  for (let i = 0; i < BASKETS.length; i++) {
    const b = BASKETS[i];
    const items = b.items.map(spec => {
      const m = resolve(spec);
      return { name: m.name, price: Number(m.price) || 0, qty: spec.q || 1, img: m.imagePath || '', description: '' };
    });
    const subtotal = r2(items.reduce((s, it) => s + it.price * it.qty, 0));
    const vat = r2(subtotal * VAT_RATE);
    const service = r2(subtotal * SERVICE_RATE);
    const tip = i % 2 === 0 ? r2(subtotal * 0.10) : 0;
    const total = r2(subtotal + vat + service + tip);
    const ts = timestampFor(b.days, i);
    const filename = `${DEMO_PREFIX}${b.t}_${ts.getTime()}_${i}.json`;
    const order = {
      table_number: b.t, waiterName: b.w, covers: b.cov,
      notes: '[DEMO] seeded basket — purge with orders:purge:demo',
      demoSeed: true, timestamp: ts.toISOString(),
      items, totals: { subtotal, vat, service, tip, total },
    };
    revenue += total;
    preview.push(`  ${b.t.padEnd(8)} ${b.w.padEnd(7)} d-${b.days} R${total.toFixed(2).padStart(8)}  ${items.map(it => `${it.qty}× ${it.name}`).join(', ')}`);

    if (APPLY) {
      const saved = await orderService.saveOrder(order, b.t, filename, 'history');
      if (!saved) throw new Error(`saveOrder failed for ${filename}`);
      seeded += 1;
    }
  }

  console.log(`\n${APPLY ? 'SEEDED' : 'DRY RUN'} — restaurantId='${RESTAURANT_ID}' — ${BASKETS.length} baskets, total R${revenue.toFixed(2)}`);
  console.log(preview.join('\n'));
  if (APPLY) console.log(`\n${seeded} demo orders written (status=history). Remove anytime with: npm run orders:purge:demo`);
  if (typeof orderService.close === 'function') await orderService.close();
  await prisma.$disconnect();
}

main().catch(e => { console.error('seed failed:', e.message); process.exit(1); });
