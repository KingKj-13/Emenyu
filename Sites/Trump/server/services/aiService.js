const { getCategoryType, normalizeId, normalizeName } = require('../utils/helpers');

const SPECIAL_WORDS = [
  'birthday',
  'anniversary',
  'event',
  'celebration',
  'party',
  'gathering',
  'festival',
  'ceremony',
  'function',
  'occasion',
  'milestone',
  'achievement',
  'engagement',
  'wedding',
  'proposal',
  'graduation',
  'farewell',
  'retirement',
  'promotion',
  'date'
];

const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'what',
  'which',
  'would',
  'should',
  'could',
  'have',
  'that',
  'this',
  'menu',
  'food',
  'dish',
  'dishes',
  'please',
  'about',
  'tonight',
  'today',
  'recommend',
  'suggest',
  'popular',
  'best',
  'good'
]);

const QUERY_INTENTS = [
  { key: 'steak', terms: ['steak', 'rump', 'ribeye', 'sirloin', 'fillet', 't-bone', 'tomahawk', 'wagyu'] },
  { key: 'seafood', terms: ['seafood', 'prawn', 'prawns', 'calamari', 'salmon', 'kingklip', 'hake', 'oyster', 'sushi'] },
  { key: 'wine', terms: ['wine', 'cabernet', 'merlot', 'pinotage', 'shiraz', 'sauvignon', 'chardonnay', 'rose', 'champagne'] },
  { key: 'cocktail', terms: ['cocktail', 'mocktail', 'margarita', 'martini', 'sour', 'daiquiri', 'gin'] },
  { key: 'dessert', terms: ['dessert', 'sweet', 'cake', 'ice cream', 'malva', 'pudding'] },
  { key: 'vegetarian', terms: ['vegetarian', 'vegan', 'plant-based', 'meat-free'] },
  { key: 'starter', terms: ['starter', 'start', 'small plate', 'appetizer', 'wings', 'snails'] },
  { key: 'burger', terms: ['burger'] },
  { key: 'beer', terms: ['beer', 'lager', 'draught', 'cider'] }
];

const IMAGE_BANK = [
  { terms: ['tomahawk', 't-bone', 'ribeye'], image: 'Images/Tomahawk.jpg' },
  { terms: ['fillet'], image: 'Images/Beef fillet.jpg' },
  { terms: ['rump', 'steak', 'sirloin', 'wagyu'], image: 'Images/Rump Steak.jpg' },
  { terms: ['prawn'], image: 'Images/Butter-garlic-prawns.jpg' },
  { terms: ['oyster'], image: 'Images/Oyster.jpg' },
  { terms: ['calamari'], image: 'Images/Calamari.jpeg' },
  { terms: ['salmon', 'fish', 'hake', 'kingklip'], image: 'Images/Fish & Chips.jpg' },
  { terms: ['mussel'], image: 'Images/Mussels.jpg' },
  { terms: ['burger'], image: 'Images/Bifteki Burger.jpg' },
  { terms: ['pork', 'chop'], image: 'Images/Crispy Pork Chops.jpg' },
  { terms: ['lamb'], image: 'Images/Crispy Lamb Chops.jpg' },
  { terms: ['chicken'], image: 'Images/Chicken Livers.jpeg' },
  { terms: ['pasta'], image: 'Images/Chicken Pasta.jpg' },
  { terms: ['salad', 'vegetarian', 'halloumi'], image: 'Images/Halloumi.jpg' },
  { terms: ['dessert', 'cake', 'ice cream', 'malva', 'pudding'], image: 'Images/Cheese Cake.jpg' },
  { terms: ['old fashioned'], image: 'Images/Old Fashioned.jpg' },
  { terms: ['cocktail', 'margarita'], image: 'Images/Margarita.jpg' },
  { terms: ['wine', 'shiraz', 'cabernet', 'merlot', 'pinotage'], image: 'Images/Porcupine Ridge Shiraz.jpg' },
  { terms: ['beer', 'lager'], image: 'Images/Heineken (330ml).jpg' }
];

function tokenize(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(token => token.length > 2 && !STOP_WORDS.has(token));
}

function inferImage(item = {}) {
  if (item.img && String(item.img).trim()) {
    return item.img;
  }

  const haystack = `${item.name || ''} ${item.description || ''} ${item.category || ''} ${item.subcategory || ''}`.toLowerCase();
  const match = IMAGE_BANK.find(entry => entry.terms.some(term => haystack.includes(term)));
  return match ? match.image : 'Images/Tomahawk.jpg';
}

function publicItem(item = {}, sourceTitle = '') {
  return {
    name: item.name,
    price: Number(item.price) || 0,
    description: item.description || '',
    img: inferImage(item),
    video: item.video || '',
    category: item.category || '',
    subcategory: item.subcategory || '',
    categoryType: item.categoryType || 'MAIN',
    source_title: sourceTitle || item.source_title || ''
  };
}

