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

  // "side" (as in a side dish) must not match "Side Car" — a named cocktail,
  // not food. Same false-positive family as the "steak"/"tea" guard above.
  if (/\b(steak|burger|beef|lamb|pork|chicken|rib|grill|wagyu|fillet|sirloin|rump|tomahawk|schnitzel|seafood|prawn|calamari|squid|mussel|kingklip|hake|salmon|sole|fish|sushi|sashimi|pasta|wrap|platter|side(?!\s*car)|wings|biltong|chop|veg|salad|curry|main)/.test(text)) {
    return 'MAIN';
  }

  if (/\b(wine|cellar|sparkling|champagne|sauvignon|chardonnay|merlot|shiraz|pinotage|cabernet|chenin|blend|rosé|rose wine|bubbly)/.test(text)) {
    return 'WINE';
  }

  if (/\b(drink|beverage|beer|lager|cider|coffee|cappuccino|latte|espresso|tea|cocktail|mocktail|spirit|liqueur|whisky|whiskey|\bgin\b|vodka|\brum\b|tequila|sake|brandy|cognac|soda|juice|water|smoothie|shake)/.test(text)) {
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
  if (/\b(wine|cellar|champagne|sparkling|mcc|cap classique|sauvignon|chardonnay|merlot|shiraz|syrah|pinotage|pinot|cabernet|chenin|blend|ros[eé]|bubbly|port|sherry|sangria)s?\b/.test(text)) {
    return 'WINE';
  }
  if (/\b(beer|lager|cider|draught|draft|ale|stout|pilsner|ipa)s?\b/.test(text)) return 'BEER';
  if (/\b(coffee|cappuccino|latte|espresso|macchiato|americano|mocha|flat white|tea|rooibos|hot chocolate)s?\b/.test(text)) {
    return 'HOT';
  }
  if (/\b(juice|soda|cola|lemonade|tonic|smoothie|shake|cordial|energy|red bull|iced tea|soft|fizz|sprite|coke|fanta|ginger ale)s?\b/.test(text)) {
    return 'SOFT';
  }

  // Generic spirits / liqueurs without a clearer kind read as a cocktail-tier drink.
  if (/\b(whisky|whiskey|vodka|\bgin\b|\brum\b|brandy|cognac|tequila|liqueur|spirit)s?\b/.test(text)) return 'COCKTAIL';

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
