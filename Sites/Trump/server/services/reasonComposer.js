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

function createReasonComposer({ nlgService = null, heroPairings = null, logger = null } = {}) {
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

  // Recommendation Brain V2 — layer the dish's own story/cooking-method and,
  // where one exists, a premium-upgrade nudge onto the base hero reason. Turns
  // a single sommelier clause into the kind of 2-3 sentence narrative an
  // experienced waiter would actually say, using only real dishes/prices
  // authored in trump_hero_pairings.json's dishNotes/upgrades/sauceUpgrades —
  // never fabricated, and skipped entirely for the ~100 dishes without this
  // extra knowledge (they just get the existing hero/Tier-2 reason, unchanged).
  function foodSideOf(target, source) {
    const isBev = it => ['WINE', 'DRINK'].includes((it && it.categoryType || '').toUpperCase());
    if (target && !isBev(target)) return target;
    if (source && !isBev(source)) return source;
    return null;
  }

  function upgradeNudge(dish) {
    if (!heroPairings || !heroPairings.ready || !dish || !dish.name) return '';
    const upgrade = typeof heroPairings.upgradeFor === 'function' ? heroPairings.upgradeFor(dish.name, dish.tags || {}) : null;
    if (upgrade && lc(upgrade.to) !== lc(dish.name)) {
      return `If you'd like something even more memorable, I'd suggest upgrading to the ${upgrade.to} — ${upgrade.note}.`;
    }
    const sauce = typeof heroPairings.sauceUpgradeFor === 'function' ? heroPairings.sauceUpgradeFor(dish.name, dish.tags || {}) : null;
    if (sauce) {
      return `Ask for the ${sauce.sauce} on the side — ${sauce.note}.`;
    }
    return '';
  }

  function narrativeExtras(target, source) {
    const dish = foodSideOf(target, source);
    if (!dish || !heroPairings || !heroPairings.ready) return '';
    const note = typeof heroPairings.dishNoteFor === 'function' ? heroPairings.dishNoteFor(dish.name, dish.tags || {}) : null;
    const parts = [];
    if (note && note.story) parts.push(note.story);
    const nudge = upgradeNudge(dish);
    if (nudge) parts.push(nudge);
    return parts.join(' ');
  }

  // Recommendation Brain V2 — a dessert suggestion that references BOTH what's
  // already on the table (the main dish AND the wine), not just one anchor.
  // Uses the item's own metadata.tags (richness/sweetness — already enriched by
  // scripts/enrich-menu-tags.js) to decide the light-vs-indulgent framing, so
  // this works for any dessert, not just ones with authored hero copy.
  function dessertNarrative(target, source, cartWine) {
    if ((target.categoryType || '').toUpperCase() !== 'DESSERT' || !source || !cartWine) return null;
    const richness = Number(target.tags?.richness);
    const isLight = Number.isFinite(richness) ? richness <= 1 : /lemon|sorbet|fruit|berry/i.test(target.name || '');
    const closing = isLight
      ? `${target.name} keeps things light rather than heavy after the ${source.name.toLowerCase()}.`
      : `${target.name} is a properly rich way to close out the ${source.name.toLowerCase()} and ${cartWine.name.toLowerCase()}.`;
    return `You've chosen ${source.name} and a ${cartWine.name} — ${closing}`;
  }

  // The per-item reason shown on cards / chat / waiter for `target`, optionally
  // paired to an anchor dish `source`. tone: 'short' | 'professional' | 'luxury' | …
  async function pairingReason(target = {}, source = null, { tone = 'casual', cartWine = null } = {}) {
    // Dessert + full table context (dish + wine) — checked first since it's the
    // most specific, most narrative-rich case when both anchors are available.
    const dessertLine = dessertNarrative(target, source, cartWine);
    if (dessertLine) return dessertLine;

    // Tier 1a — AUTHORED HERO: the curated dish × varietal line (renders for any
    // bottle of that varietal). One source for cards, chat and the waiter.
    if (heroPairings && heroPairings.ready && source) {
      const hero = heroPairings.reasonFor(source, target);
      if (hero) {
        const extras = narrativeExtras(target, source);
        return extras ? `${hero} ${extras}` : hero;
      }
    }
    // Tier 1b — chef per-pair authored reason wins verbatim.
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
