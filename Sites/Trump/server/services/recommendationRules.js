'use strict';
// Category safety rules (Phase 3, Task 3) — a deterministic filter applied to the
// merged, scored, chef-first, rotated candidate list before the final slice.
//
// Enforces (audit findings F1/F2/F3/F6):
//   R1 one primary beverage max          R2 never wine + cocktail together
//   R3 secondary beverage (soft/hot) never headlines; water never as sole headline
//   R4 no drink -> same-kind drink        R5 course-stage validity (no dessert->starter,
//   no 2nd main from algorithm)           R6/R7 dedupe by role
//
// Chef rows (candidate.chef === true) are never dropped by the course-stage rule
// (a chef may intentionally pair across stages), but beverage-primacy rules (R1/R2)
// still apply across the whole set so a chef wine + an algorithmic cocktail never
// co-appear.

const classifier = require('./categoryClassifier');

const PRIMARY_BEVERAGES = new Set(['WINE', 'COCKTAIL', 'BEER']);

function typeOf(candidate) {
  return candidate.item?.categoryType || classifier.categoryType(candidate.item);
}

function bevKindOf(candidate, type) {
  if (candidate.beverageKind && candidate.beverageKind !== 'NONE') return candidate.beverageKind;
  if (type === 'WINE') return 'WINE';
  if (type === 'DRINK') return classifier.beverageKind(candidate.item);
  return 'NONE';
}

function isWaterish(item) {
  return /\bwater\b/i.test(String(item?.name || ''));
}

// Cart items may arrive pre-classified (engine resolves them against the menu) or
// as a bare name — prefer the provided categoryType, else classify the name.
function cartItemType(c) {
  return c && c.categoryType ? c.categoryType : classifier.categoryType(c);
}

// Derive the meal stage from the current cart.
function mealStage(cart = []) {
  const types = (cart || []).map(cartItemType);
  const hasDessert = types.includes('DESSERT');
  const hasMain = types.includes('MAIN');
  if (hasDessert) return 'CLOSING';
  if (hasMain) return 'MAIN';
  if (types.length) return 'OPENING';
  return 'EMPTY';
}

function cartBeverageKinds(cart = []) {
  const kinds = new Set();
  (cart || []).forEach(c => {
    const t = cartItemType(c);
    if (t === 'WINE') kinds.add('WINE');
    else if (t === 'DRINK') kinds.add(c.beverageKind && c.beverageKind !== 'NONE' ? c.beverageKind : classifier.beverageKind(c));
  });
  return kinds;
}

