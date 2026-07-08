'use strict';
// Phase 4 (Recommendation Engine V2) — the Candidate Filtering Pipeline, per
// spec section 4.2's 9-step deterministic order:
//   1 unavailable  2 dietary/allergy conflicts  3 already-ordered duplicates
//   4 already-declined  5 meal-stage conflicts  6 downselling
//   7 protein/structural conflicts  8 duplicate-category overload
//   9 frequency/cooldown
//
// Steps 1-3 and the bulk of step 5 already run, tested, inside
// aiService.recommend() BEFORE candidates reach this module (generation-time
// `seen` dedupe = step 3; dietaryOk()/isAllergyMatch() = step 2;
// recommendationRules.applyCategorySafety()'s R1-R7 = the bulk of step 5).
// This module does not re-implement or duplicate those — it completes the
// pipeline with the steps that were a genuine gap: the memory-aware half of
// step 4, the two new meal-stage rules step 5 was missing (dessert-before-
// mains, wine-after-coffee), and steps 6-9 in full. `runPipeline()` is the
// single call site aiService.recommend() uses so the full 9-step order is
// explicit and auditable in one place, even though the underlying checks are
// composed from several modules rather than reimplemented here.

const classifier = require('./categoryClassifier');
const { normalizeName } = require('../utils/helpers');

function runPipeline({
  candidates = [],
  cart = [],
  tableId = null,
  wantsValue = false,
  proactive = false,
  memory = null,
  businessRules = null,
  maxUnrelatedItems = null
} = {}) {
  const dropped = [];
  const drop = (cand, reason) => dropped.push({ name: cand.item?.name, reason });

  // Step 4 (memory-aware half) — never re-suggest a candidate the guest has
  // already explicitly declined, or silently ignored across multiple turns.
  let kept = candidates.filter(cand => {
    if (!memory || !tableId) return true;
    const name = cand.item?.name;
    if (!name) return true;
    if (memory.isRejected(tableId, name)) { drop(cand, 'declined:already-rejected'); return false; }
    if (memory.isRecentlyIgnored(tableId, name)) { drop(cand, 'declined:recently-ignored'); return false; }
    return true;
  });

  // Step 5 (additional rules) — dessert-before-mains, wine-after-coffee.
  kept = kept.filter(cand => {
    if (!businessRules) return true;
    const type = cand.item?.categoryType || classifier.categoryType(cand.item);
    if (businessRules.isDessertBeforeMains({ categoryType: type, cart })) { drop(cand, 'stage:no-dessert-before-mains'); return false; }
    if (businessRules.isWineAfterCoffee({ categoryType: type, cart })) { drop(cand, 'beverage:no-new-wine-after-coffee'); return false; }
    return true;
  });

  // Step 6 — never-downsell: a same-role replacement priced BELOW what it
  // replaces is blocked unless the guest explicitly asked for value/lighter.
  kept = kept.filter(cand => {
    if (!businessRules) return true;
    const netRevenueIncrease = cand.brain?.netRevenueIncrease;
    if (businessRules.isDownsell({ netRevenueIncrease, wantsValue })) { drop(cand, 'value:never-downsell'); return false; }
    return true;
  });

  // Step 7 — protein/structural conflict: the spec's own named example is
  // tannic reds clashing with oily fish (metallic flavours) — the one
  // structural conflict concrete enough to enforce as a hard drop without a
  // full sommelier rules engine. Bypassed for chef-authored candidates, same
  // pattern as R1-R7's chef bypass. Pattern comes from businessRules (loaded
  // from business_rules.json's structural:tannin-clashes-with-oily-fish entry).
  kept = kept.filter(cand => {
    if (cand.chef === true || !businessRules) return true;
    const item = cand.item || {};
    const type = item.categoryType || classifier.categoryType(item);
    if (businessRules.isStructuralConflict({ categoryType: type, item, cart })) { drop(cand, 'structural:tannin-clashes-with-oily-fish'); return false; }
    return true;
  });

  // Step 8 — duplicate-category overload: keep at most 2 per categoryType so
  // one strong source (e.g. course-completion) can't flood a single category.
  const capPerType = 2;
  const typeCounts = new Map();
  kept = kept.filter(cand => {
    const type = cand.item?.categoryType || classifier.categoryType(cand.item);
    const count = typeCounts.get(type) || 0;
    if (count >= capPerType) { drop(cand, 'overload:category-cap'); return false; }
    typeCounts.set(type, count + 1);
    return true;
  });

  // Step 9 — frequency/cooldown: only gates PROACTIVE (unsolicited) turns.
  // A hard stop clears the whole proactive set (per frequency_rules.json,
  // "silence is a signal"); softer decline streaks reduce count, not to zero.
  let frequencyReason = null;
  if (proactive && memory && tableId) {
    const gate = memory.canSuggestProactively(tableId);
    if (!gate.allowed) {
      frequencyReason = gate.reason;
      kept.forEach(cand => drop(cand, gate.reason));
      kept = [];
    } else {
      const factor = memory.intensityFactor(tableId);
      if (factor < 1 && kept.length > 1) {
        const capped = Math.max(1, Math.round(kept.length * factor));
        kept.slice(capped).forEach(cand => drop(cand, 'frequency:reduced-intensity'));
        kept = kept.slice(0, capped);
      }
    }
  }

  // Utterance shaping (business_rules.json utterance:* entries) — at most
  // maxUnrelatedItems distinct categories in the final set, applied last so
  // it shapes the already-safety-and-frequency-filtered result.
  if (maxUnrelatedItems && kept.length > maxUnrelatedItems) {
    const seenTypes = new Set();
    const shaped = [];
    for (const cand of kept) {
      const type = cand.item?.categoryType || classifier.categoryType(cand.item);
      if (shaped.length < maxUnrelatedItems || seenTypes.has(type)) {
        shaped.push(cand);
        seenTypes.add(type);
      } else {
        drop(cand, 'utterance:max-unrelated-items');
      }
    }
    kept = shaped;
  }

  return { kept, dropped, frequencyGated: frequencyReason };
}

module.exports = { runPipeline };
