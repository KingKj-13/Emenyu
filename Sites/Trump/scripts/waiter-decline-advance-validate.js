#!/usr/bin/env node
'use strict';
// Waiter "AI Recommendation" panel — offline self-test for the general
// (non-curated-demo) decline/skip fix: aiService.recommend() now calls
// recoMemory.recordDecline(tableId, declinedName) when the caller passes
// { skip: true, declinedName }, BEFORE candidateFilterPipeline.runPipeline()
// runs — so the just-declined candidate is excluded from the very same
// turn's result, not just future ones. No DB/HTTP needed: exercises the
// same recoMemory + candidateFilterPipeline pairing aiService.js wires
// together, directly.
//
//   node scripts/waiter-decline-advance-validate.js

const { createRecommendationMemory } = require('../server/services/recommendationMemory');
const { createBusinessRules } = require('../server/services/businessRules');
const candidateFilterPipeline = require('../server/services/candidateFilterPipeline');

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass: !!pass, detail });
}

function candidate(name, categoryType = 'MAIN', score = 10) {
  return { item: { name, categoryType, price: 100 }, source: 'test', score };
}

const businessRules = createBusinessRules();
const recoMemory = createRecommendationMemory({ businessRules });

const tableId = 'waiter-decline-test-table';
// Distinct categoryTypes so step 8's "max 2 per category" cap can't be the
// thing dropping a candidate — this test isolates step 4 (decline) only.
const A = candidate('RIBEYE 380g', 'MAIN');
const B = candidate('ONION RINGS', 'SIDE');
const C = candidate('CORONA', 'DRINK');

// Turn 1: nothing declined yet — all 3 survive.
const turn1 = candidateFilterPipeline.runPipeline({
  candidates: [A, B, C], cart: [], tableId, memory: recoMemory, businessRules
});
check('turn 1 (no decline yet): all 3 candidates survive', turn1.kept.length === 3);

// Waiter presses Decline on the top pick (A) — this is exactly what
// aiService.recommend() now does when payload.skip && payload.declinedName.
recoMemory.recordDecline(tableId, A.item.name);

// Turn 2: re-running the SAME candidate list must now exclude A only.
const turn2 = candidateFilterPipeline.runPipeline({
  candidates: [A, B, C], cart: [], tableId, memory: recoMemory, businessRules
});
const names2 = turn2.kept.map(c => c.item.name);
check('turn 2 (after declining RIBEYE): declined item is excluded THIS SAME turn',
  !names2.includes(A.item.name), `kept: ${names2.join(', ')}`);
check('turn 2: the other two candidates are unaffected', names2.includes(B.item.name) && names2.includes(C.item.name));
check('turn 2: dropped log attributes the exclusion to the decline, not some other rule',
  turn2.dropped.some(d => d.name === A.item.name && d.reason === 'declined:already-rejected'));

// Decline B too — simulates the waiter pressing Decline a second time on
// whatever the panel now shows as the new top pick.
recoMemory.recordDecline(tableId, B.item.name);
const turn3 = candidateFilterPipeline.runPipeline({
  candidates: [A, B, C], cart: [], tableId, memory: recoMemory, businessRules
});
const names3 = turn3.kept.map(c => c.item.name);
check(`turn 3 (after declining both ${A.item.name} and ${B.item.name}): only ${C.item.name} remains`,
  names3.length === 1 && names3[0] === C.item.name, `kept: ${names3.join(', ')}`);

// A different table/device must be completely unaffected by this table's declines
// (recommendationMemory is keyed per tableId — the same isolation aiService.js
// already relies on for device-scoped recommendations).
const otherTable = 'waiter-decline-test-OTHER-table';
const turnOther = candidateFilterPipeline.runPipeline({
  candidates: [A, B, C], cart: [], tableId: otherTable, memory: recoMemory, businessRules
});
check('a different table is unaffected by this table\'s declines', turnOther.kept.length === 3);

const failed = results.filter(r => !r.pass);
for (const r of results) {
  console.log(`  ${r.pass ? '✓' : '✗ FAIL'} ${r.name}${r.detail ? ` (${r.detail})` : ''}`);
}
console.log('\n' + '─'.repeat(62));
if (failed.length) {
  console.log(`FAIL — ${failed.length}/${results.length} checks failed.`);
  process.exit(1);
} else {
  console.log(`PASS — ${results.length}/${results.length} checks passed.`);
  process.exit(0);
}
