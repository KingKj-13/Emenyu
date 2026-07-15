// Single authoritative category + beverage classifier (Phase 3, Task 3).
//
// This is the ONE place categories are decided. The server stamps `categoryType`
// and `beverageKind` onto every menu item it serves, so the client no longer needs
// to re-classify (it consumes these fields). `helpers.getCategoryType` delegates
// here, so there is a single implementation across the whole codebase.
//
// categoryType: STARTER | MAIN | DESSERT | WINE | DRINK
// beverageKind: WINE | COCKTAIL | BEER | HOT | SOFT | NONE   (meaningful for WINE/DRINK)

'use strict';

const CATEGORY_TYPES = ['STARTER', 'MAIN', 'DESSERT', 'WINE', 'DRINK'];
const BEVERAGE_KINDS = ['WINE', 'COCKTAIL', 'BEER', 'HOT', 'SOFT', 'NONE'];

function lc(value) {
  return String(value == null ? '' : value).toLowerCase();
}

// Build the text used for classification from a string or a menu-item-like object.
function classificationText(input) {
  if (input && typeof input === 'object') {
    return [input.name, input.category, input.subcategory, input.types]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
  }
  return lc(input);
}

// ── categoryType ──────────────────────────────────────────────────────────────
// Order matters: STARTER → DESSERT → food guard (MAIN) → WINE → DRINK → MAIN.
// The food guard runs before wine/drink so "steak" (contains "tea") and "veg"
// are never misread as beverages. Kept identical to the historical getCategoryType
// regex so classification is backward-compatible.
function categoryType(input) {
  const text = classificationText(input);

  if (/\b(starter|meze|tapas|soup|antipasti)/.test(text)) return 'STARTER';
  if (/\b(dessert|sweet|cake|ice ?cream|baklava|pudding|brownie|gelato)/.test(text)) return 'DESSERT';

  // Wine is checked before the food guard below so a wine SECTION (its
  // category/subcategory contains an unambiguous varietal/style word like
  // "champagne" or "wine") always wins over an incidental food-keyword
  // collision in the item's own name — e.g. "Billecart-Salmon Brut Rosé" (a
  // champagne) would otherwise be misread as a MAIN via "salmon". A generic
  // "cellar" is deliberately NOT a wine signal here (removed 2026-07-12): a
  // chapter merely named "The ... Cellar" also holds beer/spirits, and
  // "cellar" alone doesn't distinguish wine from anything else stored there
  // — see beverageKind()'s matching change below for the bug this caused
  // (every beer/spirit in such a chapter reading as WINE).
  if (/\b(wine|sparkling|champagne|sauvignon|chardonnay|merlot|shiraz|pinotage|cabernet|chenin|blend|rosé|rose wine|bubbly)/.test(text)) {
    return 'WINE';
  }

  // "side" (as in a side dish) must not match "Side Car" — a named cocktail,
  // not food. Same false-positive family as the "steak"/"tea" guard above.
  if (/\b(steak|burger|beef|lamb|pork|chicken|rib|grill|wagyu|fillet|sirloin|rump|tomahawk|schnitzel|seafood|prawn|calamari|squid|mussel|kingklip|hake|salmon|sole|fish|sushi|sashimi|pasta|wrap|platter|side(?!\s*car)|wings|biltong|chop|veg|salad|curry|main)/.test(text)) {
    return 'MAIN';
  }

  // "liquor" alongside "liqueur" — a section literally titled "Liquor" (as
  // opposed to "Liqueurs") previously matched neither spelling and fell all
  // the way through to the MAIN default below.
  if (/\b(drink|beverage|beer|lager|cider|coffee|cappuccino|latte|espresso|tea|cocktail|mocktail|spirit|liqueur|liquor|whisky|whiskey|\bgin\b|vodka|\brum\b|tequila|sake|brandy|cognac|soda|juice|water|smoothie|shake)/.test(text)) {
    return 'DRINK';
  }

  // Named cocktails/spirits and other beverages the keyword lists above miss by
  // name (e.g. "Margarita", "Negroni", "Old Fashioned", "Sangria"): defer to the
  // beverageKind lexicon so categoryType and beverageKind can never disagree.
  const kind = beverageKind(text);
  if (kind !== 'NONE') return kind === 'WINE' ? 'WINE' : 'DRINK';

  return 'MAIN';
}

// ── beverageKind ──────────────────────────────────────────────────────────────
// Used by the category-safety layer to enforce "one primary beverage" and "no
// wine+cocktail together". Returns NONE for food.
function beverageKind(input) {
  const text = classificationText(input);

  // Water is always a soft beverage, even when labelled "sparkling".
  if (/\bwater\b/.test(text)) return 'SOFT';
  // Trailing `s?` lets plural category names ("Beers", "Wines", "Juices") match
  // the singular keyword. Safe: `port` still won't match `porter` (needs a boundary
  // or an `s` immediately after `port`).
  if (/\b(cocktail|mocktail|margarita|martini|negroni|mojito|cosmopolitan|old fashioned|whiskey sour|whisky sour|aperol|spritz|long island|daiquiri|pina colada|caipirinha|mai tai|sour)s?\b/.test(text)) {
    return 'COCKTAIL';
  }
  // "cellar" removed (2026-07-12) — a chapter merely named "The ... Cellar"
  // also holds beer/spirits, and the word alone doesn't distinguish wine
  // from anything else stored there. See categoryType()'s matching note.
  if (/\b(wine|champagne|sparkling|mcc|cap classique|sauvignon|chardonnay|merlot|shiraz|syrah|pinotage|pinot|cabernet|chenin|blend|ros[eé]|bubbly|port|sherry|sangria)s?\b/.test(text)) {
    return 'WINE';
  }
  if (/\b(beer|lager|cider|draught|draft|ale|stout|pilsner|ipa)s?\b/.test(text)) return 'BEER';
  if (/\b(coffee|cappuccino|latte|espresso|macchiato|americano|mocha|flat white|tea|rooibos|hot chocolate)s?\b/.test(text)) {
    return 'HOT';
  }
  if (/\b(juice|soda|cola|lemonade|tonic|smoothie|shake|cordial|energy|red bull|iced tea|soft|fizz|sprite|coke|fanta|ginger ale)s?\b/.test(text)) {
    return 'SOFT';
  }

  // Generic spirits / liqueurs without a clearer kind read as a cocktail-tier
  // drink. "liquor" alongside "liqueur" — see categoryType()'s DRINK check.
  if (/\b(whisky|whiskey|vodka|\bgin\b|\brum\b|brandy|cognac|tequila|liqueur|liquor|spirit)s?\b/.test(text)) return 'COCKTAIL';

  return 'NONE';
}

// Convenience: classify an item once.
function classify(input) {
  const type = categoryType(input);
  const isBeverage = type === 'WINE' || type === 'DRINK';
  return {
    categoryType: type,
    beverageKind: isBeverage ? (type === 'WINE' ? 'WINE' : beverageKind(input)) : 'NONE',
    isBeverage,
    isDessert: type === 'DESSERT'
  };
}

function isBeverageType(type) {
  return type === 'WINE' || type === 'DRINK';
}

module.exports = {
  CATEGORY_TYPES,
  BEVERAGE_KINDS,
  categoryType,
  beverageKind,
  classify,
  isBeverageType,
  classificationText
};
