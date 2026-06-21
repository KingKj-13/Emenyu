'use strict';
// Waiter-only "ordered together" — market-basket / co-occurrence over real order
// history. NEVER customer-facing. Returns counted social proof ("9 tables also
// ordered this") plus a short flavour "why" derived from the Phase-2 tags.
// Deterministic, fully local.

const { normalizeName } = require('../utils/helpers');

const FLAVOUR_LABEL = {
  smoky: 'smoke', charred: 'char', garlicky: 'garlic', herby: 'herbs', creamy: 'cream',
  citrus: 'citrus', umami: 'savoury depth', peppery: 'pepper', cheesy: 'cheese',
  chocolate: 'chocolate', fruity: 'fruit', briny: 'sea-salt brine', fresh: 'freshness', nutty: 'nuttiness'
};

// A short, tag-derived reason a candidate belongs next to the anchor(s).
function whyFromTags(anchorItems, candidate) {
  const cTags = candidate.tags || {};
  const cFlav = Array.isArray(cTags.flavour) ? cTags.flavour : [];

  for (const anchor of anchorItems) {
    const aFlav = (anchor.tags && Array.isArray(anchor.tags.flavour)) ? anchor.tags.flavour : [];
    const shared = cFlav.find(f => aFlav.includes(f));
    if (shared) return `echoes the ${FLAVOUR_LABEL[shared] || shared} on the ${anchor.name}`;
  }
  if (cTags.kind === 'DRINK') return `the ${cTags.drinkType || 'drink'} most tables pour alongside`;
  if (cTags.course === 'DESSERT') return 'the sweet finish guests keep adding';
  if (cTags.course === 'SIDE') return 'the side that rounds out the plate';
  if (cFlav.length) return `brings ${FLAVOUR_LABEL[cFlav[0]] || cFlav[0]} to the table`;
  return 'a frequent companion on the bill';
}

// cart: [{name,...}]; orderRecords: [{items:[{name,..}],...}]; menuContext from aiService.
function computeOrderedTogether(cart, orderRecords, menuContext, { limit = 4, minCount = 2 } = {}) {
  const byName = (menuContext && menuContext.byName) || new Map();
  const cartNames = new Set((cart || []).map(c => normalizeName(c.name)).filter(Boolean));
  const anchorItems = (cart || []).map(c => byName.get(normalizeName(c.name))).filter(Boolean);
  if (cartNames.size === 0) return [];

  // Distinct orders (a proxy for tables) containing an anchor AND the candidate.
  const counts = new Map();
  for (const order of (orderRecords || [])) {
    const names = (order.items || []).map(i => normalizeName(i.name));
    if (!names.some(n => cartNames.has(n))) continue;
    const seen = new Set();
    for (const n of names) {
      if (cartNames.has(n) || seen.has(n)) continue;
      seen.add(n);
      counts.set(n, (counts.get(n) || 0) + 1);
    }
  }

  // Fall back to minCount=1 when the history is too thin to clear the threshold.
  const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const threshold = entries.some(([, c]) => c >= minCount) ? minCount : 1;

  return entries
    .filter(([, count]) => count >= threshold)
    .slice(0, limit)
    .map(([key, count]) => {
      const item = byName.get(key);
      if (!item) return null;
      return {
        name: item.name,
        price: Number(item.price) || 0,
        img: item.img || '',
        categoryType: item.categoryType || 'MAIN',
        count,
        countLabel: `${count} ${count === 1 ? 'table' : 'tables'} also ordered this`,
        why: whyFromTags(anchorItems, item),
        upsell: Math.round(Number(item.price) || 0)
      };
    })
    .filter(Boolean);
}

module.exports = { computeOrderedTogether, whyFromTags };
