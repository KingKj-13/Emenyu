/**
 * Trump Restaurant — Demo Experience configuration.
 *
 * This is the single source of truth for the curated investor / owner demo:
 * the showcase catalog, the five guided customer journeys, and the AI waiter's
 * talk-track copy.
 *
 * ──────────────────────────────────────────────────────────────────────────
 *  DEMO_MODE is enabled by default and is intentionally code-only:
 *  there is NO UI toggle, NO admin setting, NO switch, NO button and NO menu
 *  option anywhere in the app. The only way to disable the demo experience is
 *  to edit this constant and rebuild.
 * ──────────────────────────────────────────────────────────────────────────
 *
 * Keep this file in sync with `server/config/trumpDemo.js`, which mirrors the
 * same catalog/journeys so the server-side AI endpoints curate identically.
 */

export const DEMO_MODE = true;

/** Course slots used by the AI waiter to compose a full dining journey. */
export type Course = 'drink' | 'starter' | 'main' | 'dessert' | 'wine';

export interface ShowcaseItem {
  /** Canonical slug — must match the media filename base in /public/media/trump. */
  slug: string;
  /** Display name shown in the UI. */
  name: string;
  /** Primary course slot for this item. */
  course: Course;
  /** Short, premium, mobile-friendly description. */
  blurb: string;
  /** Indicative price (R) used when the live menu has no match. */
  price: number;
  /**
   * Normalised name fragments (lowercase, alphanumeric only) used to recognise
   * this showcase item inside the live menu. Longer/more specific first.
   */
  matchers: string[];
}

/**
 * The ONLY showcase items available. The recommendation engine strongly
 * prioritises these whenever DEMO_MODE is active.
 */
