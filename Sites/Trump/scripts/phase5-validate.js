#!/usr/bin/env node
'use strict';
// Phase 5 additive validation harness (no DB). Exercises the NEW pure logic —
// bundle mapping/validation, the analytics attribution extensions, and the
// optimization-insights generator. Phase 3 (reco:validate, 41/41) and Phase 4
// (reco:health:test, 17/17) are separate suites and remain untouched.
//
//   node scripts/phase5-validate.js

const bundleSvc = require('../server/services/recommendationBundleService');
const analytics = require('../server/services/recommendationAnalytics');
const insights = require('../server/services/recommendationInsights');

const results = [];
const check = (name, pass, detail = '') => results.push({ name, pass: !!pass, detail });

// ── Bundles: mapping + validation ─────────────────────────────────────────────
{
  const persona = bundleSvc.toPersonaOrder({
    slug: 'steak', persona: 'The Steak Lover', description: 'Unapologetic.', icon: '🥩', accent: '#a52b2d',
    items: [
      { course: 'Main', itemName: 'RIBEYE', price: 369, sortOrder: 2 },
      { course: 'Drink', itemName: 'TRUMPS', price: 225, sortOrder: 0 }
    ]
  });
  check('toPersonaOrder maps id/persona/blurb', persona.id === 'steak' && persona.persona === 'The Steak Lover' && persona.blurb === 'Unapologetic.');
  check('toPersonaOrder sorts courses by sortOrder', persona.courses[0].name === 'TRUMPS' && persona.courses[1].name === 'RIBEYE', JSON.stringify(persona.courses.map(c => c.name)));
}
{
  const ok = bundleSvc.sanitizeBundleInput({ persona: 'X', items: [{ itemName: 'A', price: 10, course: 'Main' }, { name: 'B', price: '5' }] });
  check('sanitizeBundleInput accepts valid input', !ok.error && ok.value.persona === 'X' && ok.value.items.length === 2);
  check('sanitizeBundleInput supports name/price coercion', ok.value && ok.value.items[1].itemName === 'B' && ok.value.items[1].price === 5);
  check('sanitizeBundleInput requires persona', !!bundleSvc.sanitizeBundleInput({}, { partial: false }).error);
  check('sanitizeBundleInput rejects non-numeric priority', !!bundleSvc.sanitizeBundleInput({ persona: 'X', priority: 'abc' }).error);
  check('sanitizeBundleInput partial allows missing persona', !bundleSvc.sanitizeBundleInput({ priority: 5 }, { partial: true }).error);
}

// ── Analytics attribution extensions ──────────────────────────────────────────
{
  const ev = [
    { eventType: 'impression', recommendedName: 'RIBEYE', source: 'bundle', originatingName: 'The Steak Lover' },
    { eventType: 'impression', recommendedName: 'TRUMPS', source: 'bundle', originatingName: 'The Steak Lover' },
    { eventType: 'impression', recommendedName: 'RIBEYE', source: 'bundle', originatingName: 'The Steak Lover' },
    { eventType: 'accepted', recommendedName: 'RIBEYE', source: 'bundle', originatingName: 'The Steak Lover', value: 369 }
  ];
  const agg = analytics.aggregate(ev, {}, { minImpressions: 1 });
  check('byBundle groups bundle events by persona', agg.byBundle.length === 1 && agg.byBundle[0].name === 'The Steak Lover' && agg.byBundle[0].impressions === 3, JSON.stringify(agg.byBundle));
  check('revenuePerImpression on totals', agg.totals.revenuePerImpression === Number((369 / 3).toFixed(2)), `got ${agg.totals.revenuePerImpression}`);
}
{
  const ev = [];
  for (let i = 0; i < 10; i++) ev.push({ eventType: 'impression', recommendedName: 'Dud', source: 'cart' });
  for (let i = 0; i < 10; i++) ev.push({ eventType: 'impression', recommendedName: 'Star', source: 'cart' });
  for (let i = 0; i < 5; i++) ev.push({ eventType: 'accepted', recommendedName: 'Star', source: 'cart', value: 100 });
  const agg = analytics.aggregate(ev, {}, { minImpressions: 5 });
  check('underperforming surfaces the low converter first', agg.underperforming[0] && agg.underperforming[0].name === 'Dud', agg.underperforming[0] && agg.underperforming[0].name);
  check('topConverting surfaces the high converter first', agg.topConverting[0] && agg.topConverting[0].name === 'Star', agg.topConverting[0] && agg.topConverting[0].name);
}

// ── Optimization insights ─────────────────────────────────────────────────────
{
  const ev = [];
  for (let i = 0; i < 30; i++) ev.push({ eventType: 'impression', recommendedName: 'Snails', source: 'cart' });
  ev.push({ eventType: 'accepted', recommendedName: 'Snails', source: 'cart', value: 80 });
  const agg = analytics.aggregate(ev, {}, { minImpressions: 5 });
  const r = insights.generate({ analytics: agg, health: { issues: [] }, chefRecs: [], items: [] });
  check('insight: dead recommendation detected', r.insights.some(i => i.type === 'dead_recommendation' && i.severity === 'high'));
}
{
  const r = insights.generate({ analytics: { items: [], byRotationGroup: [] }, health: { issues: [{ level: 'warn', code: 'disabled_target', message: 'X hidden', recId: 5 }] }, chefRecs: [], items: [] });
  check('insight: disabled target surfaced as high severity', r.insights.some(i => i.type === 'disabled_target' && i.severity === 'high'));
}
{
  const r = insights.generate({
    analytics: { items: [], byRotationGroup: [] }, health: { issues: [] }, chefRecs: [],
    items: [{ dbId: 1, name: 'Ribeye', categoryType: 'MAIN', available: true, visible: true }, { dbId: 2, name: 'Coke', categoryType: 'DRINK', available: true, visible: true }]
  });
  check('insight: missing pairing for an un-paired main', r.insights.some(i => i.type === 'missing_pairing' && /Ribeye/.test(i.title)));
  check('insight: no missing pairing for non-mains', !r.insights.some(i => i.type === 'missing_pairing' && /Coke/.test(i.title)));
}
{
  const r = insights.generate({ analytics: { items: [], byRotationGroup: [{ rotationGroup: 'reds', impressions: 30, acceptanceRate: 0.02 }] }, health: { issues: [] }, chefRecs: [], items: [] });
  check('insight: poor rotation group flagged', r.insights.some(i => i.type === 'poor_rotation_group'));
}
{
  const r = insights.generate({
    analytics: { items: [], byRotationGroup: [{ rotationGroup: 'reds', impressions: 30, acceptanceRate: 0.02 }] },
    health: { issues: [{ level: 'warn', code: 'disabled_target', message: 'X', recId: 1 }] }, chefRecs: [], items: []
  });
  check('insights sorted high-severity first', r.insights[0] && r.insights[0].severity === 'high');
}

const failed = results.filter(r => !r.pass);
for (const r of results) console.log(`  ${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.pass ? '' : `\n        ↳ ${r.detail}`}`);
console.log(`\n${results.length - failed.length}/${results.length} Phase 5 checks passed.` + (failed.length ? `  ${failed.length} FAILED.` : '  ALL PASSED.'));
process.exit(failed.length ? 1 : 0);
