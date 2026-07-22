#!/usr/bin/env node
'use strict';
// Extends seed-demo-orders.js + seed-demo-live.js (does NOT replace either) with
// the categories they don't cover: reservations, guest chat conversations, and a
// broader historical order date range so "Last 30 days" analytics has real
// spread, not just the existing 0-9 day window.
//
//   node scripts/seed-demo-extended.js            # DRY RUN — preview, writes nothing
//   node scripts/seed-demo-extended.js --apply    # write everything below
//   node scripts/seed-demo-extended.js --purge --apply   # remove everything this script added
//
// Tagging (independent purge from seed-demo-orders.js's 'demo_seed_' / seed-demo-live.js's 'demo_live_'):
//   Orders          filename prefix 'demo_month_'
//   Reservation     notes starts '[DEMO]'
//   Chat log entries  message ends with a trailing zero-width space marker (see CHAT_TAG)
//
// Run order for a full demo dataset: seed-bundles --apply, seed-chef-recommendations
// --apply, seed-demo-orders --apply, seed-demo-extended --apply, seed-demo-live --apply
// (live-table snapshot last, since it references the historical orders for ratings).

const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env'), quiet: true });
dotenv.config({ path: path.resolve(__dirname, '..', '.env'), quiet: true });
dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env.local'), override: true, quiet: true });

const { getPrisma } = require('../server/services/prismaClient');
const { PrismaOrderService } = require('../server/services/prismaOrderService');
const { createConfig } = require('../server/utils/helpers');
const { FileService } = require('../server/services/fileService');

const RESTAURANT_ID = process.env.TRUMP_RESTAURANT_ID || 'trump';
const VAT_RATE = parseFloat(process.env.TRUMP_VAT_RATE || '0.15');
const SERVICE_RATE = parseFloat(process.env.TRUMP_SERVICE_RATE || '0.05');
const APPLY = process.argv.includes('--apply');
const PURGE = process.argv.includes('--purge');
const MONTH_PREFIX = 'demo_month_';
const CHAT_TAG = ' ​'; // trailing zero-width space marks a conversation we authored

const r2 = n => Math.round(n * 100) / 100;

function daysAgoAt(daysAgo, hour, minute) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, minute, 0, 0);
  return d;
}

function daysFromNow(days, hour = 19, minute = 0) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, minute, 0, 0);
  return d;
}

// ---------------------------------------------------------------------------
// 1. Extended historical order spread — 10 to 29 days ago (seed-demo-orders.js
//    already owns 0-9 days), same "repeat pairings on purpose" approach so
//    30-day analytics (top items, peak hours, day-of-week) has real signal
//    instead of a cliff at day 9.
// ---------------------------------------------------------------------------
const BASKETS = [
  { t: 'table3', w: 'James', cov: 2, days: 29, hour: 19, items: [{ n: 'RIBEYE 380g' }, { n: 'STEAKHOUSE CHIPS' }, { c: 'CABERNET SAUVIGNON' }] },
  { t: 'table6', w: 'Thabo', cov: 2, days: 27, hour: 20, items: [{ n: 'GARLIC LEMON CALAMARI' }, { c: 'SAUVIGNON BLANC' }] },
  { t: 'table9', w: 'Lerato', cov: 4, days: 25, hour: 13, items: [{ n: 'FIRECRACKER CHICKEN WINGS (400g)', q: 2 }, { c: 'DRAUGHTS', q: 4 }] },
  { t: 'table1', w: 'James', cov: 2, days: 23, hour: 19, items: [{ n: 'RIBEYE 380g' }, { n: 'CREAMED SPINACH' }, { c: 'CABERNET SAUVIGNON' }] },
  { t: 'table11', w: 'Thabo', cov: 3, days: 21, hour: 20, items: [{ n: 'TOMAHAWK (FRENCH CUT) 650g' }, { n: 'STEAKHOUSE CHIPS' }, { c: 'RED BLENDS' }] },
  { t: 'table4', w: 'Lerato', cov: 2, days: 19, hour: 12, items: [{ n: 'GARLIC LEMON CALAMARI' }, { n: 'GREEK SALAD' }, { c: 'SAUVIGNON BLANC' }] },
  { t: 'table8', w: 'James', cov: 5, days: 18, hour: 19, items: [{ n: 'FIRECRACKER CHICKEN WINGS (400g)' }, { n: 'BEEF BILTONG' }, { c: 'DRAUGHTS', q: 3 }] },
  { t: 'table2', w: 'Thabo', cov: 2, days: 16, hour: 20, items: [{ n: 'RIBEYE 380g' }, { n: 'MASHED POTATOES' }, { c: 'CABERNET SAUVIGNON' }, { n: 'DEATH BY CHOCOLATE CAKE' }] },
  { t: 'table12', w: 'Lerato', cov: 2, days: 14, hour: 19, items: [{ n: 'SPRINGBOK CARPACCIO' }, { n: 'FILLET 260g' }, { c: 'SHIRAZ' }] },
  { t: 'table7', w: 'James', cov: 2, days: 12, hour: 13, items: [{ n: "LAMB CHOPS 4's 500g" }, { n: 'MASHED POTATOES' }, { c: 'PINOTAGE' }] },
];