export const SHOWCASE_ITEMS: ShowcaseItem[] = [
  { slug: 'tomahawk', name: 'Tomahawk Steak', course: 'main', price: 1290, blurb: '1.2kg dry-aged tomahawk, seared over olive-wood fire.', matchers: ['tomahawk'] },
  { slug: 'king-queen-platter', name: 'King & Queen Platter', course: 'main', price: 1450, blurb: 'A showpiece seafood platter — built to share.', matchers: ['kingqueenplatter', 'kingandqueen', 'kingqueen', 'queenplatter'] },
  { slug: 'seafood-pasta', name: 'Seafood Pasta', course: 'main', price: 285, blurb: 'Linguine with prawns, mussels & calamari in Napoli.', matchers: ['seafoodpasta'] },
  { slug: 'caprese-avocado-salad', name: 'Caprese & Avocado Salad', course: 'main', price: 165, blurb: 'Buffalo mozzarella, avocado, basil & vine tomato.', matchers: ['capreseavocado', 'caprese', 'avocadosalad'] },

  { slug: 'springbok-carpaccio', name: 'Springbok Carpaccio', course: 'starter', price: 185, blurb: 'Paper-thin springbok, truffle oil & shaved grana.', matchers: ['springbokcarpaccio', 'springbok', 'carpaccio'] },
  { slug: 'queen-prawns', name: 'Queen Prawns', course: 'starter', price: 245, blurb: 'Grilled queen prawns in lemon-garlic butter.', matchers: ['queenprawn'] },
  { slug: 'garlic-lemon-calamari', name: 'Garlic Lemon Calamari', course: 'starter', price: 145, blurb: 'Tender calamari, garlic, lemon & a touch of chilli.', matchers: ['garliclemoncalamari', 'lemoncalamari', 'garliccalamari'] },
  { slug: 'halloumi-fingers', name: 'Halloumi Fingers', course: 'starter', price: 115, blurb: 'Golden grilled halloumi with a honey drizzle.', matchers: ['halloumifinger', 'halloumi'] },
  { slug: 'tempura-prawns', name: 'Tempura Prawns', course: 'starter', price: 175, blurb: 'Crisp, light tempura prawns with ponzu.', matchers: ['tempuraprawn', 'tempura'] },

  { slug: 'chocolate-lava-cake', name: 'Chocolate Lava Cake', course: 'dessert', price: 110, blurb: 'Warm molten centre with vanilla-bean ice cream.', matchers: ['chocolatelavacake', 'lavacake', 'lavacakechocolate'] },
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

export const SHOWCASE_SLUGS = SHOWCASE_ITEMS.map(i => i.slug);

const BY_SLUG = new Map(SHOWCASE_ITEMS.map(i => [i.slug, i]));
export function showcaseBySlug(slug: string): ShowcaseItem | undefined {
  return BY_SLUG.get(slug);
}

export interface DemoJourney {
  key: string;
  title: string;
  /** One-line waiter narrative for the whole journey. */
  narrative: string;
  drink: string;
  starter: string;
  main: string;
  dessert: string;
  wine: string;
}

/** The five curated journeys (drink → starter → main → dessert → wine). */
export const DEMO_JOURNEYS: DemoJourney[] = [
  {
    key: 'steak-lover',
    title: 'The Steak Lover',
    narrative: 'A bold evening built around our signature olive-wood-fired Tomahawk.',
    drink: 'glenfiddich-whisky-sour',
    starter: 'springbok-carpaccio',
    main: 'tomahawk',
    dessert: 'chocolate-lava-cake',
    wine: 'cabernet-sauvignon',
  },
  {
    key: 'seafood-lover',
    title: 'The Seafood Lover',
    narrative: 'A celebration of the sea, anchored by our King & Queen Platter.',
    drink: 'don-margarita',
    starter: 'queen-prawns',
    main: 'king-queen-platter',
    dessert: 'lemon-tart',
    wine: 'cabernet-sauvignon',
  },
  {
    key: 'seafood-explorer',
    title: 'The Seafood Explorer',
    narrative: 'Lighter, layered seafood flavours finished with a classic cheesecake.',
    drink: 'cucumber-mint-gnt',
    starter: 'garlic-lemon-calamari',
    main: 'seafood-pasta',
    dessert: 'cheesecake',
    wine: 'cabernet-sauvignon',
  },
  {
    key: 'vegetarian',
    title: 'The Vegetarian',
    narrative: 'Fresh, vibrant and meat-free from first sip to last bite.',
    drink: 'strawberry-lemonade',
    starter: 'halloumi-fingers',
    main: 'caprese-avocado-salad',
    dessert: 'cheesecake',
    wine: 'cabernet-sauvignon',
  },
  {
    key: 'pasta-lover',
    title: 'The Pasta Lover',
    narrative: 'A relaxed, elegant table centred on our Seafood Pasta.',
    drink: 'cosmopolitan',
    starter: 'tempura-prawns',
    main: 'seafood-pasta',
    dessert: 'tiramisu',
    wine: 'cabernet-sauvignon',
  },
];

/**
 * Primary journey for each showcase slug — the journey shown when that dish is
 * opened. Items shared across journeys resolve to their most distinctive one.
 */
const PRIMARY_JOURNEY: Record<string, string> = {
  // Steak Lover
  tomahawk: 'steak-lover',
  'springbok-carpaccio': 'steak-lover',
  'chocolate-lava-cake': 'steak-lover',
  'glenfiddich-whisky-sour': 'steak-lover',
  'cabernet-sauvignon': 'steak-lover',
  // Seafood Lover
  'king-queen-platter': 'seafood-lover',
  'queen-prawns': 'seafood-lover',
  'lemon-tart': 'seafood-lover',
  'don-margarita': 'seafood-lover',
  // Seafood Explorer
  'seafood-pasta': 'seafood-explorer',
  'garlic-lemon-calamari': 'seafood-explorer',
  'cucumber-mint-gnt': 'seafood-explorer',
  cheesecake: 'seafood-explorer',
  // Vegetarian
  'caprese-avocado-salad': 'vegetarian',
  'halloumi-fingers': 'vegetarian',
  'strawberry-lemonade': 'vegetarian',
  // Pasta Lover
  cosmopolitan: 'pasta-lover',
  'tempura-prawns': 'pasta-lover',
  tiramisu: 'pasta-lover',
};

export function journeyForSlug(slug: string): DemoJourney {
  const key = PRIMARY_JOURNEY[slug] || 'steak-lover';
  return DEMO_JOURNEYS.find(j => j.key === key) || DEMO_JOURNEYS[0];
}

export const COURSE_LABEL: Record<Course, string> = {
  drink: 'Drink',
  starter: 'Starter',
  main: 'Main',
  dessert: 'Dessert',
  wine: 'Wine',
};

/**
 * The AI waiter's per-item talk track. Natural, confident luxury-waiter copy.
 * Never references demo mode, showcase mode, curated or staged recommendations.
 */
export const WAITER_LINES: Record<string, string> = {
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

/** Reason copy shown on a suggestion chip, by the suggested item's course. */
export const COURSE_REASON: Record<Course, string> = {
  drink: 'A signature pour to begin the evening.',
  starter: 'A perfect light start before the mains.',
  main: 'The heart of this dining experience.',
  dessert: 'A memorable way to finish.',
  wine: 'From the cellar — complements the whole table.',
};

export function waiterLine(slug: string): string {
  const item = showcaseBySlug(slug);
  return WAITER_LINES[slug] || (item ? `Our ${item.name} is one of the chef’s proudest plates.` : '');
}

/**
 * Short, premium storytelling copy (NOT long descriptions) for showcase items.
 * Shown on the item page, AI recommendations, recommendation cards, and the
 * featured dish sections.
 */
export const STORIES: Record<string, string> = {
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
  'strawberry-lemonade': 'Fresh strawberries and lemon over sparkling water — vibrant and alcohol-free.',
};

export function story(slug: string): string {
  const item = showcaseBySlug(slug);
  return STORIES[slug] || (item ? item.blurb : '');
}

/**
 * Desired front-of-section ordering for the demo: media-rich showcase items
 * float to the top of their section in this order. Lower index = higher.
 */
export const SHOWCASE_MENU_ORDER: string[] = [
  // Starters
  'springbok-carpaccio', 'queen-prawns', 'garlic-lemon-calamari', 'halloumi-fingers', 'tempura-prawns',
  // Featured mains
  'king-queen-platter', 'seafood-pasta', 'caprese-avocado-salad', 'tomahawk',
  // Desserts
  'chocolate-lava-cake', 'cheesecake', 'lemon-tart', 'tiramisu',
  // Drinks / wine
  'cabernet-sauvignon', 'glenfiddich-whisky-sour', 'don-margarita', 'cosmopolitan', 'cucumber-mint-gnt', 'strawberry-lemonade',
];

const MENU_RANK = new Map(SHOWCASE_MENU_ORDER.map((slug, i) => [slug, i]));
/** Sort rank for a showcase slug (lower first); non-showcase → large number. */
export function showcaseMenuRank(slug: string | null): number {
  if (!slug) return Number.MAX_SAFE_INTEGER;
  const r = MENU_RANK.get(slug);
  return r === undefined ? Number.MAX_SAFE_INTEGER - 1 : r;
}

/** Base URL (under the /Trump base path) where demo media is served. */
export const DEMO_MEDIA_BASE = 'media/trump';
