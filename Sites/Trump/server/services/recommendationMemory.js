'use strict';
// Phase 4 (Recommendation Engine V2) — the per-table/session Recommendation
// Memory Model, per spec section 4.5. Fills a confirmed gap: today
// chatSession.js re-derives a one-turn "ignored" signal from client-resent
// history on every request, and nothing tracks accepted/rejected history,
// a running suggestion count, spend, mood, or conversation topic across a
// whole visit.
//
// In-memory, keyed by tableId. Trump runs PM2 in fork mode with a single
// instance (ecosystem.config.js: exec_mode 'fork', instances 1), so this
// follows the exact same pattern already used elsewhere in this codebase
// (aiService.js's TTL cache, rotationService's scope-seeded state) rather
// than adding a new DB migration for what is genuinely ephemeral per-visit
// state. A table is cleared when its visit ends (see clear()/gc()).

const { normalizeName } = require('../utils/helpers');

const VISIT_TTL_MS = 6 * 60 * 60 * 1000; // 6h — a stale table auto-expires

function emptyRecord() {
  const now = Date.now();
  return {
    orderedItems: [],
    acceptedNames: new Set(),
    rejectedNames: new Set(),
    ignoredNames: new Set(),
    recommendationHistory: [], // [{ at, stage, proactive, names: [] }]
    lastRecommendation: null,  // { at, name }
    currentStage: null,
    spendTotal: 0,
    spendPerGuest: 0,
    guestMood: 'neutral',
    conversationTopic: null,
    proactiveCount: 0,
    lastProactiveAt: 0,
    consecutiveDeclines: 0,
    consecutiveIgnores: 0,
    createdAt: now,
    updatedAt: now
  };
}