async function resolveMenu(prisma) {
  const menu = await prisma.menuItem.findMany({ where: { restaurantId: RESTAURANT_ID }, select: { name: true, price: true, imagePath: true, category: { select: { title: true } } } });
  const byName = new Map(menu.map(m => [m.name.toLowerCase(), m]));
  const byCat = new Map();
  for (const m of menu) {
    const k = (m.category?.title || '').toLowerCase();
    if (!byCat.has(k)) byCat.set(k, []);
    byCat.get(k).push(m);
  }
  return spec => {
    if (spec.n) { const m = byName.get(spec.n.toLowerCase()); if (!m) throw new Error(`menu item not found: ${spec.n}`); return m; }
    const list = byCat.get(spec.c.toLowerCase()); if (!list || !list.length) throw new Error(`category empty/not found: ${spec.c}`);
    return list[0];
  };
}

async function seedExtendedHistory(prisma, resolve) {
  const orderService = new PrismaOrderService({ restaurantId: RESTAURANT_ID });
  const preview = [];
  let revenue = 0;
  if (APPLY) {
    const removed = await prisma.order.deleteMany({ where: { restaurantId: RESTAURANT_ID, filename: { startsWith: MONTH_PREFIX } } });
    if (removed.count) console.log(`cleared ${removed.count} prior extended-history order(s) before reseeding`);
  }
  for (let i = 0; i < BASKETS.length; i++) {
    const b = BASKETS[i];
    const items = b.items.map(spec => {
      const m = resolve(spec);
      return { name: m.name, price: Number(m.price) || 0, qty: spec.q || 1, img: m.imagePath || '', description: '' };
    });
    const subtotal = r2(items.reduce((s, it) => s + it.price * it.qty, 0));
    const vat = r2(subtotal * VAT_RATE);
    const service = r2(subtotal * SERVICE_RATE);
    const tip = i % 3 === 0 ? r2(subtotal * 0.10) : 0;
    const total = r2(subtotal + vat + service + tip);
    const ts = daysAgoAt(b.days, b.hour, 10 + (i * 7) % 40);
    const filename = `${MONTH_PREFIX}${b.t}_${ts.getTime()}_${i}.json`;
    const order = { table_number: b.t, waiterName: b.w, covers: b.cov, notes: '[DEMO] extended-history basket', demoSeed: true, timestamp: ts.toISOString(), items, totals: { subtotal, vat, service, tip, total } };
    revenue += total;
    preview.push(`  ${b.t.padEnd(8)} ${b.w.padEnd(7)} d-${String(b.days).padStart(2)} R${total.toFixed(2).padStart(8)}  ${items.map(it => `${it.qty}× ${it.name}`).join(', ')}`);
    if (APPLY) {
      const saved = await orderService.saveOrder(order, b.t, filename, 'history');
      if (!saved) throw new Error(`saveOrder failed for ${filename}`);
    }
  }
  if (typeof orderService.close === 'function') await orderService.close();
  return { preview, revenue };
}

// ---------------------------------------------------------------------------
// 2. Reservations — a believable upcoming week plus a couple of recently
//    completed ones, all relative to "now" so this never goes stale.
// ---------------------------------------------------------------------------
const RESERVATIONS = [
  { name: 'Nomvula Khumalo', phone: '082 555 0142', partySize: 6, inDays: 0, hour: 19, minute: 30, status: 'confirmed', notes: '[DEMO] Birthday — requested a table near the window.' },
  { name: 'Peter van der Merwe', phone: '083 555 0198', partySize: 2, inDays: 0, hour: 20, minute: 0, status: 'confirmed', notes: '[DEMO] Anniversary, regular guest.' },
  { name: 'Aisha Patel', phone: '071 555 0173', partySize: 4, inDays: 1, hour: 18, minute: 45, status: 'pending', notes: '[DEMO] Asked about vegetarian options when booking.' },
  { name: 'Corporate — Investec Team', phone: '011 555 0111', partySize: 10, inDays: 2, hour: 19, minute: 0, status: 'confirmed', notes: '[DEMO] Business dinner, requested a private-feeling corner.' },
  { name: 'Sipho Ndlovu', phone: '076 555 0187', partySize: 3, inDays: 4, hour: 19, minute: 15, status: 'confirmed', notes: '[DEMO] Regular monthly booking.' },
  { name: 'Emma Wilson', phone: '084 555 0129', partySize: 2, inDays: -3, hour: 19, minute: 0, status: 'completed', notes: '[DEMO] Past booking — for a "recent activity" trail.' },
  { name: 'The Botha Family', phone: '082 555 0155', partySize: 5, inDays: -6, hour: 13, minute: 0, status: 'completed', notes: '[DEMO] Past Sunday lunch booking.' },
];

