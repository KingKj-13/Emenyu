#!/usr/bin/env node
'use strict';
// Recommendation Inspector — development/verification tooling ONLY.
//
// Calls the real aiService.recommend() (the shared core every surface — chat/AI
// Sommelier, cartRecommendations/Waiter engine + Revenue Opportunity, aiPairing/
// Chef Pairing, and by extension cross-sell/upsell/dessert/drink/replacement —
// all route through it; see aiService.js lines ~648-1404 for the call sites)
// with a constructed context, and prints the FULL decision trace: input context,
// every candidate considered (with its confidence/EV/score breakdown), every
// candidate the pipeline rejected (with its exact reason), frequency-gating
// status, and the final ranked output.
//
// This is a CLI script only. It is never required by server.js and is not wired
// into any Express route, so it cannot be reached over HTTP in any environment,
// including production — that is the safety property, by construction, not a
// runtime flag that could be misconfigured.
//
//   node scripts/inspect-recommendations.js                    # run all built-in scenarios
//   node scripts/inspect-recommendations.js --scenario empty-cart
//   node scripts/inspect-recommendations.js --cart "RIBEYE 380g,TRUMPS" --table table1
//   node scripts/inspect-recommendations.js --json             # machine-readable
//
// Requires DATABASE_URL to reach a real (development!) database — recommend()
// resolves candidates against live menu data. Point it at emenyu_local (see
// .env.local), never at production.

const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env'), quiet: true });
dotenv.config({ path: path.resolve(__dirname, '..', '.env'), quiet: true });
// Local dev override: .env.local (gitignored) repoints DATABASE_URL at the local
// database so this never reads/writes anything near production data.
dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env.local'), override: true, quiet: true });

const { createConfig } = require('../server/utils/helpers');
const { FileService } = require('../server/services/fileService');
const { AiService } = require('../server/services/aiService');

const JSON_OUT = process.argv.includes('--json');

function argValue(flag) {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 && process.argv[idx + 1] ? process.argv[idx + 1] : null;
}

// A no-op stand-in for socketService: recommend() never emits over sockets
// (only the live cart-sync paths in socketService.js/chat()'s broadcast side do),
// but the constructor wires it through regardless -- rather than assume which
// methods are safe to omit, any call on this stub is a harmless no-op.
const socketServiceStub = new Proxy({}, {
  get: () => (() => {})
});

// Minimal console logger matching the {info,warn,debug,error} shape services expect.
const logger = {
  info: () => {}, warn: () => {}, debug: () => {}, error: (...a) => console.error(...a)
};

const SCENARIOS = [
  {
    key: 'empty-cart',
    label: 'Empty cart (nothing ordered yet)',
    payload: { cart: [], limit: 4 }
  },
  {
    key: 'opening-wine',
    label: 'Guest orders a Pinotage first (drink-first steakhouse pattern)',
    payload: { cart: [{ name: 'TRUMPS' }], limit: 4 }
  },
  {
    key: 'needs-dessert',
    label: 'Wine + main already ordered (should reach for a side/dessert next)',
    payload: { cart: [{ name: 'TRUMPS' }, { name: 'RIBEYE 380g' }], limit: 4 }
  },
  {
    key: 'seafood-white-wine',
    label: 'Seafood starter (should favor white wine, not red)',
    payload: { cart: [{ name: 'GARLIC LEMON CALAMARI' }], limit: 4 }
  },
  {
    key: 'vip-guest',
    label: 'Same cart as opening-wine, but a VIP guest with a known favourite',
    payload: {
      cart: [{ name: 'TRUMPS' }], limit: 4,
      guestIntel: { present: true, vip: true, favorites: { main: 'RIBEYE 380g' }, topItems: ['RIBEYE 380g'] }
    }
  },
  {
    key: 'allergy-guest',
    label: 'Guest with a declared allergy (must never surface a matching item)',
    payload: {
      cart: [{ name: 'GARLIC LEMON CALAMARI' }], limit: 6,
      guestIntel: { present: true, allergies: 'shellfish, prawns' }
    }
  },
  {
    key: 'already-full-cart',
    label: 'A near-complete dinner (wine, main, side, dessert) — tests "done" / thin results, not a crash',
    payload: { cart: [{ name: 'TRUMPS' }, { name: 'RIBEYE 380g' }, { name: 'STEAKHOUSE CHIPS' }, { name: 'DEATH BY CHOCOLATE CAKE' }, { name: 'IRISH COFFEE' }], limit: 4 }
  },
  {
    key: 'proactive-frequency-gate',
    label: 'Unsolicited (proactive) nudge on a cart that already got recommendations this turn (frequency/cooldown check)',
    payload: { cart: [{ name: 'TRUMPS' }], limit: 4, proactive: true, tableId: 'inspect-freq-test' }
  }
];

function fmtMoney(n) { return `R${(Number(n) || 0).toFixed(2)}`; }

function printCandidate(c, indent = '    ') {
  const brain = c.brain || {};
  console.log(`${indent}${(c.chef ? '[CHEF] ' : '')}${c.name}  score=${c.score ?? '-'}  confidence=${brain.confidence ?? '-'}  EV=${brain.expectedValue != null ? fmtMoney(brain.expectedValue) : '-'}  netRevenue=${brain.netRevenueIncrease != null ? fmtMoney(brain.netRevenueIncrease) : '-'}  source=${c.source || '-'}`);
  if (brain.replacement) console.log(`${indent}  -> replaces "${brain.replacement.name}" (was ${fmtMoney(brain.replacement.previousPrice)})`);
}

