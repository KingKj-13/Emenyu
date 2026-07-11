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
const { SmartPairingEngine } = require('./smartPairingEngine');
const scoring = require('./recommendationScoring');
// Phase 4 (Recommendation Engine V2) additions — additive, do not change any
// existing candidate-generation/ranking behaviour by themselves.
const { createMealStateService } = require('./mealStateService');
const { createBusinessRules } = require('./businessRules');
const { createRecommendationMemory } = require('./recommendationMemory');
const { createItemGraph } = require('./itemGraph');
const candidateFilterPipeline = require('./candidateFilterPipeline');
const gaspardVoice = require('./nlg/gaspardVoice');
const { resolveDayPart } = require('../utils/dayPartResolver');
const fs = require('fs');
const path = require('path');

// Phase 4 (Recommendation Engine V2): loaded from knowledge/occasion_rules.json
// (specialWords), the single authoritative source — not duplicated here.
function loadSpecialWords() {
  try {
    const file = path.join(__dirname, '..', '..', 'knowledge', 'occasion_rules.json');
    const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
    if (Array.isArray(data.specialWords) && data.specialWords.length) return data.specialWords;
  } catch (error) {
    // fall through to the fallback below
  }
  return ['birthday', 'anniversary', 'event', 'celebration', 'party', 'gathering', 'festival', 'ceremony', 'function', 'occasion', 'milestone', 'achievement', 'engagement', 'wedding', 'proposal', 'graduation', 'farewell', 'retirement', 'promotion', 'date'];
}
const SPECIAL_WORDS = loadSpecialWords();

// Phase 4 (Recommendation Engine V2): per-stage intensity scores loaded from
// knowledge/upsell_timing.json — the single authoritative source for
// addCourseCompletions()'s stage-score constants (title strings/pools/filter
// functions stay in code, only the numeric intensity moved to data).
function loadUpsellTiming() {
  const fallback = { drink: 74, food: 78, wine: 76, upgrade: 1150, dessert: 66, coffee: 60, digestif: 56 };
  try {
    const file = path.join(__dirname, '..', '..', 'knowledge', 'upsell_timing.json');
    const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
    const byStage = {};
    (data.stages || []).forEach(s => { if (s.stage && Number.isFinite(s.intensity)) byStage[s.stage] = s.intensity; });
    return { ...fallback, ...byStage };
  } catch (error) {
    return fallback;
  }
}
const UPSELL_TIMING = loadUpsellTiming();

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
  // "shellfish" is one of the most common real allergy words guests actually
  // say ("I'm allergic to shellfish") and previously had NO entry here at
  // all, so it fell through to the single literal word "shellfish" — which
  // never appears in any menu item's text (the data uses "Seafood"/dish
  // names), silently defeating the exclusion. Same list as `seafood` below.
  seafood: ['seafood', 'shellfish', 'prawn', 'prawns', 'calamari', 'squid', 'mussel', 'mussels', 'oyster', 'oysters', 'fish', 'salmon', 'kingklip', 'hake', 'sole', 'sushi', 'sashimi', 'linefish', 'crayfish', 'lobster', 'crab', 'clam', 'clams', 'scallop', 'scallops'],
  shellfish: ['seafood', 'shellfish', 'prawn', 'prawns', 'calamari', 'squid', 'mussel', 'mussels', 'oyster', 'oysters', 'crayfish', 'lobster', 'crab', 'clam', 'clams', 'scallop', 'scallops'],
  crustacean: ['prawn', 'prawns', 'crayfish', 'lobster', 'crab'],
  fish: ['fish', 'salmon', 'kingklip', 'hake', 'sole', 'linefish', 'sushi', 'sashimi'],
  prawn: ['prawn', 'prawns'],
  prawns: ['prawn', 'prawns'],
  // "egg" also had no entry — an "allergic to eggs" exclusion fell through to
  // the literal word "egg", missing dishes that contain egg without naming it.
  egg: ['egg', 'eggs', 'benedict', 'mayo', 'mayonnaise', 'aioli', 'hollandaise', 'meringue'],
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
    availability: item.availability || 'available',
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

// Full-bodied reds for a red-meat pairing -- the classic counterpart to
// crispWhites() above. Without this, a generic "what wine pairs with steak"
// question (no specific dish named, so nothing to read a protein tag from)
// fell through to whatever wines happened to be listed first in the menu
// data -- which could easily be Champagne/MCC if that's how the wine list
// is ordered, producing exactly the wrong classic pairing for red meat.
function fullBodiedReds(items = []) {
  return items.filter(item => item.tags && item.tags.drinkType === 'red');
}

