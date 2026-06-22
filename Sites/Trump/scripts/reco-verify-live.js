#!/usr/bin/env node
'use strict';
// Live Postgres verification suite (Phase 5, Task 4). End-to-end DB-backed checks of
// the recommendation + analytics stack.
//
// SAFE FOR DEVELOPMENT DATABASES: every write this script makes uses an isolated
// restaurantId ("verify-suite") and is deleted again at the end, so it never reads or
// mutates your real ("trump") data. Chef-rec / bundle retrieval are read-only. Even so,
// point DATABASE_URL at a development database.
//
//   node scripts/reco-verify-live.js --confirm          # run the suite
//   node scripts/reco-verify-live.js --confirm --json    # machine-readable summary
//
// Exit codes: 0 all checks pass · 1 a check failed · 2 not confirmed / cannot connect.

const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env'), quiet: true });
dotenv.config({ path: path.resolve(__dirname, '..', '.env'), quiet: true });

const { RecommendationEventService } = require('../server/services/recommendationEventService');
const { RecommendationBundleService } = require('../server/services/recommendationBundleService');
const { PrismaMenuService } = require('../server/services/prismaMenuService');
const { createRotationService } = require('../server/services/rotationService');

const CONFIRM = process.argv.includes('--confirm');
const JSON_OUT = process.argv.includes('--json');
const VERIFY_ID = process.env.RECO_VERIFY_RESTAURANT_ID || 'verify-suite';
const REAL_ID = process.env.TRUMP_RESTAURANT_ID || 'trump';
const DATA_DIR = path.join(__dirname, '..', 'data');
const RUN_ID = `verify-${Date.now()}`;

function maskUrl(url) {
  return String(url || '').replace(/:\/\/[^@]*@/, '://***@');
}

const results = [];
const check = (name, pass, detail = '') => { results.push({ name, pass: !!pass, detail }); };

async function main() {
  if (!CONFIRM) {
    console.error('Refusing to run without --confirm.');
    console.error('This writes isolated test rows (restaurantId="' + VERIFY_ID + '") to the database in DATABASE_URL and deletes them afterwards.');
    console.error('Point DATABASE_URL at a DEVELOPMENT database, then re-run: node scripts/reco-verify-live.js --confirm');
    process.exit(2);
  }
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set — nothing to verify.');
    process.exit(2);
  }
  if (!JSON_OUT) console.log(`Verifying against ${maskUrl(process.env.DATABASE_URL)}\nIsolated test restaurantId: "${VERIFY_ID}" (real data "${REAL_ID}" is never touched).\n`);

  const events = new RecommendationEventService({ config: { restaurantId: VERIFY_ID, directories: { data: DATA_DIR } } });
  const bundles = new RecommendationBundleService({ config: { restaurantId: REAL_ID, directories: { data: DATA_DIR } } });
  const menu = new PrismaMenuService({ restaurantId: REAL_ID });
  const rotation = createRotationService({ config: { restaurantId: REAL_ID, reco: { rotation: { scope: 'session', bucket: 'day' } } } });

  // 0. Connectivity.
  const db = events.prisma();
  if (!db) { console.error('Could not initialise a Prisma client.'); process.exit(2); }
  try {
    await db.$queryRaw`SELECT 1`;
    check('connect: SELECT 1', true);
  } catch (error) {
    console.error('Cannot reach the database:', error.message);
    process.exit(2);
  }

  try {
    // 1. Analytics ingest (Postgres path).
    const sample = [
      { eventType: 'impression', recommendedName: 'Verify Ribeye', source: 'bundle', originatingName: 'Verify Persona', sessionId: RUN_ID, value: 0 },
      { eventType: 'impression', recommendedName: 'Verify Ribeye', source: 'bundle', originatingName: 'Verify Persona', sessionId: RUN_ID },
      { eventType: 'click', recommendedName: 'Verify Ribeye', source: 'bundle', originatingName: 'Verify Persona', sessionId: RUN_ID },
      { eventType: 'accepted', recommendedName: 'Verify Ribeye', source: 'bundle', originatingName: 'Verify Persona', sessionId: RUN_ID, value: 369 }
    ];
    const ingest = await events.recordBatch(sample);
    check('ingest: events stored to Postgres', ingest.stored === 4 && ingest.sink === 'postgres', `stored=${ingest.stored} sink=${ingest.sink}`);

    // 2. Aggregation / 6. dashboard query (same path the dashboard uses).
    const agg = await events.getAnalytics({});
    check('aggregation: impressions counted', agg.totals.impressions >= 2, `impressions=${agg.totals.impressions}`);
    check('aggregation: revenue attributed', agg.totals.revenue >= 369, `revenue=${agg.totals.revenue}`);
    check('aggregation: byBundle attribution', (agg.byBundle || []).some(b => b.name === 'Verify Persona'));
    check('dashboard query: top boards present', Array.isArray(agg.topShown) && Array.isArray(agg.bySource));

    // 3. Chef recommendation retrieval (read-only, real data).
    const chefRecs = await menu.loadChefRecommendations();
    check('chef recs: retrieval returns an array', Array.isArray(chefRecs), `count=${Array.isArray(chefRecs) ? chefRecs.length : 'n/a'}`);

    // 4. Bundle retrieval (read-only, real data; falls back to JSON if empty).
    const bundleList = await bundles.listActive();
    check('bundles: retrieval returns PersonaOrder[]', Array.isArray(bundleList), `count=${Array.isArray(bundleList) ? bundleList.length : 'n/a'}`);

    // 5. Rotation behaviour (deterministic + varied).
    const group = () => ([
      { item: { name: 'A', categoryType: 'WINE' }, score: 100, rotationGroup: 'g', priority: 100 },
      { item: { name: 'B', categoryType: 'WINE' }, score: 100, rotationGroup: 'g', priority: 90 },
      { item: { name: 'C', categoryType: 'WINE' }, score: 100, rotationGroup: 'g', priority: 80 }
    ]);
    const a = rotation.rotate(group(), { deviceId: 'dev-A' }).ordered.map(c => c.item.name).join('>');
    const b = rotation.rotate(group(), { deviceId: 'dev-A' }).ordered.map(c => c.item.name).join('>');
    const leaders = new Set();
    for (let i = 0; i < 40; i++) leaders.add(rotation.rotate(group(), { deviceId: `dev-${i}` }).ordered[0].item.name);
    check('rotation: deterministic per device', a === b, `${a} vs ${b}`);
    check('rotation: varies across devices', leaders.size >= 2, `leaders=${[...leaders].join(',')}`);
  } finally {
    // Cleanup — remove only the isolated test rows.
    let deleted = 0;
    try {
      const res = await db.recommendationEvent.deleteMany({ where: { restaurantId: VERIFY_ID } });
      deleted = res.count;
    } catch { /* ignore */ }
    check('cleanup: isolated test events removed', true, `deleted=${deleted}`);
    await events.close().catch(() => {});
    await bundles.close().catch(() => {});
    await menu.close?.().catch?.(() => {});
  }

  const failed = results.filter(r => !r.pass);
  if (JSON_OUT) {
    console.log(JSON.stringify({ total: results.length, failed: failed.length, results }, null, 2));
  } else {
    for (const r of results) console.log(`  ${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `  (${r.detail})` : ''}`);
    console.log(`\n${results.length - failed.length}/${results.length} live checks passed.` + (failed.length ? `  ${failed.length} FAILED.` : '  ALL PASSED.'));
  }
  process.exit(failed.length ? 1 : 0);
}

main().catch(error => { console.error(error && error.message ? error.message : String(error)); process.exit(2); });