function buildMenuContext(menuJson = {}) {
  const items = [];
  const byName = new Map();
  const allKeys = [];
  const categories = new Map();
  const categorized = {
    STARTER: [],
    MAIN: [],
    DESSERT: [],
    DRINK: [],
    WINE: []
  };

  function addItem(rawItem, category, subcategory, categoryType) {
    if (!rawItem?.name || rawItem.visible === false) {
      return;
    }

    const item = {
      ...rawItem,
      category,
      subcategory,
      categoryType,
      searchText: [
        rawItem.name,
        rawItem.description,
        rawItem.allergens,
        rawItem.types,
        category,
        subcategory
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
    };
    const key = normalizeName(item.name);
    items.push(item);
    byName.set(key, item);
    allKeys.push(key);
    if (!categories.has(category)) {
      categories.set(category, new Set());
    }
    if (subcategory) {
      categories.get(category).add(subcategory);
    }
    if (categorized[categoryType]) {
      categorized[categoryType].push(item);
    }
  }

  function walk(node, category = 'Menu', subcategory = '', inheritedType = 'MAIN') {
    if (Array.isArray(node)) {
      node.forEach(item => addItem(item, category, subcategory, inheritedType));
      return;
    }

    if (!node || typeof node !== 'object' || node.visible === false) {
      return;
    }

    const nodeType = getCategoryType(`${category} ${subcategory}`);
    const categoryType = nodeType !== 'MAIN' ? nodeType : inheritedType;

    if (Array.isArray(node.items)) {
      node.items.forEach(item => addItem(item, category, subcategory, categoryType));
    }

    Object.entries(node).forEach(([key, value]) => {
      if (key === 'items' || key === 'visible') {
        return;
      }

      const nextCategory = subcategory ? category : key;
      const nextSubcategory = subcategory ? key : '';
      const nextType = getCategoryType(`${key} ${nextCategory}`);
      walk(value, nextCategory, nextSubcategory, nextType !== 'MAIN' ? nextType : categoryType);
    });
  }

  Object.entries(menuJson || {}).forEach(([key, value]) => {
    walk(value, key, '', getCategoryType(key));
  });

  return { items, byName, allKeys, categorized, categories };
}

function fuzzyFindItem(menuContext, rawName) {
  const key = normalizeName(rawName);
  if (!key) {
    return null;
  }

  if (menuContext.byName.has(key)) {
    return menuContext.byName.get(key);
  }

  const fuzzyKey = menuContext.allKeys.find(candidate => candidate.includes(key) || key.includes(candidate));
  return fuzzyKey ? menuContext.byName.get(fuzzyKey) : null;
}

function findMentionedItem(menuContext, message) {
  const compact = normalizeName(message);
  const sorted = [...menuContext.items].sort((left, right) => right.name.length - left.name.length);
  return sorted.find(item => compact.includes(normalizeName(item.name))) || null;
}

function scoreSearch(menuContext, message, options = {}) {
  const lower = String(message || '').toLowerCase();
  const queryTokens = new Set(tokenize(message));
  const intent = QUERY_INTENTS.find(entry => entry.terms.some(term => lower.includes(term)));
  const blocked = new Set((options.exclude || []).map(name => normalizeName(name)));

  return menuContext.items
    .filter(item => !blocked.has(normalizeName(item.name)))
    .map(item => {
      let score = 0;
      const nameText = String(item.name || '').toLowerCase();
      const itemTokens = new Set(tokenize(item.searchText));
      queryTokens.forEach(token => {
        if (itemTokens.has(token) || item.searchText.includes(token)) {
          score += 8;
        }
      });

      if (intent) {
        if (intent.terms.some(term => nameText.includes(term))) {
          score += 32;
        } else if (intent.terms.some(term => item.searchText.includes(term))) {
          score += 14;
        }
      }

      if (intent?.key === 'steak' && /sauce|butter|enhancement/.test(item.searchText)) {
        score -= 12;
      }

      if (lower.includes('premium') && /wagyu|tomahawk|fillet|champagne|cognac/i.test(item.searchText)) {
        score += 12;
      }

      if (lower.includes('light') && /salad|fish|sushi|seafood|vegetarian/i.test(item.searchText)) {
        score += 8;
      }

      if (lower.includes('spicy') && /peri|chilli|sriracha|spicy|firecracker/i.test(item.searchText)) {
        score += 10;
      }

      return { item, score };
    })
    .filter(entry => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .map(entry => entry.item);
}

function itemQuantity(item = {}) {
  return Number(item.qty || item.quantity || 1) || 1;
}

class AiService {
  constructor(config, fileService, socketService) {
    this.config = config;
    this.fileService = fileService;
    this.socketService = socketService;
  }

  async getMenuContext() {
    return buildMenuContext(await this.fileService.loadMenu());
  }

  async chat(payload = {}) {
    const requestBody = {
      ...payload,
      tableId: normalizeId(payload.tableId || payload.table_number || payload.table || 'unknown')
    };
    const message = String(requestBody.message || '').trim();
    const menuContext = await this.getMenuContext();
    const lower = message.toLowerCase();

    let responseData;

    if (!message) {
      responseData = {
        reply: 'Ask me for steaks, sushi, seafood, wines, cocktails, desserts, popular dishes, or a pairing.',
        suggestions: (await this.getPopularItems(menuContext, 4)).map(item => publicItem(item, 'Popular tonight'))
      };
    } else if (lower.includes('deal') || lower.includes('special')) {
      responseData = await this.buildDealsReply(menuContext);
    } else if (this.isCategoryQuestion(lower)) {
      responseData = this.buildCategoryReply(menuContext);
    } else if (lower.includes('pair') || lower.includes('go with') || lower.includes('with this')) {
      responseData = await this.buildPairingReply(menuContext, lower, payload);
    } else if (this.isComboQuestion(lower)) {
      responseData = await this.buildComboReply(menuContext, lower, payload);
    } else if (this.isRecommendationQuestion(lower)) {
      const suggestions = await this.recommend({
        cart: Array.isArray(payload.cart) ? payload.cart : [],
        limit: 4,
        reason: message
      });
      responseData = {
        reply: this.buildSuggestionReply(
          suggestions,
          suggestions.some(item => item.source_title === 'People also ordered')
            ? 'Guests who order like this also lean toward'
            : 'I would steer you toward'
        ),
        suggestions
      };
    } else if (lower.includes('wine') || lower.includes('cellar') || lower.includes('champagne') || lower.includes('shiraz') || lower.includes('cabernet') || lower.includes('merlot') || lower.includes('pinotage') || lower.includes('sauvignon') || lower.includes('chardonnay')) {
      responseData = await this.buildWineReply(menuContext, lower, payload);
    } else if (lower.includes('allerg') || lower.includes('gluten') || lower.includes('vegetarian') || lower.includes('vegan')) {
      responseData = this.buildDietaryReply(menuContext, lower);
    } else {
      const mentioned = findMentionedItem(menuContext, message);
      if (mentioned) {
        const pairings = await this.recommend({ cart: [mentioned], limit: 3 });
        responseData = {
          reply: `${mentioned.name} is ${mentioned.description || 'one of the grillhouse selections'}. It is ${this.formatPrice(
            mentioned.price
          )}. For the table, I would pair it with ${pairings.map(item => item.name).slice(0, 2).join(' and ') || 'a cellar pour'}.`,
          suggestions: [publicItem(mentioned, 'Selected item'), ...pairings].slice(0, 4)
        };
      } else {
        const matches = scoreSearch(menuContext, message).slice(0, 4);
        if (matches.length > 0) {
          responseData = {
            reply: this.buildSuggestionReply(matches.map(item => publicItem(item, 'Menu match')), 'The closest matches I found are'),
            suggestions: matches.map(item => publicItem(item, 'Menu match'))
          };
        } else {
          const popular = await this.getPopularItems(menuContext, 3);
          responseData = {
            reply:
              'I can help with the menu from local restaurant data. Try asking for steaks, seafood, sushi, cocktails, wines, desserts, or what is popular.',
            suggestions: popular.map(item => publicItem(item, 'Popular tonight'))
          };
        }
      }
    }

    await this.appendChatLog(requestBody, responseData);
    return responseData;
  }

  isRecommendationQuestion(lower) {
    return [
      'popular',
      'recommend',
      'suggest',
      'best',
      'favorite',
      'favourite',
      'what is good',
      'what should',
      'people also'
    ].some(term => lower.includes(term));
  }

  isCategoryQuestion(lower) {
    return [
      'category',
      'categories',
      'sections',
      'what do you have',
      'show me the menu',
      'menu structure'
    ].some(term => lower.includes(term));
  }

  isComboQuestion(lower) {
    return [
      'combo',
      'set menu',
      'build',
      'meal',
      'course',
      'date night',
      'for two',
      'table'
    ].some(term => lower.includes(term));
  }

  buildCategoryReply(menuContext) {
    const categories = [...menuContext.categories.entries()]
      .map(([category, subcategories]) => {
        const subs = [...subcategories].slice(0, 3);
        return subs.length ? `${category} (${subs.join(', ')})` : category;
      })
      .slice(0, 10);

    const popular = menuContext.items
      .filter(item => /tomahawk|fillet|prawn|salmon|rump|malva|margarita/i.test(item.searchText))
      .slice(0, 4);

    return {
      reply: `The menu is organised around ${categories.join('; ')}. I can narrow it by steak, seafood, sushi, wines, cocktails, vegetarian dishes, desserts, or budget.`,
      suggestions: popular.map(item => publicItem(item, 'Menu landmark'))
    };
  }

  async buildComboReply(menuContext, lower, payload = {}) {
    const cart = this.readCart(payload);
    const suggestions = [];

    const add = item => {
      if (!item?.name || suggestions.some(existing => normalizeName(existing.name) === normalizeName(item.name))) {
        return;
      }
      suggestions.push(item);
    };

    if (lower.includes('seafood')) {
      add(this.pickMenuItem(menuContext, ['calamari', 'prawn', 'salmon', 'kingklip'], 'STARTER'));
      add(this.pickMenuItem(menuContext, ['kingklip', 'prawn', 'salmon', 'calamari'], 'MAIN'));
      add(this.pickMenuItem(menuContext, ['chardonnay', 'sauvignon', 'chenin'], 'DRINK'));
    } else if (lower.includes('vegetarian') || lower.includes('vegan')) {
      add(this.pickMenuItem(menuContext, ['halloumi', 'greek salad', 'vegetarian'], 'STARTER'));
      add(this.pickMenuItem(menuContext, ['veg', 'vegetarian', 'salad'], 'MAIN'));
      add(this.pickMenuItem(menuContext, ['lemonade', 'mocktail', 'tea'], 'DRINK'));
    } else {
      add(this.pickMenuItem(menuContext, ['biltong', 'calamari', 'snails'], 'STARTER'));
      add(this.pickMenuItem(menuContext, ['tomahawk', 'fillet', 'rump', 'ribeye'], 'MAIN'));
      add(this.pickMenuItem(menuContext, ['shiraz', 'cabernet', 'old fashioned'], 'DRINK'));
      add(this.pickMenuItem(menuContext, ['malva', 'cheese cake', 'ice cream'], 'DESSERT'));
    }

    if (cart.length > 0) {
      const recs = await this.recommend({ cart, limit: 3 });
      recs.forEach(item => add(item));
    }

    const publicSuggestions = suggestions.filter(Boolean).slice(0, 5).map(item => publicItem(item, 'Combo builder'));
    return {
      reply: this.buildSuggestionReply(publicSuggestions, 'I would build the table around'),
      suggestions: publicSuggestions
    };
  }

  async buildPairingReply(menuContext, lower, payload = {}) {
    const cart = this.readCart(payload);
    const mentioned = findMentionedItem(menuContext, payload.message || lower);
    const cartItems = mentioned ? [mentioned, ...cart] : cart;
    const suggestions = await this.recommend({
      cart: cartItems,
      limit: 4,
      reason: payload.message || lower
    });

    if (suggestions.length > 0) {
      return {
        reply: this.buildSuggestionReply(suggestions, 'For a balanced pairing I would add'),
        suggestions
      };
    }

    const fallback = await this.getPopularItems(menuContext, 4);
    return {
      reply: this.buildSuggestionReply(fallback.map(item => publicItem(item, 'Popular pairing')), 'A strong fallback pairing would be'),
      suggestions: fallback.map(item => publicItem(item, 'Popular pairing'))
    };
  }

  pickMenuItem(menuContext, keywords, categoryType) {
    return this.pickMenuItems(menuContext, keywords, categoryType)[0]
      || (categoryType ? menuContext.categorized[categoryType] || [] : menuContext.items)[0]
      || null;
  }

  // Sorted list of matches (best first) — used so we can vary the choice per dish.
  pickMenuItems(menuContext, keywords, categoryType) {
    const candidates = categoryType ? menuContext.categorized[categoryType] || [] : menuContext.items;
    return candidates
      .map(item => {
        const score = keywords.reduce((sum, keyword, index) => (item.searchText.includes(keyword) ? sum + keywords.length - index : sum), 0);
        return { item, score };
      })
      .filter(entry => entry.score > 0)
      .sort((left, right) => right.score - left.score)
      .map(entry => entry.item);
  }

  hashString(value) {
    let h = 0;
    const str = String(value || '');
    for (let i = 0; i < str.length; i += 1) {
      h = (h * 31 + str.charCodeAt(i)) >>> 0;
    }
    return h;
  }

  // Pick a match that varies by dish (stable per dish) so the same wine isn't
  // recommended for every steak — rotates through the strongest matches.
  pickVariedMenuItem(menuContext, keywords, categoryType, seed) {
    const matches = this.pickMenuItems(menuContext, keywords, categoryType);
    if (matches.length === 0) {
      return (categoryType ? menuContext.categorized[categoryType] || [] : menuContext.items)[0] || null;
    }
    const pool = matches.slice(0, Math.min(5, matches.length));
    return pool[this.hashString(seed) % pool.length];
  }

  async buildDealsReply(menuContext) {
    const deals = (await this.fileService.loadDeals()).filter(deal => deal.visible !== false && deal.hidden !== true);
    if (deals.length === 0) {
      const popular = await this.getPopularItems(menuContext, 3);
      return {
        reply: `There are no active deals right now. The strongest table picks are ${popular.map(item => item.name).join(', ')}.`,
        suggestions: popular.map(item => publicItem(item, 'Popular tonight'))
      };
    }

    const deal = deals[0];
    const suggestions = (deal.items || [])
      .map(item => fuzzyFindItem(menuContext, item.name) || item)
      .map(item => publicItem(item, deal.name || 'Today special'));

    return {
      reply: `Today's special includes ${suggestions.map(item => item.name).join(', ')} for ${this.formatPrice(deal.price)}.`,
      suggestions
    };
  }

  buildDietaryReply(menuContext, lower) {
    const wantsVegetarian = lower.includes('vegetarian') || lower.includes('vegan');
    const blocked = ['beef', 'chicken', 'pork', 'lamb', 'seafood', 'gluten', 'egg', 'nuts'].filter(term => lower.includes(term));
    const matches = menuContext.items
      .filter(item => {
        const allergens = String(item.allergens || '').toLowerCase();
        const text = item.searchText || '';
        if (wantsVegetarian && !/vegetarian|vegan|salad|halloumi|veg/.test(text)) {
          return false;
        }
        return !blocked.some(term => allergens.includes(term) || text.includes(term));
      })
      .slice(0, 4)
      .map(item => publicItem(item, wantsVegetarian ? 'Vegetarian friendly' : 'Allergy aware'));

    return {
      reply:
        matches.length > 0
          ? this.buildSuggestionReply(matches, 'A safer starting point would be')
          : 'I do not see enough allergen-safe matches in the menu data. Please confirm with the waiter before ordering.',
      suggestions: matches
    };
  }

  pairingReason(pairing, forItem) {
    const cat = (pairing.categoryType || '').toUpperCase();
    const pairingName = (pairing.name || '').toLowerCase();
    const foodName = (forItem?.name || '').toLowerCase();
    if (cat === 'WINE') {
      if (/steak|beef|rump|fillet|tomahawk|ribeye|wagyu/.test(foodName)) return 'Full-bodied red — pairs beautifully with grilled beef.';
      if (/prawn|seafood|salmon|calamari|kingklip/.test(foodName)) return 'Crisp white — a classic match for seafood.';
      if (/lamb|pork/.test(foodName)) return 'Medium-bodied red — complements the richness.';
      if (/burger|ribs|chicken/.test(foodName)) return 'Easy-drinking red — great with grilled proteins.';
      if (/pasta|cream|mushroom/.test(foodName)) return 'Light white or rosé — beautiful with pasta.';
      return 'Recommended wine pairing for this dish.';
    }
    if (cat === 'DRINK') {
      if (/beer|lager|cider/.test(pairingName)) return 'A cold beer — the classic grill companion.';
      if (/cocktail|margarita|old fashioned|martini/.test(pairingName)) return 'A signature cocktail to round off the evening.';
      if (/mocktail|lemonade|iced tea/.test(pairingName)) return 'A refreshing non-alcoholic choice.';
      return 'Great drink to round off this course.';
    }
    if (cat === 'DESSERT') return 'Sweet finish to complete the meal.';
    if (cat === 'STARTER') {
      if (/calamari|prawn|oyster/.test(pairingName)) return 'A perfect light start before the mains.';
      if (/garlic bread|bruschetta/.test(pairingName)) return 'Share at the table before mains arrive.';
      return 'Light start before your main.';
    }
    if (cat === 'MAIN') {
      if (/chips|fries/.test(pairingName)) return 'Classic side — goes with almost everything.';
      if (/onion rings/.test(pairingName)) return 'Crispy side — a crowd favourite.';
      if (/sauce/.test(pairingName)) return 'Drizzle it over — takes it to the next level.';
      if (/salad/.test(pairingName)) return 'Fresh balance alongside a rich main.';
      if (/garlic bread/.test(pairingName)) return 'Mop up every last drop of sauce.';
      return 'Goes well with this dish.';
    }
    const src = pairing.source_title || '';
    if (src === "Chef's Pairing") return "Chef's hand-picked pairing.";
    if (src === 'People also ordered') return 'Other guests ordering this also chose it.';
    if (src === 'Cellar recommendation') return 'From the cellar — highly recommended.';
    return 'Goes well with this dish.';
  }

  async buildWineReply(menuContext, lower, payload = {}) {
    const wineSuggestions = await this.recommend({
      cart: Array.isArray(payload.cart) ? payload.cart : [],
      limit: 6,
      reason: payload.message || lower
    });
    const wineOnly = wineSuggestions.filter(s => s.categoryType === 'WINE').slice(0, 4);

    if (wineOnly.length > 0) {
      return {
        reply: this.buildSuggestionReply(wineOnly, 'From the cellar I would pour'),
        suggestions: wineOnly
      };
    }

    const fallbackWines = (menuContext.categorized.WINE || []).slice(0, 4).map(w => publicItem(w, 'Cellar selection'));
    return {
      reply: this.buildSuggestionReply(fallbackWines, 'From the cellar I would pour'),
      suggestions: fallbackWines
    };
  }

  buildSuggestionReply(items, prefix) {
    if (!items || items.length === 0) {
      return 'I do not have a strong match yet, but the waiter can guide you by taste, budget, and allergies.';
    }

    const names = items.slice(0, 3).map(item => item.name);
    return `${prefix} ${names.join(', ')}. Tap a dish card and I can help you build the rest of the table.`;
  }

  async aiPairing(payload = {}) {
    const menuContext = await this.getMenuContext();
    const rawItem = payload.item || payload.selectedItem || payload.name || payload.cart?.[0];
    const item = typeof rawItem === 'string' ? fuzzyFindItem(menuContext, rawItem) : fuzzyFindItem(menuContext, rawItem?.name) || rawItem;
    const recs = await this.recommend({ cart: item ? [item] : [], limit: 6 });

    const enriched = recs.map(pairing => ({
      name: pairing.name,
      price: pairing.price,
      img: pairing.img,
      categoryType: pairing.categoryType,
      source_title: pairing.source_title,
      reason: this.pairingReason(pairing, item)
    }));

    const foodPairings = enriched.filter(p => !['WINE', 'DRINK'].includes(p.categoryType || ''));
    const drinkPairings = enriched.filter(p => ['WINE', 'DRINK'].includes(p.categoryType || ''));

    return {
      title: item?.name ? `Pairs with ${item.name}` : "Chef's Pick",
      description: item?.description || 'A confident table recommendation from the local menu.',
      foodPairings,
      drinkPairings,
      pairings: [...foodPairings, ...drinkPairings],
      talkTrack: recs.length
        ? `I would pair this with ${recs[0].name}; it rounds out the table nicely.`
        : "I'd keep this simple and ask the waiter for the freshest pairing tonight."
    };
  }

  async recommend(payload = {}) {
    const cart = this.readCart(payload);
    const recommendationLimit = Math.min(8, Math.max(3, Number(payload.limit) || cart.length || 4));
    const menuContext = await this.getMenuContext();
    const adminGroups = await this.fileService.loadRecommendations();
    const orderRecords = await this.getOrderRecords();
    const popularity = await this.getPopularityScores(menuContext, orderRecords);

    const cartNames = cart.map(item => normalizeName(item.name));
    const seen = new Set(cartNames);
    const candidates = [];

    const addCandidate = (item, source, score) => {
      if (!item?.name) {
        return;
      }

      const key = normalizeName(item.name);
      if (seen.has(key)) {
        return;
      }

      candidates.push({ item, source, score });
      seen.add(key);
    };

    for (const group of adminGroups) {
      if (!Array.isArray(group.items)) {
        continue;
      }

      const isRelevant =
        cartNames.length === 0
          ? false
          : group.items.some(groupItem => cartNames.includes(normalizeName(groupItem.name)));
      if (!isRelevant) {
        continue;
      }

      group.items.forEach(groupItem => {
        const match = fuzzyFindItem(menuContext, groupItem.name);
        if (match) {
          addCandidate(match, group.description || "Chef's Pairing", 120);
        }
      });
    }

    this.addPeopleAlsoOrdered(cartNames, menuContext, orderRecords, addCandidate);
    this.addPerfectPairings(cartNames, menuContext, addCandidate);
    this.addFoodPairings(cartNames, menuContext, addCandidate);
    this.addCourseCompletions(cartNames, menuContext, addCandidate, popularity);
    this.addPopularCandidates(menuContext, popularity, addCandidate);

    if (payload.reason) {
      scoreSearch(menuContext, payload.reason, { exclude: [...seen] })
        .slice(0, 3)
        .forEach(item => addCandidate(item, 'Recommended for you', 82));
    }

    return candidates
      .sort((left, right) => right.score - left.score)
      .slice(0, recommendationLimit)
      .map(candidate => publicItem(candidate.item, candidate.source));
  }

  readCart(payload = {}) {
    if (Array.isArray(payload)) {
      return payload;
    }
    if (Array.isArray(payload.cart)) {
      return payload.cart;
    }
    if (Array.isArray(payload.items)) {
      return payload.items;
    }
    return [];
  }

  addPeopleAlsoOrdered(cartNames, menuContext, orderRecords, addCandidate) {
    if (cartNames.length === 0) {
      return;
    }

    const scores = new Map();
    orderRecords.forEach(order => {
      const names = (order.items || []).map(item => normalizeName(item.name));
      if (!names.some(name => cartNames.includes(name))) {
        return;
      }

      names.forEach(name => {
        if (!cartNames.includes(name)) {
          scores.set(name, (scores.get(name) || 0) + 18);
        }
      });
    });

    [...scores.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 4)
      .forEach(([key, score]) => {
        const item = menuContext.byName.get(key);
        if (item) {
          addCandidate(item, 'People also ordered', 100 + score);
        }
      });
  }

  addPerfectPairings(cartNames, menuContext, addCandidate) {
    if (cartNames.length === 0) return;

    const cartText = cartNames
      .map(name => menuContext.byName.get(name))
      .filter(Boolean)
      .map(item => item.searchText)
      .join(' ');

    // Each rule has typed keyword groups to ensure wine searches WINE, food searches MAIN, etc.
    const pairingRules = [
      {
        when: /tomahawk|wagyu|fillet|ribeye|rump|sirloin|steak|beef/,
        title: 'Perfect steak pairing',
        score: 94,
        typedPairs: [
          { keywords: ['shiraz', 'cabernet', 'merlot', 'pinotage'], type: 'WINE' },
          { keywords: ['pepper sauce', 'mushroom sauce', 'garlic butter'], type: 'MAIN' }
        ]
      },
      {
        when: /prawn|calamari|salmon|kingklip|hake|seafood|squid|mussel/,
        title: 'Perfect seafood pairing',
        score: 92,
        typedPairs: [
          { keywords: ['chardonnay', 'sauvignon', 'chenin'], type: 'WINE' },
          { keywords: ['garlic bread', 'chips', 'greek salad'], type: 'MAIN' }
        ]
      },
      {
        when: /burger|ribs|pork|wings/,
        title: 'Perfect grill pairing',
        score: 88,
        typedPairs: [
          { keywords: ['lager', 'beer', 'cider'], type: 'DRINK' },
          { keywords: ['chips', 'onion rings', 'coleslaw'], type: 'MAIN' }
        ]
      },
      {
        when: /lamb|souvlaki|souvlakia|keftethes|bifteki/,
        title: 'Classic Greek pairing',
        score: 90,
        typedPairs: [
          { keywords: ['shiraz', 'pinotage', 'cabernet'], type: 'WINE' },
          { keywords: ['tzatziki', 'chips', 'pita'], type: 'MAIN' }
        ]
      },
      {
        when: /dessert|malva|cake|ice cream|baklava|loukoumades|rizogalo|portokalopita/,
        title: 'Sweet finish pairing',
        score: 84,
        typedPairs: [
          { keywords: ['irish coffee', 'espresso', 'whisky', 'cognac'], type: 'DRINK' }
        ]
      }
    ];

    pairingRules
      .filter(rule => rule.when.test(cartText))
      .forEach(rule => {
        rule.typedPairs.forEach(({ keywords, type }) => {
          // Vary wine/drink picks by dish so the cellar rotates instead of
          // always pouring the same bottle.
          const item = (type === 'WINE' || type === 'DRINK')
            ? this.pickVariedMenuItem(menuContext, keywords, type, cartText)
            : this.pickMenuItem(menuContext, keywords, type);
          if (item) addCandidate(item, rule.title, rule.score);
        });
      });
  }

  addFoodPairings(cartNames, menuContext, addCandidate) {
    if (cartNames.length === 0) return;

    const cartItems = cartNames.map(name => menuContext.byName.get(name)).filter(Boolean);
    const cartText = cartItems.map(item => item.searchText).join(' ');
    const cartTypes = new Set(cartItems.map(item => item.categoryType));

    const foodRules = [
      {
        when: /tomahawk|wagyu|fillet|ribeye|rump|sirloin|steak|beef/,
        title: 'Classic steak side',
        score: 90,
        keywords: ['chips', 'fries', 'onion rings', 'mushroom sauce', 'pepper sauce', 'garlic bread']
      },
      {
        when: /prawn|calamari|salmon|kingklip|hake|seafood/,
        title: 'Goes great with seafood',
        score: 88,
        keywords: ['garlic bread', 'chips', 'greek salad', 'tartare']
      },
      {
        when: /burger/,
        title: 'Classic burger side',
        score: 86,
        keywords: ['onion rings', 'chips', 'coleslaw']
      },
      {
        when: /ribs|pork|chops/,
        title: 'Goes well together',
        score: 86,
        keywords: ['chips', 'coleslaw', 'onion rings', 'garlic bread']
      },
      {
        when: /pasta/,
        title: 'Perfect with pasta',
        score: 84,
        keywords: ['garlic bread', 'salad', 'bruschetta']
      },
      {
        when: /chicken/,
        title: 'Pairs with chicken',
        score: 84,
        keywords: ['chips', 'salad', 'garlic bread', 'coleslaw']
      }
    ];

    foodRules
      .filter(rule => rule.when.test(cartText))
      .forEach(rule => {
        rule.keywords
          .map(keyword => this.pickMenuItem(menuContext, [keyword], null))
          .filter(Boolean)
          .filter(item => {
            if (cartNames.includes(normalizeName(item.name))) return false;
            if (item.categoryType === 'MAIN' && cartTypes.has('MAIN')) return false;
            return true;
          })
          .slice(0, 2)
          .forEach(item => addCandidate(item, rule.title, rule.score));
      });
  }

  addCourseCompletions(cartNames, menuContext, addCandidate, popularity) {
    const cartTypes = new Set(
      cartNames
        .map(name => menuContext.byName.get(name))
        .filter(Boolean)
        .map(item => item.categoryType)
    );

    [
      { key: 'STARTER', title: 'Start with a starter', score: 76 },
      { key: 'WINE', title: 'Wine pairing', score: 74 },
      { key: 'DRINK', title: 'Cellar pairing', score: 72 },
      { key: 'DESSERT', title: 'Sweet finish', score: 66 }
    ].forEach(suggestion => {
      if (cartTypes.has(suggestion.key)) {
        return;
      }

      const options = [...(menuContext.categorized[suggestion.key] || [])].sort(
        (left, right) => (popularity.get(normalizeName(right.name)) || 0) - (popularity.get(normalizeName(left.name)) || 0)
      );
      // Rotate wine/drink completions by cart so it isn't always the same bottle.
      const pool = options.slice(0, Math.min(5, options.length));
      const choice = (suggestion.key === 'WINE' || suggestion.key === 'DRINK') && pool.length > 1
        ? pool[this.hashString(cartNames.join('|')) % pool.length]
        : options[0];
      if (choice) {
        addCandidate(choice, suggestion.title, suggestion.score);
      }
    });
  }

  addPopularCandidates(menuContext, popularity, addCandidate) {
    [...menuContext.items]
      .sort((left, right) => (popularity.get(normalizeName(right.name)) || 0) - (popularity.get(normalizeName(left.name)) || 0))
      .slice(0, 12)
      .forEach(item => addCandidate(item, 'Popular tonight', 52 + (popularity.get(normalizeName(item.name)) || 0)));
  }

  async getPopularItems(menuContext, limit = 6) {
    const orderRecords = await this.getOrderRecords();
    const popularity = await this.getPopularityScores(menuContext, orderRecords);
    return [...menuContext.items]
      .sort((left, right) => (popularity.get(normalizeName(right.name)) || 0) - (popularity.get(normalizeName(left.name)) || 0))
      .slice(0, limit);
  }

  async getOrderRecords() {
    const [orders, history] = await Promise.all([this.fileService.listOrders('orders'), this.fileService.listOrders('history')]);
    return [...orders, ...history].filter(order => Array.isArray(order.items));
  }

  async getPopularityScores(menuContext, orderRecords) {
    const scores = new Map();

    orderRecords.forEach(order => {
      (order.items || []).forEach(item => {
        const match = fuzzyFindItem(menuContext, item.name);
        if (!match) {
          return;
        }
        const key = normalizeName(match.name);
        scores.set(key, (scores.get(key) || 0) + itemQuantity(item));
      });
    });

    const configuredPopular = await this.fileService.loadPopular();
    configuredPopular.forEach((entry, index) => {
      const match = fuzzyFindItem(menuContext, entry.name);
      if (!match) {
        return;
      }
      const key = normalizeName(match.name);
      scores.set(key, (scores.get(key) || 0) + 16 - index);
    });

    menuContext.items.forEach(item => {
      const key = normalizeName(item.name);
      const text = item.searchText || '';
      let heuristic = 0;
      if (/tomahawk|wagyu|fillet|ribeye|rump|sirloin/.test(text)) heuristic += 7;
      if (/prawn|salmon|oyster|kingklip|calamari/.test(text)) heuristic += 6;
      if (/old fashioned|margarita|shiraz|cabernet|champagne/.test(text)) heuristic += 5;
      if (/dessert|malva|ice cream|cake/.test(text)) heuristic += 4;
      if (heuristic) {
        scores.set(key, (scores.get(key) || 0) + heuristic);
      }
    });

    return scores;
  }

  async getChatHistory() {
    return this.fileService.loadChatHistory();
  }

  async appendChatLog(payload, responseData) {
    const message = String(payload.message || '').trim();
    if (!message) {
      return;
    }

    const now = new Date();
    const logEntry = {
      tableId: normalizeId(payload.tableId || payload.table_number || 'unknown'),
      date: now.toISOString().slice(0, 10),
      timestamp: now.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' }),
      message,
      reply: String(responseData.reply || '').trim(),
      is_special: SPECIAL_WORDS.some(word => message.toLowerCase().includes(word))
    };

    await this.fileService.appendChatLog(logEntry);
    this.socketService.emitNewChatLog(logEntry);
  }

  formatPrice(value) {
    return `R${(Number(value) || 0).toFixed(2)}`;
  }
}

module.exports = {
  AiService
};
