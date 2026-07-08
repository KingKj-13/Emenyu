'use strict';
// Phase 2.5 (Hospitality Intelligence) — a reusable, TAG-DRIVEN rules engine
// for the "why" behind a pairing. This is what lets templateNlgProvider talk
// about all 439 menu items like an experienced waiter, not just the ~110 hero
// dishes authored in trump_hero_pairings.json.
//
// Nothing here is hand-written per dish. Every function reads the metadata.tags
// every item already has (scripts/enrich-menu-tags.js: protein, richness, body,
// drinkType, texture, spice, course, flavour, occasion...) and returns natural
// language. A brand-new menu item needs nothing more than tags to get a full
// narrative — that's the whole point of this file existing separately from the
// hand-authored hero copy.
//
// Style guide (per product decision): sound like a real waiter, not an AI.
// Short, concrete, sensory. Contractions are fine. Never say "exquisite",
// "indulgent", "symphony", "journey" or "luxurious experience" — those are
// marketing words, not things a person says out loud.

const fs = require('fs');
const path = require('path');
const { hashString } = require('../rotationService');

// Phase 4 (Recommendation Engine V2) — the RULES array below has been
// externalized to structured JSON per the EMenu v3 spec (knowledge/
// wine_pairings.json, beer_pairings.json, cocktail_pairings.json,
// spirit_pairings.json, coffee_pairings.json, dessert_pairings.json). This
// module now loads and merges those files at require-time rather than
// hardcoding the rule list, while keeping the EXACT same match semantics and
// rule ORDER as the original 21-entry array (order matters: more specific
// rules must still be checked first). The one entry that was always a code-
// level safety net rather than domain knowledge — the always-true catch-all —
// stays a literal fallback here rather than living in a knowledge file.
const KNOWLEDGE_DIR = path.join(__dirname, '..', '..', '..', 'knowledge');
const PAIRING_FILES = ['wine_pairings.json', 'beer_pairings.json', 'cocktail_pairings.json', 'spirit_pairings.json', 'coffee_pairings.json', 'dessert_pairings.json'];
// Canonical application order, preserved from the original hardcoded RULES
// array (see git history) — most-specific rules first, generic catch-all last.
const RULE_ORDER = [
  'red-full-rich-meat', 'red-full-rich-other', 'red-medium', 'white-seafood', 'white-light',
  'sparkling', 'rose', 'beer-spice', 'beer-general', 'cocktail-citrus', 'cocktail-general',
  'chicken-light-drink', 'crispy-carbonation', 'spirit-dessert', 'spirit-rich', 'spirit-general',
  'cider', 'mocktail-soft', 'hot-dessert', 'hot-general'
];
const GENERIC_CATCH_ALL = {
  id: 'generic-drink-dish',
  clauses: {
    professional: ["It's a comfortable match for the {dish} — neither one fights the other."],
    friendly: ["It's a solid, easy match for the {dish}, you really can't go wrong with it."],
    luxury: ['It sits comfortably alongside the {dish}, a considered rather than a showy match.']
  }
};

function matchesConditions(d = {}, w = {}, cond = {}) {
  for (const [key, value] of Object.entries(cond)) {
    switch (key) {
      case 'drinkType': if (w.drinkType !== value) return false; break;
      case 'drinkType_any_of': if (!value.includes(w.drinkType)) return false; break;
      case 'body': if (w.body !== value) return false; break;
      case 'richness_gte': if (!(Number(d.richness) >= value)) return false; break;
      case 'richness_lte': if (!(Number(d.richness) <= value)) return false; break;
      case 'protein_any_of': if (!(Array.isArray(d.protein) && d.protein.some(p => value.includes(p)))) return false; break;
      case 'protein_includes': if (!(Array.isArray(d.protein) && d.protein.includes(value))) return false; break;
      case 'spice_gte': if (!(Number(d.spice) >= value)) return false; break;
      case 'texture_includes': if (!(Array.isArray(d.texture) && d.texture.includes(value))) return false; break;
      case 'flavour_includes': if (!(Array.isArray(w.flavour) && w.flavour.includes(value))) return false; break;
      case 'course': if (d.course !== value) return false; break;
      case 'any_of': if (!value.some(sub => matchesConditions(d, w, sub))) return false; break;
      default: break; // unrecognised/candidate-generation-only keys (e.g. dish_name_or_searchText_matches) are ignored here
    }
  }
  return true;
}

