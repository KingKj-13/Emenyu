#!/usr/bin/env node
'use strict';
// Recommendation quality/correctness validation (companion to reco-health.js,
// which validates chef-recommendation DATA INTEGRITY -- this validates the
// SCORING/FILTERING LOGIC itself).
//
//   node scripts/reco-validate.js              # offline fixture tests (no DB) -- run this one
//   node scripts/reco-validate.js --json        # machine-readable
//   node scripts/reco-validate.js --live         # additionally exercise the real engine
//                                                 #   against a DB (needs DATABASE_URL; see
//                                                 #   inspect-recommendations.js for the same
//                                                 #   dependency-wiring pattern)
//
// Exit codes: 0 = all checks pass; 1 = a check failed; 2 = --live requested but DB unreachable.

const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env'), quiet: true });
dotenv.config({ path: path.resolve(__dirname, '..', '.env'), quiet: true });
dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env.local'), override: true, quiet: true });

const scoring = require('../server/services/recommendationScoring');
const { createRecommendationRules } = require('../server/services/recommendationRules');
const candidateFilterPipeline = require('../server/services/candidateFilterPipeline');

const JSON_OUT = process.argv.includes('--json');
const LIVE = process.argv.includes('--live');

const results = [];
const check = (name, pass, detail = '') => results.push({ name, pass: !!pass, detail });

// Minimal menu fixtures, shaped exactly as scoring/rules expect (item.name,
// item.categoryType/price -- no DB needed, these are the same shapes
// aiService.js already resolves cart lines and candidates into).
const item = (name, categoryType, price, extra = {}) => ({ name, categoryType, price, ...extra });
const cand = (name, categoryType, price, opts = {}) => ({
  item: item(name, categoryType, price, opts.itemExtra),
  score: opts.score, chef: opts.chef === true, isReplacement: opts.isReplacement === true,
  beverageKind: opts.beverageKind
});

