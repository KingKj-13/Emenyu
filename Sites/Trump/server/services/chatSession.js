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

// Phase 1 (Recommendation Brain): "one suggestion at a time, wait if ignored".
// Derived the same stateless way as everything else here — no new persistence,
// just reading the assistant's OWN last turn from the history the client already
// sends. If the assistant's last reply named suggestions and the guest's newest
// message didn't add any of them to the cart or ask for more, those names are
// "recently ignored" and recommend() should avoid leading with them again.
function lastAssistantSuggestions(history, sorted) {
  const list = Array.isArray(history) ? history : [];
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const msg = list[i];
    if (msg && msg.role === 'assistant' && typeof msg.content === 'string') {
      return itemsInText(msg.content, sorted).map(item => item.name);
    }
  }
  return [];
}

function hasNewerUserMessageSince(history) {
  const list = Array.isArray(history) ? history : [];
  for (let i = list.length - 1; i >= 0; i -= 1) {
    if (list[i] && list[i].role === 'assistant') return i < list.length - 1;
  }
  return false;
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
  const suggestedNames = lastAssistantSuggestions(history, sorted);
  const ignoredNames = hasNewerUserMessageSince(history)
    ? suggestedNames.filter(name => !cartNames.has(normalizeName(name)))
    : [];

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
