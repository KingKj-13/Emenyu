/**
 * Trump Restaurant — Demo Experience configuration (server mirror).
 *
 * Mirrors client/src/config/trumpDemoConfig.ts so the AI endpoints curate the
 * same showcase items and journeys the UI presents. DEMO_MODE is code-only:
 * there is no UI toggle, admin setting, switch or env flag. Disable only by
 * editing DEMO_MODE here (and in the client config) and redeploying.
 */
'use strict';

const path = require('path');

const DEMO_MODE = true;

const SHOWCASE_ITEMS = [
  { slug: 'tomahawk', name: 'Tomahawk Steak', course: 'main', price: 1290, blurb: '1.2kg dry-aged tomahawk, seared over olive-wood fire.', matchers: ['tomahawk'] },
  { slug: 'king-queen-platter', name: 'King & Queen Platter', course: 'main', price: 1450, blurb: 'A showpiece seafood platter — built to share.', matchers: ['kingqueenplatter', 'kingandqueen', 'kingqueen', 'queenplatter'] },
  { slug: 'seafood-pasta', name: 'Seafood Pasta', course: 'main', price: 285, blurb: 'Linguine with prawns, mussels & calamari in Napoli.', matchers: ['seafoodpasta'] },
  { slug: 'caprese-avocado-salad', name: 'Caprese & Avocado Salad', course: 'main', price: 165, blurb: 'Buffalo mozzarella, avocado, basil & vine tomato.', matchers: ['capreseavocado', 'caprese', 'avocadosalad'] },

  { slug: 'springbok-carpaccio', name: 'Springbok Carpaccio', course: 'starter', price: 185, blurb: 'Paper-thin springbok, truffle oil & shaved grana.', matchers: ['springbokcarpaccio', 'springbok', 'carpaccio'] },
  { slug: 'queen-prawns', name: 'Queen Prawns', course: 'starter', price: 245, blurb: 'Grilled queen prawns in lemon-garlic butter.', matchers: ['queenprawn'] },
  { slug: 'garlic-lemon-calamari', name: 'Garlic Lemon Calamari', course: 'starter', price: 145, blurb: 'Tender calamari, garlic, lemon & a touch of chilli.', matchers: ['garliclemoncalamari', 'lemoncalamari', 'garliccalamari'] },
  { slug: 'halloumi-fingers', name: 'Halloumi Fingers', course: 'starter', price: 115, blurb: 'Golden grilled halloumi with a honey drizzle.', matchers: ['halloumifinger', 'halloumi'] },
  { slug: 'tempura-prawns', name: 'Tempura Prawns', course: 'starter', price: 175, blurb: 'Crisp, light tempura prawns with ponzu.', matchers: ['tempuraprawn', 'tempura'] },

  { slug: 'chocolate-lava-cake', name: 'Chocolate Lava Cake', course: 'dessert', price: 110, blurb: 'Warm molten centre with vanilla-bean ice cream.', matchers: ['chocolatelavacake', 'lavacake'] },
  { slug: 'lemon-tart', name: 'Lemon Tart', course: 'dessert', price: 95, blurb: 'Silky lemon curd under torched meringue.', matchers: ['lemontart'] },
  { slug: 'cheesecake', name: 'Cheesecake', course: 'dessert', price: 98, blurb: 'Baked vanilla cheesecake with berry coulis.', matchers: ['cheesecake'] },
  { slug: 'tiramisu', name: 'Tiramisu', course: 'dessert', price: 105, blurb: 'Espresso-soaked savoiardi & mascarpone cream.', matchers: ['tiramisu'] },

  { slug: 'glenfiddich-whisky-sour', name: 'Glenfiddich Whisky Sour', course: 'drink', price: 135, blurb: 'Single-malt sour, velvet foam, a whisper of bitters.', matchers: ['glenfiddichwhiskysour', 'whiskysour', 'glenfiddich'] },
  { slug: 'don-margarita', name: 'Don Margarita', course: 'drink', price: 120, blurb: 'Premium tequila, fresh lime & a salt rim.', matchers: ['donmargarita', 'margarita'] },
  { slug: 'cucumber-mint-gnt', name: 'Cucumber & Mint G&T', course: 'drink', price: 110, blurb: 'Crisp gin with cucumber & garden mint.', matchers: ['cucumbermint', 'cucumbergnt', 'mintgnt'] },
  { slug: 'cosmopolitan', name: 'Cosmopolitan', course: 'drink', price: 115, blurb: 'Citrus vodka, cranberry & a twist of lime.', matchers: ['cosmopolitan', 'cosmo'] },
  { slug: 'strawberry-lemonade', name: 'Strawberry Lemonade', course: 'drink', price: 65, blurb: 'Fresh strawberries, lemon & sparkling water.', matchers: ['strawberrylemonade'] },

  { slug: 'cabernet-sauvignon', name: 'Cabernet Sauvignon', course: 'wine', price: 340, blurb: 'Full-bodied red — blackcurrant & soft tannins.', matchers: ['cabernetsauvignon', 'cabernet'] },
];

