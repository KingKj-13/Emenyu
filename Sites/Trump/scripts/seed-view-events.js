#!/usr/bin/env node
// Demo guest-engagement data: simulates guests browsing the menu, opening
// dishes, watching videos and exploring the butchery chart, so the
// Engagement / "most viewed" / "most-watched video" analytics have
// something real to show instead of empty charts.
//
// Writes ViewEvent rows directly (the same table POST /api/engagement writes
// to) -- nothing here is a special "demo" code path, it's the same data shape
// a real guest session produces. Safe to re-run: each run adds a fresh batch
// of sessions rather than mutating existing ones.
//
// Usage: node scripts/seed-view-events.js [restaurantId]
process.env.TZ = 'Africa/Johannesburg';

const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const RESTAURANT_ID = process.argv[2] || 'trump';

// [id, name, category, hasVideo] -- real Trump menu rows. Signature/hero
// dishes are the ones plausibly carrying a video asset; sides/drinks/desserts
// get view interest only, matching how the guest app actually behaves.
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
  [96, 'KUDU ±450g', 'VENISON & GAME (Subject to availability)', false, 2],
  [95, 'OSTRICH FILLET ±450g', 'VENISON & GAME (Subject to availability)', false, 2],
  [98, 'OXTAIL', 'OXTAIL AND BEEF RIBS', false, 3],
  [89, 'EISBEIN ±1kg', 'PORK', false, 2],
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

const CATEGORIES = [...new Set(ITEMS.map(i => i[2]))];
const CUTS = [
  ['sirloin', 'Sirloin'], ['fillet', 'Fillet'], ['rump', 'Rump'], ['rib', 'Prime Rib'],
  ['chuck', 'Chuck'], ['thickflank', 'Thick Flank'], ['brisket', 'Brisket'],
];
const LOCALES = ['en', 'en', 'en', 'en', 'af', 'de', 'fr', 'zh-Hans', 'pt-BR', 'ja'];
const DEVICES = ['phone', 'phone', 'phone', 'phone', 'tablet', 'desktop'];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function weightedPick(list) {
  const total = list.reduce((s, r) => s + r[4], 0);
  let r = Math.random() * total;
  for (const row of list) {
    r -= row[4];
    if (r <= 0) return row;
  }
  return list[list.length - 1];
}
function sessionId() { return crypto.randomBytes(10).toString('hex'); }

function buildSession(baseDate) {
  const sid = sessionId();
  const locale = pick(LOCALES);
  const deviceType = pick(DEVICES);
  const hour = 12 + Math.floor(Math.random() * 10); // 12:00-21:59
  const minute = Math.floor(Math.random() * 60);
  const base = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), hour, minute, Math.floor(Math.random() * 60));

  const rows = [];
  let t = 0;
  const at = offsetSec => new Date(base.getTime() + offsetSec * 1000);
  const common = { restaurantId: RESTAURANT_ID, sessionId: sid, locale, deviceType, tableId: '' };

  rows.push({ ...common, eventType: 'MENU_VIEW', createdAt: at(t) });
  t += 4 + Math.random() * 8;

  if (Math.random() < 0.7) {
    rows.push({ ...common, eventType: 'LANGUAGE_SELECT', createdAt: at(t) });
    t += 2;
  }

  const categoriesToBrowse = 1 + Math.floor(Math.random() * 3);
  for (let c = 0; c < categoriesToBrowse; c++) {
    rows.push({ ...common, eventType: 'CATEGORY_VIEW', categoryName: pick(CATEGORIES), createdAt: at(t) });
    t += 3 + Math.random() * 8;
  }

  const itemsToView = 2 + Math.floor(Math.random() * 5);
  const seen = new Set();
  for (let i = 0; i < itemsToView; i++) {
    const [id, name, category, hasVideo] = weightedPick(ITEMS);
    if (seen.has(id)) continue;
    seen.add(id);

    const dwellMs = Math.round((8 + Math.random() * 70) * 1000);
    rows.push({
      ...common, eventType: 'ITEM_VIEW', menuItemId: id, label: name, categoryName: category,
      dwellMs, createdAt: at(t),
    });
    t += dwellMs / 1000;

    if (hasVideo && Math.random() < 0.65) {
      rows.push({ ...common, eventType: 'VIDEO_PLAY', menuItemId: id, label: name, createdAt: at(t) });
      const loopLen = 12 + Math.random() * 25; // a looping dish video, 12-37s
      const watchedSec = Math.random() < 0.55 ? loopLen : loopLen * (0.3 + Math.random() * 0.6);
      if (watchedSec >= loopLen / 2) {
        rows.push({
          ...common, eventType: 'VIDEO_PROGRESS', menuItemId: id, label: name,
          positionSec: Math.round(loopLen / 2), createdAt: at(t + loopLen / 2),
        });
      }
      if (watchedSec >= loopLen - 0.5) {
        rows.push({
          ...common, eventType: 'VIDEO_COMPLETE', menuItemId: id, label: name,
          positionSec: Math.round(loopLen), createdAt: at(t + loopLen),
        });
      }
      t += watchedSec;
    }
  }

  if (Math.random() < 0.3) {
    const [slug, name] = pick(CUTS);
    rows.push({ ...common, eventType: 'CUT_VIEW', cutSlug: slug, label: name, createdAt: at(t) });
  }

  return rows;
}

async function main() {
  const DAYS = 14;
  const now = new Date();
  const events = [];
  let sessionCount = 0;

  for (let d = 0; d < DAYS; d++) {
    // Heavier today/yesterday, tapering off — matches a real traffic curve
    // better than a flat count per day, and keeps "Today" non-empty.
    const sessionsToday = d === 0 ? 45 : Math.max(6, Math.round(28 * Math.exp(-d / 6)));
    const day = new Date(now.getTime() - d * 86400000);
    for (let s = 0; s < sessionsToday; s++) {
      events.push(...buildSession(day));
      sessionCount += 1;
    }
  }

  const BATCH = 500;
  for (let i = 0; i < events.length; i += BATCH) {
    await prisma.viewEvent.createMany({ data: events.slice(i, i + BATCH) });
  }

  console.log(`Inserted ${events.length} view events across ${sessionCount} sessions for restaurantId="${RESTAURANT_ID}"`);
  await prisma.$disconnect();
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
