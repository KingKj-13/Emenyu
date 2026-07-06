'use strict';
// Recommendation Brain — confidence + expected-value scoring (Phase 1).
//
// This module does NOT generate candidates — aiService.recommend() already does
// that (chef-first → hero → tag-match → algorithmic → rotation → category safety).
// It takes the candidates that pipeline already produced and scores each one:
//   - confidence: 0..1, derived from the source tier the candidate already carries
//     (chef/hero/tag-match/rule/popular), nudged by guest favourites/VIP.
//   - expected value: confidence × net revenue increase, where the increase is
//     replacement-aware (a same-role swap counts only the price delta, never the
//     full price of the new item).
//   - tier weight: Wine(1) > Main(2) > Side(3) > Dessert(4) as a PRIOR, not a hard
//     gate — dessert's weight is promoted in proportion to how under-ordered
//     desserts measurably are versus the other courses in real order history.

const classifier = require('./categoryClassifier');
const { normalizeName } = require('../utils/helpers');

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

// Confidence bands mirror the score bands aiService.recommend() already assigns
// (chef/hero 1000+, tag-match 200+, perfect/food-pairing rules ~84-94, course
// completion ~60-76, popular ~52+) but are expressed as an interpretable
// probability, independent of the raw internal score scale.
function baseConfidence(candidate = {}) {
  if (candidate.chef === true) return 0.92;
  const score = Number(candidate.score) || 0;
  if (score >= 1000) return 0.9;
  if (score >= 200) return 0.8;
  if (score >= 84) return 0.72;
  if (score >= 60) return 0.62;
  return 0.5;
}

function favouriteNames(guestIntel) {
  if (!guestIntel || !guestIntel.present) return [];
  const favs = guestIntel.favorites || {};
  return [favs.wine, favs.main, favs.dessert, ...(guestIntel.topItems || [])]
    .filter(Boolean)
    .map(normalizeName);
}

// Guest-aware confidence nudge. Favourites boost; VIP/returning guests get a
// small trust bump. Allergy/avoid exclusion is a hard filter, handled separately
// by isAllergyMatch (callers should drop matches before they reach here).
function guestAdjustedConfidence(confidence, item = {}, guestIntel = null) {
  if (!guestIntel || !guestIntel.present) return confidence;
  const name = normalizeName(item.name);
  if (favouriteNames(guestIntel).includes(name)) return clamp01(confidence + 0.15);
  if (guestIntel.vip) return clamp01(confidence + 0.05);
  return confidence;
}

function isAllergyMatch(item = {}, guestIntel = null) {
  if (!guestIntel || !guestIntel.present) return false;
  const avoid = [
    ...(Array.isArray(guestIntel.avoids) ? guestIntel.avoids : []),
    ...String(guestIntel.allergies || '').split(',').map(s => s.trim()).filter(Boolean)
  ]
    .map(term => term.toLowerCase())
    .filter(Boolean);
  if (!avoid.length) return false;
  const haystack = `${item.name || ''} ${item.description || ''} ${item.allergens || ''} ${item.searchText || ''}`.toLowerCase();
  return avoid.some(term => haystack.includes(term));
}

function resolveCartLine(line, menuByName) {
  const match = menuByName && menuByName.get(normalizeName(line?.name));
  return match || line || {};
}

function beverageKindOf(item, categoryType) {
  if (categoryType === 'WINE') return 'WINE';
  if (categoryType === 'DRINK') return classifier.beverageKind(item);
  return 'NONE';
}

// Find the cart line this candidate would plausibly REPLACE: same categoryType,
// and for beverages, the same beverageKind (a cocktail never "replaces" a wine).
// Returns { name, price } or null when this is a pure add, not a swap.
function findReplacementTarget(candidateItem = {}, cart = [], menuByName = new Map()) {
  const candType = candidateItem.categoryType || classifier.categoryType(candidateItem);
  const candKind = beverageKindOf(candidateItem, candType);
  const candKey = normalizeName(candidateItem.name);

  for (const line of cart) {
    const resolved = resolveCartLine(line, menuByName);
    if (normalizeName(resolved.name) === candKey) continue;
    const lineType = resolved.categoryType || classifier.categoryType(resolved);
    if (lineType !== candType) continue;
    if ((candType === 'WINE' || candType === 'DRINK') && beverageKindOf(resolved, lineType) !== candKind) continue;
    return { name: resolved.name, price: Number(line.price ?? resolved.price) || 0 };
  }
  return null;
}

// Net revenue increase: full price for a pure add; price DELTA for a same-role
// replacement (e.g. Wine A R210 -> Wine B R255 reports +R45, never +R255).
function netRevenueIncrease(candidatePrice, replacementTarget) {
  const price = Number(candidatePrice) || 0;
  if (!replacementTarget) return price;
  return price - (Number(replacementTarget.price) || 0);
}

