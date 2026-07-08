'use strict';
// Phase 4 (Recommendation Engine V2) — business-rules loader + predicates, per
// knowledge/business_rules.json and knowledge/frequency_rules.json (EMenu v3
// spec sections 3.1-3.4). R1-R7 (already-enforced) stay exactly where they are
// today, inside recommendationRules.js's applyCategorySafety() — this module
// does not re-implement them. It ONLY implements the concrete, previously-
// unenforced guardrails the spec calls for (business_rules.json entries whose
// status is "gap-to-implement"), scoped to the ones that are safely,
// deterministically checkable against a single candidate:
//   - value:never-downsell
//   - stage:no-dessert-before-mains
//   - beverage:no-new-wine-after-coffee
//   - timing:never-interrupt-to-upsell (via chat intent type)
//   - utterance:max-one-upgrade-plus-one-pairing / max-3-unrelated-items
//     (selection-shaping thresholds, applied by candidateFilterPipeline)
//
// The remaining gap entries (no-contradicting-previous-recommendations,
// no-robotic-templatey-lines, value-on-request-only) need session memory and
// are partially covered via recommendationMemory.js + nlgService.js's
// personality enforcement — see docs/project-progress for the phase report.

const fs = require('fs');
const path = require('path');
const classifier = require('./categoryClassifier');

const KNOWLEDGE_DIR = path.join(__dirname, '..', '..', 'knowledge');

function loadJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(path.join(KNOWLEDGE_DIR, file), 'utf-8'));
  } catch (error) {
    return fallback;
  }
}

function createBusinessRules({ file, frequencyFile } = {}) {
  const businessRulesDoc = loadJson(file || 'business_rules.json', { rules: [] });
  const frequencyDoc = loadJson(frequencyFile || 'frequency_rules.json', { rules: [] });

  const rules = Array.isArray(businessRulesDoc.rules) ? businessRulesDoc.rules : [];
  const frequencyRules = Array.isArray(frequencyDoc.rules) ? frequencyDoc.rules : [];

  function ruleById(id) {
    return rules.find(r => r.id === id) || null;
  }

  const thresholds = {
    maxProactivePerMeal: frequencyRules.find(r => r.id === 'frequency:max-proactive-suggestions-per-meal')?.threshold ?? 6,
    minMinutesBetweenUnsolicited: frequencyRules.find(r => r.id === 'frequency:min-minutes-between-unsolicited-suggestions')?.threshold ?? 6,
    maxConsecutiveDeclines: frequencyRules.find(r => r.id === 'frequency:reduce-intensity-after-consecutive-declines')?.threshold ?? 3,
    maxConsecutiveIgnoresBeforeStop: frequencyRules.find(r => r.id === 'frequency:stop-proactive-upsell-after-ignored-suggestions')?.threshold ?? 2,
    maxUpgradeCandidates: 1,
    maxPairingCandidates: 1,
    maxUnrelatedItems: 3
  };

  // Intent types that mean "the guest is mid-conversation about something
  // else" (a direct question, or a decline of the current topic) — proactive
  // suggestions should not interrupt these. Loaded from business_rules.json's
  // timing:never-interrupt-to-upsell entry (suppressForIntentTypes) — the
  // live, authoritative config, not a hardcoded set.
  const SUPPRESS_PROACTIVE_INTENT_TYPES = new Set(
    ruleById('timing:never-interrupt-to-upsell')?.suppressForIntentTypes || ['info', 'offtopic']
  );

  // Structural conflict pattern (spec 2.2.1 "tannin + oily fish"), loaded from
  // business_rules.json's structural:tannin-clashes-with-oily-fish entry.
  const oilyFishPatternSource = ruleById('structural:tannin-clashes-with-oily-fish')?.oilyFishPattern || 'salmon|mackerel|sardine|trout|tuna';
  const OILY_FISH_RE = new RegExp(oilyFishPatternSource, 'i');

  // value:never-downsell — block a same-role replacement candidate that is
  // CHEAPER than the item it replaces, unless the guest explicitly asked for
  // something more affordable/lighter (wantsValue).
  function isDownsell({ netRevenueIncrease, wantsValue = false } = {}) {
    if (wantsValue) return false;
    return typeof netRevenueIncrease === 'number' && netRevenueIncrease < 0;
  }

  // stage:no-dessert-before-mains — a dessert candidate is only legal once at
  // least one MAIN/STARTER/SUSHI item is already in the cart.
  function isDessertBeforeMains({ categoryType, cart = [] } = {}) {
    if (categoryType !== 'DESSERT') return false;
    const hasFood = cart.some(line => ['MAIN', 'STARTER', 'SUSHI'].includes(line.categoryType || classifier.categoryType(line)));
    return !hasFood;
  }

  // beverage:no-new-wine-after-coffee — once coffee is in the cart, the
  // wine-pairing window has closed.
  function isWineAfterCoffee({ categoryType, cart = [] } = {}) {
    if (categoryType !== 'WINE') return false;
    return cart.some(line => classifier.beverageKind(line) === 'HOT');
  }

  // timing:never-interrupt-to-upsell — proactive suggestions are suppressed
  // for direct-question / off-topic turns; guest-initiated asks always answer.
  function shouldSuppressProactive(intentType) {
    return SUPPRESS_PROACTIVE_INTENT_TYPES.has(intentType);
  }

  // structural:tannin-clashes-with-oily-fish — a full-bodied red wine
  // candidate is blocked when the cart already holds an oily fish dish.
  function isStructuralConflict({ categoryType, item = {}, cart = [] } = {}) {
    if (categoryType !== 'WINE' || item.tags?.drinkType !== 'red' || item.tags?.body !== 'full') return false;
    return cart.some(line => OILY_FISH_RE.test(String(line?.name || '')));
  }

  return {
    rules,
    frequencyRules,
    thresholds,
    ruleById,
    isDownsell,
    isDessertBeforeMains,
    isWineAfterCoffee,
    shouldSuppressProactive,
    isStructuralConflict
  };
}

module.exports = { createBusinessRules };
