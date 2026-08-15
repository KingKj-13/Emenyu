#!/usr/bin/env node
'use strict';
// Curated Demo Mode — offline self-test for the accept/skip/no-loop stage
// machine (server/services/curatedDemoJourney.js). No DB, no HTTP: exercises
// the resolver directly against every one of the 3 hand-designed journeys
// in config/trumpDemoJourney.js.
//
//   node scripts/curated-demo-validate.js
//
// Exit codes: 0 = every check passes; 1 = at least one failure.

const { resolveCuratedPick, countAccepted, clear } = require('../server/services/curatedDemoJourney');
const { JOURNEYS } = require('../server/config/trumpDemoJourney');

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass: !!pass, detail });
}

function normalize(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

let seq = 0;
function freshVisit() {
  // A unique tableId per test so no two checks ever share curatedDemoJourney's
  // in-memory per-visit state (mirrors how two different tables/devices never
  // interfere with each other in production).
  seq += 1;
  return { tableId: `test-table-${seq}`, deviceId: `test-device-${seq}` };
}

// ── 1. Every journey: accept-everything path ends at dessert, no coffee/digestif ──
for (const journey of JOURNEYS) {
  const { tableId, deviceId } = freshVisit();
  const cart = [journey.starter.name];

  const mainPick = resolveCuratedPick(cart.map(normalize), { tableId, deviceId });
  check(`${journey.id}: first pick after starter is a main candidate`,
    mainPick && mainPick !== 'done' && journey.mains.some(m => normalize(m.name) === normalize(mainPick.name)),
    JSON.stringify(mainPick));

  const acceptedMain = journey.mains[0];
  cart.push(acceptedMain.name);

  const stagePicks = [];
  for (let i = 0; i < 6; i++) {
    const pick = resolveCuratedPick(cart.map(normalize), { tableId, deviceId });
    if (pick === 'done' || !pick) break;
    stagePicks.push(pick.name);
    cart.push(pick.name);
  }

  const finalPick = resolveCuratedPick(cart.map(normalize), { tableId, deviceId });
  check(`${journey.id}: accept-everything path terminates with 'done'`, finalPick === 'done', JSON.stringify(finalPick));

  const namesLower = stagePicks.map(n => n.toLowerCase());
  const hasCoffeeOrDigestif = namesLower.some(n =>
    ['coffee', 'cappuccino', 'espresso', 'latte', 'macchiato', 'americano', 'dom pedro', 'amarula', 'irish coffee'].some(bad => n.includes(bad))
  );
  check(`${journey.id}: journey never recommends coffee/digestif after dessert`, !hasCoffeeOrDigestif, JSON.stringify(stagePicks));

  const dessertName = normalize(journey.dessert.name);
  check(`${journey.id}: dessert is offered exactly once and is the last stage pick`,
    stagePicks.filter(n => normalize(n) === dessertName).length === 1 &&
    normalize(stagePicks[stagePicks.length - 1]) === dessertName,
    JSON.stringify(stagePicks));

  const uniquePicks = new Set(stagePicks.map(normalize));
  check(`${journey.id}: no duplicate recommendations across the whole journey`, uniquePicks.size === stagePicks.length, JSON.stringify(stagePicks));

  clear(tableId, deviceId);
}

// ── 2. Skip logic: main offers up to 3 alternatives, no loop, no duplicates ──
{
  const journey = JOURNEYS[0];
  const { tableId, deviceId } = freshVisit();
  const cart = [journey.starter.name];
  const offered = [];

  for (let i = 0; i < journey.mains.length; i++) {
    const pick = resolveCuratedPick(cart.map(normalize), { tableId, deviceId, skip: i > 0 });
    check(`${journey.id}: main alternative #${i + 1} matches journey config, in order`,
      pick && pick !== 'done' && normalize(pick.name) === normalize(journey.mains[i].name),
      JSON.stringify(pick));
    if (pick && pick !== 'done') offered.push(pick.name);
  }

  // Skip the 3rd (last) alternative too — no loop back to the 1st, no 4th offer.
  const afterAllSkipped = resolveCuratedPick(cart.map(normalize), { tableId, deviceId, skip: true });
  check(`${journey.id}: skipping all ${journey.mains.length} main alternatives ends the journey (no loop, no 4th offer)`,
    afterAllSkipped === 'done', JSON.stringify(afterAllSkipped));

  check(`${journey.id}: skip chain never repeated an alternative`, new Set(offered.map(normalize)).size === offered.length, JSON.stringify(offered));

  clear(tableId, deviceId);
}

// ── 3. Side selection depends on which main was actually accepted ──
{
  const journey = JOURNEYS[0];
  for (const main of journey.mains) {
    const { tableId, deviceId } = freshVisit();
    const cart = [journey.starter.name, main.name];
    const nextPick = resolveCuratedPick(cart.map(normalize), { tableId, deviceId });
    if (main.side) {
      check(`${journey.id}: accepting "${main.name}" recommends its own side ("${main.side.name}")`,
        nextPick && nextPick !== 'done' && normalize(nextPick.name) === normalize(main.side.name),
        JSON.stringify(nextPick));
    } else {
      check(`${journey.id}: "${main.name}" has no side -> skips straight to drink`,
        nextPick && nextPick !== 'done' && normalize(nextPick.name) === normalize(main.drink.name),
        JSON.stringify(nextPick));
    }
    clear(tableId, deviceId);
  }
}

// ── 4. Device isolation: two devices at the same table don't share state ──
{
  const journey = JOURNEYS[0];
  const tableId = 'test-shared-table';
  const deviceA = 'test-device-a';
  const deviceB = 'test-device-b';
  const cartA = [journey.starter.name];
  const cartB = [journey.starter.name];

  // Device A skips its first main alternative...
  resolveCuratedPick(cartA.map(normalize), { tableId, deviceId: deviceA });
  const aSecondPick = resolveCuratedPick(cartA.map(normalize), { tableId, deviceId: deviceA, skip: true });

  // ...device B, first call ever for this table+device, should still see the FIRST alternative, not A's second.
  const bFirstPick = resolveCuratedPick(cartB.map(normalize), { tableId, deviceId: deviceB });

  check('device isolation: device B is unaffected by device A\'s skip on the same table',
    bFirstPick && normalize(bFirstPick.name) === normalize(journey.mains[0].name) &&
    aSecondPick && normalize(aSecondPick.name) === normalize(journey.mains[1].name),
    JSON.stringify({ aSecondPick, bFirstPick }));

  clear(tableId, deviceA);
  clear(tableId, deviceB);
}

// ── 5. countAccepted() is stateless and purely cart-derived (Order Complete hook) ──
{
  const journey = JOURNEYS[0];
  const main = journey.mains[0];
  const fullCart = [journey.starter.name, main.name, main.side?.name, main.drink?.name, journey.dessert.name].filter(Boolean);
  const { journey: found, accepted, offered } = countAccepted(fullCart.map(normalize));
  check('countAccepted: fully-accepted journey counts all 4 stages', found?.id === journey.id && accepted === offered && accepted === 4,
    JSON.stringify({ accepted, offered }));

  const noneCart = [journey.starter.name];
  const noneResult = countAccepted(noneCart.map(normalize));
  check('countAccepted: starter-only cart counts 0 accepted', noneResult.accepted === 0, JSON.stringify(noneResult));

  const nonDemoResult = countAccepted(['some random item never in any journey'].map(normalize));
  check('countAccepted: a non-curated cart resolves to no journey at all', nonDemoResult.journey === null, JSON.stringify(nonDemoResult));
}

// ── Report ──
const fails = results.filter(r => !r.pass);
console.log(`Curated Demo Mode — ${results.length} checks across ${JOURNEYS.length} journeys.`);
for (const r of results) {
  console.log(`  ${r.pass ? '✓' : '✗'} ${r.name}${r.pass ? '' : ` — ${r.detail}`}`);
}
console.log(`\n${'─'.repeat(60)}`);
console.log(`${fails.length === 0 ? 'PASS' : 'FAIL'} — ${results.length - fails.length}/${results.length} checks passed.`);
process.exit(fails.length === 0 ? 0 : 1);
