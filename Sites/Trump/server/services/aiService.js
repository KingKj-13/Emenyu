const { getCategoryType, normalizeId, normalizeName } = require('../utils/helpers');
const classifier = require('./categoryClassifier');
const { createRotationService } = require('./rotationService');
const { createRecommendationRules } = require('./recommendationRules');
const chatbotNlu = require('./chatbotNlu');
const intentClassifier = require('./intentClassifier');
const chatSession = require('./chatSession');
const { createKnowledgeService } = require('./knowledgeService');
const { createNlgService } = require('./nlg/nlgService');
const { createReasonComposer } = require('./reasonComposer');
const { createHeroPairings } = require('./heroPairings');
const { computeOrderedTogether } = require('./marketBasket');

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

// When a guest excludes a category, expand it to the concrete menu terms to filter.
const NEGATION_SYNONYMS = {
  seafood: ['seafood', 'prawn', 'prawns', 'calamari', 'squid', 'mussel', 'mussels', 'oyster', 'oysters', 'fish', 'salmon', 'kingklip', 'hake', 'sole', 'sushi', 'sashimi', 'linefish', 'crayfish', 'lobster'],
  fish: ['fish', 'salmon', 'kingklip', 'hake', 'sole', 'linefish', 'sushi', 'sashimi'],
  prawn: ['prawn', 'prawns'],
  prawns: ['prawn', 'prawns'],
  meat: ['beef', 'steak', 'rump', 'fillet', 'ribeye', 'tomahawk', 'sirloin', 'lamb', 'pork', 'chicken', 'ribs', 'wors', 'boerewors', 'game', 'venison', 'oxtail', 'biltong'],
  steak: ['steak', 'rump', 'fillet', 'ribeye', 'tomahawk', 'sirloin', 'beef'],
  beef: ['beef', 'steak', 'rump', 'fillet', 'ribeye', 'tomahawk', 'sirloin'],
  pork: ['pork', 'bacon', 'ribs'],
  chicken: ['chicken'],
  lamb: ['lamb'],
  dairy: ['cheese', 'halloumi', 'cream', 'milk', 'mozzarella', 'feta'],
  cheese: ['cheese', 'halloumi', 'mozzarella', 'feta'],
  nuts: ['nut', 'nuts', 'almond', 'peanut', 'cashew'],
  gluten: ['bread', 'pasta', 'crumbed', 'tempura', 'batter', 'noodle'],
  carbs: ['pasta', 'chips', 'fries', 'rice', 'bread', 'noodle'],
  spicy: ['peri', 'chilli', 'chili', 'spicy', 'sriracha', 'firecracker'],
  alcohol: ['wine', 'beer', 'cocktail', 'whisky', 'whiskey', 'vodka', 'gin', 'rum', 'tequila', 'margarita', 'cabernet', 'shiraz', 'merlot', 'champagne', 'sauvignon', 'liqueur', 'spirit']
};