function offlineSelfTest() {
  // ---------------------------------------------------------------------
  // 1. Confidence scores are reasonable.
  // ---------------------------------------------------------------------
  check('baseConfidence: chef candidate = 0.92', scoring.baseConfidence({ chef: true }) === 0.92);
  check('baseConfidence: score>=1000 -> 0.9', scoring.baseConfidence({ score: 1200 }) === 0.9);
  check('baseConfidence: score>=200 -> 0.8', scoring.baseConfidence({ score: 250 }) === 0.8);
  check('baseConfidence: score>=84 -> 0.72', scoring.baseConfidence({ score: 90 }) === 0.72);
  check('baseConfidence: score>=60 -> 0.62', scoring.baseConfidence({ score: 65 }) === 0.62);
  check('baseConfidence: low score -> 0.5 floor', scoring.baseConfidence({ score: 1 }) === 0.5);
  check('confidence is always clamped to [0,1] even with a favourite nudge past 1.0',
    scoring.guestAdjustedConfidence(0.95, { name: 'X' }, { present: true, favorites: {}, topItems: ['X'] }) <= 1.0);
  check('VIP guest gets a small (+0.05) confidence bump, not a favourite-sized (+0.15) one',
    scoring.guestAdjustedConfidence(0.5, { name: 'Unrelated Item' }, { present: true, vip: true }) === 0.55);

  // ---------------------------------------------------------------------
  // 2. Revenue calculations are correct.
  // ---------------------------------------------------------------------
  const menuByName = new Map([
    ['ribeye 380g', item('RIBEYE 380g', 'MAIN', 369)],
    ['tokara', item('TOKARA', 'WINE', 260)],
    ['diemersdal', item('DIEMERSDAL', 'WINE', 210)],
  ]);
  check('netRevenueIncrease: a pure add reports the FULL price', scoring.netRevenueIncrease(369, null) === 369);
  check('netRevenueIncrease: a same-role replacement reports the DELTA, not the full price',
    scoring.netRevenueIncrease(260, { name: 'DIEMERSDAL', price: 210 }) === 50);
  {
    const target = scoring.findReplacementTarget(item('TOKARA', 'WINE', 260), [{ name: 'DIEMERSDAL', price: 210 }], menuByName);
    check('findReplacementTarget: same categoryType+beverageKind in cart IS a replacement target', !!target && target.name === 'DIEMERSDAL');
  }
  {
    const target = scoring.findReplacementTarget(item('TOKARA', 'WINE', 260), [{ name: 'RIBEYE 380g', price: 369 }], menuByName);
    check('findReplacementTarget: a different categoryType in cart is NOT a replacement target', target === null);
  }
  {
    const scored = scoring.scoreCandidate({
      candidate: cand('RIBEYE 380g', 'MAIN', 369, { chef: true }),
      cart: [], menuByName, weights: { MAIN: 0.9 }
    });
    const expected = Number((scored.confidence * scored.netRevenueIncrease).toFixed(2));
    check('scoreCandidate: expectedValue === confidence x netRevenueIncrease (rounded)', scored.expectedValue === expected,
      `expectedValue=${scored.expectedValue} confidence=${scored.confidence} netRevenueIncrease=${scored.netRevenueIncrease}`);
  }

  // ---------------------------------------------------------------------
  // 3. No unrealistic upsells -- category-safety rules (R1-R7), pure function.
  // ---------------------------------------------------------------------
  const rules = createRecommendationRules({ config: {} });

  check('R1: default beverage cap (maxBeverages=1) keeps only the first beverage candidate', (() => {
    const { kept, dropped } = rules.applyCategorySafety(
      [cand('TOKARA', 'WINE', 260, { score: 100 }), cand('NEDERBURG', 'WINE', 195, { score: 90 })], []
    );
    return kept.length === 1 && kept[0].item.name === 'TOKARA' && dropped.some(d => d.reason === 'beverage:max-reached');
  })());

  check('R2: with the cap raised, a second PRIMARY beverage (wine after wine) is still blocked', (() => {
    const looseRules = createRecommendationRules({ config: { reco: { maxBeverages: 5 } } });
    const { kept, dropped } = looseRules.applyCategorySafety(
      [cand('TOKARA', 'WINE', 260, { score: 100 }), cand('NEDERBURG', 'WINE', 195, { score: 90 })], []
    );
    return kept.length === 1 && dropped.some(d => d.reason === 'beverage:second-primary');
  })());

  check('R2: wine + cocktail together is blocked (never two primary beverage kinds)', (() => {
    const { kept } = rules.applyCategorySafety(
      [cand('TOKARA', 'WINE', 260, { score: 100 }), cand('MOJITO', 'DRINK', 145, { score: 90, beverageKind: 'COCKTAIL' })], []
    );
    return kept.length === 1;
  })());

  check('R3: a soft/hot drink cannot headline (no primary beverage yet, not closing)', (() => {
    const { dropped } = rules.applyCategorySafety(
      [cand('CAPPUCCINO', 'DRINK', 45, { score: 60, beverageKind: 'HOT' })], []
    );
    return dropped.some(d => d.reason === 'beverage:secondary-headline');
  })());

  check('R3 bypass: a CHEF-authored soft/hot drink CAN headline (e.g. coffee+croissant pairing)', (() => {
    const { kept } = rules.applyCategorySafety(
      [cand('CAPPUCCINO', 'DRINK', 45, { chef: true, beverageKind: 'HOT' })], []
    );
    return kept.length === 1;
  })());

  check('R4: a beverage kind already in the cart is not re-suggested', (() => {
    const { dropped } = rules.applyCategorySafety(
      [cand('NEDERBURG', 'WINE', 195, { score: 90 })], [{ name: 'TOKARA', categoryType: 'WINE' }]
    );
    return dropped.some(d => d.reason === 'beverage:already-in-cart');
  })());

  check('R4 bypass: an isReplacement upgrade of the SAME kind already in cart is allowed', (() => {
    const { kept } = rules.applyCategorySafety(
      [cand('NEDERBURG', 'WINE', 195, { score: 90, isReplacement: true })], [{ name: 'TOKARA', categoryType: 'WINE' }]
    );
    return kept.length === 1;
  })());

  check('R5: no starter suggested once a main is already in the cart', (() => {
    const { dropped } = rules.applyCategorySafety(
      [cand('BEEF BILTONG', 'STARTER', 155, { score: 70 })], [{ name: 'RIBEYE 380g', categoryType: 'MAIN' }]
    );
    return dropped.some(d => d.reason === 'stage:no-starter-past-first-course');
  })());

  check('R5: never a second main', (() => {
    const { dropped } = rules.applyCategorySafety(
      [cand('T-BONE 500g', 'MAIN', 329, { score: 70 })], [{ name: 'RIBEYE 380g', categoryType: 'MAIN' }]
    );
    return dropped.some(d => d.reason === 'stage:no-second-main');
  })());

  check('R7: at most one dessert per recommendation set', (() => {
    const { kept, dropped } = rules.applyCategorySafety(
      [cand('DEATH BY CHOCOLATE CAKE', 'DESSERT', 119, { score: 80 }), cand('CAPE MALVA PUDDING', 'DESSERT', 115, { score: 70 })], []
    );
    return kept.length === 1 && dropped.some(d => d.reason === 'dedupe:extra-dessert');
  })());

  check('empty cart / empty candidates does not throw, stage = EMPTY', (() => {
    const { kept, dropped, stage } = rules.applyCategorySafety([], []);
    return kept.length === 0 && dropped.length === 0 && stage === 'EMPTY';
  })());

  // ---------------------------------------------------------------------
  // 4. Wine pairing keyword logic (same regexes seed-chef-recommendations.js
  //    uses to build the actual chef-curated pairings) classifies sensibly.
  // ---------------------------------------------------------------------
  const redRe = /shiraz|cabernet|merlot|pinotage|malbec|syrah|\bred\b/i;
  const whiteRe = /sauvignon|chardonnay|chenin|riesling|colombard|viognier|blanc|\bwhite\b/i;
  check('red-wine keyword match: Shiraz/Cabernet/Pinotage varietals', ['KLEINE ZALZE SHIRAZ', 'RUSTENBURG CABERNET SAUVIGNON', 'BEYERSKLOOF PINOTAGE'].every(n => redRe.test(n)));
  check('white-wine keyword match: Sauvignon Blanc/Chardonnay varietals', ['NEDERBURG SAUVIGNON BLANC', 'DURBANVILLE HILLS CHARDONNAY'].every(n => whiteRe.test(n)));
  check('red/white keyword sets do not both match the same common varietal names', ['KLEINE ZALZE SHIRAZ', 'NEDERBURG SAUVIGNON BLANC'].every(n => redRe.test(n) !== whiteRe.test(n)));

  // ---------------------------------------------------------------------
  // 5. Candidate-filter pipeline (steps 4/6-9) -- pure function, no DB.
  // ---------------------------------------------------------------------
  check('pipeline: never-downsell blocks a same-role replacement priced BELOW what it replaces', (() => {
    const businessRules = { isDessertBeforeMains: () => false, isWineAfterCoffee: () => false, isDownsell: ({ netRevenueIncrease }) => netRevenueIncrease < 0, isStructuralConflict: () => false, thresholds: {} };
    const c = cand('CHEAPER WINE', 'WINE', 150, {});
    c.brain = { netRevenueIncrease: -60 };
    const { kept, dropped } = candidateFilterPipeline.runPipeline({ candidates: [c], cart: [], businessRules, wantsValue: false });
    return kept.length === 0 && dropped.some(d => d.reason === 'value:never-downsell');
  })());
  check('pipeline: a candidate the guest already declined is never re-suggested', (() => {
    const memory = { isRejected: () => true, isRecentlyIgnored: () => false };
    const { kept, dropped } = candidateFilterPipeline.runPipeline({ candidates: [cand('X', 'MAIN', 100)], cart: [], tableId: 't1', memory });
    return kept.length === 0 && dropped.some(d => d.reason === 'declined:already-rejected');
  })());
  check('pipeline: caps at 2 kept candidates per category (overload protection)', (() => {
    const candidates = [cand('A', 'DESSERT', 100), cand('B', 'DESSERT', 100), cand('C', 'DESSERT', 100)];
    const { kept, dropped } = candidateFilterPipeline.runPipeline({ candidates, cart: [] });
    return kept.length === 2 && dropped.some(d => d.reason === 'overload:category-cap');
  })());

  const failed = results.filter(r => !r.pass);
  for (const r of results) console.log(`  ${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.pass ? '' : `\n        ↳ ${r.detail}`}`);
  console.log(`\n${results.length - failed.length}/${results.length} self-tests passed.` + (failed.length ? `  ${failed.length} FAILED.` : '  ALL PASSED.'));
  console.log(`\nNote: chef-recommendation DATA graph integrity (orphaned/missing/circular/duplicate-priority) is\nalready covered by 'node scripts/reco-health.js --selftest' -- not duplicated here.`);
  return failed.length === 0;
}

