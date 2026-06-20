#!/usr/bin/env node
'use strict';
// Phase 3A validation harness. Exercises the new intent classifier, the pure
// tag-scoring function, and the shared reasonComposer directly (no DB, no server,
// no external AI). Reproducible: same inputs → same output every run.
//
//   node scripts/chat-validate.js          # human-readable report, exit 0/1
//   node scripts/chat-validate.js --json    # machine-readable summary

const intent = require('../server/services/intentClassifier');
const { createReasonComposer } = require('../server/services/reasonComposer');

const results = [];
let section = '';
function group(name) { section = name; }
function check(name, pass, detail) { results.push({ section, name, pass: !!pass, detail: detail || '' }); }

(async () => {
  // ── 1. Intent classification ────────────────────────────────────────────────
  group('1. Intent classification (message → type + slots)');
  const cls = m => intent.classify(m);
  check('"something spicy" → attribute + spice', cls('something spicy').type === 'attribute' && cls('something spicy').slots.spice, JSON.stringify(cls('something spicy').slots));
  check('"anything light?" → attribute + body=light', cls('anything light?').type === 'attribute' && cls('anything light?').slots.body === 'light');
  check('"vegetarian options" → dietary ∋ vegetarian', cls('vegetarian options').type === 'dietary' && cls('vegetarian options').slots.dietary.includes('vegetarian'));
  check('"any vegan dishes" → dietary ∋ vegan', cls('any vegan dishes').slots.dietary.includes('vegan'));
  check('"I feel like seafood" → attribute + protein seafood', cls('I feel like seafood').type === 'attribute' && cls('I feel like seafood').slots.proteinWanted.includes('seafood'));
  check('"what wine goes with my steak" → pairing + protein beef', cls('what wine goes with my steak').type === 'pairing' && cls('what wine goes with my steak').slots.proteinWanted.includes('beef'));
  check('"actually I want seafood instead" → swap', cls('actually I want seafood instead').type === 'swap');
  check('"we are watching the football" → occasion sharing', cls('we are watching the football').type === 'occasion' && cls('we are watching the football').slots.occasion === 'sharing');
  check('"celebrating a birthday" → occasion celebration', cls('celebrating a birthday').slots.occasion === 'celebration');
  check('"whats good here" → recommendation', cls('whats good here').type === 'recommendation');
  check('"wats gud" → recommendation (typo)', cls('wats gud').type === 'recommendation');

  // ── 2. Tag scoring (pure, against metadata.tags) ────────────────────────────
  group('2. Tag scoring (intent slots × item tags)');
  const spicy = { kind: 'FOOD', course: 'MAIN', spice: 2, richness: 1, protein: ['chicken'], occasion: ['sharing'] };
  const mild = { kind: 'FOOD', course: 'MAIN', spice: 0, richness: 2, protein: ['beef'], occasion: ['hearty'] };
  const salad = { kind: 'FOOD', course: 'SALAD', spice: 0, richness: 1, protein: ['none'], dietary: ['vegetarian'], occasion: ['light'] };
  const heavy = { kind: 'FOOD', course: 'MAIN', spice: 0, richness: 3, protein: ['beef'], occasion: ['hearty'] };
  check('spicy slot scores a spice:2 item > 0', intent.tagScore(spicy, { spice: true }) > 0, `score=${intent.tagScore(spicy, { spice: true })}`);
  check('spicy slot scores a spice:0 item = 0', intent.tagScore(mild, { spice: true }) === 0);
  check('light slot favours a SALAD over a richness:3 main', intent.tagScore(salad, { body: 'light' }) > intent.tagScore(heavy, { body: 'light' }), `salad=${intent.tagScore(salad, { body: 'light' })} heavy=${intent.tagScore(heavy, { body: 'light' })}`);
  check('protein seafood matches tags.protein', intent.tagScore({ protein: ['seafood'] }, { proteinWanted: ['seafood'] }) > 0);
  check('dietary vegetarian matches tags.dietary', intent.tagScore(salad, { dietary: ['vegetarian'] }) > 0);
  check('occasion sharing matches tags.occasion', intent.tagScore(spicy, { occasion: 'sharing' }) > 0);
  check('no-match item scores 0', intent.tagScore(mild, { dietary: ['vegan'] }) === 0);

  // ── 3. reasonComposer (one voice, never blank) ──────────────────────────────
  group('3. reasonComposer (Tier-1 chef · Tier-2 NLG · never blank)');
  const composer = createReasonComposer({});
  const chef = await composer.pairingReason({ name: 'House Pinotage', categoryType: 'WINE', reason: 'The chef pours this with every ribeye.' }, { name: 'Ribeye' });
  check('Tier-1: chef reason returned verbatim', chef === 'The chef pours this with every ribeye.', `got="${chef}"`);
  const wine = await composer.pairingReason({ name: 'Cabernet Sauvignon', categoryType: 'WINE' }, { name: 'Ribeye 380g' });
  check('Tier-2: wine reason is non-blank and not the old bland line', wine && wine.length > 0 && !/^Full-bodied red — pairs beautifully with grilled beef\.$/.test(wine), `got="${wine}"`);
  check('Tier-2: wine reason mentions the dish', /ribeye/i.test(wine), `got="${wine}"`);
  const side = await composer.pairingReason({ name: 'Steakhouse Chips', categoryType: 'MAIN' }, { name: 'Ribeye 380g' });
  check('Default: non-wine side is never blank', !!side && side.trim().length > 0, `got="${side}"`);
  check('No "Goes well with this dish." anywhere', ![chef, wine, side].some(r => /goes well with this dish/i.test(r)));
  const bridge = await composer.pairingReason(
    { name: 'Smoky Wings', categoryType: 'STARTER', tags: { flavour: ['smoky'] } },
    { name: 'BBQ Ribs', tags: { flavour: ['smoky'] } }
  );
  check('Tag bridge: shared "smoky" flavour surfaces in the line', /smoky/i.test(bridge), `got="${bridge}"`);

  // ── Report ──────────────────────────────────────────────────────────────────
  const failed = results.filter(r => !r.pass);
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ total: results.length, failed: failed.length, results }, null, 2));
  } else {
    let last = '';
    for (const r of results) {
      if (r.section !== last) { console.log(`\n${r.section}`); last = r.section; }
      console.log(`${r.pass ? '  PASS' : '  FAIL'}  ${r.name}${r.pass ? '' : `\n        ↳ ${r.detail}`}`);
    }
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`${results.length - failed.length}/${results.length} checks passed.` + (failed.length ? `  ${failed.length} FAILED.` : '  ALL PASSED.'));
  }
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('chat-validate crashed:', e.message); process.exit(1); });
