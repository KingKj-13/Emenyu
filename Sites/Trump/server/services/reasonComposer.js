'use strict';
// One shared copy layer (Phase 3A). Generates the per-item "why" for the customer
// cards, the chatbot and the waiter, so the same pairing reads identically
// everywhere. Three tiers, never blank (per product decision):
//   Tier 1 — the chef's authored reason (verbatim).
//   Tier 2 — the offline NLG (varietal tasting notes / dish hooks) + a tag-true
//            flavour bridge when source & target share a flavour.
//   Default — a sensible category-aware line so it is NEVER empty.
// Zero external AI: all wording comes from the local templateNlgProvider.

const { KINDS } = require('./nlg/nlgProvider');
const { createNlgService } = require('./nlg/nlgService');

function createReasonComposer({ nlgService = null, logger = null } = {}) {
  const nlg = nlgService || createNlgService({ logger });

  function lc(v) { return String(v || '').toLowerCase(); }

  function sharedFlavour(target, source) {
    const a = target && target.tags && Array.isArray(target.tags.flavour) ? target.tags.flavour : [];
    const b = source && source.tags && Array.isArray(source.tags.flavour) ? source.tags.flavour : [];
    return a.find(f => b.includes(f)) || null;
  }

  // Never-blank default, category-aware.
  function fallback(target, sourceName) {
    const ct = (target.categoryType || '').toUpperCase();
    const s = sourceName ? ` the ${sourceName}` : ' this dish';
    if (ct === 'WINE') return `A confident pour alongside${s}.`;
    if (ct === 'DRINK') return `A great glass to lift${s}.`;
    if (ct === 'DESSERT') return `The sweet finish for${s}.`;
    if (ct === 'STARTER') return `A light way to open before${s}.`;
    return `A natural match for${s}.`;
  }

  // The per-item reason shown on cards / chat / waiter for `target`, optionally
  // paired to an anchor dish `source`. tone: 'short' | 'professional' | 'luxury' | …
  async function pairingReason(target = {}, source = null, { tone = 'professional' } = {}) {
    // Tier 1 — chef authored reason wins verbatim.
    if (typeof target.reason === 'string' && target.reason.trim()) {
      return target.reason.trim();
    }

    // Tier 2 — offline NLG (varietal-aware), then a tag-true flavour bridge.
    let line = '';
    try {
      line = await nlg.phrase({ kind: KINDS.PAIRING_REASON, tone, data: { item: target, forItem: source || undefined } });
    } catch (error) {
      logger?.warn?.('reason_composer_nlg_failed', { error: error?.message });
    }
    line = String(line || '').trim();

    if (line && (target.categoryType || '').toUpperCase() !== 'WINE') {
      const bridge = sharedFlavour(target, source);
      if (bridge && !lc(line).includes(bridge)) {
        line = `${line.replace(/\.\s*$/, '')} — echoing the ${bridge} note.`;
      }
    }

    return line || fallback(target, source && source.name);
  }

  return { pairingReason };
}

module.exports = { createReasonComposer };
