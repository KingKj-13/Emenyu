/**
 * Menu content localization.
 *
 * Translation is applied HERE, on the way out, rather than in the client. That
 * choice matters: the client then needs no translation logic, no per-locale
 * bundle of menu strings, and no way to get out of sync — it asks for
 * `/api/menu?locale=de` and receives a menu that is already German wherever
 * German exists and English everywhere it does not.
 *
 * English is never stored as a Translation row. The MenuItem/MenuCategory
 * columns ARE the English source of truth, so a missing translation degrades to
 * English for free, per field, with no lookup and no placeholder.
 */

/** Locales the menu API will accept. Matches client/src/i18n/locales.ts. */
const SUPPORTED_LOCALES = [
  'en', 'af', 'de', 'fr', 'nl', 'it', 'es', 'pt-BR',
  'zh-Hans', 'ja', 'ko', 'hi', 'ru', 'ar',
];

const LOCALE_SET = new Set(SUPPORTED_LOCALES.map(l => l.toLowerCase()));
const DEFAULT_LOCALE = 'en';

/** Fields a Translation row may target, per entity type. */
const ITEM_FIELDS = ['name', 'description', 'story', 'subtitle'];
const CATEGORY_FIELDS = ['title', 'intro'];
const CUT_FIELDS = ['name', 'altName', 'description', 'texture'];

/**
 * Normalize whatever arrived on the query string to a supported locale.
 * Falls back to English rather than erroring: a guest with a stale bookmark or
 * a typo'd locale should still get a menu.
 */
function normalizeLocale(raw) {
  const value = String(raw || '').trim();
  if (!value) return DEFAULT_LOCALE;
  const lower = value.toLowerCase();
  if (LOCALE_SET.has(lower)) {
    return SUPPORTED_LOCALES.find(l => l.toLowerCase() === lower);
  }
  // `de-AT` -> `de`, `pt` -> `pt-BR`, `zh` -> `zh-Hans`
  const primary = lower.split('-')[0];
  const match = SUPPORTED_LOCALES.find(l => l.toLowerCase().split('-')[0] === primary);
  return match || DEFAULT_LOCALE;
}

/**
 * TRUMP_SUPPORTED_LOCALES narrows the locales THIS server instance's menu
 * API will localize into — a comma-separated list of codes (e.g.
 * "en,fr,es,zh-Hans"). Unset (the default) accepts every locale in
 * SUPPORTED_LOCALES; matches the client's VITE_SUPPORTED_LOCALES so a
 * request for a de-restricted locale falls back to English on both ends
 * instead of one silently translating what the other refuses to offer.
 * Read lazily (not at module load) so it always sees the real env, however
 * the process loaded it. DEFAULT_LOCALE is always kept even if the env var
 * omits it — normalizeLocale's fallback assumes it's always resolvable.
 */
function resolveInstanceLocales() {
  const raw = process.env.TRUMP_SUPPORTED_LOCALES;
  if (!raw) return { locales: SUPPORTED_LOCALES, set: LOCALE_SET };
  const restricted = raw.split(',').map(s => s.trim()).filter(Boolean);
  if (!restricted.length) return { locales: SUPPORTED_LOCALES, set: LOCALE_SET };
  const wanted = new Set(restricted.map(l => l.toLowerCase()));
  wanted.add(DEFAULT_LOCALE.toLowerCase());
  const locales = SUPPORTED_LOCALES.filter(l => wanted.has(l.toLowerCase()));
  return { locales, set: new Set(locales.map(l => l.toLowerCase())) };
}

