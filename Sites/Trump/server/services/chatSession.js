'use strict';
// Per-turn chat context (Phase 3B). Fully local, no persistence: each turn we
// re-derive a lightweight "anchor" from the conversation so follow-ups resolve —
// "a wine for it" knows the dish, "seafood instead" knows what it replaces, and
// the wine being swapped away from is remembered. Built from payload.history
// (already sent by the client) plus the live cart.

const { normalizeName } = require('../utils/helpers');

// Scan a blob of text for any menu item names (greedy, longest name first so
// "RIBEYE ON THE BONE" wins over "RIBEYE"). Returns matches in menu order.
function itemsInText(text, sortedItems) {
  const compact = normalizeName(text);
  if (!compact) return [];
  return sortedItems.filter(item => compact.includes(normalizeName(item.name)));
}

// Phase 3 (Dining Concierge): "never repeatedly recommend the same thing" needs
// memory of the WHOLE conversation, not just the immediately-preceding turn —
// a dish suggested three messages ago and never added should stay excluded too.
// Still fully stateless (derived from the history the client already sends),
// still the same underlying signal (suggested, then never added to cart).
function allIgnoredNames(history, sorted, cartNames) {
  const list = Array.isArray(history) ? history : [];
  const ignored = new Set();
  list.forEach((msg, idx) => {
    if (msg && msg.role === 'assistant' && typeof msg.content === 'string' && idx < list.length - 1) {
      itemsInText(msg.content, sorted).forEach(item => {
        if (!cartNames.has(normalizeName(item.name))) ignored.add(item.name);
      });
    }
  });
  return [...ignored];
}

// history: [{ role: 'user'|'assistant', content: string }] (oldest → newest).
function build(history = [], menuContext = {}, cart = []) {
  const items = (menuContext && Array.isArray(menuContext.items)) ? menuContext.items : [];
  const byName = (menuContext && menuContext.byName) || new Map();
  const sorted = [...items].sort((a, b) => String(b.name || '').length - String(a.name || '').length);

  // Mentions in conversation order (so "most recent" = end of the list).
  const mentioned = [];
  (Array.isArray(history) ? history : []).forEach(msg => {
    if (msg && typeof msg.content === 'string') {
      itemsInText(msg.content, sorted).forEach(item => mentioned.push(item));
    }
  });
  // Cart items are the strongest, most-current anchors.
  (Array.isArray(cart) ? cart : []).forEach(line => {
    const match = byName.get(normalizeName(line && line.name)) || null;
    if (match) mentioned.push(match);
  });

  const reversed = [...mentioned].reverse();
  const anchorDish = reversed.find(item => ['MAIN', 'STARTER', 'SUSHI', 'DESSERT'].includes(item.categoryType)) || null;
  const lastWine = reversed.find(item => item.categoryType === 'WINE') || null;
  const lastDrink = reversed.find(item => ['WINE', 'DRINK'].includes(item.categoryType)) || null;

  const cartNames = new Set((Array.isArray(cart) ? cart : []).map(line => normalizeName(line && line.name)));
  const ignoredNames = allIgnoredNames(history, sorted, cartNames);

  return {
    anchorDish,
    lastWine,
    lastDrink,
    lastCourse: mentioned.length ? mentioned[mentioned.length - 1].categoryType : null,
    mentioned: mentioned.map(item => item.name),
    ignoredNames,
  };
}

module.exports = { build };
