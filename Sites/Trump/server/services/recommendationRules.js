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

      if (enforceStage && !chef) {
        // R5: no starter once the table is closing (dessert in cart).
        if (type === 'STARTER' && stage === 'CLOSING') reason = 'stage:no-starter-at-closing';
        // R5: no second main from the algorithm when the cart already has a main,
        // and never two mains in one rec set.
        else if (type === 'MAIN' && (cartHasMain || mainsKept >= 1)) reason = 'stage:no-second-main';
      }

      if (!reason && isBeverage) {
        const kind = bevKindOf(cand, type);
        // R4: don't recommend a beverage of a kind already on the table.
        if (cartKinds.has(kind)) reason = 'beverage:already-in-cart';
        // R1/R3: total beverage cap.
        else if (beveragesKept >= maxBeverages) reason = 'beverage:max-reached';
        // R2 + one-primary: only one primary beverage; never wine+cocktail.
        else if (PRIMARY_BEVERAGES.has(kind) && primaryKept) reason = 'beverage:second-primary';
        // R3: a soft/hot beverage must not headline (no primary yet) unless closing
        //     (a coffee/digestif with dessert is fine); water never headlines.
        else if (!PRIMARY_BEVERAGES.has(kind) && !primaryKept && stage !== 'CLOSING') reason = 'beverage:secondary-headline';
        else if (kind === 'SOFT' && isWaterish(cand.item) && !primaryKept && stage !== 'CLOSING') reason = 'beverage:water-headline';

        if (!reason) {
          beveragesKept += 1;
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
