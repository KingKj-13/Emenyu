#!/usr/bin/env node
'use strict';
// Phase 2.5 (Hospitality Intelligence) validation harness.
//
//   node scripts/hospitality-validate.js            # human report, exit 0/1
//   node scripts/hospitality-validate.js --json       # machine-readable summary
//   node scripts/hospitality-validate.js --report      # write data/hospitality-report.json
//
// Pulls REAL menu items (name/price/category/tags) from the local Postgres DB,
// randomly samples >=100 across every category (Wine, Beer, Cocktails, Steaks,
// Seafood, Chicken, Pasta, Pizza, Burgers, Desserts, Vegetarian, Kids, ...),
// and runs each through the real reasonComposer/templateNlgProvider (the exact
// engine cards/chat/waiter use) — not a re-implementation. Flags anything that
// reads artificial: banned marketing words, > 5 sentences, or two DIFFERENT
// pairings producing byte-identical text (the sign a template isn't varying).

const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env'), quiet: true });
dotenv.config({ path: path.resolve(__dirname, '..', '.env'), quiet: true });
dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env.local'), override: true, quiet: true });

const { getPrisma } = require('../server/services/prismaClient');
const classifier = require('../server/services/categoryClassifier');
const { createHeroPairings } = require('../server/services/heroPairings');
const { createReasonComposer } = require('../server/services/reasonComposer');

const RESTAURANT_ID = process.env.TRUMP_RESTAURANT_ID || 'trump';
const WRITE_REPORT = process.argv.includes('--report');
const JSON_OUT = process.argv.includes('--json');
const SAMPLE_SIZE = 150; // Phase 3 (Dining Concierge): "randomly review at least 150 menu items"
const BANNED = /\b(exquisite|indulgent|symphony|journey|luxurious experience)\b/i;
const TONES = ['casual', 'professional', 'luxury'];

function lc(v) { return String(v || '').toLowerCase(); }
function isBev(it) { return ['WINE', 'DRINK'].includes(it.categoryType); }
function sentenceCount(s) { return (s.match(/[.!?]+(?:\s|$)/g) || []).length || 1; }

function toItem(row) {
  const category = row.category?.parent?.title || row.category?.title || '';
  const subcategory = row.category?.parent ? row.category.title : '';
  const cls = classifier.classify({ name: row.name, category, subcategory });
  return {
    name: row.name,
    price: Number(row.price) || 0,
    category,
    subcategory,
    categoryType: cls.categoryType,
    tags: row.metadata && typeof row.metadata === 'object' ? row.metadata.tags : undefined
  };
}

// Deterministic shuffle (no Math.random dependency needed, but this is a
// dev-only script — fine to use it here for sampling variety across runs).
function sample(arr, n) {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

function pickAnchor(item, pool) {
  const wantBev = !isBev(item);
  const candidates = pool.filter(p => isBev(p) === wantBev && p.name !== item.name);
  if (!candidates.length) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

(async () => {
  const prisma = getPrisma();
  const rows = await prisma.menuItem.findMany({
    where: { restaurantId: RESTAURANT_ID },
    select: { id: true, name: true, price: true, metadata: true, category: { select: { title: true, parent: { select: { title: true } } } } },
    orderBy: { id: 'asc' }
  });
  const items = rows.map(toItem).filter(it => it.tags);
  const heroPairings = createHeroPairings();
  const reason = createReasonComposer({ heroPairings });

  const byCategory = new Map();
  items.forEach(it => {
    const key = it.category || 'Uncategorised';
    if (!byCategory.has(key)) byCategory.set(key, []);
    byCategory.get(key).push(it);
  });

  // Stratified sample: at least 1 per category, then fill to SAMPLE_SIZE.
  let picked = [];
  for (const [, list] of byCategory) picked.push(list[Math.floor(Math.random() * list.length)]);
  if (picked.length < SAMPLE_SIZE) {
    const remaining = items.filter(it => !picked.includes(it));
    picked = picked.concat(sample(remaining, SAMPLE_SIZE - picked.length));
  }
  picked = picked.slice(0, Math.max(SAMPLE_SIZE, picked.length));

  const seenText = new Set();
  let collisions = 0;
  const flagged = [];
  const byCategoryExamples = new Map();
  const stats = { total: 0, byTone: { casual: 0, professional: 0, luxury: 0 }, banned: 0, tooLong: 0 };

  for (const item of picked) {
    const anchor = pickAnchor(item, items);
    for (const tone of TONES) {
      const text = await reason.pairingReason(item, anchor, { tone });
      stats.total += 1;
      stats.byTone[tone] += 1;
      const sc = sentenceCount(text);
      const isBanned = BANNED.test(text);
      const tooLong = sc > 5;
      if (isBanned) { stats.banned += 1; flagged.push({ item: item.name, tone, reason: 'banned-word', text }); }
      if (tooLong) { stats.tooLong += 1; flagged.push({ item: item.name, tone, reason: 'too-long', text }); }
      const key = text.trim().toLowerCase();
      if (seenText.has(key)) collisions += 1;
      seenText.add(key);

      if (tone === 'casual') {
        const cat = item.category || 'Uncategorised';
        if (!byCategoryExamples.has(cat)) byCategoryExamples.set(cat, []);
        if (byCategoryExamples.get(cat).length < 2) {
          byCategoryExamples.get(cat).push({ item: item.name, anchor: anchor?.name || null, text });
        }
      }
    }
  }

  const collisionRate = collisions / stats.total;
  const pass = flagged.length === 0 && collisionRate < 0.15;

  if (JSON_OUT) {
    console.log(JSON.stringify({ pass, sampled: picked.length, categories: byCategory.size, ...stats, collisions, collisionRate }, null, 2));
  } else {
    console.log(`\nHospitality Intelligence validation — restaurantId='${RESTAURANT_ID}'`);
    console.log(`sampled: ${picked.length} items across ${byCategory.size} categories | generations: ${stats.total} (3 tones each)`);
    console.log(`banned-word hits: ${stats.banned} | over-length (>5 sentences): ${stats.tooLong} | exact-text collisions: ${collisions} (${(collisionRate * 100).toFixed(1)}%)`);
    if (flagged.length) {
      console.log('\nFLAGGED:');
      flagged.slice(0, 20).forEach(f => console.log(`  [${f.reason}] ${f.item} (${f.tone}): ${f.text}`));
    }
    console.log(`\nresult: ${pass ? 'PASS' : 'FAIL'}`);
  }

  if (WRITE_REPORT) {
    const fs = require('fs');
    const examples = [...byCategoryExamples.entries()].map(([category, ex]) => ({ category, examples: ex }));
    fs.writeFileSync(
      path.join(__dirname, '..', 'data', 'hospitality-report.json'),
      JSON.stringify({ generatedAt: new Date().toISOString(), pass, sampled: picked.length, categories: byCategory.size, ...stats, collisions, collisionRate, examples }, null, 2)
    );
    console.log(`\nreport -> data/hospitality-report.json`);
  }

  await prisma.$disconnect();
  process.exit(pass ? 0 : 1);
})().catch(e => { console.error('hospitality-validate failed:', e.message); process.exit(1); });
