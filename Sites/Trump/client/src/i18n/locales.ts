/**
 * The languages the QR menu offers.
 *
 * Adding a fifteenth language is: one entry here + one message catalogue.
 * No component, route, database column or migration changes — menu content
 * comes from the `Translation` table keyed on the same code, and anything
 * untranslated falls back to English.
 *
 * Codes are BCP-47 and are used verbatim as the `lang` attribute, in the
 * `?locale=` API parameter, and as the analytics `locale` value. Do not invent
 * short forms: `pt-BR` and `zh-Hans` are deliberately region/script tagged so
 * `pt-PT` or `zh-Hant` can be added later without redefining what the existing
 * codes mean.
 */

export type LocaleCode =
  | 'en' | 'af' | 'de' | 'fr' | 'nl' | 'it' | 'es' | 'pt-BR'
  | 'zh-Hans' | 'ja' | 'ko' | 'hi' | 'ru' | 'ar';

export interface LocaleDefinition {
  code: LocaleCode;
  /** Name in English — how staff and the admin panel refer to it. */
  english: string;
  /** Endonym: what a speaker calls their own language. Shown to the guest. */
  native: string;
  dir: 'ltr' | 'rtl';
  /**
   * Extra search terms so a guest typing "chinese", "mandarin" or "putonghua"
   * all reach the same row.
   */
  aliases: string[];
  /**
   * Scripts that need a different font stack from the Latin default. Drives
   * the `data-script` attribute the stylesheet keys off — CJK and Devanagari
   * render badly in Cormorant Garamond, which has no coverage for them.
   */
  script?: 'cjk' | 'arabic' | 'devanagari' | 'cyrillic';
}

const ALL_LOCALES: LocaleDefinition[] = [
  { code: 'en', english: 'English', native: 'English', dir: 'ltr', aliases: ['english', 'eng'] },
  { code: 'af', english: 'Afrikaans', native: 'Afrikaans', dir: 'ltr', aliases: ['afrikaans', 'af'] },
  { code: 'de', english: 'German', native: 'Deutsch', dir: 'ltr', aliases: ['german', 'deutsch', 'germany'] },
  { code: 'fr', english: 'French', native: 'Français', dir: 'ltr', aliases: ['french', 'francais', 'france'] },
  { code: 'nl', english: 'Dutch', native: 'Nederlands', dir: 'ltr', aliases: ['dutch', 'nederlands', 'holland', 'netherlands'] },
  { code: 'it', english: 'Italian', native: 'Italiano', dir: 'ltr', aliases: ['italian', 'italiano', 'italy'] },
  { code: 'es', english: 'Spanish', native: 'Español', dir: 'ltr', aliases: ['spanish', 'espanol', 'castellano', 'spain'] },
  { code: 'pt-BR', english: 'Portuguese', native: 'Português', dir: 'ltr', aliases: ['portuguese', 'portugues', 'brazil', 'brasil', 'portugal'] },
  { code: 'zh-Hans', english: 'Chinese', native: '中文', dir: 'ltr', script: 'cjk', aliases: ['chinese', 'mandarin', 'putonghua', 'simplified', 'zhongwen'] },
  { code: 'ja', english: 'Japanese', native: '日本語', dir: 'ltr', script: 'cjk', aliases: ['japanese', 'nihongo', 'japan'] },
  { code: 'ko', english: 'Korean', native: '한국어', dir: 'ltr', script: 'cjk', aliases: ['korean', 'hangul', 'hanguk', 'korea'] },
  { code: 'hi', english: 'Hindi', native: 'हिन्दी', dir: 'ltr', script: 'devanagari', aliases: ['hindi', 'india', 'devanagari'] },
  { code: 'ru', english: 'Russian', native: 'Русский', dir: 'ltr', script: 'cyrillic', aliases: ['russian', 'russkiy', 'russia'] },
  { code: 'ar', english: 'Arabic', native: 'العربية', dir: 'rtl', script: 'arabic', aliases: ['arabic', 'arabiya', 'arabi'] },
];

export const DEFAULT_LOCALE: LocaleCode = 'en';

/**
 * VITE_SUPPORTED_LOCALES narrows the list a given build actually offers —
 * a comma-separated list of codes (e.g. "en,fr,es,zh-Hans"). Unset (the
 * default) offers every locale above; this is how the Demo tenant keeps
 * all 14 while Trump's own build narrows to a curated set. DEFAULT_LOCALE
 * is always kept even if the env var omits it — every fallback path in this
 * module assumes it's a valid, resolvable code.
 */
const restrictedCodes = (import.meta.env.VITE_SUPPORTED_LOCALES as string | undefined)
  ?.split(',').map(s => s.trim()).filter(Boolean);

export const LOCALES: LocaleDefinition[] = restrictedCodes && restrictedCodes.length > 0
  ? ALL_LOCALES.filter(l => restrictedCodes.includes(l.code) || l.code === DEFAULT_LOCALE)
  : ALL_LOCALES;

export const LOCALE_BY_CODE = new Map<string, LocaleDefinition>(LOCALES.map(l => [l.code, l]));

export function isLocaleCode(value: unknown): value is LocaleCode {
  return typeof value === 'string' && LOCALE_BY_CODE.has(value);
}

export function localeDefinition(code: string): LocaleDefinition {
  return LOCALE_BY_CODE.get(code) ?? LOCALE_BY_CODE.get(DEFAULT_LOCALE)!;
}

/**
 * Best offered locale for a browser's stated preferences.
 *
 * Matches exactly first, then by primary subtag, so a device set to `de-AT`
 * or `pt-PT` still lands somewhere sensible rather than defaulting to English.
 * Used only as the initial highlight on the chooser — never to skip it.
 */
export function detectLocale(preferred: readonly string[] = navigator.languages ?? []): LocaleCode {
  for (const raw of preferred) {
    const tag = String(raw);
    if (isLocaleCode(tag)) return tag;
    const exact = LOCALES.find(l => l.code.toLowerCase() === tag.toLowerCase());
    if (exact) return exact.code;
  }
  for (const raw of preferred) {
    const primary = String(raw).split('-')[0].toLowerCase();
    const match = LOCALES.find(l => l.code.split('-')[0].toLowerCase() === primary);
    if (match) return match.code;
  }
  return DEFAULT_LOCALE;
}

/** Free-text search across English name, endonym and aliases. */
export function searchLocales(query: string): LocaleDefinition[] {
  const q = query.trim().toLowerCase();
  if (!q) return LOCALES;
  return LOCALES.filter(l =>
    l.english.toLowerCase().includes(q) ||
    l.native.toLowerCase().includes(q) ||
    l.code.toLowerCase().includes(q) ||
    l.aliases.some(a => a.includes(q))
  );
}
