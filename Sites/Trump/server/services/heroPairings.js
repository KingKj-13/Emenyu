'use strict';
// Tier-1 AUTHORED "hero" pairings (Phase 3C / Commit A). Loads the curated
// dish × varietal sommelier lines (trump_hero_pairings.json) and exposes the
// lookups the engine and reasonComposer need. Fully local, no AI.
//
// Drinks are authored at the VARIETAL/CATEGORY level (Cabernet Sauvignon, Castle
// Lager, Cap Classique). The engine expands a varietal to the in-stock bottles of
// that varietal and rotationService rotates them; the one authored reason renders
// for any bottle of that varietal.

const fs = require('fs');
const path = require('path');

const STOP = new Set(['and', 'the', 'by', 'with', 'of', 'a', 'on', 'to']);
const lc = v => String(v == null ? '' : v).toLowerCase();
const toks = name => lc(name).replace(/['']/g, '').replace(/-/g, '').replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
const dishToks = dish => toks(dish).filter(t => !STOP.has(t));

// Beef/game/lamb/pork hero dishes only apply to a matching-protein menu item, so
// "Fillet" (beef) never lands on a KINGKLIP FILLET (seafood).
const CATEGORY_PROTEIN = { 'Premium Steak': 'beef', Wagyu: 'beef', 'Oxtail & Beef Ribs': 'beef', 'Venison & Game': 'game', Lamb: 'lamb', 'Pork & Ribs': 'pork' };

// Canonical varietal/drink key from any title/name. Order matters: "cabernet"
// is tested before "sauvignon" so "Cabernet Sauvignon" never reads as a white.
function varietalKey(s) {
  s = lc(s);
  if (/cabernet/.test(s)) return 'cabernet';
  if (/sauvignon\s*blanc|sauv\s*blanc/.test(s)) return 'sauvignon-blanc';
  if (/shiraz|syrah/.test(s)) return 'shiraz';
  if (/pinotage/.test(s)) return 'pinotage';
  if (/merlot/.test(s)) return 'merlot';
  if (/pinot\s*noir/.test(s)) return 'pinot-noir';
  if (/malbec/.test(s)) return 'malbec';
  if (/red\s*blend|\bblend\b/.test(s)) return 'red-blend';
  if (/chenin/.test(s)) return 'chenin';
  if (/chardonnay/.test(s)) return 'chardonnay';
  if (/cap\s*classique|\bmcc\b|prosecco/.test(s)) return 'cap-classique';
  if (/champagne/.test(s)) return 'champagne';
  if (/ros[eé]/.test(s)) return 'rose';
  if (/castle\s*lite/.test(s)) return 'castle-lite';
  if (/castle|lager|draught|draft|\bbeer\b/.test(s)) return 'lager';
  if (/savanna|cider/.test(s)) return 'cider';
  if (/\bport\b/.test(s)) return 'port';
  if (/amarula/.test(s)) return 'amarula';
  return null;
}

const isDrink = item => item && item.tags && item.tags.kind === 'DRINK';
const bottleVarietal = item => varietalKey(item.category) || varietalKey(item.subcategory) || varietalKey(item.name);

