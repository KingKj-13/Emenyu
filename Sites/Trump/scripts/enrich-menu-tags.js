#!/usr/bin/env node
'use strict';
// Phase 2 — bootstrap flavour/attribute tags onto every Trump menu item.
//
//   node scripts/enrich-menu-tags.js            # DRY RUN — preview, writes nothing
//   node scripts/enrich-menu-tags.js --apply    # write metadata.tags into Postgres
//   node scripts/enrich-menu-tags.js --report   # (with either) write data/enrich-report.json
//
// Tenant-scoped (restaurantId from env, default 'trump'). Idempotent. NEVER
// overwrites a row whose metadata.tags.source === 'reviewed' (chef edits win).
// Tags are ADDITIVE: existing metadata (media keys) is preserved; only `tags`
// is (re)written. Three deterministic passes:
//   1. category defaults   2. structured fields (allergens, spice emoji)   3. name/description keyword inference
//
// Vocab is closed (see MENU_ENRICHMENT_PLAN.md). Low-confidence axes (flavour/
// texture/aromatics with no description signal) are reported, not invented.

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env'), quiet: true });
dotenv.config({ path: path.resolve(__dirname, '..', '.env'), quiet: true });
// Local dev override: .env.local (gitignored) repoints DATABASE_URL at the local
// database so build/test work never touches prod. No-op in production (no file).
dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env.local'), override: true, quiet: true });

const { getPrisma } = require('../server/services/prismaClient');
const classifier = require('../server/services/categoryClassifier');

const RESTAURANT_ID = process.env.TRUMP_RESTAURANT_ID || 'trump';
const APPLY = process.argv.includes('--apply');
const WRITE_REPORT = process.argv.includes('--report') || APPLY;
const REPORT_PATH = path.join(__dirname, '..', 'data', 'enrich-report.json');
const TAGS_VERSION = 1;

// ── Closed vocabularies ────────────────────────────────────────────────────────
const FLAVOUR = ['smoky', 'charred', 'garlicky', 'herby', 'creamy', 'citrus', 'umami', 'peppery', 'cheesy', 'chocolate', 'fruity', 'briny', 'fresh', 'nutty'];
const TEXTURE = ['crispy', 'tender', 'juicy', 'crunchy', 'soft', 'flaky'];
const AROMATICS = ['garlic', 'chilli', 'herbs', 'citrus', 'smoke', 'truffle'];
const OCCASION = ['sharing', 'date', 'celebration', 'quick', 'hearty', 'light'];

const uniq = arr => [...new Set(arr)].filter(Boolean);
const lc = v => String(v == null ? '' : v).toLowerCase();

// Items under these root categories are ALWAYS drinks — trust the menu structure
// over the name-based classifier, which misreads brand names like "Flying Fish"
// (cider) as seafood via its \bfish\b food-guard.
const DRINK_ROOTS = new Set(['champagne', 'white wine', 'red wine', 'beers', 'spirits', 'cocktails', 'mocktails & cold beverages']);

// ── Pass 1: category → defaults ────────────────────────────────────────────────
// course keyed on the root category title; classifier handles kind/drink base.
const ROOT_COURSE = {
  'starters': 'STARTER', 'salads': 'SALAD', 'sushi': 'SUSHI', 'sides': 'SIDE',
  'dessert': 'DESSERT', 'set menus': 'SET',
  'champagne': 'DRINK', 'white wine': 'DRINK', 'red wine': 'DRINK', 'beers': 'DRINK',
  'spirits': 'DRINK', 'cocktails': 'DRINK', 'mocktails & cold beverages': 'DRINK'
};
const ROOT_PROTEIN = {
  'trumps premium steaks': 'beef', 'oxtail & beef ribs': 'beef', 'signature combos': 'beef',
  'pork & ribs': 'pork', 'lamb': 'lamb', 'venison & game': 'game', 'chicken dishes': 'chicken',
  'signature seafood': 'seafood', 'sushi': 'seafood', 'vegetarian': 'none'
};
// drink axes keyed on sub-category (varietal) title, falling back to root.
const VARIETAL = {
  'cabernet sauvignon': { drinkType: 'red', body: 'full', drySweet: 'dry' },
  'shiraz': { drinkType: 'red', body: 'full', drySweet: 'dry' },
  'red blends': { drinkType: 'red', body: 'full', drySweet: 'dry' },
  'pinotage': { drinkType: 'red', body: 'full', drySweet: 'dry' },
  'merlot': { drinkType: 'red', body: 'medium', drySweet: 'dry' },
  'pinot noir': { drinkType: 'red', body: 'medium', drySweet: 'dry' },
  'rosé': { drinkType: 'rose', body: 'light', drySweet: 'off-dry' },
  'sauvignon blanc': { drinkType: 'white', body: 'light', drySweet: 'dry' },
  'chenin blanc': { drinkType: 'white', body: 'light', drySweet: 'off-dry' },
  'chardonnay': { drinkType: 'white', body: 'medium', drySweet: 'dry' },
  'semi-sweet and other whites': { drinkType: 'white', body: 'light', drySweet: 'sweet' },
  'champagne': { drinkType: 'sparkling', body: 'light', drySweet: 'dry' },
  'cap classique and prosecco': { drinkType: 'sparkling', body: 'light', drySweet: 'off-dry' }
};
const ROOT_DRINK = {
  'champagne': { drinkType: 'sparkling', body: 'light', drySweet: 'dry' },
  'white wine': { drinkType: 'white', body: 'medium', drySweet: 'dry' },
  'red wine': { drinkType: 'red', body: 'full', drySweet: 'dry' }
};