function createLocalizationService({ prismaMenuService, logger = null } = {}) {
  const restaurantId = prismaMenuService?.restaurantId || 'trump';
  const { locales: instanceLocales, set: instanceLocaleSet } = resolveInstanceLocales();

  /**
   * Normalize whatever arrived on the query string to a locale this
   * INSTANCE actually supports (may be narrower than the global list above).
   */
  function instanceNormalizeLocale(raw) {
    const value = String(raw || '').trim();
    if (!value) return DEFAULT_LOCALE;
    const lower = value.toLowerCase();
    if (instanceLocaleSet.has(lower)) {
      return instanceLocales.find(l => l.toLowerCase() === lower);
    }
    const primary = lower.split('-')[0];
    const match = instanceLocales.find(l => l.toLowerCase().split('-')[0] === primary);
    return match || DEFAULT_LOCALE;
  }

  /**
   * All translations for one locale, as `${entityType}:${entityId}` -> {field: value}.
   * One query per locale per cache build — not per item.
   */
  async function loadTranslations(locale) {
    if (!prismaMenuService || locale === DEFAULT_LOCALE) return null;
    const rows = await prismaMenuService.withPrisma(
      'translations_load_failed',
      async prisma => prisma.translation.findMany({
        where: { restaurantId, locale },
        select: { entityType: true, entityId: true, field: true, value: true },
      }),
      []
    );
    if (!rows || rows.length === 0) return null;
    const byEntity = new Map();
    for (const r of rows) {
      if (!r.value) continue;              // an empty translation is not a translation
      const key = `${r.entityType}:${r.entityId}`;
      let fields = byEntity.get(key);
      if (!fields) { fields = {}; byEntity.set(key, fields); }
      fields[r.field] = r.value;
    }
    logger?.debug?.({ locale, entities: byEntity.size, rows: rows.length }, 'translations loaded');
    return byEntity;
  }

  /** Apply `fields` to `target` for the whitelisted keys only. */
  function applyFields(target, fields, allowed) {
    if (!fields) return;
    for (const key of allowed) {
      const value = fields[key];
      if (typeof value === 'string' && value.trim()) target[key] = value;
    }
  }

  /**
   * Localize a serialized menu tree in place-ish (returns a new tree; inputs are
   * left untouched so the English cache entry can never be mutated by a German
   * request — that bug class is why this clones rather than edits).
   *
   * Category TITLES are object keys in this payload, so a translated title
   * would break every client-side lookup that keys off them (deep links,
   * section scrolling, the chapter list). Categories therefore carry their
   * translation as a separate `displayTitle` the UI can render while the key
   * stays stable and English.
   */
  function localizeMenu(menu, translations) {
    if (!menu || !translations) return menu;

    const out = {};
    for (const [categoryTitle, categoryValue] of Object.entries(menu)) {
      if (Array.isArray(categoryValue)) {
        out[categoryTitle] = categoryValue.map(item => localizeItem(item, translations));
        continue;
      }
      if (!categoryValue || typeof categoryValue !== 'object') {
        out[categoryTitle] = categoryValue;
        continue;
      }

      const category = { ...categoryValue };
      const catFields = categoryValue.dbId != null
        ? translations.get(`MENU_CATEGORY:${categoryValue.dbId}`)
        : null;
      if (catFields) {
        const display = {};
        applyFields(display, catFields, CATEGORY_FIELDS);
        if (display.title) category.displayTitle = display.title;
        if (display.intro) category.intro = display.intro;
      }

      for (const [key, value] of Object.entries(categoryValue)) {
        if (key === 'items' && Array.isArray(value)) {
          category.items = value.map(item => localizeItem(item, translations));
        } else if (value && typeof value === 'object' && Array.isArray(value.items)) {
          const sub = { ...value, items: value.items.map(item => localizeItem(item, translations)) };
          const subFields = value.dbId != null ? translations.get(`MENU_CATEGORY:${value.dbId}`) : null;
          if (subFields) {
            const display = {};
            applyFields(display, subFields, CATEGORY_FIELDS);
            if (display.title) sub.displayTitle = display.title;
            if (display.intro) sub.intro = display.intro;
          }
          category[key] = sub;
        }
      }
      out[categoryTitle] = category;
    }
    return out;
  }

  function localizeItem(item, translations) {
    if (!item || item.dbId == null) return item;
    const fields = translations.get(`MENU_ITEM:${item.dbId}`);
    if (!fields) return item;
    const copy = { ...item };
    applyFields(copy, fields, ITEM_FIELDS);
    return copy;
  }

  /** Same treatment for a butchery cut record. */
  function localizeCut(cut, translations) {
    if (!cut || !translations) return cut;
    const fields = translations.get(`COW_CUT:${cut.id}`);
    if (!fields) return cut;
    const copy = { ...cut };
    applyFields(copy, fields, CUT_FIELDS);
    return copy;
  }

  return {
    SUPPORTED_LOCALES: instanceLocales,
    DEFAULT_LOCALE,
    normalizeLocale: instanceNormalizeLocale,
    loadTranslations,
    localizeMenu,
    localizeCut,
  };
}

module.exports = {
  createLocalizationService,
  normalizeLocale,
  SUPPORTED_LOCALES,
  DEFAULT_LOCALE,
};
