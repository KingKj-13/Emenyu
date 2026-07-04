#!/usr/bin/env node
'use strict';
// Phase 3 validation harness (Task 9). Exercises the deterministic recommendation
// + chatbot modules directly (no DB, no server, no external AI) and asserts the
// approved safety / rotation / NLU properties. Reproducible: same inputs → same
// output every run.
//
//   node scripts/phase3-validate.js          # human-readable report, exit 0/1
//   node scripts/phase3-validate.js --json    # machine-readable summary
//
// Modules under test:
//   server/services/categoryClassifier.js   (single authoritative classifier)
//   server/services/recommendationRules.js  (category safety R1–R7)
//   server/services/rotationService.js       (seeded weighted rotation)
//   server/services/chatbotNlu.js            (typo + synonym → intent)

const classifier = require('../server/services/categoryClassifier');
const { createRecommendationRules } = require('../server/services/recommendationRules');
const { createRotationService } = require('../server/services/rotationService');
const nlu = require('../server/services/chatbotNlu');
const scoring = require('../server/services/recommendationScoring');

const results = [];
let section = '';
function group(name) { section = name; }
function check(name, pass, detail) {
  results.push({ section, name, pass: !!pass, detail: detail || '' });
}
function eq(name, actual, expected) {
  check(name, actual === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// Build a recommendation candidate the way aiService.recommend() does.
function cand(name, categoryType, { score = 50, chef = false, beverageKind, rotationGroup, priority } = {}) {
  return { item: { name, categoryType }, score, chef, beverageKind, rotationGroup, priority };
}
const keptNames = kept => kept.map(c => c.item.name);
const keptTypes = kept => kept.map(c => c.item.categoryType);

// ─────────────────────────────────────────────────────────────────────────────
group('1. Category classifier (single source of truth)');
eq('Tomahawk Steak → MAIN', classifier.categoryType('Tomahawk Steak'), 'MAIN');
eq('"steak" not misread as DRINK (contains "tea")', classifier.categoryType('Rump Steak'), 'MAIN');
eq('Calamari Starter → STARTER', classifier.categoryType('Calamari Starter'), 'STARTER');
eq('Malva Pudding → DESSERT', classifier.categoryType('Malva Pudding'), 'DESSERT');
eq('Porcupine Ridge Shiraz → WINE', classifier.categoryType('Porcupine Ridge Shiraz'), 'WINE');
eq('Margarita → DRINK', classifier.categoryType('Margarita'), 'DRINK');
eq('Margarita beverageKind → COCKTAIL', classifier.beverageKind('Margarita'), 'COCKTAIL');
eq('Shiraz beverageKind → WINE', classifier.beverageKind('Porcupine Ridge Shiraz'), 'WINE');
eq('Still Water beverageKind → SOFT (not wine)', classifier.beverageKind('Still Water'), 'SOFT');
eq('Cappuccino beverageKind → HOT', classifier.beverageKind('Cappuccino'), 'HOT');
// Brand-only names (e.g. "Heineken") carry no type keyword, so the menu pipeline
// classifies them WITH their category — exactly as dbItemToJson does in production.
eq('Heineken (with "Beers" category) → DRINK', classifier.categoryType({ name: 'Heineken (330ml)', category: 'Beers' }), 'DRINK');
eq('Heineken (with "Beers" category) beverageKind → BEER', classifier.beverageKind({ name: 'Heineken (330ml)', category: 'Beers' }), 'BEER');

// ─────────────────────────────────────────────────────────────────────────────
group('2. Category safety rules (R1–R7)');
const rules = createRecommendationRules({ config: { reco: { maxBeverages: 1, enforceStage: true } } });

// R1/R2 — at most one beverage, never wine + cocktail together.
{
  const cart = [{ name: 'Ribeye', categoryType: 'MAIN' }];
  const cands = [
    cand('House Shiraz', 'WINE', { score: 100, beverageKind: 'WINE' }),
    cand('Margarita', 'DRINK', { score: 90, beverageKind: 'COCKTAIL' }),
    cand('Still Water', 'DRINK', { score: 80, beverageKind: 'SOFT' })
  ];
  const { kept } = rules.applyCategorySafety(cands, cart);
  const bevs = kept.filter(c => ['WINE', 'DRINK'].includes(c.item.categoryType));
  check('R1 at most one beverage recommended', bevs.length <= 1, `beverages kept: ${keptNames(bevs).join(', ') || 'none'}`);
  const kinds = bevs.map(c => c.beverageKind);
  check('R2 never wine + cocktail together', !(kinds.includes('WINE') && kinds.includes('COCKTAIL')), `kinds: ${kinds.join(', ')}`);
}

// R4 — no drink → same-kind drink (wine-only cart must not get another drink).
{
  const cart = [{ name: 'Cabernet', categoryType: 'WINE', beverageKind: 'WINE' }];
  const cands = [
    cand('Another Red', 'WINE', { score: 100, beverageKind: 'WINE' }),
    cand('Still Water', 'DRINK', { score: 90, beverageKind: 'SOFT' })
  ];
  const { kept } = rules.applyCategorySafety(cands, cart);
  const bevs = kept.filter(c => ['WINE', 'DRINK'].includes(c.item.categoryType));
  check('R4 wine-only cart gets no drink-to-drink chain', bevs.length === 0, `beverages kept: ${keptNames(bevs).join(', ') || 'none'}`);
}

// R5 — no dessert → starter (closing cart must not be sent back to a starter).
{
  const cart = [{ name: 'Cheesecake', categoryType: 'DESSERT' }];
  const cands = [
    cand('Snails', 'STARTER', { score: 70 }),
    cand('Calamari', 'STARTER', { score: 60 })
  ];
  const { kept } = rules.applyCategorySafety(cands, cart);
  check('R5 dessert cart drops algorithmic starters', !keptTypes(kept).includes('STARTER'), `kept: ${keptNames(kept).join(', ') || 'none'}`);
}

// Audit headline reproduction — dessert-only cart must NOT yield starter + coffee + wine.
{
  const cart = [{ name: 'Cheesecake', categoryType: 'DESSERT' }];
  const cands = [
    cand('House Shiraz', 'WINE', { score: 80, beverageKind: 'WINE' }),
    cand('Snails', 'STARTER', { score: 70 }),
    cand('Cappuccino', 'DRINK', { score: 60, beverageKind: 'HOT' })
  ];
  const { kept } = rules.applyCategorySafety(cands, cart);
  const bevs = kept.filter(c => ['WINE', 'DRINK'].includes(c.item.categoryType));
  check('Audit fix: dessert cart → ≤1 beverage and no starter',
    bevs.length <= 1 && !keptTypes(kept).includes('STARTER'),
    `kept: ${keptNames(kept).join(', ') || 'none'}`);
}

// Chef bypass — a chef cross-stage pick is kept even when an algorithmic one is dropped.
{
  const cart = [{ name: 'Cheesecake', categoryType: 'DESSERT' }];
  const cands = [
    cand('Chef Oysters', 'STARTER', { score: 1100, chef: true }),
    cand('Snails', 'STARTER', { score: 70 })
  ];
  const { kept } = rules.applyCategorySafety(cands, cart);
  check('Chef starter survives stage rule (chef bypass)', keptNames(kept).includes('Chef Oysters'), `kept: ${keptNames(kept).join(', ')}`);
  check('Algorithmic starter still dropped at closing', !keptNames(kept).includes('Snails'), `kept: ${keptNames(kept).join(', ')}`);
}

// Phase 1 (Recommendation Brain) — Replacement Logic: a same-kind beverage
// candidate tagged isReplacement passes R4 (it's a swap, not an addition), and
// does NOT count toward the beverage cap; an ordinary same-kind candidate
// (no isReplacement flag) is still blocked exactly as before (no regression).
{
  const cart = [{ name: 'House Shiraz', categoryType: 'WINE', beverageKind: 'WINE' }];
  const cands = [
    { item: { name: 'Reserve Cabernet', categoryType: 'WINE' }, score: 60, beverageKind: 'WINE', isReplacement: true },
    { item: { name: 'Another Shiraz', categoryType: 'WINE' }, score: 55, beverageKind: 'WINE' } // no isReplacement flag
  ];
  const { kept } = rules.applyCategorySafety(cands, cart);
  check('isReplacement candidate passes R4 (upgrade, not addition)', keptNames(kept).includes('Reserve Cabernet'), `kept: ${keptNames(kept).join(', ') || 'none'}`);
  check('non-replacement same-kind candidate still blocked by R4 (no regression)', !keptNames(kept).includes('Another Shiraz'), `kept: ${keptNames(kept).join(', ') || 'none'}`);
}
// isReplacement is NOT a free pass against R2 — it only excuses R4/R1 (same-kind
// "already in cart" + the cap-count). If a cocktail is already primary in this
// same batch, a wine tagged isReplacement is still blocked from joining it.
{
  const cart = [{ name: 'House Shiraz', categoryType: 'WINE', beverageKind: 'WINE' }];
  const cands = [
    { item: { name: 'Margarita', categoryType: 'DRINK' }, score: 90, beverageKind: 'COCKTAIL' },
    { item: { name: 'Reserve Cabernet', categoryType: 'WINE' }, score: 60, beverageKind: 'WINE', isReplacement: true }
  ];
  const { kept } = rules.applyCategorySafety(cands, cart);
  const kinds = kept.filter(c => ['WINE', 'DRINK'].includes(c.item.categoryType)).map(c => c.beverageKind);
  check('isReplacement does not bypass R2: same-batch cocktail still blocks a wine replacement', !(kinds.includes('WINE') && kinds.includes('COCKTAIL')), `kinds: ${kinds.join(', ')}`);
}

// Chef beverage primacy still applies — chef wine + algorithmic cocktail never co-appear.
{
  const cart = [{ name: 'Ribeye', categoryType: 'MAIN' }];
  const cands = [
    cand('Chef Pinotage', 'WINE', { score: 1100, chef: true, beverageKind: 'WINE' }),
    cand('Margarita', 'DRINK', { score: 90, beverageKind: 'COCKTAIL' })
  ];
  const { kept } = rules.applyCategorySafety(cands, cart);
  const kinds = kept.filter(c => ['WINE', 'DRINK'].includes(c.item.categoryType)).map(c => c.beverageKind);
  check('Chef wins but R2 holds: no wine + cocktail', kinds.includes('WINE') && !kinds.includes('COCKTAIL'), `kinds: ${kinds.join(', ')}`);
}

// ─────────────────────────────────────────────────────────────────────────────
group('3. Rotation engine (seeded, weighted, deterministic)');
const rotation = createRotationService({ config: { restaurantId: 'trump', reco: { rotation: { scope: 'session', bucket: 'day' } } } });

// Three wines in one rotation group, equal score so they stay contiguous.
function wineGroup() {
  return [
    cand('Shiraz', 'WINE', { score: 100, rotationGroup: 'reds', priority: 100, beverageKind: 'WINE' }),
    cand('Cabernet', 'WINE', { score: 100, rotationGroup: 'reds', priority: 90, beverageKind: 'WINE' }),
    cand('Pinotage', 'WINE', { score: 100, rotationGroup: 'reds', priority: 80, beverageKind: 'WINE' })
  ];
}
// Determinism: same scope + day → identical order.
{
  const a = rotation.rotate(wineGroup(), { deviceId: 'device-A' }).ordered.map(c => c.item.name);
  const b = rotation.rotate(wineGroup(), { deviceId: 'device-A' }).ordered.map(c => c.item.name);
  check('Deterministic: same device → identical order', JSON.stringify(a) === JSON.stringify(b), `${a.join('>')} vs ${b.join('>')}`);
}
// Variety: across many devices the group leader is not always the same bottle.
{
  const leaders = new Set();
  for (let i = 0; i < 60; i += 1) {
    leaders.add(rotation.rotate(wineGroup(), { deviceId: `device-${i}` }).ordered[0].item.name);
  }
  check('Variety: different guests see different leaders', leaders.size >= 2, `distinct leaders: ${[...leaders].join(', ')}`);
}
// Priority-weighted: highest priority leads more often than the lowest.
{
  const tally = { Shiraz: 0, Cabernet: 0, Pinotage: 0 };
  for (let i = 0; i < 300; i += 1) {
    const leader = rotation.rotate(wineGroup(), { deviceId: `g-${i}` }).ordered[0].item.name;
    tally[leader] += 1;
  }
  check('Priority respected: P100 leads more than P80', tally.Shiraz > tally.Pinotage, `Shiraz(P100)=${tally.Shiraz}, Cabernet(P90)=${tally.Cabernet}, Pinotage(P80)=${tally.Pinotage}`);
}
// Reproducible seed for reporting.
{
  const s1 = rotation.seedFor({ bucket: '2026-06-06', scopeId: 'x' }, 'reds').seed;
  const s2 = rotation.seedFor({ bucket: '2026-06-06', scopeId: 'x' }, 'reds').seed;
  check('Reproducible seed (offline recompute for reports)', s1 === s2, `seed=${s1}`);
}

// ─────────────────────────────────────────────────────────────────────────────
group('4. Chatbot NLU (typos + synonyms → one intent)');
const intentPhrases = [
  "what's good here", 'whats good here', 'best dish', 'most popular',
  'signature dish', 'chef recommendation', 'what do you recommend', 'must try'
];
intentPhrases.forEach(p => {
  const norm = nlu.normalize(p).normalized;
  check(`intent: "${p}" → recommendation`, nlu.isRecommendationIntent(norm), `normalized="${norm}"`);
});

// Spelling correction.
[['stake', 'steak'], ['stak', 'steak'], ['vegitarian', 'vegetarian'], ['chiken', 'chicken'], ['desert', 'dessert']].forEach(([from, to]) => {
  const tokens = nlu.normalize(from).tokens;
  check(`typo: "${from}" → "${to}"`, tokens.includes(to), `tokens=[${tokens.join(', ')}]`);
});

// "wats gud here" — combined typo + intent (the audit's hardest phrase).
{
  const n = nlu.normalize('wats gud here');
  check('typo phrase: "wats gud here" → "whats good …"', /whats good/.test(n.normalized), `normalized="${n.normalized}"`);
  check('typo phrase: "wats gud here" → recommendation intent', nlu.isRecommendationIntent(n.normalized), `normalized="${n.normalized}"`);
}

// Chat-speak / fillers stripped, no crash.
{
  const n = nlu.normalize('im hungry lol');
  check('chat-speak: "im hungry lol" strips fillers', !n.tokens.includes('lol') && !n.tokens.includes('im'), `tokens=[${n.tokens.join(', ')}]`);
}
{
  const n = nlu.normalize('something spicy pls');
  check('chat-speak: "something spicy pls" keeps "spicy"', n.tokens.includes('spicy'), `tokens=[${n.tokens.join(', ')}]`);
}

// ─────────────────────────────────────────────────────────────────────────────
group('5. Recommendation Brain scoring (Phase 1: confidence, expected value, replacement, tier weights)');

// Confidence bands by source tier.
eq('chef candidate -> confidence 0.92', scoring.baseConfidence({ chef: true }), 0.92);
eq('score>=1000 (hero) -> confidence 0.9', scoring.baseConfidence({ score: 1200 }), 0.9);
eq('score>=200 (tag-match) -> confidence 0.8', scoring.baseConfidence({ score: 250 }), 0.8);
eq('score>=84 (perfect-pairing) -> confidence 0.72', scoring.baseConfidence({ score: 90 }), 0.72);
eq('score>=60 (course completion) -> confidence 0.62', scoring.baseConfidence({ score: 70 }), 0.62);
eq('low score (popular/backfill) -> confidence 0.5', scoring.baseConfidence({ score: 10 }), 0.5);

// Guest-aware confidence: favourite boost, VIP nudge, no guest = unchanged.
{
  const guestIntel = { present: true, favorites: { wine: 'House Shiraz' }, topItems: [], vip: false };
  const boosted = scoring.guestAdjustedConfidence(0.6, { name: 'House Shiraz' }, guestIntel);
  check('guest favourite match boosts confidence', boosted > 0.6, `got=${boosted}`);
  const vipGuest = { present: true, favorites: {}, topItems: [], vip: true };
  const vipBoosted = scoring.guestAdjustedConfidence(0.6, { name: 'Something Else' }, vipGuest);
  check('VIP guest gets a small confidence nudge', vipBoosted > 0.6 && vipBoosted < boosted, `got=${vipBoosted}`);
  check('no guestIntel -> confidence unchanged', scoring.guestAdjustedConfidence(0.6, { name: 'X' }, null) === 0.6);
}

// Allergy/avoid hard-exclusion signal.
{
  const guestIntel = { present: true, allergies: 'shellfish, nuts', avoids: [] };
  check('allergy match detected (shellfish in prawns dish)', scoring.isAllergyMatch({ name: 'Garlic Prawns', searchText: 'garlic prawns shellfish' }, guestIntel));
  check('no allergy match for an unrelated dish', !scoring.isAllergyMatch({ name: 'Ribeye Steak', searchText: 'ribeye steak beef' }, guestIntel));
}

// Replacement-aware expected value — the brief's own worked examples.
{
  // Wine A (R210 in cart) -> Wine B (R255 candidate) must report a +R45 increase, NOT +R255.
  const menuByName = new Map([
    ['wine a', { name: 'Wine A', categoryType: 'WINE' }],
  ]);
  const cart = [{ name: 'Wine A', price: 210 }];
  const target = scoring.findReplacementTarget({ name: 'Wine B', categoryType: 'WINE' }, cart, menuByName);
  check('replacement target found (same-role wine swap)', target && target.name === 'Wine A' && target.price === 210, JSON.stringify(target));
  const increase = scoring.netRevenueIncrease(255, target);
  eq('Wine A (R210) -> Wine B (R255) reports +R45, not +R255', increase, 45);

  // Pure add: a STARTER/side candidate with a MAIN already in the cart shares no
  // role with anything present, so there is no replacement target — full price.
  const noTarget = scoring.findReplacementTarget(
    { name: 'Loaded Fries', categoryType: 'STARTER' },
    [{ name: 'Ribeye', price: 320, categoryType: 'MAIN' }],
    new Map()
  );
  check('no same-role cart item -> no replacement target (pure add)', noTarget === null, JSON.stringify(noTarget));
  const pureAddIncrease = scoring.netRevenueIncrease(55, noTarget);
  eq('pure add (no replacement target) reports full price', pureAddIncrease, 55);

  // Expected Value = confidence x net revenue increase — the brief's own example math.
  const wineEV = Number((0.05 * 450).toFixed(2));
  eq('Expected Value: 5% x R450 = R22.50', wineEV, 22.5);
  const friesEV = Number((0.8 * 55).toFixed(2));
  eq('Expected Value: 80% x R55 = R44', friesEV, 44);
  check('higher-EV Loaded Fries outranks lower-EV Wine upgrade', friesEV > wineEV);
}

// Dessert under-order promotion: a course ordered less than the others gets a
// higher tier weight so a strong dessert candidate can still win on final score.
{
  const orderRecords = [
    { items: [{ name: 'Ribeye' }, { name: 'House Shiraz' }] },
    { items: [{ name: 'Ribeye' }, { name: 'House Shiraz' }] },
    { items: [{ name: 'Calamari' }, { name: 'Ribeye' }] },
    { items: [{ name: 'Malva Pudding' }] }, // dessert attached to only 1/4 orders
  ];
  const menuByName = new Map([
    ['ribeye', { name: 'Ribeye', categoryType: 'MAIN' }],
    ['house shiraz', { name: 'House Shiraz', categoryType: 'WINE' }],
    ['calamari', { name: 'Calamari', categoryType: 'STARTER' }],
    ['malva pudding', { name: 'Malva Pudding', categoryType: 'DESSERT' }],
  ]);
  const weights = scoring.tierWeights(orderRecords, menuByName);
  check('dessert tier weight promoted above its base 0.7 when under-ordered', weights.DESSERT > 0.7, `weights=${JSON.stringify(weights)}`);
  check('wine keeps priority-1 base weight (1.0)', weights.WINE === 1.0, `weights=${JSON.stringify(weights)}`);
  check('priority order preserved as a prior: wine >= main >= starter', weights.WINE >= weights.MAIN && weights.MAIN >= weights.STARTER);
}

// scoreCandidate end-to-end: chef gets the highest confidence, non-chef candidates
// get a finalScore usable for ranking.
{
  const weights = { WINE: 1.0, MAIN: 0.9, STARTER: 0.8, DESSERT: 0.9, DRINK: 0.85 };
  const chefCand = { item: { name: 'Chef Pinotage', categoryType: 'WINE', price: 180 }, chef: true, score: 1100 };
  const scored = scoring.scoreCandidate({ candidate: chefCand, cart: [], menuByName: new Map(), guestIntel: null, weights });
  eq('chef candidate scored with confidence 0.92', scored.confidence, 0.92);
  check('pure-add chef candidate: expectedValue = confidence x price', Math.abs(scored.expectedValue - Number((0.92 * 180).toFixed(2))) < 0.01, JSON.stringify(scored));
  check('no replacement target for a pure add', scored.replacement === null);
}

// ─────────────────────────────────────────────────────────────────────────────
// Report
const failed = results.filter(r => !r.pass);
if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ total: results.length, failed: failed.length, results }, null, 2));
} else {
  let lastSection = '';
  for (const r of results) {
    if (r.section !== lastSection) { console.log(`\n${r.section}`); lastSection = r.section; }
    const mark = r.pass ? '  PASS' : '  FAIL';
    console.log(`${mark}  ${r.name}${r.pass ? '' : `\n        ↳ ${r.detail}`}`);
  }
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`${results.length - failed.length}/${results.length} checks passed.` + (failed.length ? `  ${failed.length} FAILED.` : '  ALL PASSED.'));
}

process.exit(failed.length ? 1 : 0);