function drinkAxes(rootL, subL, nameL) {
  if (VARIETAL[subL]) return { ...VARIETAL[subL] };
  if (rootL === 'beers') return /cider|cooler/.test(subL) ? { drinkType: 'cider', body: 'light', drySweet: 'off-dry' } : { drinkType: 'beer', body: 'medium', drySweet: 'dry' };
  if (rootL === 'spirits') return { drinkType: 'spirit', body: 'full', drySweet: 'dry' };
  if (rootL === 'cocktails') return { drinkType: 'cocktail', body: 'medium', drySweet: 'off-dry' };
  if (rootL === 'mocktails & cold beverages') {
    if (/mocktail/.test(subL)) return { drinkType: 'mocktail', body: 'light', drySweet: 'sweet' };
    if (/hot/.test(subL)) return { drinkType: 'hot', body: 'medium', drySweet: 'off-dry' };
    return { drinkType: 'soft', body: 'light', drySweet: 'sweet' };
  }
  if (ROOT_DRINK[rootL]) return { ...ROOT_DRINK[rootL] };
  // classifier says it's a drink but category is unusual — derive from beverageKind.
  const bk = classifier.beverageKind(nameL);
  const map = { WINE: { drinkType: 'red', body: 'medium', drySweet: 'dry' }, BEER: { drinkType: 'beer', body: 'medium', drySweet: 'dry' }, COCKTAIL: { drinkType: 'cocktail', body: 'medium', drySweet: 'off-dry' }, HOT: { drinkType: 'hot', body: 'medium', drySweet: 'off-dry' }, SOFT: { drinkType: 'soft', body: 'light', drySweet: 'sweet' } };
  return map[bk] || { drinkType: 'soft', body: 'light', drySweet: 'off-dry' };
}
function abvFor(drinkType) {
  if (drinkType === 'spirit') return 'high';
  if (['red', 'white', 'rose', 'sparkling', 'cocktail'].includes(drinkType)) return 'standard';
  if (['beer', 'cider'].includes(drinkType)) return 'low';
  return 'none';
}

// ── Pass 2: structured fields ──────────────────────────────────────────────────
const PROTEIN_TOKENS = { beef: 'beef', chicken: 'chicken', lamb: 'lamb', pork: 'pork', seafood: 'seafood' };
const DIETARY_TOKENS = { vegetarian: 'vegetarian', vegan: 'vegan', gluten: 'contains-gluten', egg: 'contains-egg', nuts: 'contains-nuts' };

function tokensFromAllergens(allergens) {
  return lc(allergens).split(',').map(s => s.trim()).filter(Boolean);
}
function spiceFromEmoji(spice) {
  const peppers = (String(spice || '').match(/🌶/gu) || []).length;
  return Math.min(3, peppers);
}

