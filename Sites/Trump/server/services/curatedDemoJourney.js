'use strict';
// Curated Demo Mode — accept/skip/no-loop stage machine.
//
// Sibling to scriptedDemoChains.js (which stays untouched — Carmella still
// uses it, and Trump falls back to it when Curated Demo Mode is off). This
// module implements the richer flow the curated journeys need:
//   starter -> main (offer up to 3, in order; Accept stops the chain, Skip
//              advances to the next; after the 3rd is skipped, no more mains
//              are offered — no loop) -> side (only if the accepted main
//              defines one) -> drink (one, best pairing) -> dessert (one) ->
//              done (no coffee/digestif, no further recommendation).
//
// "Accept" is inferred the same way the rest of this codebase infers it: the
// item shows up in the guest's cart. "Skip" is the one truly explicit signal
// — the caller (aiService.recommend/chat) passes `skip: true` when the guest
// tapped a Skip button, and this module advances its own per-visit state.
//
// State is kept in-memory, keyed by the same `${tableId}:${deviceId}`
// composite aiService.js already builds for recommendationMemory.js's
// device-aware suppression (see aiService.js's `readCart`/`tableId` comments)
// — one diner's skip never affects another diner at the same table. Trump
// runs PM2 in fork mode with a single instance, so in-memory per-visit state
// is the same accepted pattern recommendationMemory.js already uses (no new
// DB table for what is genuinely ephemeral demo-session state).

const { normalizeName } = require('../utils/helpers');
const { JOURNEYS } = require('../config/trumpDemoJourney');

const VISIT_TTL_MS = 6 * 60 * 60 * 1000; // 6h — matches recommendationMemory.js

const byKey = new Map();

function keyFor(tableId, deviceId) {
  return `${tableId || 'anon'}:${deviceId || 'anon'}`;
}

function emptyState(journeyId) {
  return {
    journeyId,
    stage: 'main', // main -> side -> drink -> dessert -> done
    mainOfferIndex: 0,
    acceptedMainName: null,
    updatedAt: Date.now()
  };
}

function getState(tableId, deviceId, journeyId) {
  const key = keyFor(tableId, deviceId);
  let state = byKey.get(key);
  if (!state || state.journeyId !== journeyId) {
    state = emptyState(journeyId);
    byKey.set(key, state);
  }
  state.updatedAt = Date.now();
  return state;
}

function gc(ttlMs = VISIT_TTL_MS) {
  const cutoff = Date.now() - ttlMs;
  for (const [key, state] of byKey) {
    if (state.updatedAt < cutoff) byKey.delete(key);
  }
}

function clear(tableId, deviceId) {
  byKey.delete(keyFor(tableId, deviceId));
}

function findJourneyByStarter(cartSet) {
  return JOURNEYS.find(journey => cartSet.has(normalizeName(journey.starter.name))) || null;
}

function findAcceptedMain(journey, cartSet) {
  return journey.mains.find(main => cartSet.has(normalizeName(main.name))) || null;
}

// cartNames: array of already-normalized cart item names. opts:
//   tableId, deviceId — the composite key this visit's state is scoped to.
//   skip — true when this call is an explicit "skip this recommendation" action.
// Returns the same shape scriptedDemoChains.resolveScriptedPick() does:
//   - a pick object { name, price, reason } to recommend next, or
//   - 'done' when this journey has nothing further to offer, or
//   - null when no journey's starter is in the cart (not a curated cart).
function resolveCuratedPick(cartNames, opts = {}) {
  const cartSet = new Set(cartNames);
  const journey = findJourneyByStarter(cartSet);
  if (!journey) return null;

  const state = getState(opts.tableId, opts.deviceId, journey.id);

  const acceptedMain = findAcceptedMain(journey, cartSet);
  if (acceptedMain) state.acceptedMainName = acceptedMain.name;

  if (opts.skip) {
    if (!state.acceptedMainName && state.stage === 'main') {
      state.mainOfferIndex += 1;
    } else if (state.stage === 'side') {
      state.stage = 'drink';
    } else if (state.stage === 'drink') {
      state.stage = 'dessert';
    } else if (state.stage === 'dessert') {
      state.stage = 'done';
    }
  }

  // --- Main stage: no accepted main yet ---
  if (!state.acceptedMainName) {
    if (state.mainOfferIndex >= journey.mains.length) {
      state.stage = 'done';
      return 'done';
    }
    const candidate = journey.mains[state.mainOfferIndex];
    return { name: candidate.name, price: candidate.price, reason: candidate.reason };
  }

  // --- A main has been accepted: side -> drink -> dessert -> done ---
  const acceptedDef = journey.mains.find(main => normalizeName(main.name) === normalizeName(state.acceptedMainName));
  if (!acceptedDef) {
    state.stage = 'done';
    return 'done';
  }

  if (state.stage === 'main') {
    state.stage = acceptedDef.side ? 'side' : 'drink';
  }

  if (state.stage === 'side') {
    if (acceptedDef.side && !cartSet.has(normalizeName(acceptedDef.side.name))) {
      return { name: acceptedDef.side.name, price: acceptedDef.side.price, reason: acceptedDef.side.reason };
    }
    state.stage = 'drink';
  }

  if (state.stage === 'drink') {
    if (acceptedDef.drink && !cartSet.has(normalizeName(acceptedDef.drink.name))) {
      return { name: acceptedDef.drink.name, price: acceptedDef.drink.price, reason: acceptedDef.drink.reason };
    }
    state.stage = 'dessert';
  }

  if (state.stage === 'dessert') {
    if (!cartSet.has(normalizeName(journey.dessert.name))) {
      return { name: journey.dessert.name, price: journey.dessert.price, reason: journey.dessert.reason };
    }
    state.stage = 'done';
  }

  return 'done';
}

// How many of the curated stage offers (main/side/drink/dessert) this visit
// has actually accepted so far — used by the Order Complete follow-up to
// decide thank-you vs. make-good (see config/trumpDemoJourney.js's
// ENJOYED_THRESHOLD and server/services/rewardService.js).
function countAccepted(cartNames, opts = {}) {
  const cartSet = new Set(cartNames);
  const journey = findJourneyByStarter(cartSet);
  if (!journey) return { journey: null, accepted: 0, offered: 0 };

  const acceptedMain = findAcceptedMain(journey, cartSet);
  let accepted = 0;
  let offered = 0;

  if (acceptedMain) {
    accepted += 1;
    offered += 1;
    if (acceptedMain.side) {
      offered += 1;
      if (cartSet.has(normalizeName(acceptedMain.side.name))) accepted += 1;
    }
    if (acceptedMain.drink) {
      offered += 1;
      if (cartSet.has(normalizeName(acceptedMain.drink.name))) accepted += 1;
    }
  } else {
    offered += 1; // a main was offered even though none was accepted yet
  }

  offered += 1; // dessert is always eventually offered
  if (cartSet.has(normalizeName(journey.dessert.name))) accepted += 1;

  return { journey, accepted, offered };
}

module.exports = { resolveCuratedPick, countAccepted, clear, gc };