const NEGATION_STOP = new Set(['the', 'a', 'an', 'any', 'some', 'more', 'too', 'please', 'thanks', 'food', 'dish', 'thing', 'stuff', 'it', 'that', 'this']);

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
    story: item.story || '',
    source_title: sourceTitle || item.source_title || '',
    // Phase 3A: carry the structured tags so the shared reasonComposer can craft
    // tag-true copy on any surface. Absent (undefined) when the menu isn't enriched.
    tags: item.tags && typeof item.tags === 'object' ? item.tags : undefined
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

      if (/\b(light|lighter|healthy|fresh|delicate)\b/.test(lower)) {
        if (/salad|vegetarian|veg |sushi|sashimi|carpaccio|tartare|ceviche|bruschetta|halloumi|edamame|gazpacho|greek salad|starter/i.test(item.searchText)) {
          score += 14;
        }
        if (/steak|rump|fillet|ribeye|wagyu|tomahawk|sirloin|beef|lamb|pork|ribs|ostrich|chicken|duck|oxtail|platter|burger|pasta|fried|crumbed|tempura|creamy|wors|chips|cake|pizza/i.test(item.searchText)) {
          score -= 14;
        }
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

// Phase 3A: hard dietary gate. Prefers the Phase-2 tags; falls back to scanning
// allergens/name when the menu isn't enriched, so a vegetarian/vegan request
// never surfaces meat regardless of which source proposed the item.
const MEAT_PROTEINS = new Set(['beef', 'chicken', 'lamb', 'pork', 'seafood', 'game']);
const MEAT_TEXT = /beef|steak|chicken|wings|lamb|pork|ribs|bacon|prawn|calamari|salmon|fish|seafood|sushi|sashimi|oxtail|game|venison|ostrich|biltong|wors/;
function dietaryOk(item = {}, diets = []) {
  const tags = item.tags || {};
  const dietary = Array.isArray(tags.dietary) ? tags.dietary : [];
  const protein = Array.isArray(tags.protein) ? tags.protein : [];
  const hasMeat = tags.protein
    ? protein.some(p => MEAT_PROTEINS.has(p))
    : MEAT_TEXT.test(`${item.allergens || ''} ${item.searchText || item.name || ''}`.toLowerCase());
  if (diets.includes('vegan')) return tags.dietary ? dietary.includes('vegan') : !hasMeat;
  if (diets.includes('vegetarian')) return dietary.includes('vegetarian') || !hasMeat;
  return true;
}

// Phase 3B: crisp "white" pours for a seafood/light pairing, still whites first
// (so a seafood swap isn't four champagnes), then rosé, then sparkling.
const CRISP_RANK = { white: 0, rose: 1, sparkling: 2 };
function crispWhites(items = []) {
  return items
    .filter(item => item.tags && ['white', 'sparkling', 'rose'].includes(item.tags.drinkType))
    .sort((a, b) => (CRISP_RANK[a.tags.drinkType] ?? 3) - (CRISP_RANK[b.tags.drinkType] ?? 3));
}

class AiService {
  constructor(config, fileService, socketService, { logger = null, nlgService = null } = {}) {
    this.config = config;
    this.fileService = fileService;
    this.socketService = socketService;
    // Phase 3: deterministic rotation + category-safety layers consumed by recommend().
    this.rotation = createRotationService({ config, logger });
    this.rules = createRecommendationRules({ config, logger });
    this.knowledge = createKnowledgeService({ config, fileService, logger });
    // Phase 3A/3C: shared copy layer (one voice for cards/chat/waiter) with the
    // Tier-1 authored hero pairings layered in. Reuses the injected NLG service
    // when available, else builds its own (always offline).
    this.nlgService = nlgService || createNlgService({ config, logger });
    this.hero = createHeroPairings({ logger });
    this.reason = createReasonComposer({ nlgService: this.nlgService, heroPairings: this.hero, logger });
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
    // Phase 3: normalize slang/typos and resolve synonyms before routing, so
    // "whats good", "wats gud", "stake", "vegitarian" reach the right intent.
    const nlu = chatbotNlu.normalize(message);
    const lower = nlu.normalized || message.toLowerCase();
    // Phase 3A: structured intent + slots (attribute/dietary/occasion) for tag-aware routing.
    const intent = intentClassifier.classify(message);
    // Phase 3B: cart-awareness + per-turn memory (anchor dish / last wine) from the
    // history the client already sends, so swaps and "a wine for it" resolve.
    const cart = this.readCart(payload);
    const session = chatSession.build(payload.history, menuContext, cart);
    const knowledgeIntent = this.knowledge.detectIntent(lower);
    const knowledgeAnswer = knowledgeIntent && knowledgeIntent !== 'special'
      ? await this.knowledge.answer(knowledgeIntent, lower, menuContext)
      : null;

    let responseData;

    if (!message) {
      responseData = {
        reply: 'Ask me for steaks, sushi, seafood, wines, cocktails, desserts, popular dishes, or a pairing.',
        suggestions: (await this.getPopularItems(menuContext, 4)).map(item => publicItem(item, 'Popular tonight'))
      };
    } else if (lower.includes('deal') || lower.includes('special')) {
      responseData = await this.buildDealsReply(menuContext);
    } else if (knowledgeAnswer) {
      responseData = {
        reply: knowledgeAnswer.reply,
        suggestions: (knowledgeAnswer.suggestions || []).map(item => publicItem(item, 'From our kitchen'))
      };
    } else if (intent.type === 'offtopic') {
      // Phase 3B: warm, in-character decline — never a random menu match.
      responseData = this.buildOfftopicReply();
    } else if (intent.type === 'swap') {
      // Phase 3B: "actually something fishy" — swap the dish AND the drink, using
      // the anchor remembered from the conversation.
      responseData = await this.buildSwapReply(menuContext, intent, session, payload);
    } else if (this.isCategoryQuestion(lower)) {
      responseData = this.buildCategoryReply(menuContext);
    } else if (lower.includes('pair') || lower.includes('go with') || lower.includes('with this') || intent.type === 'pairing') {
      responseData = await this.buildPairingReply(menuContext, lower, payload, session);
    } else if (this.isComboQuestion(lower)) {
      responseData = await this.buildComboReply(menuContext, lower, payload);
    } else if (!['attribute', 'dietary', 'occasion'].includes(intent.type)
      && (this.isRecommendationQuestion(lower) || chatbotNlu.isRecommendationIntent(lower))) {
      // A bare "what's good" lands here; "what's good, watching the football"
      // carries an occasion intent and falls through to the tag-aware branch below.
      const suggestions = await this.recommend({
        cart,
        limit: 4,
        reason: nlu.tokens.join(' '),
        tableId: requestBody.tableId,
        deviceId: payload.deviceId,
        menuContext
      });
      // Phase 3B: when there's a cart, make the lead a cart-aware cross-sell.
      const cartLead = this.cartAwareLead(cart, suggestions);
      responseData = {
        reply: cartLead || this.buildSuggestionReply(
          suggestions,
          suggestions.some(item => item.source_title === 'People also ordered')
            ? 'Guests who order like this also lean toward'
            : 'I would steer you toward'
        ),
        suggestions
      };
    } else if (['attribute', 'dietary', 'occasion'].includes(intent.type)) {
      // Phase 3A: tag-aware matching for "something spicy", "anything light",
      // "vegetarian options", "watching the football", etc.
      const suggestions = await this.recommend({
        cart,
        limit: 4,
        intent,
        reason: nlu.tokens.join(' '),
        tableId: requestBody.tableId,
        deviceId: payload.deviceId,
        menuContext
      });
      responseData = {
        reply: this.buildSuggestionReply(suggestions, this.intentLead(intent)),
        suggestions
      };
    } else if (lower.includes('wine') || lower.includes('cellar') || lower.includes('champagne') || lower.includes('shiraz') || lower.includes('cabernet') || lower.includes('merlot') || lower.includes('pinotage') || lower.includes('sauvignon') || lower.includes('chardonnay')) {
      responseData = await this.buildWineReply(menuContext, lower, payload);
    } else if (lower.includes('allerg') || lower.includes('gluten') || lower.includes('vegetarian') || lower.includes('vegan')) {
      responseData = this.buildDietaryReply(menuContext, lower);
    } else {
      const mentioned = findMentionedItem(menuContext, lower);
      if (mentioned) {
        const pairings = await this.recommend({ cart: [mentioned], limit: 3, menuContext });
        responseData = {
          reply: `${mentioned.name} is ${mentioned.description || 'one of the grillhouse selections'}. It is ${this.formatPrice(
            mentioned.price
          )}. For the table, I would pair it with ${pairings.map(item => item.name).slice(0, 2).join(' and ') || 'a cellar pour'}.`,
          suggestions: [publicItem(mentioned, 'Selected item'), ...pairings].slice(0, 4)
        };
      } else {
        const matches = scoreSearch(menuContext, lower).slice(0, 4);
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

    // Honour exclusions ("no seafood", "without cheese", "avoid pork") across
    // every reply branch — strip blocked items and backfill if needed.
    const blocked = this.computeBlockedTerms(lower);
    if (blocked.size > 0 && Array.isArray(responseData.suggestions)) {
      const kept = responseData.suggestions.filter(s => !this.matchesBlocked(s, blocked));
      if (kept.length !== responseData.suggestions.length) {
        let finalList = kept;
        if (finalList.length === 0) {
          const popular = await this.getPopularItems(menuContext, 12);
          finalList = popular
            .filter(item => !this.matchesBlocked(item, blocked))
            .slice(0, 4)
            .map(item => publicItem(item, 'A lighter choice'));
        }
        responseData = {
          reply: finalList.length
            ? this.buildSuggestionReply(finalList, 'Of course — how about')
            : 'Let me check with the kitchen on what fits best — the waiter can tailor something for you.',
          suggestions: finalList
        };
      }
    }

    await this.appendChatLog(requestBody, responseData);
    return responseData;
  }

  // ── Exclusion ("no X") handling ───────────────────────────────────────────
  computeBlockedTerms(lower) {
    const blocked = new Set();
    const patterns = [
      /\bno\s+more\s+([a-z]+)/g,
      /\bno\s+([a-z]+)/g,
      /\bwithout\s+([a-z]+)/g,
      /\bdo\s?n'?t\s+want\s+(?:any\s+)?([a-z]+)/g,
      /\bdon'?t\s+like\s+([a-z]+)/g,
      /\bavoid\s+([a-z]+)/g,
      /\bhold\s+the\s+([a-z]+)/g,
      /\bskip\s+(?:the\s+)?([a-z]+)/g,
      /\bnot?\s+(?:a\s+|any\s+)?fan\s+of\s+([a-z]+)/g,
      /\ballergic\s+to\s+([a-z]+)/g
    ];
    for (const re of patterns) {
      let match;
      while ((match = re.exec(lower)) !== null) {
        let word = match[1];
        if (!word || NEGATION_STOP.has(word)) continue;
        if (word.endsWith('s') && NEGATION_SYNONYMS[word.slice(0, -1)]) word = word.slice(0, -1);
        const expanded = NEGATION_SYNONYMS[word] || [word];
        expanded.forEach(term => blocked.add(term));
      }
    }
    return blocked;
  }

  matchesBlocked(suggestion, blocked) {
    const hay = (suggestion.searchText
      || [suggestion.name, suggestion.description, suggestion.category, suggestion.subcategory, suggestion.categoryType]
        .filter(Boolean).join(' ')).toLowerCase();
    for (const term of blocked) {
      if (hay.includes(term)) return true;
    }
    return false;
  }

  async cartRecommendations(payload = {}) {
    const cart = this.readCart(payload);
    const recs = await this.recommend({ cart, limit: 8, reason: payload.reason });
    const cartNames = new Set(cart.map(c => normalizeName(c.name)));

    // Phase 3C: the waiter upsell reads the SAME composed reason as the cards and
    // chat (authored hero → chef → tag-true Tier-2 → never blank). One copy source.
    const recommendations = recs
      .filter(r => !cartNames.has(normalizeName(r.name)))
      .slice(0, 4)
      .map(r => ({
        name: r.name,
        price: r.price,
        img: r.img,
        categoryType: r.categoryType,
        story: r.story || '',
        reason: r.reason || '',
        upsell: Math.round(Number(r.price) || 0),
        // Phase 4 analytics attribution.
        source_title: r.source_title || '',
        rotationGroup: r.rotationGroup || '',
        chef: r.chef === true
      }));

    const eventRec = null;

    const potentialUplift = recommendations.reduce((sum, r) => sum + r.upsell, 0);
    return { recommendations, eventRec, potentialUplift };
  }

  // Phase 3C: waiter-only "ordered together" — counted co-occurrence over real
  // order history + a flavour why. Never customer-facing (waiter-auth route).
  async orderedTogether(payload = {}) {
    const cart = this.readCart(payload);
    const [menuContext, orderRecords] = await Promise.all([this.getMenuContext(), this.getOrderRecords()]);
    const recommendations = computeOrderedTogether(cart, orderRecords, menuContext, { limit: Number(payload.limit) || 4 });
    return { recommendations };
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
      const recs = await this.recommend({ cart, limit: 3, menuContext });
      recs.forEach(item => add(item));
    }

    const publicSuggestions = suggestions.filter(Boolean).slice(0, 5).map(item => publicItem(item, 'Combo builder'));
    return {
      reply: this.buildSuggestionReply(publicSuggestions, 'I would build the table around'),
      suggestions: publicSuggestions
    };
  }

  async buildPairingReply(menuContext, lower, payload = {}, session = null) {
    const cart = this.readCart(payload);
    let mentioned = findMentionedItem(menuContext, payload.message || lower);
    // Phase 3B: "a wine for it" — resolve "it" from the remembered anchor dish.
    if (!mentioned && cart.length === 0 && session && session.anchorDish) {
      mentioned = session.anchorDish;
    }
    const cartItems = mentioned ? [mentioned, ...cart] : cart;
    const suggestions = await this.recommend({
      cart: cartItems,
      limit: 4,
      reason: payload.message || lower,
      menuContext
    });

    // Phase 3B: "a wine for it" — return a colour-appropriate wine (crisp white
    // for seafood), not a mixed plate. Resolves "it" from the remembered anchor.
    if (/\bwine\b|\bcellar\b/.test(lower)) {
      const isCrisp = x => x && x.tags && ['white', 'sparkling', 'rose'].includes(x.tags.drinkType);
      const anchorSeafood = mentioned && mentioned.tags && Array.isArray(mentioned.tags.protein) && mentioned.tags.protein.includes('seafood');
      let wines = suggestions.filter(s => s.categoryType === 'WINE');
      if (anchorSeafood) {
        const crisp = wines.filter(isCrisp);
        wines = (crisp.length ? crisp : crispWhites(menuContext.items).slice(0, 4).map(w => publicItem(w, 'Crisp white')));
      }
      if (wines.length === 0) wines = (menuContext.categorized.WINE || []).slice(0, 3).map(w => publicItem(w, 'Cellar selection'));
      wines = wines.slice(0, 4);
      const lead = mentioned ? `For the ${mentioned.name}, from the cellar I'd pour` : 'From the cellar I would pour';
      return { reply: this.buildSuggestionReply(wines, lead), suggestions: wines };
    }

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

  async buildWineReply(menuContext, lower, payload = {}) {
    const wineSuggestions = await this.recommend({
      cart: Array.isArray(payload.cart) ? payload.cart : [],
      limit: 6,
      reason: payload.message || lower,
      menuContext
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

  // Phase 3A: a short, intent-shaped lead-in for tag-matched suggestions.
  intentLead(intent) {
    const s = (intent && intent.slots) || {};
    if (s.spice) return 'For a bit of heat, try';
    if (s.body === 'light') return 'Something on the lighter side —';
    if (s.body === 'full') return 'For a hearty plate —';
    if ((s.dietary || []).includes('vegan')) return 'Plant-based picks —';
    if ((s.dietary || []).length) return 'Vegetarian-friendly —';
    if (s.occasion === 'sharing') return 'Great for the table —';
    if (s.occasion === 'celebration') return "Let's make it special —";
    if (s.occasion === 'date') return 'For a memorable evening —';
    if (s.occasion === 'quick') return 'Quick and satisfying —';
    if ((s.proteinWanted || []).length) return `For ${s.proteinWanted[0]} lovers, I'd suggest`;
    return 'I would steer you toward';
  }

  // Phase 3B: resolve a swap — pick the newly-wanted dish from its tags, re-pair
  // it, drop a red carried over from the old anchor when moving to a lighter or
  // seafood plate, and say plainly what we're switching.
  async buildSwapReply(menuContext, intent, session, payload) {
    const slots = intent.slots || {};
    const hits = menuContext.items
      .map(item => ({ item, score: intentClassifier.tagScore(item.tags, slots) }))
      .filter(entry => entry.score > 0)
      .sort((left, right) => right.score - left.score);
    const newDish = (hits[0] && hits[0].item) || null;

    if (!newDish) {
      const suggestions = await this.recommend({ cart: this.readCart(payload), intent, menuContext, limit: 4 });
      return { reply: this.buildSuggestionReply(suggestions, 'How about'), suggestions };
    }

    const recs = await this.recommend({ cart: [newDish], intent, menuContext, limit: 6 });
    const goesLighter = (newDish.tags && Array.isArray(newDish.tags.protein) && newDish.tags.protein.includes('seafood'))
      || (slots.proteinWanted || []).includes('seafood') || slots.body === 'light';

    // Pick the new drink off tags.drinkType (never mistake a dish for a wine): a
    // crisp white/sparkling for a lighter/seafood swap, otherwise any wine pour.
    const isCrisp = x => x && x.tags && ['white', 'sparkling', 'rose'].includes(x.tags.drinkType);
    const isAnyWine = x => x && (x.categoryType === 'WINE' || (x.tags && ['white', 'sparkling', 'rose', 'red'].includes(x.tags.drinkType)));
    const newWine = goesLighter
      ? (recs.find(isCrisp) || crispWhites(menuContext.items)[0])
      : recs.find(isAnyWine);

    const prevWine = session && session.lastWine;
    const drinkClause = prevWine && newWine
      ? ` — and I'd switch the ${prevWine.name} for the ${newWine.name}`
      : newWine ? ` — with a glass of ${newWine.name}` : '';

    const foodRecs = recs.filter(rec => !isAnyWine(rec) && normalizeName(rec.name) !== normalizeName(newDish.name));
    const suggestions = [
      publicItem(newDish, 'Your swap'),
      ...(newWine ? [publicItem(newWine, 'Crisp pairing')] : []),
      ...foodRecs
    ].slice(0, 4);
    return { reply: `Good call — let's go with the ${newDish.name}${drinkClause}.`, suggestions };
  }

  // Phase 3B: warm, in-character decline for anything off the menu.
  buildOfftopicReply() {
    const name = (this.config && this.config.assistantName) || 'Donald';
    return {
      reply: `Ha — that one's a little beyond my table. I'm ${name}, your dining host: I can talk steaks, seafood, sushi, wines and pairings, or help you build the perfect meal. What are you in the mood for?`,
      suggestions: []
    };
  }

  // Phase 3B: cart-aware cross-sell lead ("you've got the carpaccio — add … or keep it light with …").
  cartAwareLead(cart, suggestions) {
    if (!Array.isArray(cart) || cart.length === 0 || !Array.isArray(suggestions) || suggestions.length === 0) {
      return null;
    }
    const anchor = cart[cart.length - 1].name;
    const add = suggestions[0] && suggestions[0].name;
    const light = suggestions.find(s => s.name !== add
      && (['STARTER', 'SALAD'].includes((s.tags && s.tags.course) || '') || s.categoryType === 'STARTER'));
    let line = `You've already got the ${anchor}`;
    if (add) line += ` — add the ${add}`;
    if (light && light.name !== add) line += `, or keep it light with the ${light.name}`;
    return `${line}.`;
  }

  async aiPairing(payload = {}) {
    const rawItem = payload.item || payload.selectedItem || payload.name || payload.cart?.[0];
    const menuContext = await this.getMenuContext();
    const item = typeof rawItem === 'string' ? fuzzyFindItem(menuContext, rawItem) : fuzzyFindItem(menuContext, rawItem?.name) || rawItem;
    const recs = await this.recommend({ cart: item ? [item] : [], limit: 6, menuContext });

    // Phase 3A: one shared copy layer (varietal notes, dish hooks, tag bridges,
    // chef-authored reason verbatim, never blank) — replaces the old bland templates.
    const enriched = await Promise.all(recs.map(async pairing => ({
      name: pairing.name,
      price: pairing.price,
      img: pairing.img,
      categoryType: pairing.categoryType,
      beverageKind: pairing.beverageKind,
      source_title: pairing.source_title,
      chef: pairing.chef === true,
      reason: await this.reason.pairingReason(pairing, item)
    })));

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
    // Perf (Phase 4, Task 5): reuse a caller-supplied menu context so a single
    // chat()/aiPairing() request doesn't load + rebuild the whole menu twice.
    const menuContext = payload.menuContext || await this.getMenuContext();
    const adminGroups = await this.fileService.loadRecommendations();
    const chefRecs = await this.fileService.loadChefRecommendations();
    const orderRecords = await this.getOrderRecords();
    const popularity = await this.getPopularityScores(menuContext, orderRecords);

    const cartNames = cart.map(item => normalizeName(item.name));
    const seen = new Set(cartNames);
    const candidates = [];

    const addCandidate = (item, source, score, extra = {}) => {
      if (!item?.name) {
        return;
      }

      const key = normalizeName(item.name);
      if (seen.has(key)) {
        return;
      }

      candidates.push({ item, source, score, ...extra });
      seen.add(key);
    };

    // 1) CHEF-FIRST. Per-item chef recommendations win outright (score band
    //    1000 + priority, far above any algorithmic source). When several chef recs
    //    share a rotationGroup, the rotation engine varies which one leads per guest.
    if (Array.isArray(chefRecs) && chefRecs.length && cartNames.length) {
      chefRecs
        .filter(rec => cartNames.includes(normalizeName(rec.sourceName)) && rec.targetAvailable !== false)
        .forEach(rec => {
          const target = fuzzyFindItem(menuContext, rec.targetName);
          if (!target) {
            return;
          }
          addCandidate(target, rec.reason || "Chef's pairing", 1000 + (Number(rec.priority) || 0), {
            chef: true,
            recType: rec.recType,
            beverageKind: rec.beverageKind,
            priority: Number(rec.priority) || 100,
            rotationGroup: rec.rotationGroup || `chef:${normalizeName(rec.sourceName)}:${rec.recType}`,
            reason: rec.reason || ''
          });
        });
    }

    // 2) Legacy admin recommendation groups (kept as a mid-tier fallback below chef).
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

    // 2.4) Phase 3C: AUTHORED HERO pairings. When the cart holds a hero dish,
    //      prefer its authored varietals — boost the in-stock bottles of each
    //      varietal (rotationService rotates them). Band below chef, above all else.
    if (this.hero && this.hero.ready && cart.length) {
      this.addHeroPairings(cart, menuContext, addCandidate);
    }

    // 2.5) Phase 3A: tag-aware matching. When the chat intent carries attribute/
    //      dietary/occasion slots (spicy/light/seafood/veg/football…), match the
    //      Phase-2 metadata.tags directly — a high band, below chef, above the
    //      generic algorithmic sources. No-op when the menu isn't enriched.
    if (payload.intent && intentClassifier.hasAttributeSlots(payload.intent.slots || {})) {
      this.addTagMatches(payload.intent, menuContext, addCandidate);
    }

    // 3) Algorithmic fallback sources — only fill what chef curation did not cover.
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

    // 4) Rotation (variety, priority-weighted, deterministic) → category safety.
    //    Resolve cart items to their authoritative menu classification first, since
    //    raw cart items carry only a name (e.g. "MOËT & CHANDON BRUT" is only WINE
    //    once resolved against its category) — the safety rules depend on this.
    const enrichedCart = cart.map(c => {
      const match = fuzzyFindItem(menuContext, c.name);
      const ct = match?.categoryType || classifier.categoryType(c.name);
      return {
        name: c.name,
        categoryType: ct,
        beverageKind: ct === 'WINE' ? 'WINE' : ct === 'DRINK' ? classifier.beverageKind(match || c.name) : 'NONE'
      };
    });
    const { ordered } = this.rotation.rotate(candidates, payload);
    const { kept } = this.rules.applyCategorySafety(ordered, enrichedCart);

    // Phase 3A: enforce a dietary request as a hard constraint — meat must never
    // reach a vegetarian/vegan result, even from the popular/backfill sources.
    // Never returns empty (falls back to the unfiltered set if nothing qualifies).
    let finalKept = kept;
    const wantDiet = payload.intent && payload.intent.slots && payload.intent.slots.dietary;
    if (Array.isArray(wantDiet) && wantDiet.length) {
      const filtered = kept.filter(candidate => dietaryOk(candidate.item, wantDiet));
      if (filtered.length) finalKept = filtered;
    }

    // Phase 3C: ONE copy source. Compose every result's reason via reasonComposer
    // (authored hero → chef → tag-true Tier-2 → never-blank), anchored to the
    // primary food dish in the cart so a hero dish renders its varietal's line.
    const sourceDish = cart
      .map(c => fuzzyFindItem(menuContext, c.name))
      .find(m => m && !['WINE', 'DRINK'].includes(m.categoryType)) || null;

    const out = [];
    for (const candidate of finalKept.slice(0, recommendationLimit)) {
      const pub = publicItem(candidate.item, candidate.source);
      pub.beverageKind = candidate.beverageKind && candidate.beverageKind !== 'NONE'
        ? candidate.beverageKind
        : (pub.categoryType === 'WINE' ? 'WINE' : pub.categoryType === 'DRINK' ? classifier.beverageKind(candidate.item) : 'NONE');
      if (candidate.reason) pub.reason = candidate.reason;
      pub.chef = candidate.chef === true;
      // Phase 4: carry the rotation group through so analytics can attribute
      // impressions/clicks to the group the engine drew from.
      pub.rotationGroup = candidate.rotationGroup || '';
      pub.reason = await this.reason.pairingReason(pub, sourceDish);
      out.push(pub);
    }
    return out;
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

  // Phase 3A: score every menu item against the chat intent's slots using the
  // Phase-2 metadata.tags, and add the strongest as high-priority candidates.
  // Occasion intents also nudge in an archetype drink (football→beer, etc.).
  addTagMatches(intent, menuContext, addCandidate) {
    const slots = intent.slots || {};

    menuContext.items
      .map(item => ({ item, score: intentClassifier.tagScore(item.tags, slots) }))
      .filter(entry => entry.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, 8)
      .forEach(({ item, score }) => addCandidate(item, 'Matched to your taste', 200 + score));

    // Phase 3C: occasion archetype from the authored occasions block — boost the
    // curated lead-with dishes and the occasion's drinks (football → Castle +
    // sharing plates, celebration → bubbles, date → Cab/Pinot, group → platter).
    if (slots.occasion && this.hero && this.hero.ready) {
      const arch = this.hero.archetypeFor(slots.occasion);
      if (arch) {
        arch.leadWith.forEach((dishName, i) => {
          const item = this.hero.itemsForDishName(menuContext.items, dishName)[0];
          if (item) addCandidate(item, 'Made for the occasion', 270 - i);
        });
        arch.drinkKeys.forEach((vk, i) => {
          const bottle = this.hero.bottlesOfVarietal(menuContext.items, vk)[0];
          if (bottle) addCandidate(bottle, 'Goes with the moment', 250 - i);
        });
      }
    }
  }

  // Phase 3C: boost the in-stock bottles of a hero dish's authored varietals so
  // the drink recommended for that dish is its sommelier pairing. All of a dish's
  // hero bottles share ONE rotation group, so rotationService rotates across the
  // varietals (Cabernet ↔ Shiraz) and the bottles within them. Band 1200 — above
  // the legacy chef-rec table (these authored heroes are the source of truth now).
  addHeroPairings(cart, menuContext, addCandidate) {
    for (const line of cart) {
      const src = fuzzyFindItem(menuContext, line.name);
      if (!src) continue;
      const dish = this.hero.dishFor(src.name, src.tags || {});
      if (!dish) continue;
      const group = `hero:${normalizeName(dish.dish)}`;
      dish.varietals.forEach(v => {
        if (!v.key) return;
        const score = v.tier === 'hero' ? 1200 : 1150;
        this.hero.bottlesOfVarietal(menuContext.items, v.key).forEach(bottle => {
          addCandidate(bottle, 'Chef pairing', score, {
            chef: true,
            rotationGroup: group,
            priority: v.tier === 'hero' ? 100 : 80
          });
        });
      });
    }
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