// ── Pass 3: name + description keyword inference ────────────────────────────────
const PROTEIN_KW = [['seafood', /\b(salmon|prawn|calamari|squid|mussel|kingklip|hake|sashimi|sushi|seafood|fish|oyster|crab|shrimp)\b/], ['beef', /\b(beef|steak|ribeye|sirloin|rump|fillet|t-bone|tomahawk|wagyu|oxtail|biltong|boerewors|bolognese)\b/], ['chicken', /\b(chicken|wings|trinchado)\b/], ['lamb', /\blamb\b/], ['pork', /\b(pork|eisbein|bacon)\b/], ['game', /\b(ostrich|kudu|springbok|venison|game)\b/]];
const FLAVOUR_KW = [['smoky', /\b(bbq|smok|glaze|chargrill|peri-?peri)\b/], ['charred', /\b(grill|crusted|char|flame|seared|basted)\b/], ['garlicky', /\bgarlic\b/], ['herby', /\b(herb|basil|pesto|rosemary|thyme|rocket|mint)\b/], ['creamy', /\b(cream|alfredo|butter|mash)\b/], ['cheesy', /\b(cheese|halloumi|feta|parmesan|mozzarella|caprese)\b/], ['citrus', /\b(lemon|lime|citrus|orange)\b/], ['chocolate', /\b(chocolate|cocoa|brownie)\b/], ['umami', /\b(mushroom|truffle|soy|miso|sashimi|umami|tomato)\b/], ['peppery', /\b(pepper|peppercorn)\b/], ['fruity', /\b(berry|cranberry|mango|pineapple|apple|fruit|jam)\b/], ['nutty', /\b(nut|sesame|almond|pecan|peanut)\b/], ['briny', /\b(prawn|mussel|calamari|salmon|oyster|olive|caper)\b/], ['fresh', /\b(fresh|salad|cucumber|crisp|rocket|avo)\b/]];
const TEXTURE_KW = [['crispy', /\b(crisp|fried|tempura|crunch|onion ring)\b/], ['flaky', /\b(hake|kingklip|fish fillet|sole)\b/], ['soft', /\b(thinly sliced|sashimi|mash|pudding|sponge|cake|ice ?cream)\b/], ['crunchy', /\b(salad|nuts|crouton)\b/], ['juicy', /\b(steak|burger|rump|sirloin|ribeye|chop)\b/], ['tender', /\b(fillet|tender|braised|slow)\b/]];
const AROMA_KW = [['garlic', /\bgarlic\b/], ['chilli', /\b(chilli|chili|peri-?peri|jalapeno|jalapeño|firecracker|sriracha)\b/], ['herbs', /\b(herb|basil|pesto|rosemary|thyme|mint)\b/], ['citrus', /\b(lemon|lime|citrus|orange)\b/], ['smoke', /\b(smok|bbq|chargrill)\b/], ['truffle', /\btruffle\b/]];
const SPICE_KW = /\b(peri-?peri|chilli|chili|jalapeno|jalapeño|firecracker|sriracha|hot sauce|spicy|cajun|madras|vindaloo)\b/;

function matchList(text, table, vocab) {
  const out = [];
  for (const [tag, re] of table) if (re.test(text)) out.push(tag);
  return uniq(out).filter(t => vocab.includes(t));
}

function inferOccasion(rootL, nameL, course) {
  const occ = [];
  // Word boundaries matter: "rump" is a substring of "tRUMPs", so /rump/ without
  // \b falsely tags every Trumps-branded dish as hearty.
  if (/\b(platter|combo|sharing|wings|ribs|biltong|trinchado|nachos)\b/.test(nameL) || rootL === 'signature combos') occ.push('sharing');
  if (rootL === 'champagne' || /\b(champagne|cap classique|prosecco)\b/.test(nameL)) occ.push('celebration');
  if (/\b(wagyu|tomahawk|kings|signature|sashimi|the king)\b/.test(nameL) || course === 'SUSHI') occ.push('date');
  if (/\b(burger|wrap|single)\b|for 1\b/.test(nameL)) occ.push('quick');
  if (/\b(steak|ribs|oxtail|lamb|eisbein|mixed grill|rump|sirloin|ribeye|t-bone)\b/.test(nameL)) occ.push('hearty');
  if (course === 'SALAD' || /\b(salad|sashimi)\b|\bveg\b/.test(nameL)) occ.push('light');
  return uniq(occ).filter(o => OCCASION.includes(o));
}