const DEMO_JOURNEYS = [
  { key: 'steak-lover', title: 'The Steak Lover', narrative: 'A bold evening built around our signature olive-wood-fired Tomahawk.', drink: 'glenfiddich-whisky-sour', starter: 'springbok-carpaccio', main: 'tomahawk', dessert: 'chocolate-lava-cake', wine: 'cabernet-sauvignon' },
  { key: 'seafood-lover', title: 'The Seafood Lover', narrative: 'A celebration of the sea, anchored by our King & Queen Platter.', drink: 'don-margarita', starter: 'queen-prawns', main: 'king-queen-platter', dessert: 'lemon-tart', wine: 'cabernet-sauvignon' },
  { key: 'seafood-explorer', title: 'The Seafood Explorer', narrative: 'Lighter, layered seafood flavours finished with a classic cheesecake.', drink: 'cucumber-mint-gnt', starter: 'garlic-lemon-calamari', main: 'seafood-pasta', dessert: 'cheesecake', wine: 'cabernet-sauvignon' },
  { key: 'vegetarian', title: 'The Vegetarian', narrative: 'Fresh, vibrant and meat-free from first sip to last bite.', drink: 'strawberry-lemonade', starter: 'halloumi-fingers', main: 'caprese-avocado-salad', dessert: 'cheesecake', wine: 'cabernet-sauvignon' },
  { key: 'pasta-lover', title: 'The Pasta Lover', narrative: 'A relaxed, elegant table centred on our Seafood Pasta.', drink: 'cosmopolitan', starter: 'tempura-prawns', main: 'seafood-pasta', dessert: 'tiramisu', wine: 'cabernet-sauvignon' },
];

const PRIMARY_JOURNEY = {
  tomahawk: 'steak-lover',
  'springbok-carpaccio': 'steak-lover',
  'chocolate-lava-cake': 'steak-lover',
  'glenfiddich-whisky-sour': 'steak-lover',
  'cabernet-sauvignon': 'steak-lover',
  'king-queen-platter': 'seafood-lover',
  'queen-prawns': 'seafood-lover',
  'lemon-tart': 'seafood-lover',
  'don-margarita': 'seafood-lover',
  'seafood-pasta': 'seafood-explorer',
  'garlic-lemon-calamari': 'seafood-explorer',
  'cucumber-mint-gnt': 'seafood-explorer',
  cheesecake: 'seafood-explorer',
  'caprese-avocado-salad': 'vegetarian',
  'halloumi-fingers': 'vegetarian',
  'strawberry-lemonade': 'vegetarian',
  cosmopolitan: 'pasta-lover',
  'tempura-prawns': 'pasta-lover',
  tiramisu: 'pasta-lover',
};

const WAITER_LINES = {
  tomahawk: 'Our Tomahawk is the table’s centrepiece — dry-aged and finished over olive-wood fire.',
  'king-queen-platter': 'The King & Queen Platter is how we love to celebrate the sea — generous and made to share.',
  'seafood-pasta': 'Our Seafood Pasta is a guest favourite — prawns, mussels and calamari folded through linguine.',
  'caprese-avocado-salad': 'The Caprese & Avocado is bright and fresh — a beautiful meat-free main.',
  'springbok-carpaccio': 'Many guests begin with our Springbok Carpaccio before enjoying the Tomahawk Steak.',
  'queen-prawns': 'Our Queen Prawns pair perfectly with the King & Queen Platter.',
  'garlic-lemon-calamari': 'The Garlic Lemon Calamari is a light, lively way to open the meal.',
  'halloumi-fingers': 'Guests adore our Halloumi Fingers to start — golden, with a touch of honey.',
  'tempura-prawns': 'Our Tempura Prawns are delicate and crisp — a refined first course.',
  'chocolate-lava-cake': 'The Chocolate Lava Cake is one of our most popular ways to finish this dining experience.',
  'lemon-tart': 'Our Lemon Tart is the perfect bright finish after seafood.',
  cheesecake: 'The Cheesecake is a timeless way to end the evening.',
  tiramisu: 'Our Tiramisu rounds off the table beautifully.',
  'glenfiddich-whisky-sour': 'May I start you with our Glenfiddich Whisky Sour? It sets the tone for a steak evening.',
  'don-margarita': 'Our Don Margarita is a wonderful way to begin a seafood feast.',
  'cucumber-mint-gnt': 'The Cucumber & Mint G&T is crisp and refreshing to open the meal.',
  cosmopolitan: 'A Cosmopolitan is an elegant aperitif before the pasta.',
  'strawberry-lemonade': 'Our Strawberry Lemonade is fresh and vibrant — a lovely non-alcoholic start.',
  'cabernet-sauvignon': 'I’d pour our Cabernet Sauvignon alongside — it complements the whole table.',
};