function loadRules() {
  const byId = new Map();
  for (const file of PAIRING_FILES) {
    try {
      const doc = JSON.parse(fs.readFileSync(path.join(KNOWLEDGE_DIR, file), 'utf-8'));
      (doc.entries || [])
        .filter(e => typeof e.source === 'string' && e.source.startsWith('hospitalityKnowledge.js RULES') && e.conditions && e.phrases)
        .forEach(e => { if (!byId.has(e.id)) byId.set(e.id, e); });
    } catch (error) {
      // Missing/unreadable knowledge file: skip it. whyClauseFor() still
      // falls back to the generic catch-all, so this degrades gracefully.
    }
  }
  const ordered = RULE_ORDER.map(id => byId.get(id)).filter(Boolean);
  // Any rule present in the knowledge files but missing from RULE_ORDER
  // (should not happen in practice) is appended before the catch-all rather
  // than silently dropped.
  byId.forEach((entry, id) => { if (!RULE_ORDER.includes(id)) ordered.push(entry); });
  return [
    ...ordered.map(e => ({ id: e.id, match: (d, w) => matchesConditions(d, w, e.conditions), clauses: e.phrases })),
    { ...GENERIC_CATCH_ALL, match: () => true }
  ];
}

function pick(list, seedKey) {
  if (!list || !list.length) return '';
  if (list.length === 1) return list[0];
  return list[hashString(seedKey) % list.length];
}

function lc(v) { return String(v || '').toLowerCase(); }
const isBevCat = it => ['WINE', 'DRINK'].includes(lc(it && it.categoryType).toUpperCase());

// ── Cooking method (derived, never stored) ──────────────────────────────────
// A short, concrete phrase for how the dish is actually prepared, inferred from
// tags already on the item. Returns '' when nothing confident can be said.
// Condiments/enhancements (sauce/butter/dressing add-ons) inherit their root
// category's course/protein tags (e.g. a steak-enhancement butter reads as
// course=MAIN, protein=beef) but aren't cooked themselves -- never given a
// cooking-method line.
const CONDIMENT_RE = /\b(sauce|butter|dressing|dip|chutney|relish|glaze)\b/;
function cookingMethodFor(item = {}) {
  const tags = item.tags || {};
  const nameL = lc(item.name);
  if (CONDIMENT_RE.test(nameL)) return '';
  const course = tags.course;
  const protein = tags.protein || [];
  const texture = tags.texture || [];
  const flavour = tags.flavour || [];

  if (course === 'SUSHI' || /sashimi|sushi/.test(nameL)) return 'sliced fresh to order';
  if (protein.includes('seafood') && texture.includes('flaky')) return 'pan-seared so it stays flaky';
  if (protein.includes('seafood')) return 'kept simple so the flavour stays clean';
  if ((protein.includes('beef') || protein.includes('lamb') || protein.includes('game')) && flavour.includes('charred')) return 'char-grilled over the coals';
  if (protein.includes('beef') || protein.includes('lamb') || protein.includes('game')) return 'grilled to order';
  if (protein.includes('chicken') && flavour.includes('smoky')) return 'flame-grilled';
  if (protein.includes('chicken')) return 'grilled till the skin crisps up';
  if (protein.includes('pork') && /rib/.test(nameL)) return 'slow-roasted till it falls off the bone';
  if (texture.includes('crispy')) return 'fried till properly crisp';
  if (course === 'SALAD') return 'tossed fresh';
  if (course === 'DESSERT' && tags.temperature === 'cold') return 'served well chilled';
  if (course === 'DESSERT') return 'baked in-house';
  return '';
}

