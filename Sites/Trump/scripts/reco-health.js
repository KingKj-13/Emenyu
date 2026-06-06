#!/usr/bin/env node
'use strict';
// Recommendation data-integrity health check (Phase 4, Task 4).
//
//   node scripts/reco-health.js            # check live chef recs against the menu (needs DB)
//   node scripts/reco-health.js --json      # machine-readable report
//   node scripts/reco-health.js --selftest  # offline fixture tests (no DB) for the
//                                            #   health analyzer + analytics aggregator
//
// Exit codes: 0 = healthy / all self-tests pass; 1 = fail-level issues or a failing
// self-test; 2 = could not run the live check (database unreachable).

const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env'), quiet: true });
dotenv.config({ path: path.resolve(__dirname, '..', '.env'), quiet: true });

const health = require('../server/services/recommendationHealth');
const analytics = require('../server/services/recommendationAnalytics');

const JSON_OUT = process.argv.includes('--json');
const SELFTEST = process.argv.includes('--selftest');

// ── Offline self-test ─────────────────────────────────────────────────────────
function selftest() {
  const results = [];
  const check = (name, pass, detail = '') => results.push({ name, pass: !!pass, detail });
  const has = (report, code) => report.issues.some(i => i.code === code);
  const C = health.CODES;

  // Health analyzer — one focused fixture per rule.
  check('orphaned source detected',
    !health.analyze({ items: [{ id: 1, name: 'A' }], recommendations: [{ id: 1, sourceItemId: 99, targetItemId: 1, recType: 'DISH', priority: 1, active: true }] }).ok);
  check('missing target detected',
    has(health.analyze({ items: [{ id: 1, name: 'A' }], recommendations: [{ id: 1, sourceItemId: 1, targetItemId: 99, recType: 'DISH', priority: 1, active: true }] }), C.MISSING_TARGET));
  {
    const r = health.analyze({ items: [{ id: 1, name: 'A' }, { id: 2, name: 'B', available: false }], recommendations: [{ id: 1, sourceItemId: 1, targetItemId: 2, recType: 'DISH', priority: 1, active: true }] });
    check('disabled target detected (warn, not fail)', has(r, C.DISABLED_TARGET) && r.ok);
  }
  check('circular chain detected',
    has(health.analyze({ items: [{ id: 1, name: 'A' }, { id: 2, name: 'B' }], recommendations: [{ id: 1, sourceItemId: 1, targetItemId: 2, recType: 'DISH', priority: 1, active: true }, { id: 2, sourceItemId: 2, targetItemId: 1, recType: 'DISH', priority: 1, active: true }] }), C.CIRCULAR_CHAIN));
  check('single-member rotation group flagged',
    has(health.analyze({ items: [{ id: 1, name: 'A' }, { id: 2, name: 'B' }], recommendations: [{ id: 1, sourceItemId: 1, targetItemId: 2, recType: 'BEVERAGE', priority: 1, rotationGroup: 'g', active: true }] }), C.INVALID_ROTATION_GROUP));
  check('rotation group spanning sources flagged',
    has(health.analyze({ items: [{ id: 1, name: 'A' }, { id: 2, name: 'B' }, { id: 3, name: 'C' }], recommendations: [{ id: 1, sourceItemId: 1, targetItemId: 2, recType: 'BEVERAGE', priority: 1, rotationGroup: 'g', active: true }, { id: 2, sourceItemId: 3, targetItemId: 2, recType: 'BEVERAGE', priority: 1, rotationGroup: 'g', active: true }] }), C.INVALID_ROTATION_GROUP));
  check('duplicate priority conflict detected',
    has(health.analyze({ items: [{ id: 1, name: 'A' }, { id: 2, name: 'B' }, { id: 3, name: 'C' }], recommendations: [{ id: 1, sourceItemId: 1, targetItemId: 2, recType: 'BEVERAGE', priority: 100, active: true }, { id: 2, sourceItemId: 1, targetItemId: 3, recType: 'BEVERAGE', priority: 100, active: true }] }), C.DUPLICATE_PRIORITY));
  check('shared rotation group is NOT a duplicate-priority conflict',
    !has(health.analyze({ items: [{ id: 1, name: 'A' }, { id: 2, name: 'B' }, { id: 3, name: 'C' }], recommendations: [{ id: 1, sourceItemId: 1, targetItemId: 2, recType: 'BEVERAGE', priority: 100, rotationGroup: 'reds', active: true }, { id: 2, sourceItemId: 1, targetItemId: 3, recType: 'BEVERAGE', priority: 100, rotationGroup: 'reds', active: true }] }), C.DUPLICATE_PRIORITY));
  {
    const clean = health.analyze({ items: [{ id: 1, name: 'A' }, { id: 2, name: 'B' }, { id: 3, name: 'C' }], recommendations: [{ id: 1, sourceItemId: 1, targetItemId: 2, recType: 'BEVERAGE', priority: 100, rotationGroup: 'reds', active: true }, { id: 2, sourceItemId: 1, targetItemId: 3, recType: 'BEVERAGE', priority: 90, rotationGroup: 'reds', active: true }] });
    check('clean data set → ok with no issues', clean.ok && clean.issues.length === 0);
  }

  // Analytics aggregator.
  const events = [
    { eventType: 'impression', recommendedName: 'Shiraz', source: 'cart', value: 0 },
    { eventType: 'impression', recommendedName: 'Shiraz', source: 'cart' },
    { eventType: 'impression', recommendedName: 'Shiraz', source: 'cart' },
    { eventType: 'click', recommendedName: 'Shiraz', source: 'cart' },
    { eventType: 'accepted', recommendedName: 'Shiraz', source: 'cart', value: 120 },
    { eventType: 'ordered', recommendedName: 'Shiraz', source: 'cart', value: 120 },
    { eventType: 'impression', recommendedName: 'Margarita', source: 'chat' },
    { eventType: 'impression', recommendedName: 'Margarita', source: 'chat' },
    { eventType: 'dismissed', recommendedName: 'Margarita', source: 'chat' }
  ];
  const agg = analytics.aggregate(events, {}, { minImpressions: 1 });
  check('aggregate totals.impressions = 5', agg.totals.impressions === 5, `got ${agg.totals.impressions}`);
  check('aggregate revenue = 120', agg.totals.revenue === 120, `got ${agg.totals.revenue}`);
  check('aggregate acceptanceRate = 0.2', agg.totals.acceptanceRate === 0.2, `got ${agg.totals.acceptanceRate}`);
  check('topShown leader is Shiraz', agg.topShown[0] && agg.topShown[0].name === 'Shiraz', agg.topShown[0] && agg.topShown[0].name);
  check('source filter (chat) → 2 impressions', analytics.aggregate(events, { source: 'chat' }).totals.impressions === 2);
  check('sanitizeEvent rejects bad type', analytics.sanitizeEvent({ eventType: 'nope', recommendedName: 'X' }) === null);
  check('sanitizeEvent rejects missing name', analytics.sanitizeEvent({ eventType: 'click' }) === null);
  check('sanitizeEvent accepts a valid event', !!analytics.sanitizeEvent({ eventType: 'click', recommendedName: 'X' }));

  const failed = results.filter(r => !r.pass);
  for (const r of results) console.log(`  ${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.pass ? '' : `\n        ↳ ${r.detail}`}`);
  console.log(`\n${results.length - failed.length}/${results.length} self-tests passed.` + (failed.length ? `  ${failed.length} FAILED.` : '  ALL PASSED.'));
  return failed.length === 0;
}