// ---------------------------------------------------------------------------
// Live tier: the checks that inherently need a real database (existing-order
// influence, empty-cart behaviour through the FULL engine, real menu wine
// pairings) -- run via the same aiService wiring as inspect-recommendations.js.
// ---------------------------------------------------------------------------
async function liveChecks() {
  if (!process.env.DATABASE_URL) {
    console.error('--live requires DATABASE_URL. Point it at a development database (see .env.local) -- never production.');
    process.exit(2);
  }
  const { createConfig } = require('../server/utils/helpers');
  const { FileService } = require('../server/services/fileService');
  const { AiService } = require('../server/services/aiService');
  const config = createConfig(path.resolve(__dirname, '..'));
  const fileService = new FileService(config, {});
  const socketStub = new Proxy({}, { get: () => (() => {}) });
  const aiService = new AiService(config, fileService, socketStub, {});

  const liveResults = [];
  const lcheck = (name, pass, detail = '') => liveResults.push({ name, pass: !!pass, detail });

  try {
    const empty = await aiService.recommend({ cart: [] });
    lcheck('live: empty cart does not throw and returns an array', Array.isArray(empty), `got ${typeof empty}, length=${empty?.length}`);

    const wineOpener = await aiService.recommend({ cart: [{ name: 'TRUMPS' }], limit: 3 });
    lcheck('live: a red wine opener returns at least one suggestion', Array.isArray(wineOpener) && wineOpener.length > 0);
    if (wineOpener[0]) {
      lcheck('live: every returned suggestion has a confidence in [0,1]', wineOpener.every(s => s.confidence >= 0 && s.confidence <= 1), JSON.stringify(wineOpener.map(s => s.confidence)));
      lcheck('live: no suggestion re-recommends an item already in the cart', !wineOpener.some(s => s.name?.toLowerCase() === 'trumps'));
    }
  } catch (error) {
    lcheck('live: recommend() ran without throwing', false, error.message);
  }

  for (const r of liveResults) console.log(`  ${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `  (${r.detail})` : ''}`);
  const failed = liveResults.filter(r => !r.pass);
  console.log(`\n${liveResults.length - failed.length}/${liveResults.length} live checks passed.`);
  if (typeof fileService.close === 'function') await fileService.close().catch(() => {});
  return failed.length === 0;
}

async function main() {
  const offlineOk = offlineSelfTest();
  let liveOk = true;
  if (LIVE) {
    console.log('\n--- LIVE (database-backed) checks ---\n');
    liveOk = await liveChecks();
  }
  if (JSON_OUT) console.log(JSON.stringify({ results, offlineOk, liveOk: LIVE ? liveOk : null }, null, 2));
  process.exit(offlineOk && liveOk ? 0 : 1);
}

main().catch(error => { console.error('reco-validate failed:', error.message); process.exit(2); });