async function seedReservations(prisma) {
  const preview = [];
  if (APPLY) {
    const removed = await prisma.reservation.deleteMany({ where: { restaurantId: RESTAURANT_ID, notes: { startsWith: '[DEMO]' } } });
    if (removed.count) console.log(`cleared ${removed.count} prior demo reservation(s) before reseeding`);
  }
  for (const r of RESERVATIONS) {
    const date = daysFromNow(r.inDays, r.hour, r.minute);
    preview.push(`  ${date.toISOString().slice(0, 16).replace('T', ' ')}  ${r.name.padEnd(26)} party of ${String(r.partySize).padEnd(2)} ${r.status.padEnd(10)} ${r.notes}`);
    if (APPLY) {
      await prisma.reservation.create({
        data: { restaurantId: RESTAURANT_ID, name: r.name, phone: r.phone, partySize: r.partySize, date, status: r.status, notes: r.notes }
      });
    }
  }
  return preview;
}

// ---------------------------------------------------------------------------
// 3. Guest chat conversations — realistic exchanges the AI sommelier/concierge
//    plausibly handles, referencing real seeded cart context. Written straight
//    to chat_logs.json via FileService (the same path aiService.appendChatLog
//    uses), dated today so "recent chat activity" always looks current.
// ---------------------------------------------------------------------------
const CONVERSATIONS = [
  { table: 'table2', minutesAgo: 38, message: 'Do you have anything gluten free?', reply: 'A few dishes work well — the Springbok Carpaccio and most of our grilled steaks (ask us to hold any sauce with flour). I’d avoid the pastas and burger buns. Want me to point out a full plate?' },
  { table: 'table5', minutesAgo: 25, message: 'What wine goes with the Wagyu ribeye?', reply: 'For a Wagyu cut this rich, a structured Cabernet or a Shiraz stands up well without fighting the marbling. The Le Riche is a lovely match if you’d like something a step up.' },
  { table: 'table8', minutesAgo: 10, message: 'Is the chicken burger spicy?', reply: 'The BBQ / Peri-Peri Chicken Burger can be made mild on request — just let your waiter know when you order and we’ll go easy on the peri-peri.' },
  { table: 'table11', minutesAgo: 62, message: 'Can we get the tomahawk to share between two?', reply: 'Absolutely — the Tomahawk 850g-900g is built exactly for sharing between two, and we’ll bring extra plates and sides to go with it.' },
  { table: 'table3', minutesAgo: 18, message: 'Whats a good starter before the calamari', reply: 'The calamari is already a lovely light opener on its own — if you’d like something before it, the Greek Salad is a fresh, easy way to start.' },
];

async function seedChatLogs() {
  const config = createConfig(path.resolve(__dirname, '..'));
  const fileService = new FileService(config, {});
  const preview = [];
  for (const c of CONVERSATIONS) {
    const ts = new Date(Date.now() - c.minutesAgo * 60000);
    const entry = {
      tableId: c.table,
      date: ts.toISOString().slice(0, 10),
      timestamp: ts.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' }),
      message: c.message + CHAT_TAG,
      reply: c.reply,
      is_special: false,
    };
    preview.push(`  ${c.table.padEnd(8)} ${entry.timestamp}  Q: "${c.message}"`);
    if (APPLY) await fileService.appendChatLog(entry);
  }
  return preview;
}

async function purge(prisma) {
  const orders = await prisma.order.deleteMany({ where: { restaurantId: RESTAURANT_ID, filename: { startsWith: MONTH_PREFIX } } });
  console.log(`orders: removed ${orders.count} (filename prefix '${MONTH_PREFIX}')`);
  const reservations = await prisma.reservation.deleteMany({ where: { restaurantId: RESTAURANT_ID, notes: { startsWith: '[DEMO]' } } });
  console.log(`reservations: removed ${reservations.count}`);

  const config = createConfig(path.resolve(__dirname, '..'));
  const fileService = new FileService(config, {});
  const history = await fileService.loadChatHistory();
  const kept = history.filter(e => !String(e.message || '').endsWith(CHAT_TAG));
  const removedChat = history.length - kept.length;
  await fileService.writeJson(config.files.chatLogs, kept);
  console.log(`chat log entries: removed ${removedChat}`);
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
  const { preview: historyPreview, revenue } = await seedExtendedHistory(prisma, resolve);
  const reservationPreview = await seedReservations(prisma);
  const chatPreview = await seedChatLogs();

  console.log(`\n${APPLY ? 'SEEDED' : 'DRY RUN'} — restaurantId='${RESTAURANT_ID}'\n`);
  console.log(`Extended historical orders (10-29 days ago, ${BASKETS.length} baskets, R${revenue.toFixed(2)}):\n${historyPreview.join('\n')}\n`);
  console.log(`Reservations (${RESERVATIONS.length}):\n${reservationPreview.join('\n')}\n`);
  console.log(`Chat conversations (${CONVERSATIONS.length}):\n${chatPreview.join('\n')}\n`);
  if (APPLY) console.log('Remove anytime with: node scripts/seed-demo-extended.js --purge --apply');
  await prisma.$disconnect();
}

main().catch(e => { console.error('seed failed:', e.message); process.exit(1); });