function createRecommendationRules({ config = {}, logger = null } = {}) {
  const rcfg = (config.reco) || {};
  const maxBeverages = Number.isFinite(rcfg.maxBeverages) ? rcfg.maxBeverages : 1;
  const enforceStage = rcfg.enforceStage !== false;

  // candidates are already ordered (chef-first, rotated, scored). Walk in order and
  // keep those that pass the rules; record drop reasons for explainability.
  function applyCategorySafety(candidates = [], cart = []) {
    const stage = mealStage(cart);
    const cartKinds = cartBeverageKinds(cart);
    const cartHasMain = stage === 'MAIN' || stage === 'CLOSING';

    let beveragesKept = 0;
    let primaryKept = false;
    let mainsKept = 0;
    let dessertsKept = 0;
    const dropped = [];
    const kept = [];

    for (const cand of candidates) {
      const type = typeOf(cand);
      const isBeverage = type === 'WINE' || type === 'DRINK';
      const chef = cand.chef === true;
      let reason = null;

      // Phase 1 (Recommendation Brain) Replacement Logic applies here too: a
      // premium-upgrade candidate (cand.isReplacement === true) swaps the main
      // already in the cart rather than adding a second one, so R5 shouldn't
      // block it — same bypass pattern as the beverage rules below.
      const isMainReplacement = cand.isReplacement === true;
      if (enforceStage && !chef && !isMainReplacement) {
        // R5: no starter once the table is closing (dessert in cart), or once a
        // main is already in the cart (mid-meal — a starter reads as "too late").
        if (type === 'STARTER' && (stage === 'CLOSING' || stage === 'MAIN')) reason = 'stage:no-starter-past-first-course';
        // R5: no second main from the algorithm when the cart already has a main,
        // and never two mains in one rec set.
        else if (type === 'MAIN' && (cartHasMain || mainsKept >= 1)) reason = 'stage:no-second-main';
      }

      if (!reason && isBeverage) {
        const kind = bevKindOf(cand, type);
        // Phase 1 (Recommendation Brain) — Replacement Logic: a candidate the
        // engine has identified as a same-role UPGRADE of something already in
        // the cart (cand.isReplacement === true, set by aiService.recommend()
        // via recommendationScoring.findReplacementTarget) swaps the existing
        // pour rather than adding a second one. Only R4 ("already in cart") and
        // R1's cap-COUNTING treat it specially — R2 (never wine+cocktail) and R3
        // (no secondary headline) are ALWAYS enforced, replacement or not, since
        // those protect what ends up on the table, not how it got there.
        const isReplacement = cand.isReplacement === true;
        // R4: don't recommend a beverage of a kind already on the table — unless
        // it's an upgrade replacement of that exact kind. Always enforced (chef
        // or not) — a chef pairing still shouldn't duplicate what's on the table.
        if (cartKinds.has(kind) && !isReplacement) reason = 'beverage:already-in-cart';
        // R1: total beverage cap (a replacement doesn't consume a cap slot).
        // Bypassed for chef candidates — per the "chef recommendations always
        // win" invariant (see recommend()'s chef-tier comment), a curated
        // pairing list (e.g. Carmella's cappuccino+juice for one dish) is the
        // authoritative diversity decision, not the algorithmic cap's job to
        // second-guess.
        else if (!chef && !isReplacement && beveragesKept >= maxBeverages) reason = 'beverage:max-reached';
        // R2 + one-primary: only one primary beverage; never wine+cocktail.
        // Always enforced — two competing primary pours is a table-setting
        // problem regardless of source.
        else if (PRIMARY_BEVERAGES.has(kind) && primaryKept) reason = 'beverage:second-primary';
        // R3: a soft/hot beverage must not headline (no primary yet) unless
        // closing (a coffee/digestif with dessert is fine); water never
        // headlines. This is a steakhouse-style upsell heuristic ("lead with
        // wine, not coffee") that does not generalize to every tenant (a café
        // pairing a croissant with a cappuccino is exactly right) — bypassed
        // for chef candidates for the same reason as R1.
        else if (!chef && !PRIMARY_BEVERAGES.has(kind) && !primaryKept && stage !== 'CLOSING') reason = 'beverage:secondary-headline';
        else if (!chef && kind === 'SOFT' && isWaterish(cand.item) && !primaryKept && stage !== 'CLOSING') reason = 'beverage:water-headline';

        if (!reason) {
          if (!isReplacement) beveragesKept += 1;
          if (PRIMARY_BEVERAGES.has(kind)) primaryKept = true;
        }
      }

      // R7: cap desserts at one per set.
      if (!reason && type === 'DESSERT') {
        if (dessertsKept >= 1) reason = 'dedupe:extra-dessert';
        else dessertsKept += 1;
      }

      if (!reason && type === 'MAIN') mainsKept += 1;

      if (reason) {
        dropped.push({ name: cand.item?.name, type, reason });
      } else {
        kept.push(cand);
      }
    }

    if (dropped.length) {
      logger?.debug?.('reco_safety_dropped', { stage, dropped });
    }
    return { kept, dropped, stage };
  }

  return { applyCategorySafety, mealStage };
}

module.exports = { createRecommendationRules, PRIMARY_BEVERAGES };
