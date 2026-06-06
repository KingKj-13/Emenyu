#!/usr/bin/env node
'use strict';
// Recommendation performance micro-benchmark (Phase 5, Task 6). Times the pure,
// CPU-bound hot paths (no DB) so the dashboard-aggregation and per-request work can be
// characterised offline and reproducibly. DB-bound latency (the network round-trips) is
// analysed statically in docs/phase5/performance.md and measured live with reco:verify:live.
//
//   node scripts/reco-bench.js          # human-readable
//   node scripts/reco-bench.js --json    # machine-readable

const analytics = require('../server/services/recommendationAnalytics');
const classifier = require('../server/services/categoryClassifier');
const health = require('../server/services/recommendationHealth');
const { createRotationService } = require('../server/services/rotationService');
const { toPersonaOrder } = require('../server/services/recommendationBundleService');

const JSON_OUT = process.argv.includes('--json');

function timeIt(fn) {
  const start = process.hrtime.bigint();
  fn();
  return Number(process.hrtime.bigint() - start) / 1e6; // ms
}

const NAMES = ['Tomahawk Steak', 'Margarita', 'Porcupine Ridge Shiraz', 'Malva Pudding', 'Calamari Starter', 'Heineken', 'Cappuccino', 'Still Water'];

// Build a realistic event corpus.
function makeEvents(n) {
  const ev = [];
  for (let i = 0; i < n; i++) {
    const name = NAMES[i % NAMES.length];
    const type = i % 5 === 0 ? 'accepted' : i % 3 === 0 ? 'click' : 'impression';
    ev.push({ eventType: type, recommendedName: name, source: i % 2 ? 'cart' : 'chat', recType: 'MAIN', rotationGroup: i % 4 ? '' : 'reds', value: type === 'accepted' ? 200 : 0, createdAt: new Date(Date.now() - i * 1000) });
  }
  return ev;
}

const benches = [];
const add = (name, iterations, ms) => benches.push({ name, iterations, ms: Number(ms.toFixed(2)), perOp: Number((ms / iterations).toFixed(5)) });

// 1. Dashboard aggregation over a large event window.
for (const n of [1000, 10000, 50000]) {
  const ev = makeEvents(n);
  const ms = timeIt(() => analytics.aggregate(ev, {}, { minImpressions: 5 }));
  add(`aggregate(${n} events)`, 1, ms);
}

// 2. Classifier throughput (per served menu item).
{
  const N = 50000;
  const ms = timeIt(() => { for (let i = 0; i < N; i++) { const t = classifier.categoryType(NAMES[i % NAMES.length]); classifier.beverageKind(NAMES[i % NAMES.length]); void t; } });
  add('classify (categoryType+beverageKind)', N, ms);
}

// 3. Rotation throughput (per recommendation request).
{
  const rotation = createRotationService({ config: { restaurantId: 'trump', reco: { rotation: {} } } });
  const cands = () => ([
    { item: { name: 'A' }, score: 100, rotationGroup: 'g', priority: 100 },
    { item: { name: 'B' }, score: 100, rotationGroup: 'g', priority: 90 },
    { item: { name: 'C' }, score: 100, rotationGroup: 'g', priority: 80 }
  ]);
  const N = 5000;
  const ms = timeIt(() => { for (let i = 0; i < N; i++) rotation.rotate(cands(), { deviceId: `d${i}` }); });
  add('rotate (3-member group)', N, ms);
}

// 4. Bundle mapping.
{
  const N = 5000;
  const b = { slug: 's', persona: 'P', description: 'd', icon: 'x', accent: '#000', items: [{ course: 'Main', itemName: 'X', price: 1, sortOrder: 0 }, { course: 'Drink', itemName: 'Y', price: 2, sortOrder: 1 }] };
  const ms = timeIt(() => { for (let i = 0; i < N; i++) toPersonaOrder(b); });
  add('toPersonaOrder', N, ms);
}

// 5. Health analyze over a synthetic chef-rec graph.
{
  const items = Array.from({ length: 200 }, (_, i) => ({ id: i + 1, name: `Item ${i}`, available: true, visible: true }));
  const recs = Array.from({ length: 400 }, (_, i) => ({ id: i + 1, sourceItemId: (i % 200) + 1, targetItemId: ((i + 1) % 200) + 1, recType: 'BEVERAGE', priority: 100, rotationGroup: i % 5 ? 'g' + (i % 20) : '', active: true }));
  const ms = timeIt(() => health.analyze({ recommendations: recs, items }));
  add('health.analyze (400 recs / 200 items)', 1, ms);
}

if (JSON_OUT) {
  console.log(JSON.stringify({ node: process.version, benches }, null, 2));
} else {
  console.log(`Recommendation micro-benchmark (Node ${process.version})\n`);
  console.log('  path                                        iters       total ms     per-op ms');
  console.log('  ' + '-'.repeat(78));
  for (const b of benches) {
    console.log('  ' + b.name.padEnd(42) + String(b.iterations).padStart(8) + String(b.ms).padStart(13) + String(b.perOp).padStart(14));
  }
  console.log('\n  (Pure CPU paths only — DB latency is measured by reco:verify:live.)');
}