// A specific dish (`mentioned`) carries its own protein tag, but a generic
// category question -- "what wine pairs with steak?" -- never resolves to a
// specific menu item (findMentionedItem() requires the message to contain a
// dish's full name), so `mentioned` stays null and there's nothing to read a
// tag from. This falls back to recognizing the spoken protein word itself.
function proteinFromMessage(mentioned, lower) {
  if (mentioned && Array.isArray(mentioned.tags?.protein) && mentioned.tags.protein.length) {
    return mentioned.tags.protein;
  }
  if (/\b(steak|beef|rump|fillet|ribeye|tomahawk|sirloin|red meat|oxtail|biltong)\b/.test(lower)) return ['beef'];
  if (/\b(lamb|game|venison)\b/.test(lower)) return ['lamb'];
  if (/\b(seafood|shellfish|prawn|prawns|calamari|squid|mussel|oyster|fish|salmon|kingklip|hake|sole|sushi|sashimi)\b/.test(lower)) return ['seafood'];
  if (/\bchicken\b/.test(lower)) return ['chicken'];
  if (/\bpork\b/.test(lower)) return ['pork'];
  return [];
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
    this.smartPairings = new SmartPairingEngine(config, { logger });

    // Phase 4 (Recommendation Engine V2): meal-state model, business/frequency
    // rules, per-table recommendation memory, and the unified item graph.
    // Additive — nothing above this line changes; recommend()/chat() opt into
    // these below rather than having their existing logic replaced.
    this.mealStates = createMealStateService();
    this.businessRules = createBusinessRules();
    this.recoMemory = createRecommendationMemory({ businessRules: this.businessRules, logger });
    this.itemGraph = createItemGraph({ marketBasket: { computeOrderedTogether } });

    // Perf: the recommendation/chat path used to reload the whole menu, every
    // order + history record, the admin/chef recs and recompute popularity on
    // EVERY recommend() call — and a single chat() fans out several recommend()
    // calls. On a large order history the popularity loop also blocks the event
    // loop (starving unrelated requests like staff login). These derived datasets
    // change rarely relative to request rate, so we memoize them with a short TTL
    // and a stale-while-revalidate refresh: a request never waits on a recompute
    // (after warm-up); the refresh runs in the background and swaps in atomically.
    this._cache = new Map();
    this._cacheTtlMs = Number(process.env.TRUMP_RECO_CACHE_TTL_MS) || 30000;
  }

  // Memoize an async producer with stale-while-revalidate semantics. Concurrent
  // cold misses are de-duplicated via a shared in-flight promise; once warm, a
  // call past the TTL returns the stale value immediately and refreshes in the
  // background, so request latency is unaffected by the recompute cost.
  _cached(key, producer) {
    const entry = this._cache.get(key);
    if (entry && 'value' in entry) {
      if (Date.now() >= entry.expiresAt && !entry.refreshing) {
        entry.refreshing = true;
        Promise.resolve()
          .then(producer)
          .then(value => this._cache.set(key, { value, expiresAt: Date.now() + this._cacheTtlMs, refreshing: false }))
          .catch(error => { entry.refreshing = false; this.logger?.debug?.('reco_cache_refresh_failed', { key, error: error?.message }); });
      }
      return Promise.resolve(entry.value);
    }
    if (entry && entry.inflight) {
      return entry.inflight;
    }
    const inflight = Promise.resolve()
      .then(producer)
      .then(value => { this._cache.set(key, { value, expiresAt: Date.now() + this._cacheTtlMs, refreshing: false }); return value; })
      .catch(error => { this._cache.delete(key); throw error; });
    this._cache.set(key, { inflight });
    return inflight;
  }

  // Drop all memoized reco datasets — call after a menu/order/recs write so the
  // next request rebuilds from fresh data instead of waiting out the TTL.
  invalidateCaches() {
    this._cache.clear();
  }

  // Prime the caches off the request path (called once after the server binds)
  // so the very first guest request is already fast.
  async warmCaches() {
    try {
      await Promise.all([this.getCachedRecommendations(), this.getCachedChefRecommendations()]);
      await this.getPopularity();
    } catch (error) {
      this.logger?.debug?.('reco_cache_warm_failed', { error: error?.message });
    }
  }

  async getMenuContext() {
    return this._cached('menuContext', async () => buildMenuContext(await this.fileService.loadMenu()));
  }

  // Cached admin recommendation groups + per-item chef recs (one DB read each
  // per TTL window instead of one per recommend() call).
  getCachedRecommendations() {
    return this._cached('adminRecs', () => this.fileService.loadRecommendations());
  }

  getCachedChefRecommendations() {
    return this._cached('chefRecs', () => this.fileService.loadChefRecommendations());
  }

  // Popularity is a name-keyed score map derived from the (cached) menu + orders;
  // computing it is the heaviest synchronous work, so it gets its own cache entry.
  getPopularity() {
    return this._cached('popularity', async () => {
      const [menuContext, orderRecords] = await Promise.all([this.getMenuContext(), this.getOrderRecords()]);
      return this.getPopularityScores(menuContext, orderRecords);
    });
  }

  // Phase 1 (Recommendation Brain): course-attach-rate-derived tier weights
  // (dessert promoted when measurably under-ordered vs the other courses).
  // Cached alongside popularity — same inputs, same refresh cadence.
  getTierWeights() {
    return this._cached('tierWeights', async () => {
      const [menuContext, orderRecords] = await Promise.all([this.getMenuContext(), this.getOrderRecords()]);
      return scoring.tierWeights(orderRecords, menuContext.byName);
    });
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
      // Phase 4 (business_rules.json "timing:never-interrupt-to-upsell"): a
      // guest asking about hours/policy/allergens is mid-question about
      // something else entirely — riding an unrelated upsell along on the
      // answer is exactly the interruption the spec warns against.
      responseData = {
        reply: knowledgeAnswer.reply,
        suggestions: this.businessRules.shouldSuppressProactive('info')
          ? []
          : (knowledgeAnswer.suggestions || []).map(item => publicItem(item, 'From our kitchen'))
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
        menuContext,
        excludeNames: session.ignoredNames
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
        excludeNames: session.ignoredNames,
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

    // Phase 1 (Recommendation Brain): occasion detection from a CART SIGNAL, not
    // just words — a guest adding a sparkling/Champagne pour without having said
    // anything about an occasion is the brief's own example. Ask once per
    // conversation (derived from history, no new state) and only when the guest
    // hasn't already told us the occasion this turn.
    if (!intent.slots.occasion && !intent.slots.occasionDetail) {
      const occasionPrompt = this.celebratoryOccasionPrompt(cart, menuContext, payload.history);
      if (occasionPrompt) {
        responseData = { ...responseData, reply: `${occasionPrompt} ${responseData.reply || ''}`.trim() };
      }
    }

    // Persona voice swap (AD-005): reuses the exact suggestions the scoring
    // engine above already decided on — only the WORDING changes. Runs last,
    // after exclusion-filtering and the occasion prompt, so Gaspard always
    // talks about the final, real suggestion set, never a pre-filtered one.
    if (this.config?.assistantPersona === 'gaspard') {
      const dayParts = await this.fileService.loadDayParts();
      const dayPart = dayParts.length > 0 ? resolveDayPart(dayParts) : null;
      const isFirstTurn = !(Array.isArray(payload.history) && payload.history.length > 0);
      responseData = {
        ...responseData,
        reply: gaspardVoice.composeReply({
          message,
          suggestions: responseData.suggestions || [],
          dayPart,
          isFirstTurn
        })
      };
    }

    // Chat logging is a side effect, not part of the guest-facing reply --
    // `responseData` above is already a complete, successfully-computed
    // answer. appendChatLog() does an unlocked read-modify-write on one
    // shared chat_logs.json file (every table's every turn), so concurrent
    // chat requests can race on the rename step and intermittently throw
    // (observed as EPERM/EBUSY on Windows). Previously that error propagated
    // up through this unguarded `await`, discarding the already-good reply
    // and surfacing as a fake "chat failed" error to the guest -- an
    // identical retry then succeeded once the contention window passed,
    // because the reply computation itself was never the problem.
    try {
      await this.appendChatLog(requestBody, responseData);
    } catch (error) {
      this.logger?.warn?.('appendChatLog failed (non-fatal, reply still returned)', { error: error?.message });
    }
    return responseData;
  }

  // Phase 1 (Recommendation Brain): last cart line resolves to a sparkling/
  // Champagne pour, and we haven't already asked this conversation.
  celebratoryOccasionPrompt(cart, menuContext, history) {
    if (!Array.isArray(cart) || cart.length === 0) return null;
    const last = cart[cart.length - 1];
    const resolved = fuzzyFindItem(menuContext, last?.name) || last;
    const text = `${resolved?.name || ''} ${resolved?.category || ''} ${resolved?.subcategory || ''}`.toLowerCase();
    const isCelebratory = resolved?.categoryType === 'WINE' && /champagne|sparkling|cap classique|\bmcc\b|prosecco/.test(text);
    if (!isCelebratory) return null;

    const alreadyAsked = (Array.isArray(history) ? history : []).some(
      msg => msg?.role === 'assistant' && typeof msg.content === 'string' && /celebrating something/i.test(msg.content)
    );
    if (alreadyAsked) return null;

    return 'Are you celebrating something tonight?';
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
    // Defense-in-depth: also check the structured protein/dietary tags
    // enrich-menu-tags.js writes on every item (e.g. protein: ["seafood"]),
    // not just free text — a dish can be a genuine match (a squid/prawn dish
    // tagged protein: ["seafood"]) without the blocked word ever appearing
    // literally in its name/description/category text.
    const tagValues = [
      ...((suggestion.tags && suggestion.tags.protein) || []),
      ...((suggestion.tags && suggestion.tags.dietary) || [])
    ];
    for (const term of blocked) {
      if (hay.includes(term)) return true;
      if (tagValues.includes(term)) return true;
    }
    return false;
  }

  async cartRecommendations(payload = {}) {
    const cart = this.readCart(payload);
    const [menuContext, recs] = await Promise.all([
      this.getMenuContext(),
      // tableId threaded through so recoMemory's "recently ignored"/session
      // suppression (already built, otherwise dormant for this endpoint) can
      // actually apply here — previously silently dropped, so a card the
      // waiter had just ignored could resurface on the very next cart refetch.
      this.recommend({ cart, limit: 8, reason: payload.reason, guestIntel: payload.guestIntel, tableId: payload.tableId })
    ]);
    const cartNames = new Set(cart.map(c => normalizeName(c.name)));
    const csvRecs = this.smartPairings.recommend({ cart, menuContext, limit: 4 });

    // Phase 2.5 (Hospitality Intelligence): the same food/wine cart anchors
    // recommend() resolves internally for pairingReason() — recomputed here
    // (cheap, cart is tiny) so upsellScript can build the SAME tag-driven WHY
    // clause for its Professional/Friendly/Luxury scripts, not a separate one.
    const anchorDish = cart
      .map(c => fuzzyFindItem(menuContext, c.name))
      .find(m => m && !['WINE', 'DRINK'].includes(m.categoryType)) || null;
    const anchorWine = cart
      .map(c => fuzzyFindItem(menuContext, c.name))
      .find(m => m && m.categoryType === 'WINE') || null;

    // csvRecs' `.reason` comes straight from the CSV's own `reasoning` column —
    // a completely separate, formulaic wording system that bypasses
    // reasonComposer/heroPairings entirely (verified: the same sentence repeats
    // verbatim across unrelated dishes in the source CSVs). Recompute it through
    // the same composer `recs` already uses, so both sources sound alike. Clear
    // the CSV text first — pairingReason's Tier-1b returns an existing
    // `target.reason` verbatim (by design, for genuinely authored overrides), so
    // leaving the CSV string in place would make the recompute a no-op.
    await Promise.all(csvRecs.map(async item => {
      const isBev = ['WINE', 'DRINK'].includes(item.categoryType);
      const anchor = isBev ? anchorDish : (anchorWine || anchorDish);
      item.reason = await this.reason.pairingReason({ ...item, reason: '' }, anchor, { cartWine: anchorWine });
    }));

    // Phase 3C: the waiter upsell reads the SAME composed reason as the cards and
    // chat (authored hero → chef → tag-true Tier-2 → never blank). One copy source.
    let merged = [...csvRecs, ...recs]
      .filter(r => !cartNames.has(normalizeName(r.name)))
      .filter((r, index, list) => list.findIndex(x => normalizeName(x.name) === normalizeName(r.name)) === index);

    // csvRecs (SmartPairingEngine) has no beverage-primacy logic of its own,
    // unlike `recs` (which already passed recommendationRules.applyCategorySafety's
    // "max one primary beverage" rule). If both independently name a different
    // wine/drink for the same cart, keep only the already-safety-checked one from
    // `recs` — otherwise the waiter can see two wine recommendations for one steak.
    const isBevCandidate = r => ['WINE', 'DRINK'].includes(r.categoryType);
    if (recs.some(isBevCandidate)) {
      const safeBevNames = new Set(recs.filter(isBevCandidate).map(r => normalizeName(r.name)));
      merged = merged.filter(r => !isBevCandidate(r) || safeBevNames.has(normalizeName(r.name)));
    }

    // Luxury tables: surface chef-picks and higher-priced items first, so the
    // 4-item cut favours the premium end of the menu rather than whatever
    // scored highest for the general (price-agnostic) standard-table pipeline.
    if (payload.mode === 'luxury') {
      merged = [...merged].sort((a, b) => {
        const chefDelta = (b.chef === true ? 1 : 0) - (a.chef === true ? 1 : 0);
        return chefDelta || (Number(b.price) || 0) - (Number(a.price) || 0);
      });
    }

    const candidates = merged.slice(0, 4);

    // Phase 2 (Waiter Experience): the waiter picks a delivery style per guest —
    // reuse the SAME nlgService/templateNlgProvider tones already built for the
    // AI Table Coach (postCoach), not a second wording system. "Friendly" maps to
    // the existing 'casual' tone (there is no separate 'friendly' tone).
    const recommendations = await Promise.all(candidates.map(async r => {
      // Script the waiter can say out loud. Name the dish it pairs from (CSV
      // source) and fold in the pairing reasoning when we have it.
      const from = r.pairedWith || cart[0]?.name || 'your order';
      const why = r.reason ? ` ${r.reason}` : '';
      // Phase 1 (Recommendation Brain): the "uplift" a waiter is coached to
      // expect must be the replacement-aware delta, not the new item's full
      // price — a same-role swap (e.g. Wine A -> Wine B) only nets the difference.
      const netIncrease = r.netRevenueIncrease ?? r.price;
      const isBev = ['WINE', 'DRINK'].includes(r.categoryType);
      const anchor = isBev ? anchorDish : (anchorWine || anchorDish);
      const scriptData = {
        suggestedItem: { name: r.name, price: r.price, categoryType: r.categoryType, tags: r.tags },
        forItem: anchor ? { name: anchor.name, categoryType: anchor.categoryType, tags: anchor.tags } : null
      };
      const [professional, friendly, luxury] = await Promise.all([
        this.nlgService.phrase({ kind: this.nlgService.KINDS.UPSELL_SCRIPT, tone: 'professional', data: scriptData }),
        this.nlgService.phrase({ kind: this.nlgService.KINDS.UPSELL_SCRIPT, tone: 'casual', data: scriptData }),
        this.nlgService.phrase({ kind: this.nlgService.KINDS.UPSELL_SCRIPT, tone: 'luxury', data: scriptData })
      ]);
      const fallbackScript = `I see you have the ${from} — many guests pair it with our ${r.name}.${why}`;
      return {
        name: r.name,
        price: r.price,
        img: r.img,
        categoryType: r.categoryType,
        story: r.story || '',
        reason: r.reason || '',
        script: fallbackScript,
        scripts: {
          professional: professional || fallbackScript,
          friendly: friendly || fallbackScript,
          luxury: luxury || fallbackScript
        },
        upsell: Math.max(0, Math.round(Number(netIncrease) || 0)),
        confidence: r.confidence,
        expectedValue: r.expectedValue,
        replacement: r.replacement || null,
        // Phase 4 analytics attribution.
        source_title: r.source_title || '',
        rotationGroup: r.rotationGroup || '',
        chef: r.chef === true,
        relation: r.relation || ''
      };
    }));

    // Phase 2: expose the same cart-signal occasion detection chat() already
    // uses (Champagne/sparkling in cart, no words needed) so the waiter UI can
    // show an occasion badge without a second detector.
    const occasionPrompt = this.celebratoryOccasionPrompt(cart, menuContext, payload.history);

    const eventRec = null;

    const potentialUplift = recommendations.reduce((sum, r) => sum + r.upsell, 0);
    return { recommendations, eventRec, potentialUplift, occasionPrompt: occasionPrompt || null };
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
      const isRed = x => x && x.tags && x.tags.drinkType === 'red';
      // Resolves from the specific dish's protein tag when one was named
      // ("a wine for the calamari"), or from the spoken protein word itself
      // when it wasn't ("what wine pairs with steak?") -- see
      // proteinFromMessage()'s own comment for why `mentioned` alone isn't
      // enough to catch the generic-category case.
      const protein = proteinFromMessage(mentioned, lower);
      const anchorSeafood = protein.includes('seafood');
      const anchorRedMeat = protein.some(p => ['beef', 'lamb', 'pork'].includes(p));
      let wines = suggestions.filter(s => s.categoryType === 'WINE');
      if (anchorSeafood) {
        const crisp = wines.filter(isCrisp);
        wines = (crisp.length ? crisp : crispWhites(menuContext.items).slice(0, 4).map(w => publicItem(w, 'Crisp white')));
      } else if (anchorRedMeat) {
        const reds = wines.filter(isRed);
        wines = (reds.length ? reds : fullBodiedReds(menuContext.items).slice(0, 4).map(w => publicItem(w, 'Full-bodied red')));
      }
      // Last-resort fallback (still no protein signal at all, e.g. "what
      // wine do you have") stays list order -- there's genuinely no pairing
      // logic to apply without something to pair against.
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
    // Phase 1 (Recommendation Brain): occasionDetail is a refinement of the
    // coarse `occasion` bucket below — check it first so a stated birthday/
    // anniversary/etc gets a specific lead rather than the generic one.
    if (s.occasionDetail === 'birthday') return 'Happy birthday to someone at the table — let’s make it special —';
    if (s.occasionDetail === 'anniversary') return 'Congratulations on the anniversary — for a memorable toast —';
    if (s.occasionDetail === 'graduation') return 'Congratulations on the graduation — a fitting way to celebrate —';
    if (s.occasionDetail === 'business_dinner') return 'For a polished business dinner —';
    if (s.occasionDetail === 'sports_night') return 'Perfect for match night —';
    if (s.occasionDetail === 'family_dinner') return 'Great for a family dinner —';
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
    const name = (this.config && this.config.assistantName) || '🍷 Your Sommelier';
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

    // Phase 4 (Recommendation Engine V2): direct pairs_with/upgrade_of/add_on_to
    // edges from the unified item graph (spec 4.7), additive/optional so
    // existing clients that don't render it are unaffected. Capped to
    // one-hop-out from the item itself — a full multi-hop BFS through a
    // shared wine node fans out to many unrelated dishes that also pair with
    // it (noisy, not a meaningful "meal journey" chain), so it's not used here.
    const secondOrder = item?.name
      ? this.itemGraph.edgesFor(item.name)
          .slice(0, 6)
          .map(edge => ({ type: edge.type, source: edge.source, target: edge.target, note: edge.note }))
      : [];

    return {
      title: item?.name ? `Pairs with ${item.name}` : "Chef's Pick",
      description: item?.description || 'A confident table recommendation from the local menu.',
      foodPairings,
      drinkPairings,
      pairings: [...foodPairings, ...drinkPairings],
      secondOrder,
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
    const [adminGroups, chefRecs, orderRecords, popularity] = await Promise.all([
      this.getCachedRecommendations(),
      this.getCachedChefRecommendations(),
      this.getOrderRecords(),
      this.getPopularity()
    ]);

    const cartNames = cart.map(item => normalizeName(item.name));
    const seen = new Set(cartNames);
    // Phase 1 (Recommendation Brain): "wait before suggesting something else" —
    // chatSession derives which names the guest just ignored (suggested last turn,
    // not added, not asked about again); recommend() simply excludes them from
    // this turn's candidates rather than tracking any new state itself.
    (Array.isArray(payload.excludeNames) ? payload.excludeNames : []).forEach(name => seen.add(normalizeName(name)));
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
    this.addCourseCompletions(cartNames, menuContext, addCandidate, popularity, seen);
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
    // Phase 1 (Recommendation Brain) — Replacement Logic: tag beverage candidates
    // that are a same-role UPGRADE of something already in the cart (same
    // categoryType/beverageKind) so the category-safety rules below treat them as
    // a swap, not an addition (R4/R1 exist to stop beverage PILE-UP, not to block
    // a guest trading up their current pour). Food-course candidates are untouched
    // — R5/R7 already handle those via the chef bypass.
    candidates.forEach(candidate => {
      const ct = candidate.item?.categoryType || classifier.categoryType(candidate.item);
      if (ct === 'WINE' || ct === 'DRINK') {
        candidate.isReplacement = Boolean(scoring.findReplacementTarget(candidate.item, cart, menuContext.byName));
      }
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

    // Phase 1 (Recommendation Brain): guest-aware hard exclusion — an allergy/avoid
    // match never surfaces, regardless of how well it otherwise scores.
    const guestIntel = payload.guestIntel && payload.guestIntel.present ? payload.guestIntel : null;
    if (guestIntel) {
      const safeKept = finalKept.filter(candidate => !scoring.isAllergyMatch(candidate.item, guestIntel));
      if (safeKept.length) finalKept = safeKept;
    }

    // Phase 1 (Recommendation Brain): confidence + replacement-aware expected
    // value, then re-rank by (expectedValue × course tier weight) — Wine > Main >
    // Side > Dessert as a PRIOR, not a hard gate, so a high-EV dessert (measurably
    // under-ordered) can still outrank a low-EV wine. Chef recommendations keep
    // their existing "always wins" position — only the non-chef tail is re-ranked.
    const tierWeightMap = await this.getTierWeights();
    const scored = finalKept.map(candidate => ({
      candidate,
      brain: scoring.scoreCandidate({ candidate, cart, menuByName: menuContext.byName, guestIntel, weights: tierWeightMap })
    }));
    // Phase 3 (Dining Concierge): chef-tier candidates now come from two
    // sources (curated chefRecs AND the journey's own upgrade nudge) that can
    // both apply to the same dish, so this tier needs its OWN priority order
    // instead of relying on insertion order -- sorted by the same `score` every
    // chef candidate already carries (chefRecs' 1000+priority band; the
    // journey upgrade's score is set to compete on the same scale below).
    const chefScored = scored.filter(s => s.candidate.chef === true).sort((a, b) => b.candidate.score - a.candidate.score);
    const restScored = scored
      .filter(s => s.candidate.chef !== true)
      .sort((a, b) => b.brain.finalScore - a.brain.finalScore);
    finalKept = [...chefScored, ...restScored].map(s => ({ ...s.candidate, brain: s.brain }));

    // Phase 4 (Recommendation Engine V2): the candidate filter pipeline's
    // remaining steps (never-suggest-declined, no-dessert-before-mains,
    // no-wine-after-coffee, never-downsell, protein/structural conflict,
    // per-category cap, frequency/cooldown) — additive on top of the
    // existing chef/hero/tag/rotation/category-safety/dietary/allergy
    // filtering above, never replacing it. The quality/correctness steps
    // (5-8) always run; the frequency/cooldown step (9) only gates a call a
    // caller has explicitly flagged payload.proactive === true (an
    // unsolicited nudge, e.g. a future chat-initiated upsell) — recommend()
    // is called continuously by many existing surfaces (ItemModal pairings,
    // the cart upsell rail, waiter panel, etc.) that never set this flag
    // today, so the suggestion/frequency counters stay dormant for all of
    // them rather than silently emptying an always-on panel a guest expects
    // to see something in.
    const tableId = payload.tableId || payload.deviceId || null;
    const pipelineResult = candidateFilterPipeline.runPipeline({
      candidates: finalKept,
      cart,
      tableId,
      wantsValue: false,
      proactive: payload.proactive === true,
      memory: this.recoMemory,
      businessRules: this.businessRules,
      maxUnrelatedItems: this.businessRules.thresholds.maxUnrelatedItems
    });
    finalKept = pipelineResult.kept;

    // Phase 3C: ONE copy source. Compose every result's reason via reasonComposer
    // (authored hero → chef → tag-true Tier-2 → never-blank), anchored to the
    // primary food dish in the cart so a hero dish renders its varietal's line.
    const sourceDish = cart
      .map(c => fuzzyFindItem(menuContext, c.name))
      .find(m => m && !['WINE', 'DRINK'].includes(m.categoryType)) || null;
    // Recommendation Brain V2: for a dessert suggestion specifically, reference
    // BOTH what's already on the table (the dish AND the wine), not just one
    // anchor — "you've chosen seafood pasta and a Sauvignon Blanc, so..." reads
    // as an experienced waiter's observation, not a single-item lookup.
    const cartWine = cart
      .map(c => fuzzyFindItem(menuContext, c.name))
      .find(m => m && m.categoryType === 'WINE') || null;

    const out = [];
    for (const candidate of finalKept.slice(0, recommendationLimit)) {
      const pub = publicItem(candidate.item, candidate.source);
      pub.beverageKind = candidate.beverageKind && candidate.beverageKind !== 'NONE'
        ? candidate.beverageKind
        : (pub.categoryType === 'WINE' ? 'WINE' : pub.categoryType === 'DRINK' ? classifier.beverageKind(candidate.item) : 'NONE');
      if (candidate.reason) pub.reason = candidate.reason;
      pub.chef = candidate.chef === true;
      // Phase 1 (Recommendation Brain): confidence score, replacement-aware
      // expected value, and what (if anything) this recommendation would replace.
      if (candidate.brain) {
        pub.confidence = candidate.brain.confidence;
        pub.expectedValue = candidate.brain.expectedValue;
        pub.netRevenueIncrease = candidate.brain.netRevenueIncrease;
        pub.replacement = candidate.brain.replacement;
      }
      // Phase 4 (Recommendation Engine V2): named scoring components (H/P/R/
      // S/T/O/Pop/Chef/Pref/Pen, spec 4.3) and the confidence breakdown (spec
      // 4.6), exposed alongside the existing confidence/expectedValue fields
      // above — additive, informational; ranking above still uses finalScore.
      const currentState = this.mealStates.currentState(cart, menuContext.byName);
      const scoreComponents = scoring.computeScoreComponents({
        candidate,
        mealStateService: this.mealStates,
        currentState,
        popularity: (popularity.get(normalizeName(candidate.item?.name)) || 0) / Math.max(1, Math.max(...popularity.values(), 1)),
        guestIntel
      });
      pub.scoreComponents = scoreComponents;
      pub.confidenceBreakdown = scoring.computeConfidenceBreakdown({ candidate, scoreComponents });
      // Phase 4: carry the rotation group through so analytics can attribute
      // impressions/clicks to the group the engine drew from.
      pub.rotationGroup = candidate.rotationGroup || '';
      pub.reason = await this.reason.pairingReason(pub, sourceDish, { cartWine });
      out.push(pub);
    }

    // Phase 4 (Recommendation Engine V2): record this turn into the per-table
    // recommendation memory (spec 4.5) — never-re-suggest-rejected and
    // frequency/cooldown enforcement above read this on the NEXT call.
    if (tableId) {
      this.recoMemory.recordTurn(tableId, {
        cartNames: cart.map(c => c.name),
        suggestedNames: out.map(o => o.name),
        ignoredNamesThisTurn: Array.isArray(payload.excludeNames) ? payload.excludeNames : [],
        stage: this.mealStates.currentState(cart, menuContext.byName),
        proactive: payload.proactive === true
      });
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
      },
      {
        when: /beer|lager|cider|draught/,
        title: 'Goes great with a cold one',
        score: 86,
        keywords: ['wings', 'biltong', 'burger', 'snails', 'calamari']
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

  // Phase 3 (Dining Concierge): ONE clear "next best decision" per turn, driven
  // by scoring.nextJourneyStage — not a scattershot fill of every empty course.
  // Still reuses the exact same candidate pipeline (addCandidate -> Brain
  // scoring -> category-safety rules) that every other source here uses; this
  // just decides WHICH course gets the strongest push this turn, and stops
  // pushing anything once the journey (drink -> food -> wine -> upgrade ->
  // dessert -> coffee -> digestif) is complete, per product spec.
  addCourseCompletions(cartNames, menuContext, addCandidate, popularity, seen = new Set()) {
    const cartItems = cartNames.map(name => menuContext.byName.get(name)).filter(Boolean);
    const cartTypes = new Set(cartItems.map(item => item.categoryType));
    const mainDish = cartItems.find(it => ['MAIN', 'STARTER', 'SUSHI'].includes(it.categoryType)) || null;

    const upgrade = mainDish && this.hero && this.hero.ready
      ? this.hero.upgradeFor(mainDish.name, mainDish.tags || {})
      : null;
    const upgradeItem = upgrade ? fuzzyFindItem(menuContext, upgrade.to) : null;
    const upgradeAvailable = Boolean(upgradeItem && normalizeName(upgradeItem.name) !== normalizeName(mainDish?.name));
    const upgradeOffered = !upgradeAvailable || seen.has(normalizeName(upgradeItem.name));

    const stage = scoring.nextJourneyStage(
      cartNames.map(name => ({ name })),
      menuContext.byName,
      { upgradeAvailable, upgradeOffered }
    );

    if (stage === 'done') {
      return; // journey complete -- stop recommending, per product spec.
    }

    if (stage === 'upgrade') {
      if (upgradeItem) {
        // A same-role swap of the main already in the cart -- reuses the exact
        // Phase 1 Replacement Logic (isReplacement -> price-delta EV, bypasses
        // R5's "no second main", surfaces as "Replace X" on the card) rather
        // than a second, parallel "this is an upgrade" mechanism.
        // Also chef:true -- a curated upgrade nudge, not an algorithmic guess,
        // so it earns the SAME guaranteed-prominent placement every other
        // chef pairing gets (existing "chef always wins" ordering), rather
        // than competing on raw EV against everything else in the rest tier.
        addCandidate(upgradeItem, "Premium upgrade", UPSELL_TIMING.upgrade, {
          rotationGroup: `upgrade:${normalizeName(mainDish.name)}`,
          isReplacement: true,
          chef: true,
          // Tier 1b (reasonComposer): an explicit candidate.reason wins verbatim
          // over the generic tag-driven fallback, reusing heroPairings' own
          // upgrade note rather than inventing a second copy of it.
          reason: `If you'd like something even more memorable, I'd suggest the ${upgrade.to} — ${upgrade.note}.`
        });
      }
      return;
    }

    const pickFrom = (pool, title, score, filterFn) => {
      let options = [...pool].filter(item => !cartTypes.has(item.categoryType) || item.categoryType === 'DRINK');
      if (filterFn) options = options.filter(filterFn);
      options.sort((left, right) => (popularity.get(normalizeName(right.name)) || 0) - (popularity.get(normalizeName(left.name)) || 0));
      const top = options.slice(0, Math.min(5, options.length));
      const choice = top.length > 1 ? top[this.hashString(cartNames.join('|') + title) % top.length] : top[0];
      if (choice) addCandidate(choice, title, score);
    };

    if (stage === 'food') {
      pickFrom([...(menuContext.categorized.STARTER || []), ...(menuContext.categorized.MAIN || [])], 'Start with a starter or main', UPSELL_TIMING.food);
    } else if (stage === 'wine') {
      pickFrom(menuContext.categorized.WINE || [], 'Wine pairing', UPSELL_TIMING.wine);
    } else if (stage === 'drink') {
      // Restrict to primary beverage kinds (wine/cocktail/beer) — without this,
      // the pool included soft drinks/water/coffee, and if the popularity+hash
      // pick landed on one of those, R3 (recommendationRules.js) drops secondary
      // beverages from headlining outright, leaving the guest with no drink
      // candidate at all for this turn.
      pickFrom([...(menuContext.categorized.WINE || []), ...(menuContext.categorized.DRINK || [])], 'To start, something to drink', UPSELL_TIMING.drink,
        item => ['WINE', 'COCKTAIL', 'BEER'].includes(classifier.beverageKind(item)));
    } else if (stage === 'dessert') {
      // All 6 desserts on the menu carry identical richness/sweetness tags
      // (bootstrap defaults, verified live) so richness can't differentiate
      // them — temperature does vary (ice creams are 'cold', cakes 'room').
      // After a hot, heavy main, prefer a cold dessert for contrast; fall back
      // to the unfiltered pool rather than risk zero candidates if that ever
      // empties out (e.g. a future menu change).
      const desserts = menuContext.categorized.DESSERT || [];
      const mainIsHotAndHeavy = mainDish && mainDish.tags?.temperature !== 'cold' && Number(mainDish.tags?.richness) >= 3;
      const coldDesserts = mainIsHotAndHeavy ? desserts.filter(d => d.tags?.temperature === 'cold') : [];
      pickFrom(coldDesserts.length ? coldDesserts : desserts, 'Sweet finish', UPSELL_TIMING.dessert);
    } else if (stage === 'coffee') {
      pickFrom(menuContext.categorized.DRINK || [], 'Coffee to finish', UPSELL_TIMING.coffee, item => classifier.beverageKind(item) === 'HOT');
    } else if (stage === 'digestif') {
      pickFrom(menuContext.categorized.DRINK || [], 'An after-dinner drink', UPSELL_TIMING.digestif, item => ['spirit', 'port', 'amarula'].includes(item.tags?.drinkType));
    }
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
    const popularity = await this.getPopularity();
    return [...menuContext.items]
      .sort((left, right) => (popularity.get(normalizeName(right.name)) || 0) - (popularity.get(normalizeName(left.name)) || 0))
      .slice(0, limit);
  }

  async getOrderRecords() {
    return this._cached('orderRecords', async () => {
      const [orders, history] = await Promise.all([this.fileService.listOrders('orders'), this.fileService.listOrders('history')]);
      return [...orders, ...history].filter(order => Array.isArray(order.items));
    });
  }

  async getPopularityScores(menuContext, orderRecords) {
    const scores = new Map();

    // fuzzyFindItem falls back to an O(menuItems) substring scan whenever a name
    // isn't an exact match (renamed items, "x2" suffixes, typos in old history).
    // Memoizing per distinct name keeps that scan to once-per-unique-name instead
    // of once-per-order-line — the difference between ~60ms and ~700ms on a large
    // history, and the synchronous work that otherwise blocks the event loop.
    const resolveCache = new Map();
    const resolveName = rawName => {
      const cacheKey = String(rawName || '');
      if (resolveCache.has(cacheKey)) {
        return resolveCache.get(cacheKey);
      }
      const match = fuzzyFindItem(menuContext, rawName);
      resolveCache.set(cacheKey, match);
      return match;
    };

    orderRecords.forEach(order => {
      (order.items || []).forEach(item => {
        const match = resolveName(item.name);
        if (!match) {
          return;
        }
        const key = normalizeName(match.name);
        scores.set(key, (scores.get(key) || 0) + itemQuantity(item));
      });
    });

    const configuredPopular = await this.fileService.loadPopular();
    configuredPopular.forEach((entry, index) => {
      const match = resolveName(entry.name);
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