// ── Signature status (derived) ──────────────────────────────────────────────
function signatureFor(item = {}) {
  const nameL = lc(item.name);
  const tags = item.tags || {};
  if (CONDIMENT_RE.test(nameL)) return false;
  if (/wagyu|tomahawk|signature|trumps |the king|kings platter/.test(nameL)) return true;
  return tags.richness === 3 && tags.course === 'MAIN';
}

// ── Split a (target, source) pair into { dish, drink } if it's a food+drink
// pair, regardless of which one the caller passed first. Returns null for
// food+food or drink+drink pairs (those get foodPairClauseFor instead).
function splitDishDrink(a, b) {
  if (!a || !b) return null;
  const aBev = isBevCat(a);
  const bBev = isBevCat(b);
  if (aBev === bBev) return null;
  return aBev ? { dish: b, drink: a } : { dish: a, drink: b };
}

// ── Dish x Drink WHY clause ──────────────────────────────────────────────────
// Each rule matches on tags already present on the dish/drink; each has 2
// phrasing variants (rotated deterministically per dish+drink name, so the
// same pairing always reads the same way, but different pairings don't all
// sound identical) and a register per tone. Order matters — more specific
// rules are checked first.
// Loaded from knowledge/{wine,beer,cocktail,spirit,coffee,dessert}_pairings.json
// (see loadRules() above) — same 21-entry rule set, same order, same match
// semantics as the original hardcoded array; only the storage moved.
const RULES = loadRules();


function whyClauseFor({ dish, drink, tone = 'friendly' }) {
  if (!dish || !drink) return '';
  const d = dish.tags || {};
  const w = drink.tags || {};
  const rule = RULES.find(r => r.match(d, w));
  if (!rule) return '';
  const set = rule.clauses[tone] || rule.clauses.friendly;
  const line = pick(set, `${dish.name}|${drink.name}|${rule.id}`);
  return line.replace(/\{dish\}/g, lc(dish.name));
}

// ── Food + food WHY clause (starter/side/salad/dessert with no wine anchor) ──
function foodPairClauseFor({ target, source, tone = 'friendly' }) {
  if (!target) return '';
  const tt = target.tags || {};
  const sourceName = source && source.name ? lc(source.name) : 'your main';
  const course = tt.course;
  if (course === 'STARTER') {
    return tone === 'luxury'
      ? 'A good way to open the table before the mains arrive.'
      : 'A nice way to open the table while the rest of the order is cooking.';
  }
  if (course === 'SIDE') return `Goes naturally alongside the ${sourceName}.`;
  if (course === 'SALAD') return `Adds something fresh next to the ${sourceName}.`;
  if (course === 'DESSERT') {
    const rich = Number(tt.richness);
    return Number.isFinite(rich) && rich <= 1
      ? `Keeps things light rather than heavy after the ${sourceName}.`
      : `A properly sweet way to close things out after the ${sourceName}.`;
  }
  return `A popular add-on alongside the ${sourceName}.`;
}

// ── Conversation tips (derived) ─────────────────────────────────────────────
// A short, true, tag-gated aside a waiter might casually drop when talking
// about a dish -- never a fabricated fact about a SPECIFIC item, only what
// its own tags already say. Covers every item with tags (all 439), not a
// hand-authored list.
function conversationTipFor(item = {}) {
  const tags = item.tags || {};
  if (tags.spice >= 3) return "Fair warning, it's the spiciest thing on the menu.";
  if ((tags.occasion || []).includes('sharing')) return "It's a popular one for the table to share.";
  if (signatureFor(item)) return "It's one of our signature dishes.";
  if (tags.richness === 3 && tags.course === 'MAIN') return "It's on the richer side, built for a proper appetite.";
  if (tags.course === 'DESSERT' && tags.sweetness === 3) return "Guests usually split this one, it's properly sweet.";
  if (tags.drinkType === 'sparkling') return "Good one if the table's celebrating anything tonight.";
  if ((tags.dietary || []).includes('vegan')) return "Fully plant-based, if that matters to the table.";
  return '';
}

module.exports = { cookingMethodFor, signatureFor, splitDishDrink, whyClauseFor, foodPairClauseFor, conversationTipFor };