function buildTags(item) {
  const rootTitle = item.category?.parent?.title || item.category?.title || '';
  const subTitle = item.category?.parent ? item.category.title : '';
  const rootL = lc(rootTitle), subL = lc(subTitle), nameL = lc(item.name);
  const desc = lc(item.description || '');
  const text = `${nameL} ${desc}`;
  const ctx = { name: item.name, category: rootTitle, subcategory: subTitle };
  const cls = classifier.classify(ctx);
  const isDrink = DRINK_ROOTS.has(rootL) || cls.isBeverage;

  const tags = { v: TAGS_VERSION, source: 'bootstrap', kind: isDrink ? 'DRINK' : 'FOOD' };

  // course
  if (isDrink) tags.course = 'DRINK';
  else if (ROOT_COURSE[rootL] && ROOT_COURSE[rootL] !== 'DRINK') tags.course = ROOT_COURSE[rootL];
  else if (cls.categoryType === 'DESSERT') tags.course = 'DESSERT';
  else if (cls.categoryType === 'STARTER') tags.course = 'STARTER';
  else tags.course = 'MAIN';

  const weakAxes = [];

  if (isDrink) {
    const da = drinkAxes(rootL, subL, nameL);
    tags.drinkType = da.drinkType; tags.body = da.body; tags.drySweet = da.drySweet;
    tags.abv = abvFor(da.drinkType);
    tags.temperature = ['hot'].includes(da.drinkType) ? 'hot' : ['red', 'spirit'].includes(da.drinkType) ? 'room' : 'cold';
    tags.flavour = matchList(text, FLAVOUR_KW, FLAVOUR);
    if (da.drinkType === 'red') tags.flavour = uniq([...tags.flavour, 'fruity']);
    if (da.drinkType === 'sparkling') tags.flavour = uniq([...tags.flavour, 'fresh']);
    tags.occasion = uniq([da.drinkType === 'sparkling' ? 'celebration' : 'date', ...(rootL === 'beers' ? ['sharing'] : [])]).filter(o => OCCASION.includes(o));
    return { tags, weakAxes };
  }

  // ── FOOD ──
  // protein: allergens token → category → name keyword
  const allTokens = tokensFromAllergens(item.allergens);
  let protein = uniq(allTokens.map(t => PROTEIN_TOKENS[t]).filter(Boolean));
  if (protein.length === 0 && ROOT_PROTEIN[rootL]) protein = [ROOT_PROTEIN[rootL]];
  if (protein.length === 0) protein = matchList(text, PROTEIN_KW, ['beef', 'chicken', 'lamb', 'pork', 'seafood', 'game']);
  if (protein.length === 0) protein = ['none'];
  tags.protein = protein;

  // dietary: allergens tokens + vegetarian category
  let dietary = uniq(allTokens.map(t => DIETARY_TOKENS[t]).filter(Boolean));
  if (rootL === 'vegetarian' && !dietary.includes('vegetarian')) dietary.push('vegetarian');
  tags.dietary = dietary;

  // spice: emoji → keyword
  tags.spice = Math.max(spiceFromEmoji(item.spice), SPICE_KW.test(text) ? 1 : 0);

  // richness / acid / sweetness (0–3)
  let richness = 1;
  if (/wagyu|cream|butter|cheese|truffle|alfredo|bacon|eisbein|chocolate|fried/.test(text)) richness = 3;
  else if (/steak|ribeye|sirloin|rump|fillet|ribs|lamb|pork|burger|pasta|tomahawk/.test(text)) richness = 2;
  if (tags.course === 'SALAD' || protein[0] === 'none' && /salad|veg/.test(text)) richness = Math.min(richness, 1);
  tags.richness = richness;

  let acid = 0;
  if (/lemon|lime|citrus|vinaigrette|tomato|caprese|napolitana|pickle/.test(text)) acid = 2;
  if (tags.course === 'SALAD') acid = Math.max(acid, 2);
  if (/sashimi|ceviche/.test(text)) acid = Math.max(acid, 1);
  tags.acid = acid;

  let sweetness = 0;
  if (tags.course === 'DESSERT') sweetness = 3;
  else if (/sweet|honey|caramel|jam|glaze|chutney|cranberry|malva/.test(text)) sweetness = 1;
  tags.sweetness = sweetness;

  // flavour / texture / aromatics (keyword; weak when no description signal)
  const hasDesc = desc.trim().length > 10;
  let flavour = matchList(text, FLAVOUR_KW, FLAVOUR);
  let texture = matchList(text, TEXTURE_KW, TEXTURE);
  const aromatics = matchList(text, AROMA_KW, AROMATICS);
  // category nudges so steaks/sushi aren't empty even without a description
  if (flavour.length === 0) {
    if (protein.includes('beef') || protein.includes('lamb') || protein.includes('game')) flavour = ['charred', 'peppery'];
    else if (tags.course === 'SUSHI' || protein.includes('seafood')) flavour = ['umami', 'fresh'];
    else if (tags.course === 'DESSERT') flavour = ['chocolate'];
    if (flavour.length) weakAxes.push('flavour');
  }
  if (texture.length === 0) {
    if (protein.includes('beef') || protein.includes('lamb')) texture = ['juicy', 'tender'];
    else if (tags.course === 'SUSHI') texture = ['soft'];
    if (texture.length) weakAxes.push('texture');
  }
  tags.flavour = uniq(flavour).slice(0, 4);
  tags.texture = uniq(texture).slice(0, 3);
  tags.aromatics = aromatics;

  // Temperature off the dish form, NOT the full text (/ice/ used to match "choice").
  if (/\b(ice ?cream|sorbet|chilled)\b/.test(nameL)) tags.temperature = 'cold';
  else if (tags.course === 'SUSHI' || tags.course === 'SALAD' || /\b(salad|carpaccio|sashimi|tartare)\b/.test(nameL)) tags.temperature = 'cold';
  else if (tags.course === 'DESSERT') tags.temperature = 'room';
  else tags.temperature = 'hot';

  tags.occasion = inferOccasion(rootL, nameL, tags.course);
  if (tags.occasion.length === 0) tags.occasion = [tags.course === 'MAIN' ? 'hearty' : tags.course === 'DESSERT' ? 'date' : 'light'];

  if (!hasDesc) weakAxes.push('no-description');
  return { tags, weakAxes: uniq(weakAxes) };
}

