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
  'cut.classically': 'Classically',
  'cut.notOnMenu': 'Not on tonight’s menu — ask your waiter what the butchery has in.',
  'cut.browseSteaks': 'See every steak',
  'cut.onTheMenu': 'on the menu',
  'cut.naming': 'Naming',
  'cut.knowYourCut': 'Know your cut',
  'cut.teaserBody': 'Every steak here comes off a specific part of the animal, and where it sat decides how it eats. Tap a primal to see what it becomes on the menu.',
  'cut.openButchery': 'Open the butchery',
  'cut.loadingImage': 'Bringing the cut through…',

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

  'common.retry': 'Try again',
  'common.of': 'of',
  'common.more': 'More',
  'common.less': 'Less',
} as const;

export type MessageKey = keyof typeof en;
export type Messages = Record<MessageKey, string>;