// Dessert under-order promotion. attach-rate = fraction of orders containing a
// line of that course. Dessert's tier weight is nudged toward parity with the
// other courses in proportion to how far under-ordered it measurably is — never
// exceeding 1.0, so it stays a prior a strong non-dessert EV can still beat.
function tierWeights(orderRecords = [], menuByName = new Map()) {
  const attach = { STARTER: 0, MAIN: 0, WINE: 0, DRINK: 0, DESSERT: 0 };
  const total = orderRecords.length || 1;

  orderRecords.forEach(order => {
    const types = new Set(
      (order.items || []).map(line => {
        const resolved = resolveCartLine(line, menuByName);
        return resolved.categoryType || classifier.categoryType(line?.name);
      })
    );
    types.forEach(type => { if (attach[type] !== undefined) attach[type] += 1; });
  });
  Object.keys(attach).forEach(key => { attach[key] /= total; });

  // Base priority tiers per product spec: Wine(1) > Main(2) > Side/Starter(3) > Dessert(4).
  const base = { WINE: 1.0, MAIN: 0.9, DRINK: 0.85, STARTER: 0.8, DESSERT: 0.7 };
  const others = ['STARTER', 'MAIN', 'WINE', 'DRINK'].map(key => attach[key]);
  const avgOthers = others.reduce((sum, value) => sum + value, 0) / others.length;
  const underOrderGap = Math.max(0, avgOthers - attach.DESSERT);
  const dessertWeight = Math.min(1, base.DESSERT + underOrderGap * 0.4);

  return { ...base, DESSERT: dessertWeight };
}

// Score one already-generated candidate. Returns the fields the API surfaces
// (confidence, expectedValue, netRevenueIncrease, replacement) plus a finalScore
// used only for re-ranking within aiService.recommend() (never returned to callers).
function scoreCandidate({ candidate, cart = [], menuByName = new Map(), guestIntel = null, weights = {} } = {}) {
  const item = candidate.item || candidate;
  const categoryType = item.categoryType || classifier.categoryType(item);

  const confidence = clamp01(guestAdjustedConfidence(baseConfidence(candidate), item, guestIntel));
  const replacementTarget = findReplacementTarget(item, cart, menuByName);
  const increase = netRevenueIncrease(item.price, replacementTarget);
  const expectedValue = Number((confidence * increase).toFixed(2));
  const tierWeight = weights[categoryType] ?? 0.75;

  return {
    confidence: Number(confidence.toFixed(2)),
    expectedValue,
    netRevenueIncrease: Number(increase.toFixed(2)),
    replacement: replacementTarget ? { name: replacementTarget.name, previousPrice: replacementTarget.price } : null,
    finalScore: expectedValue * tierWeight
  };
}

// Phase 3 (Dining Concierge): the guest's dining journey is a fixed hospitality
// sequence, not "whichever course happens to be empty" — nothing selected -> a
// drink, drink -> starter/main, food -> wine, wine+main -> a premium upgrade
// (once, never repeated), then dessert, then coffee, then a digestif, then STOP.
// Pure function: given what's already in the cart (+ whether an upgrade has
// already been offered this session, from the SAME excludeNames memory
// recommend() already uses), returns the single next stage — never invents a
// second recommendation system, just orders the existing course-completion
// candidates the engine already knows how to build.
function resolveItems(cart = [], menuByName = new Map()) {
  return cart.map(line => resolveCartLine(line, menuByName)).filter(it => it && it.name);
}

function nextJourneyStage(cart = [], menuByName = new Map(), { upgradeOffered = false, upgradeAvailable = false } = {}) {
  const items = resolveItems(cart, menuByName);
  const typeOf = it => it.categoryType || classifier.categoryType(it);
  const hasDrink = items.some(it => ['WINE', 'DRINK'].includes(typeOf(it)));
  const hasFood = items.some(it => ['MAIN', 'STARTER', 'SUSHI'].includes(typeOf(it)));
  const hasWine = items.some(it => typeOf(it) === 'WINE');
  const hasDessert = items.some(it => typeOf(it) === 'DESSERT');
  const hasCoffee = items.some(it => classifier.beverageKind(it) === 'HOT');
  const hasDigestif = items.some(it => ['spirit', 'port', 'amarula'].includes(it.tags?.drinkType));

  if (!hasDrink) return 'drink';
  if (!hasFood) return 'food';
  if (!hasWine) return 'wine';
  if (upgradeAvailable && !upgradeOffered) return 'upgrade';
  if (!hasDessert) return 'dessert';
  if (!hasCoffee) return 'coffee';
  if (!hasDigestif) return 'digestif';
  return 'done';
}

module.exports = {
  clamp01,
  baseConfidence,
  guestAdjustedConfidence,
  isAllergyMatch,
  findReplacementTarget,
  netRevenueIncrease,
  tierWeights,
  scoreCandidate,
  nextJourneyStage
};