async function main() {
  const prisma = getPrisma();
  const items = await prisma.menuItem.findMany({
    where: { restaurantId: RESTAURANT_ID },
    select: { id: true, name: true, description: true, spice: true, allergens: true, metadata: true, category: { select: { title: true, parent: { select: { title: true } } } } },
    orderBy: { id: 'asc' }
  });

  const stats = { total: items.length, written: 0, skippedReviewed: 0, kind: { FOOD: 0, DRINK: 0 }, axisFill: {}, lowConfidence: [] };
  const AXES = ['protein', 'dietary', 'spice', 'richness', 'acid', 'sweetness', 'flavour', 'texture', 'aromatics', 'occasion', 'temperature', 'drinkType', 'body', 'drySweet'];
  AXES.forEach(a => { stats.axisFill[a] = 0; });
  const samples = [];

  for (const item of items) {
    const existing = item.metadata && typeof item.metadata === 'object' ? item.metadata : {};
    if (existing.tags && existing.tags.source === 'reviewed') { stats.skippedReviewed += 1; continue; }

    const { tags, weakAxes } = buildTags(item);
    stats.kind[tags.kind] += 1;
    AXES.forEach(a => {
      const v = tags[a];
      const filled = Array.isArray(v) ? v.length > 0 : (typeof v === 'number' ? v > 0 : Boolean(v));
      if (filled) stats.axisFill[a] += 1;
    });
    if (weakAxes.includes('no-description') || weakAxes.includes('flavour')) {
      stats.lowConfidence.push({ id: item.id, name: item.name, weak: weakAxes });
    }
    if (samples.length < 12 && /ribeye 380|salmon sashimi|firecracker chicken wings|garlic lemon calamari|lamb chops 4|veg burger|death by chocolate|greek salad|seafood pasta|cabernet/i.test(item.name)) {
      samples.push({ name: item.name, tags });
    }

    if (APPLY) {
      await prisma.menuItem.update({ where: { id: item.id }, data: { metadata: { ...existing, tags } } });
      stats.written += 1;
    }
  }

  stats.lowConfidenceCount = stats.lowConfidence.length;
  const pct = n => `${Math.round((n / Math.max(1, stats.total - stats.skippedReviewed)) * 100)}%`;
  console.log(`\n${APPLY ? 'APPLIED' : 'DRY RUN'} — restaurantId='${RESTAURANT_ID}'`);
  console.log(`items: ${stats.total} | FOOD ${stats.kind.FOOD} · DRINK ${stats.kind.DRINK} | reviewed-skipped: ${stats.skippedReviewed} | ${APPLY ? `written: ${stats.written}` : '(no writes)'}`);
  console.log('\naxis fill (of tagged):');
  AXES.forEach(a => console.log(`  ${a.padEnd(12)} ${String(stats.axisFill[a]).padStart(3)}  ${pct(stats.axisFill[a])}`));
  console.log(`\nlow-confidence items (flavour/texture are category-guesses or no description): ${stats.lowConfidenceCount}`);

  if (WRITE_REPORT) {
    fs.writeFileSync(REPORT_PATH, JSON.stringify({ generatedAt: new Date().toISOString(), applied: APPLY, ...stats, samples }, null, 2));
    console.log(`\nreport → ${path.relative(path.resolve(__dirname, '..'), REPORT_PATH)}`);
  }
  await prisma.$disconnect();
}

main().catch(e => { console.error('enrich failed:', e.message); process.exit(1); });
