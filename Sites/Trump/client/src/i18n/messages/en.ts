/**
 * English — the canonical catalogue.
 *
 * Every other locale file is typed against `Messages`, so a missing or
 * misspelled key is a compile error rather than a blank label in front of a
 * guest. Keep this file the only place a new key is introduced.
 *
 * These are UI strings only. Menu item names, descriptions and cut copy are
 * restaurant content and are translated in the database, never here.
 */
export const en = {
  // ── language chooser ────────────────────────────────────────────────────
  'lang.title': 'Choose your language',
  'lang.subtitle': 'You can change this at any time',
  'lang.search': 'Search languages',
  'lang.continue': 'Continue',
  'lang.current': 'Current language',
  'lang.none': 'No language matches that search',
  'lang.change': 'Language',

  // ── welcome ─────────────────────────────────────────────────────────────
  'welcome.eyebrow': 'Welcome to',
  'welcome.pill': 'Scan · Browse · Savour',
  'welcome.browseAll': 'Browse the full menu',
  'welcome.browseAllSub': 'Every dish, pour and pairing',
  'welcome.table': 'Table',

  // ── navigation ──────────────────────────────────────────────────────────
  'nav.menu': 'Menu',
  'nav.back': 'Back',
  'nav.close': 'Close',
  'nav.search': 'Search the menu',
  'nav.filters': 'Filters',
  'nav.clearFilters': 'Clear filters',
  'nav.categories': 'Categories',
  'nav.butchery': 'The Butchery',

  // ── menu ────────────────────────────────────────────────────────────────
  'menu.loading': 'Loading the menu…',
  'menu.error': 'We could not load the menu. Please ask your waiter.',
  'menu.empty': 'Nothing matches those filters.',
  'menu.chefPick': "Chef's choice",
  'menu.popular': 'Popular',
  'menu.unavailable': 'Not available tonight',
  'menu.askKitchen': 'Ask your waiter',
  'menu.viewDish': 'View dish',

  // ── dish detail ─────────────────────────────────────────────────────────
  'dish.about': 'About this dish',
  'dish.allergens': 'Allergens',
  'dish.calories': 'Calories',
  'dish.spice': 'Heat',
  'dish.photos': 'Photos',
  'dish.videos': 'Video',
  'dish.playVideo': 'Play video',
  'dish.pauseVideo': 'Pause video',
  'dish.pairsWith': 'Pairs well with',
  'dish.orderHint': 'Speak to your waiter to order',

  // ── butchery / cow selector ─────────────────────────────────────────────
  'cut.eyebrow': 'Grillhouse & Butchery',
  'cut.title': 'Choose your cut',
  'cut.primal': 'Primal',
  'cut.tapAnimal': 'Tap the animal to choose a cut',
  'cut.twelvePrimals': 'Twelve primals, one animal',
  'cut.intro': 'Every steak here comes off a specific part of the animal, and where it sat decides how it eats. Tap a cut to see where it comes from and what it becomes on the menu.',
  'cut.texture': 'Texture',
  'cut.bestFor': 'Best for',
  'cut.onMenu': 'From this cut tonight',
  'cut.from': 'From {cut}',
  'cut.classically': 'Classically',
  'cut.notOnMenu': 'Not on tonight’s menu — ask your waiter what the butchery has in.',
  'cut.browseSteaks': 'See every steak',
  'cut.onTheMenu': 'on the menu',
  'cut.naming': 'Naming',
  'cut.knowYourCut': 'Know your cut',
  'cut.teaserBody': 'Every steak here comes off a specific part of the animal, and where it sat decides how it eats. Tap a primal to see what it becomes on the menu.',
  'cut.openButchery': 'Open the butchery',
  'cut.loadingImage': 'Bringing the cut through…',
  // The mobile trigger row's own two-line copy — see cut.twelvePrimals /
  // cut.naming for the panel this opens onto. "ZA and US" is written to match
  // the toggle it opens onto, which shows the codes "ZA" / "US" untranslated
  // in every language — that pairing is what the guest will actually see, not
  // a market-specific naming clash, so this stays literal rather than local.
  'cut.mobileTitle': "Where's my cut from?",
  'cut.mobileSubtitle': '12 primals · ZA and US names',

  // ── generic ─────────────────────────────────────────────────────────────
  // ── strings that were still hardcoded English on the guest screens ──
  'nav.quickAccess': 'Quick Access',
  'nav.foodMenu': 'Food Menu',
  'nav.drinks': 'Wine & Drinks',
  'nav.setMenus': 'Signature Set Menus',
  'nav.sections': 'Menu Sections',
  'nav.searchLabel': 'Search',
  'nav.searchPlaceholder': 'Search menu…',
  'nav.dietary': 'Dietary Filters',
  'nav.clearAllFilters': 'Clear all filters',
  'nav.staffAccess': 'Staff Access',
  'nav.jumpToSection': 'Jump to menu section',
  'menu.soldOut': 'Sold Out',
  'menu.contains': 'Contains:',
  'reco.title': 'Not sure what to order?',
  'reco.fullOrder': 'Full order',
  'reco.askWaiter': 'Ask your waiter',

  // ── landing screen ──────────────────────────────────────────────────────
  // The brand NAME ("Trump") is never translated — it is the mark on the door.
  // The tagline beneath it is ordinary prose and is.
  'brand.tagline': 'Prime Grillhouse',
  'landing.wine': 'Wine',
  'landing.wineSub': 'The cellar',
  'landing.cocktails': 'Cocktails',
  'landing.cocktailsSub': 'Signature pours',
  'landing.setMenu': 'Set Menu',
  'landing.setMenuSub': 'Curated combos',
  'landing.mains': 'Mains',
  'landing.mainsSub': 'Steaks, seafood and grill',
  'landing.starters': 'Starters',
  'landing.startersSub': 'To begin',
  'landing.sushi': 'Sushi & Sashimi',
  'landing.sushiSub': 'From the sea',
  'landing.butchery': 'The Butchery',

  // ── the four top-level tabs ─────────────────────────────────────────────
  'group.starters': 'Starters',
  'group.mains': 'Mains',
  'group.dessert': 'Dessert',
  'group.drinks': 'Drinks',

  // ── dietary filters ─────────────────────────────────────────────────────
  'diet.noBeef': 'No Beef',
  'diet.noChicken': 'No Chicken',
  'diet.noPork': 'No Pork',
  'diet.noLamb': 'No Lamb',
  'diet.noSeafood': 'No Seafood',
  'diet.noEgg': 'No Egg',
  'diet.noGluten': 'No Gluten',
  'diet.noNuts': 'No Nuts',
  'diet.veganOnly': 'Vegan Only',
  'diet.vegetarianOnly': 'Vegetarian Only',

  // ── staff entrances (guests see these in the drawer) ────────────────────
  'staff.waiterApp': 'Waiter App',
  'staff.adminDashboard': 'Admin Dashboard',

  // ── dish detail ─────────────────────────────────────────────────────────
  'spice.mild': 'Mild heat',
  'spice.medium': 'Medium heat',
  'spice.hot': 'Hot',
  'spice.spiced': 'Spiced',
  'dish.sommelier': 'Your sommelier recommends',

  // ── menu chapters ───────────────────────────────────────────────────────
  // `chapter.steaks` and `chapter.pastas` carry the brand word; keep "Trump"
  // and translate the rest of the phrase.
  'chapter.starters': 'To Start',
  'chapter.tempura': 'Tempura',
  'chapter.salads': 'Bespoke Salads',
  'chapter.sushi': 'Sushi & Sashimi',
  'chapter.seafood': 'Signature Seafood',
  'chapter.steaks': 'Trumps Premium Steaks',
  'chapter.pork': 'Pork & Ribs',
  'chapter.lamb': 'Lamb',
  'chapter.venison': 'Venison & Game',
  'chapter.oxtail': 'Oxtail & Beef Ribs',
  'chapter.combos': 'Signature Combos',
  'chapter.platters': 'Signature Platters',
  'chapter.burgers': 'Gourmet Burgers',
  'chapter.chicken': 'Chicken Dishes',
  'chapter.pastas': 'Trumps Pastas',
  'chapter.veg': 'Vegetarian',
  'chapter.sides': 'Sides & Extras',
  'chapter.dessert': 'Dessert & Cakes',
  'chapter.sparkling': 'Sparkling',
  'chapter.white': 'White Wine',
  'chapter.red': 'Red Wine',
  'chapter.beer': 'Beer & Cider',
  'chapter.spirits': 'Spirits',
  'chapter.liqueurs': 'Liqueurs & After-Dinner',
  'chapter.soft': 'Soft & Hot',
  'chapter.cocktails': 'Cocktails',

  // ── the one-tap bundles ─────────────────────────────────────────────────
  'reco.strapline': 'One-tap chef pairings — a drink, starter, main & dessert',
  'reco.persona.sushi': 'The Sushi Lover',
  'reco.persona.sushiSub': 'Fresh, delicate and made to share.',
  'reco.persona.steak': 'The Steak Lover',
  'reco.persona.steakSub': 'Flame-grilled, dry-aged, unapologetic.',
  'reco.persona.fish': 'The Fish Lover',
  'reco.persona.fishSub': 'From the coast, line to plate.',
  'reco.persona.veg': 'The Vegetarian',
  'reco.persona.vegSub': 'Garden-forward and full of colour.',
  'reco.persona.pasta': 'The Pasta Lover',
  'reco.persona.pastaSub': 'Comfort, twirled to perfection.',
  'reco.course.drink': 'Drink',
  'reco.course.starter': 'Starter',
  'reco.course.main': 'Main',
  'reco.course.dessert': 'Dessert',

  // ── the sommelier's one-line meal narrative ─────────────────────────────
  // {a} {b} {c} are dish names. Word order differs by language, so translators
  // move the placeholders rather than keeping this order.
  'journey.starterThenMain': 'Many guests begin with our {a} before enjoying the {b}.',
  'journey.starterWithDrink': 'Start with our {a} alongside a {b}.',
  'journey.starterOnly': 'A refined way to begin the evening.',
  'journey.mainBoth': 'Pair your {a} with our {b}, then finish with the {c}.',
  'journey.mainBefore': 'Our {a} pairs beautifully with our {b}.',
  'journey.mainAfter': 'Enjoy our {a}, then finish with the {b}.',
  'journey.mainOnly': 'Our signature {a} — the heart of the table.',
  'journey.drinkTwo': 'Our {a} pairs beautifully with the {b} and the {c}.',
  'journey.drinkOne': 'Our {a} pairs beautifully with the {b}.',
  'journey.drinkOnly': 'A standout pour from our list.',
  'journey.dessertAfterWithSip': 'After our {a}, finish the evening with our {b}, alongside a {c}.',
  'journey.dessertAfter': 'After our {a}, finish the evening with our {b}.',
  'journey.dessertOnly': 'Finish the evening on a sweet note with our {a}.',
  'journey.sideWith': 'Our {a} is the perfect companion to the {b}.',
  'journey.sideOnly': 'A delicious addition to the table.',

  // ── allergen / dietary tokens ───────────────────────────────────────────
  // Rendered after "Contains:" on a dish. Safety-critical: these must name the
  // same thing the English does, not a near neighbour.
  'allergen.Beef': 'Beef',
  'allergen.Chicken': 'Chicken',
  'allergen.Egg': 'Egg',
  'allergen.Gluten': 'Gluten',
  'allergen.Lamb': 'Lamb',
  'allergen.Nuts': 'Nuts',
  'allergen.Pork': 'Pork',
  'allergen.Seafood': 'Seafood',
  'allergen.Vegan': 'Vegan',
  'allergen.Vegetarian': 'Vegetarian',

  'common.retry': 'Try again',
  'common.of': 'of',
  'common.more': 'More',
  'common.less': 'Less',
} as const;

export type MessageKey = keyof typeof en;
export type Messages = Record<MessageKey, string>;