// ── Live check against the database ───────────────────────────────────────────
function renderReport(report) {
  if (JSON_OUT) { console.log(JSON.stringify(report, null, 2)); return; }
  const { summary, issues } = report;
  console.log(`Recommendation health — ${summary.recommendations} chef recs (${summary.active} active) against ${summary.items} menu items.`);
  if (issues.length === 0) {
    console.log('\n  No issues found. ✓');
  } else {
    const fails = issues.filter(i => i.level === 'fail');
    const warns = issues.filter(i => i.level === 'warn');
    if (fails.length) { console.log(`\nFAILURES (${fails.length}):`); fails.forEach(i => console.log(`  ✗ [${i.code}] ${i.message}`)); }
    if (warns.length) { console.log(`\nWARNINGS (${warns.length}):`); warns.forEach(i => console.log(`  ! [${i.code}] ${i.message}`)); }
  }
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`${report.ok ? 'HEALTHY' : 'UNHEALTHY'} — ${summary.fail} failure(s), ${summary.warn} warning(s).`);
}

async function liveCheck() {
  const restaurantId = process.env.TRUMP_RESTAURANT_ID || 'trump';
  let prisma;
  try {
    const { PrismaClient } = require('@prisma/client');
    prisma = new PrismaClient();
  } catch (error) {
    console.error('Prisma client unavailable:', error.message);
    process.exit(2);
  }
  try {
    const [recs, items] = await Promise.all([
      prisma.menuItemRecommendation.findMany({ where: { restaurantId } }),
      prisma.menuItem.findMany({ where: { restaurantId }, select: { id: true, name: true, available: true, visible: true } })
    ]);
    const byId = new Map(items.map(i => [i.id, i.name]));
    const enriched = recs.map(r => ({ ...r, sourceName: byId.get(r.sourceItemId), targetName: byId.get(r.targetItemId) }));
    const report = health.analyze({ recommendations: enriched, items });
    renderReport(report);
    await prisma.$disconnect();
    process.exit(report.ok ? 0 : 1);
  } catch (error) {
    console.error('Could not run the live health check (is the database reachable?):', error.message);
    console.error('Run `node scripts/reco-health.js --selftest` to validate the analyzer offline.');
    try { await prisma.$disconnect(); } catch { /* ignore */ }
    process.exit(2);
  }
}

if (SELFTEST) {
  process.exit(selftest() ? 0 : 1);
} else {
  liveCheck();
}