function printResult(scenario, trace, output) {
  console.log(`\n${'='.repeat(78)}`);
  console.log(`SCENARIO: ${scenario.label}`);
  console.log('-'.repeat(78));
  console.log('INPUT CONTEXT:');
  console.log(`  cart: [${(scenario.payload.cart || []).map(c => c.name).join(', ') || '(empty)'}]`);
  if (scenario.payload.tableId) console.log(`  tableId: ${scenario.payload.tableId}`);
  if (scenario.payload.guestIntel) console.log(`  guestIntel: ${JSON.stringify(scenario.payload.guestIntel)}`);
  if (scenario.payload.proactive) console.log(`  proactive: true`);
  console.log(`  limit: ${scenario.payload.limit ?? '(default)'}`);

  if (trace.mealStage) console.log(`  detected meal stage: ${trace.mealStage}`);

  console.log(`\nREJECTED BY CATEGORY-SAFETY RULES R1-R7 (${(trace.rejectedByCategorySafety || []).length}):`);
  if (!trace.rejectedByCategorySafety || trace.rejectedByCategorySafety.length === 0) console.log('    (none)');
  else trace.rejectedByCategorySafety.forEach(d => console.log(`    ${d.name || '(unknown)'} [${d.type}]  ->  ${d.reason}`));

  console.log(`\nCANDIDATES CONSIDERED (${(trace.candidatesConsidered || []).length}, post chef/hero/tag/rotation/category-safety/dietary/allergy filtering, pre pipeline):`);
  (trace.candidatesConsidered || []).forEach(c => printCandidate(c));

  console.log(`\nREJECTED BY THE CANDIDATE-FILTER PIPELINE (${(trace.rejected || []).length}):`);
  if (!trace.rejected || trace.rejected.length === 0) console.log('    (none)');
  else trace.rejected.forEach(d => console.log(`    ${d.name || '(unknown)'}  ->  ${d.reason}`));

  if (trace.frequencyGated) console.log(`\nFREQUENCY/COOLDOWN GATE FIRED: ${trace.frequencyGated}`);

  console.log(`\nFINAL OUTPUT (${output.length} recommendation${output.length === 1 ? '' : 's'}, in ranked order):`);
  if (output.length === 0) console.log('    (empty — no recommendation for this context)');
  output.forEach((pub, i) => {
    console.log(`  ${i + 1}. ${pub.chef ? '[CHEF] ' : ''}${pub.name} — ${fmtMoney(pub.price)}`);
    console.log(`     confidence=${pub.confidence}  expectedValue=${pub.expectedValue != null ? fmtMoney(pub.expectedValue) : '-'}  netRevenueIncrease=${pub.netRevenueIncrease != null ? fmtMoney(pub.netRevenueIncrease) : '-'}`);
    if (pub.replacement) console.log(`     replaces: ${pub.replacement.name} (was ${fmtMoney(pub.replacement.previousPrice)})`);
    console.log(`     reason: "${pub.reason || ''}"`);
    if (pub.scoreComponents) {
      const sc = pub.scoreComponents;
      console.log(`     scoreComponents: H=${sc.H} P=${sc.P} R=${sc.R} S=${sc.S} T=${sc.T} O=${sc.O} Pop=${sc.Pop} Chef=${sc.Chef} Pref=${sc.Pref} Pen=${sc.Pen}  total=${sc.TotalScore}`);
    }
    if (pub.confidenceBreakdown) {
      console.log(`     confidenceBreakdown: band=${pub.confidenceBreakdown.band}  ${JSON.stringify(pub.confidenceBreakdown.components)}`);
    }
  });
}

async function main() {
  const config = createConfig(path.resolve(__dirname, '..'));
  const fileService = new FileService(config, { logger });
  const aiService = new AiService(config, fileService, socketServiceStub, { logger });

  let scenarios = SCENARIOS;
  const only = argValue('--scenario');
  const adhocCart = argValue('--cart');
  if (adhocCart) {
    scenarios = [{
      key: 'adhoc',
      label: `Ad-hoc cart: ${adhocCart}`,
      payload: {
        cart: adhocCart.split(',').map(s => ({ name: s.trim() })).filter(c => c.name),
        tableId: argValue('--table') || undefined,
        limit: 6
      }
    }];
  } else if (only) {
    scenarios = SCENARIOS.filter(s => s.key === only);
    if (scenarios.length === 0) {
      console.error(`Unknown --scenario "${only}". Known: ${SCENARIOS.map(s => s.key).join(', ')}`);
      process.exit(2);
    }
  }

  const results = [];
  for (const scenario of scenarios) {
    const trace = {};
    const payload = { ...scenario.payload, __debugTrace: trace };
    let output;
    try {
      output = await aiService.recommend(payload);
    } catch (error) {
      console.error(`Scenario "${scenario.key}" threw: ${error.message}`);
      results.push({ scenario: scenario.key, error: error.message });
      continue;
    }
    if (JSON_OUT) {
      results.push({ scenario: scenario.key, label: scenario.label, input: scenario.payload, trace, output });
    } else {
      printResult(scenario, trace, output);
    }
  }

  if (JSON_OUT) console.log(JSON.stringify(results, null, 2));
  else console.log(`\n${'='.repeat(78)}\n${scenarios.length} scenario(s) inspected.`);

  if (typeof fileService.close === 'function') await fileService.close().catch(() => {});
  process.exit(0);
}

main().catch(error => {
  console.error('inspect-recommendations failed:', error.message);
  console.error('Is DATABASE_URL reachable? This tool needs a real (development) database — recommend() resolves candidates against live menu data.');
  process.exit(2);
});
