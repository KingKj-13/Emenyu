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

const { hashString } = require('../rotationService');

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
const RULES = [
  {
    id: 'red-full-rich-meat',
    match: (d, w) => w.drinkType === 'red' && w.body === 'full' && d.richness >= 2 && (d.protein || []).some(p => ['beef', 'lamb', 'game'].includes(p)),
    clauses: {
      professional: [
        'The richness in the {dish} holds up well against a fuller-bodied red — it softens the tannins and gives you a smoother finish.',
        'A full-bodied red like this is built for the char on the {dish}; the tannins settle down against the richness.'
      ],
      friendly: [
        'The marbling in the {dish} really works with a fuller-bodied red — you get a much smoother finish.',
        'Honestly the char on the {dish} is made for a red with this much backbone, it just softens everything out.'
      ],
      luxury: [
        'The wine\'s structure comes alive against the richness of the {dish} — the tannins soften and the finish lengthens.',
        'A red with this much depth was built for a cut like the {dish}; the marbling rounds off every tannin.'
      ]
    }
  },
  {
    id: 'red-full-rich-other',
    match: (d, w) => w.drinkType === 'red' && w.body === 'full' && d.richness >= 2,
    clauses: {
      professional: ['The richness of the {dish} holds up well against a fuller-bodied red — it softens the tannins nicely.'],
      friendly: ['That creamy, rich sauce on the {dish} can really take a red with this much weight — it softens everything out.'],
      luxury: ['A red with this much depth stands up comfortably to the richness of the {dish}.']
    }
  },
  {
    id: 'red-medium',
    match: (d, w) => w.drinkType === 'red' && w.body === 'medium' && d.richness >= 1,
    clauses: {
      professional: ['A medium-bodied red won\'t fight with the {dish} — it just rounds the plate out nicely.'],
      friendly: ['This one\'s not too heavy, so it just rounds out the {dish} without taking over.'],
      luxury: ['A softer-structured red like this lets the {dish} lead, rather than competing with it.']
    }
  },
  {
    id: 'white-seafood',
    match: (d, w) => w.drinkType === 'white' && (d.protein || []).includes('seafood'),
    clauses: {
      professional: ['The acidity in the wine lifts the seafood rather than masking it — a classic pairing.'],
      friendly: ['That crisp acidity just lifts the {dish} right up, it\'s a classic match for a reason.'],
      luxury: ['The wine\'s acidity is a natural foil for seafood — it lifts the dish instead of sitting on top of it.']
    }
  },
  {
    id: 'white-light',
    match: (d, w) => w.drinkType === 'white' && w.body === 'light' && d.richness <= 1,
    clauses: {
      professional: ['A lighter white keeps the plate feeling fresh rather than weighed down.'],
      friendly: ['Keeps things light, the wine won\'t bulldoze the {dish} at all.'],
      luxury: ['A lighter-bodied white lets the more delicate notes in the {dish} come through.']
    }
  },
  {
    id: 'sparkling',
    match: (d, w) => w.drinkType === 'sparkling',
    clauses: {
      professional: ['The bubbles cut through the richness and keep every bite feeling fresh.'],
      friendly: ['Bubbles always cut through a plate like this, it keeps things feeling fresh — and it\'s got a nice celebratory lift too.'],
      luxury: ['The bead in the wine cuts cleanly through the dish and lifts the whole course.']
    }
  },
  {
    id: 'rose',
    match: (d, w) => w.drinkType === 'rose',
    clauses: {
      professional: ['It has enough body for the dish but stays light enough not to weigh the table down.'],
      friendly: ['It\'s got just enough weight for the {dish} without feeling heavy.'],
      luxury: ['There\'s enough structure here for the dish, without ever feeling heavy-handed.']
    }
  },
  {
    id: 'beer-spice',
    match: (d, w) => w.drinkType === 'beer' && d.spice >= 1,
    clauses: {
      professional: ['A cold beer is the most reliable way to cool the heat in this dish.'],
      friendly: ['Honestly a cold beer is the best way to cool that heat down, works every time.'],
      luxury: ['A well-chilled beer tempers the spice cleanly, without dulling the flavour.']
    }
  },
  {
    id: 'beer-general',
    match: (d, w) => w.drinkType === 'beer',
    clauses: {
      professional: ['Nothing complicated about it — a cold beer just works with food like this.'],
      friendly: ['No overthinking needed, a cold one just goes with food like this.'],
      luxury: ['A simple, well-chilled beer suits this kind of straightforward, hearty food.']
    }
  },
  {
    id: 'cocktail-citrus',
    match: (d, w) => w.drinkType === 'cocktail' && (w.flavour || []).includes('citrus'),
    clauses: {
      professional: ['The citrus in the cocktail cuts cleanly through the richness of the dish.'],
      friendly: ['The citrus in that cocktail cuts right through the richness, keeps every bite feeling lighter.'],
      luxury: ['The citrus lift in the cocktail plays nicely against the richness on the plate.']
    }
  },
  {
    id: 'cocktail-general',
    match: (d, w) => w.drinkType === 'cocktail',
    clauses: {
      professional: ['It has enough character to stand up to the dish without getting lost.'],
      friendly: ['It\'s got enough going on that it won\'t get lost next to the {dish}.'],
      luxury: ['There\'s enough going on in the glass that it holds its own alongside the dish.']
    }
  },
  {
    id: 'chicken-light-drink',
    match: (d, w) => (d.protein || []).includes('chicken') && (w.body === 'light' || w.drinkType === 'white'),
    clauses: {
      professional: ['Chicken is forgiving, but a lighter pour keeps the whole plate feeling balanced.'],
      friendly: ['Chicken goes with almost anything, but keeping it light like this keeps the whole plate balanced.'],
      luxury: ['A lighter pour lets the more delicate cooking on the chicken still come through.']
    }
  },
  {
    id: 'crispy-carbonation',
    match: (d, w) => (d.texture || []).includes('crispy') && ['sparkling', 'beer'].includes(w.drinkType),
    clauses: {
      professional: ['The carbonation cuts through the crunch and keeps the dish from feeling heavy.'],
      friendly: ['The bubbles cut right through the crunch, keeps it feeling light instead of heavy.'],
      luxury: ['The carbonation plays well off the texture — it keeps the dish feeling lighter than it looks.']
    }
  },
  {
    id: 'spirit-dessert',
    match: (d, w) => w.drinkType === 'spirit' && d.course === 'DESSERT',
    clauses: {
      professional: ['A spirit like this is a natural way to close the meal after dessert.'],
      friendly: ['A neat pour like that is honestly the perfect way to finish once the dessert\'s done.'],
      luxury: ['A spirit of this weight is the natural way to close the evening once the dessert is finished.']
    }
  },
  {
    id: 'spirit-rich',
    match: (d, w) => w.drinkType === 'spirit' && d.richness >= 2,
    clauses: {
      professional: ['It has the weight to stand up to a rich dish like this rather than getting lost.'],
      friendly: ['It\'s got enough weight that it won\'t get lost next to something this rich.'],
      luxury: ['It carries enough depth to stand alongside a dish this rich, rather than fading beside it.']
    }
  },
  {
    id: 'spirit-general',
    match: (d, w) => w.drinkType === 'spirit',
    clauses: {
      professional: ['A pour like this works well on the side, no need to overthink it.'],
      friendly: ['Nothing complicated here, it just goes well alongside.'],
      luxury: ['A considered pour that sits comfortably alongside the dish, without competing for attention.']
    }
  },
  {
    id: 'cider',
    match: (d, w) => w.drinkType === 'cider',
    clauses: {
      professional: ['The sweetness in the cider cools things down nicely against the dish.'],
      friendly: ['It\'s got a bit of sweetness that cools everything down nicely with the {dish}.'],
      luxury: ['A touch of sweetness in the cider tempers the dish rather than competing with it.']
    }
  },
  {
    id: 'mocktail-soft',
    match: (d, w) => ['mocktail', 'soft'].includes(w.drinkType),
    clauses: {
      professional: ['It\'s refreshing enough to reset the palate between bites.'],
      friendly: ['It\'s nice and refreshing, keeps things feeling light between bites of the {dish}.'],
      luxury: ['Something this refreshing keeps the palate clear between courses.']
    }
  },
  {
    id: 'hot-dessert',
    match: (d, w) => w.drinkType === 'hot' && d.course === 'DESSERT',
    clauses: {
      professional: ['A hot drink alongside dessert is the classic way to finish the meal.'],
      friendly: ['A coffee with dessert is the classic move, always works.'],
      luxury: ['A hot pour alongside dessert is the traditional, and still the best, way to close the meal.']
    }
  },
  {
    id: 'hot-general',
    match: (d, w) => w.drinkType === 'hot',
    clauses: {
      professional: ['A hot drink rounds off the meal well once the plate is cleared.'],
      friendly: ['Good one to have once the plate\'s cleared, rounds things off nicely.'],
      luxury: ['A fitting way to round off the meal once the table is cleared.']
    }
  },
  // Always-true catch-all — every menu item has SOME tags, so this fires only
  // when a bottle/dish's specific attributes didn't match a sharper rule above
  // (e.g. an estate name with no varietal signal in the name). Keeps every
  // food+drink pair inside the composed narrative shape rather than dropping
  // to the old single-clause "confident pour" line.
  {
    id: 'generic-drink-dish',
    match: () => true,
    clauses: {
      professional: ['It\'s a comfortable match for the {dish} — neither one fights the other.'],
      friendly: ['It\'s a solid, easy match for the {dish}, you really can\'t go wrong with it.'],
      luxury: ['It sits comfortably alongside the {dish}, a considered rather than a showy match.']
    }
  }
];

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