function createRecommendationMemory({ businessRules, logger = null } = {}) {
  const thresholds = businessRules?.thresholds || {
    maxProactivePerMeal: 6,
    minMinutesBetweenUnsolicited: 6,
    maxConsecutiveDeclines: 3,
    maxConsecutiveIgnoresBeforeStop: 2
  };

  const byTable = new Map();

  function getOrCreate(tableId) {
    const key = String(tableId || 'anonymous');
    let record = byTable.get(key);
    if (!record) {
      record = emptyRecord();
      byTable.set(key, record);
    }
    return record;
  }

  function gc(ttlMs = VISIT_TTL_MS) {
    const cutoff = Date.now() - ttlMs;
    for (const [key, record] of byTable) {
      if (record.updatedAt < cutoff) byTable.delete(key);
    }
  }

  function clear(tableId) {
    byTable.delete(String(tableId || 'anonymous'));
  }

  // Call once per chat()/recommend() turn. cartNames = current cart (used to
  // detect a previously-suggested item the guest has since accepted).
  // suggestedNames = the names surfaced THIS turn. ignoredNamesThisTurn = names
  // suggested in a prior turn that the guest moved on from without adding
  // (chatSession.js already computes this signal; reused here, not recomputed).
  function recordTurn(tableId, { cartNames = [], suggestedNames = [], ignoredNamesThisTurn = [], stage = null, proactive = false, spendTotal = null, spendPerGuest = null, guestMood = null, conversationTopic = null } = {}) {
    const record = getOrCreate(tableId);
    const now = Date.now();
    const cartSet = new Set(cartNames.map(normalizeName));

    // Anything now in the cart that was previously suggested is an accept —
    // clears decline/ignore streaks (a real signal the guest is engaged).
    let anyAccepted = false;
    for (const name of cartSet) {
      if (!record.acceptedNames.has(name) && (record.ignoredNames.has(name) || record.recommendationHistory.some(h => h.names.includes(name)))) {
        record.acceptedNames.add(name);
        anyAccepted = true;
      }
    }

    if (ignoredNamesThisTurn.length) {
      ignoredNamesThisTurn.forEach(name => record.ignoredNames.add(normalizeName(name)));
      if (!anyAccepted) record.consecutiveIgnores += 1;
    }
    if (anyAccepted) {
      record.consecutiveIgnores = 0;
      record.consecutiveDeclines = 0;
    }

    if (suggestedNames.length) {
      record.recommendationHistory.push({ at: now, stage, proactive, names: suggestedNames.map(normalizeName) });
      // Bound the history so a very long visit doesn't grow this unbounded.
      if (record.recommendationHistory.length > 200) record.recommendationHistory.shift();
      record.lastRecommendation = { at: now, name: suggestedNames[0] };
      if (proactive) {
        record.proactiveCount += 1;
        record.lastProactiveAt = now;
      }
    }

    record.orderedItems = cartNames;
    if (stage) record.currentStage = stage;
    if (spendTotal != null) record.spendTotal = spendTotal;
    if (spendPerGuest != null) record.spendPerGuest = spendPerGuest;
    if (guestMood) record.guestMood = guestMood;
    if (conversationTopic) record.conversationTopic = conversationTopic;
    record.updatedAt = now;
    return record;
  }

  // An explicit decline (e.g. guest says "no thanks") — distinct from a
  // silent ignore. Callers that detect this signal (none currently do; wired
  // for future chat-intent "decline" detection) should call this directly.
  function recordDecline(tableId, name) {
    const record = getOrCreate(tableId);
    if (name) record.rejectedNames.add(normalizeName(name));
    record.consecutiveDeclines += 1;
    record.consecutiveIgnores = 0;
    record.updatedAt = Date.now();
  }

  function isRejected(tableId, name) {
    const record = getOrCreate(tableId);
    return record.rejectedNames.has(normalizeName(name));
  }

  // Never re-suggest the exact same candidate once it's been suggested and
  // ignored across more than one turn — a stronger, session-wide version of
  // chatSession.js's one-turn-back ignoredNames.
  function isRecentlyIgnored(tableId, name) {
    const record = getOrCreate(tableId);
    return record.ignoredNames.has(normalizeName(name)) && !record.acceptedNames.has(normalizeName(name));
  }

  // frequency_rules.json enforcement — gates whether a PROACTIVE (unsolicited)
  // suggestion may be attached to this turn's response at all. Guest-requested
  // suggestions (payload explicitly asked for a recommendation/pairing) are
  // never gated by this — only unsolicited ones.
  function canSuggestProactively(tableId) {
    const record = getOrCreate(tableId);
    if (record.consecutiveIgnores >= thresholds.maxConsecutiveIgnoresBeforeStop) {
      return { allowed: false, reason: 'frequency:stop-proactive-upsell-after-ignored-suggestions' };
    }
    if (record.proactiveCount >= thresholds.maxProactivePerMeal) {
      return { allowed: false, reason: 'frequency:max-proactive-suggestions-per-meal' };
    }
    const minGapMs = thresholds.minMinutesBetweenUnsolicited * 60 * 1000;
    if (record.lastProactiveAt && Date.now() - record.lastProactiveAt < minGapMs) {
      return { allowed: false, reason: 'frequency:min-minutes-between-unsolicited-suggestions' };
    }
    return { allowed: true, reason: null };
  }

  // 1.0 = normal; reduced after repeated explicit declines (soften, don't stop).
  function intensityFactor(tableId) {
    const record = getOrCreate(tableId);
    return record.consecutiveDeclines >= thresholds.maxConsecutiveDeclines ? 0.5 : 1.0;
  }

  function snapshot(tableId) {
    const record = getOrCreate(tableId);
    return {
      ordered_items: record.orderedItems,
      accepted_recommendations: [...record.acceptedNames],
      rejected_recommendations: [...record.rejectedNames],
      ignored_recommendations: [...record.ignoredNames],
      recommendation_history: record.recommendationHistory,
      last_recommendation: record.lastRecommendation,
      current_stage: record.currentStage,
      current_spend_total: record.spendTotal,
      current_spend_per_guest: record.spendPerGuest,
      guest_mood: record.guestMood,
      current_conversation_topic: record.conversationTopic
    };
  }

  return {
    getOrCreate, clear, gc, recordTurn, recordDecline,
    isRejected, isRecentlyIgnored, canSuggestProactively, intensityFactor, snapshot
  };
}

module.exports = { createRecommendationMemory };