const COURSE_REASON = {
  drink: 'A signature pour to begin the evening.',
  starter: 'A perfect light start before the mains.',
  main: 'The heart of this dining experience.',
  dessert: 'A memorable way to finish.',
  wine: 'From the cellar — complements the whole table.',
};

const COURSE_TO_TYPE = { drink: 'DRINK', starter: 'STARTER', main: 'MAIN', dessert: 'DESSERT', wine: 'WINE' };

const BY_SLUG = new Map(SHOWCASE_ITEMS.map(i => [i.slug, i]));
const SHOWCASE_SLUGS = SHOWCASE_ITEMS.map(i => i.slug);

// (slug, matcher) pairs sorted most-specific first.
const MATCHERS = SHOWCASE_ITEMS
  .reduce((acc, item) => acc.concat(item.matchers.map(m => ({ slug: item.slug, matcher: m }))), [])
  .sort((a, b) => b.matcher.length - a.matcher.length);

function normalize(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function matchShowcaseSlug(name) {
  const norm = normalize(name);
  if (!norm) return null;
  for (const { slug, matcher } of MATCHERS) {
    if (norm.includes(matcher)) return slug;
  }
  return null;
}

function showcaseBySlug(slug) {
  return BY_SLUG.get(slug) || null;
}

function journeyForSlug(slug) {
  const key = PRIMARY_JOURNEY[slug] || 'steak-lover';
  return DEMO_JOURNEYS.find(j => j.key === key) || DEMO_JOURNEYS[0];
}

function waiterLine(slug) {
  const item = showcaseBySlug(slug);
  return WAITER_LINES[slug] || (item ? `Our ${item.name} is one of the chef’s proudest plates.` : '');
}

// Short, premium storytelling copy (NOT long descriptions) for showcase items.
const STORIES = {
  'springbok-carpaccio': 'A South African favourite, prepared to highlight the natural richness of the meat while keeping the dish elegant and light.',
  'king-queen-platter': 'A celebration of premium seafood, designed for guests who enjoy variety and a memorable dining experience.',
  'seafood-pasta': 'A rich seafood experience combining fresh ocean flavours with a comforting pasta base.',
  'chocolate-lava-cake': 'Our most popular dessert, served warm with a rich molten chocolate centre.',
  'cabernet-sauvignon': 'Carefully selected to complement premium meats and elevate the dining experience.',
  tomahawk: 'Our signature centrepiece — dry-aged on-site and finished over an olive-wood fire.',
  'queen-prawns': 'Plump, grilled queen prawns in a lemon-garlic butter — a refined start to a seafood feast.',
  'garlic-lemon-calamari': 'Tender calamari, lightly grilled with garlic, lemon and a touch of chilli.',
  'halloumi-fingers': 'Golden grilled halloumi with a honey drizzle — a guest favourite to begin.',
  'tempura-prawns': 'Delicate, crisp tempura prawns — light, elegant and moreish.',
  'caprese-avocado-salad': 'Buffalo mozzarella, avocado and vine tomato — bright, vibrant and beautifully simple.',
  cheesecake: 'A timeless baked vanilla cheesecake finished with a berry coulis.',
  'lemon-tart': 'Silky lemon curd under torched meringue — the perfect bright finish.',
  tiramisu: 'Espresso-soaked savoiardi and mascarpone — an elegant classic.',
  'glenfiddich-whisky-sour': 'A single-malt sour with a velvet foam — it sets the tone for a steak evening.',
  'don-margarita': 'Premium tequila, fresh lime and a salt rim — a wonderful way to open a seafood feast.',
  'cucumber-mint-gnt': 'Crisp gin with cucumber and garden mint — refreshing and elegant.',
  cosmopolitan: 'Citrus vodka, cranberry and a twist of lime — a timeless aperitif.',
  'strawberry-lemonade': 'Fresh strawberries and lemon over sparkling water — vibrant and alcohol-free.'
};

function story(slug) {
  const item = showcaseBySlug(slug);
  return STORIES[slug] || (item ? item.blurb : '');
}

// Special-occasion metadata for event detection + waiter alerts.
const EVENT_META = {
  birthday: { type: 'birthday', label: 'Birthday', emoji: '🎂', action: 'Offer a complimentary Chocolate Lava Cake', script: 'Happy Birthday from the Trump team! We’d love to offer you a complimentary Chocolate Lava Cake.' },
  anniversary: { type: 'anniversary', label: 'Anniversary', emoji: '❤️', action: 'Offer a complimentary Chocolate Lava Cake to share', script: 'Happy Anniversary! Please enjoy a complimentary Chocolate Lava Cake to share, with our compliments.' },
  'first-date': { type: 'first-date', label: 'First Date', emoji: '🌹', action: 'Offer attentive, unobtrusive service and a complimentary dessert', script: 'Wishing you a wonderful evening together — a little something sweet is on us.' },
  engagement: { type: 'engagement', label: 'Engagement', emoji: '💍', action: 'Congratulate the couple and offer a complimentary dessert', script: 'Congratulations on your engagement! Dessert is on us tonight.' },
  celebration: { type: 'celebration', label: 'Celebration', emoji: '🥂', action: 'Offer a complimentary Chocolate Lava Cake', script: 'Here’s to your celebration — enjoy a complimentary Chocolate Lava Cake from the Trump team.' }
};

function detectEvent(text) {
  const t = String(text || '').toLowerCase();
  if (/\b(birthday|bday|b-day)\b|turning \d+/.test(t)) return EVENT_META.birthday;
  if (/anniversar/.test(t)) return EVENT_META.anniversary;
  if (/\bfirst date\b|\bdate night\b|\bon a date\b/.test(t)) return EVENT_META['first-date'];
  if (/\b(propos|engag|getting married|got engaged)\b/.test(t)) return EVENT_META.engagement;
  if (/\b(celebrat|special occasion|occasion|graduation|promotion)\b/.test(t)) return EVENT_META.celebration;
  return null;
}

// Detect which curated journey a free-text query / cart leans toward, so the
// hero recommendation varies (steak vs seafood vs pasta vs vegetarian) instead
// of always defaulting to the Tomahawk.
function detectJourneyKey(text) {
  const t = String(text || '').toLowerCase();
  if (/\b(prawn|calamari|squid|mussel|oyster|sushi|sashimi|kingklip|salmon|hake|seafood|fish)\b/.test(t)) return 'seafood-lover';
  if (/\b(pasta|linguine|spaghetti|noodle)\b/.test(t)) return 'pasta-lover';
  if (/\b(vegetarian|vegan|veggie|salad|halloumi|caprese|meat-free|meatless|plant)\b/.test(t)) return 'vegetarian';
  if (/\b(steak|beef|rump|fillet|ribeye|sirloin|tomahawk|wagyu|grill|carnivore)\b/.test(t)) return 'steak-lover';
  return null;
}

function journeyByKey(key) {
  return DEMO_JOURNEYS.find(j => j.key === key) || null;
}

// Directory the demo media lives in. Prefer the built dist copy, fall back to
// the committed public source. Both contain the same filenames.
function mediaDir() {
  const dist = path.join(__dirname, '..', '..', 'client', 'dist', 'media', 'trump');
  const pub = path.join(__dirname, '..', '..', 'client', 'public', 'media', 'trump');
  return { dist, pub };
}

module.exports = {
  DEMO_MODE,
  SHOWCASE_ITEMS,
  SHOWCASE_SLUGS,
  DEMO_JOURNEYS,
  COURSE_REASON,
  COURSE_TO_TYPE,
  WAITER_LINES,
  STORIES,
  EVENT_META,
  matchShowcaseSlug,
  showcaseBySlug,
  journeyForSlug,
  journeyByKey,
  detectJourneyKey,
  detectEvent,
  waiterLine,
  story,
  normalize,
  mediaDir,
};