function createHeroPairings({ logger = null, file = path.join(__dirname, '..', '..', 'trump_hero_pairings.json') } = {}) {
  let data = null;
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch (error) {
    logger?.warn?.('hero_pairings_load_failed', { error: error.message });
  }

  const ready = Boolean(data && Array.isArray(data.pairings));
  const occasions = ready ? (data.occasions || []) : [];

  // Build the dish index: dish → { tokens, protein, varietals: [{key, drink, drinkType, tier, axis, reason}] }
  const dishIndex = [];
  const byDish = new Map();
  for (const p of (ready ? data.pairings : [])) {
    let entry = byDish.get(p.dish);
    if (!entry) {
      entry = { dish: p.dish, tokens: dishToks(p.dish), protein: CATEGORY_PROTEIN[p.category] || null, varietals: [] };
      byDish.set(p.dish, entry);
      dishIndex.push(entry);
    }
    entry.varietals.push({ key: varietalKey(p.drink), drink: p.drink, drinkType: p.drink_type, tier: p.tier, axis: p.axis, reason: p.reason });
  }
  dishIndex.sort((a, b) => b.tokens.length - a.tokens.length); // most specific first

  // The hero dish a menu item belongs to (protein-gated, most-specific token match).
  function dishFor(itemName, itemTags = {}) {
    const it = new Set(toks(itemName));
    const proteins = (itemTags && Array.isArray(itemTags.protein)) ? itemTags.protein : [];
    let best = null;
    let bestN = 0;
    for (const d of dishIndex) {
      if (d.protein && !proteins.includes(d.protein)) continue;
      if (d.tokens.length && d.tokens.every(t => it.has(t)) && d.tokens.length > bestN) {
        best = d;
        bestN = d.tokens.length;
      }
    }
    return best;
  }

  // Preferred varietal keys for a source dish (hero tier first, then strong).
  function preferredVarietals(itemName, itemTags) {
    const d = dishFor(itemName, itemTags);
    if (!d) return [];
    return [...d.varietals]
      .sort((a, b) => (a.tier === 'hero' ? 0 : 1) - (b.tier === 'hero' ? 0 : 1))
      .map(v => v.key)
      .filter(Boolean);
  }

  // The authored reason for a (dish × bottle varietal) pair, or null. Direction-
  // agnostic: works whether the dish is passed as sourceItem or targetItem (a
  // guest may add the wine first and ask what food goes with it, or add the
  // dish first and ask what wine goes with it — the authored line reads the
  // same either way, so both call directions should resolve it).
  function reasonFor(sourceItem, targetItem) {
    if (!ready || !sourceItem || !targetItem) return null;
    let d = dishFor(sourceItem.name, sourceItem.tags || {});
    let bottleItem = targetItem;
    if (!d) {
      // Try the other direction: targetItem is the dish, sourceItem is the bottle.
      d = dishFor(targetItem.name, targetItem.tags || {});
      bottleItem = sourceItem;
    }
    if (!d) return null;
    const tvk = bottleVarietal(bottleItem);
    if (!tvk) return null;
    const match = d.varietals.find(v => v.key === tvk);
    return match ? match.reason : null;
  }

  // In-stock bottles of a varietal, from a menu-context item list.
  function bottlesOfVarietal(items, vk) {
    return (items || []).filter(it => isDrink(it) && bottleVarietal(it) === vk && it.available !== false);
  }

  // Menu items matching an occasion "lead_with" dish name (token-subset).
  function itemsForDishName(items, dishName) {
    const dts = dishToks(dishName);
    if (!dts.length) return [];
    return (items || []).filter(it => { const s = new Set(toks(it.name)); return dts.every(t => s.has(t)); });
  }

  const OCC_SLOT_MATCH = { sharing: /football|sharing|watching/, celebration: /celebration/, date: /date/, quick: /quick/, group: /group|platter/ };
  function archetypeFor(slot) {
    if (!ready || !slot) return null;
    const re = OCC_SLOT_MATCH[slot];
    const occasion = occasions.find(x => re && re.test(lc(x.occasion)));
    if (!occasion) return null;
    return { leadWith: occasion.lead_with || [], drinkKeys: (occasion.drink || []).map(varietalKey).filter(Boolean), note: occasion.note || '' };
  }

  // Recommendation Brain V2 — dish-level narrative facts (cooking method, story)
  // and premium-upgrade/sauce-upgrade mappings, keyed by the same hero dish name
  // dishFor() resolves to. Additive to the existing wine/beer/cocktail pairing
  // data above; never fabricated — every {from,to}/{forDish,sauce} references a
  // real Trump menu item.
  const dishNotesByName = new Map((ready ? (data.dishNotes || []) : []).map(d => [d.dish, d]));
  const upgradesByName = new Map((ready ? (data.upgrades || []) : []).map(u => [u.from, u]));
  const sauceUpgradesByName = new Map((ready ? (data.sauceUpgrades || []) : []).map(s => [s.forDish, s]));

  function dishNoteFor(itemName, itemTags = {}) {
    const d = dishFor(itemName, itemTags);
    if (!d) return null;
    return dishNotesByName.get(d.dish) || null;
  }
  function upgradeFor(itemName, itemTags = {}) {
    const d = dishFor(itemName, itemTags);
    if (!d) return null;
    return upgradesByName.get(d.dish) || null;
  }
  function sauceUpgradeFor(itemName, itemTags = {}) {
    const d = dishFor(itemName, itemTags);
    if (!d) return null;
    return sauceUpgradesByName.get(d.dish) || null;
  }

  return {
    ready, dishFor, preferredVarietals, reasonFor, bottlesOfVarietal, itemsForDishName, archetypeFor, varietalKey: bottleVarietal, occasions,
    dishNoteFor, upgradeFor, sauceUpgradeFor
  };
}

module.exports = { createHeroPairings, varietalKey };
