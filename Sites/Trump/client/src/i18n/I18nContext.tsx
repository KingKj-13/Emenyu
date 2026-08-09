import {
  createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode,
} from 'react';
import {
  DEFAULT_LOCALE, detectLocale, isLocaleCode, localeDefinition,
  type LocaleCode, type LocaleDefinition,
} from './locales';
import { en, type MessageKey } from './messages/en';
import { af } from './messages/af';
import { de } from './messages/de';
import { fr } from './messages/fr';
import { nl } from './messages/nl';
import { it } from './messages/it';
import { es } from './messages/es';
import { ptBR } from './messages/pt-BR';
import { zhHans } from './messages/zh-Hans';
import { ja } from './messages/ja';
import { ko } from './messages/ko';
import { hi } from './messages/hi';
import { ru } from './messages/ru';
import { ar } from './messages/ar';

/**
 * All fourteen catalogues are in the main bundle on purpose.
 *
 * Together they are ~14 KB gzipped — smaller than a single menu photograph —
 * and lazy-loading them would put a network round trip between "tap your
 * language" and "see the menu", on restaurant wifi, at the exact moment a
 * guest forms their first impression. Menu CONTENT is the part that scales
 * with language count, and that is fetched per-locale from the API.
 */
const CATALOGUES: Record<LocaleCode, Record<string, string>> = {
  en, af, de, fr, nl, it, es, 'pt-BR': ptBR, 'zh-Hans': zhHans, ja, ko, hi, ru, ar,
};

const STORAGE_KEY = 'emenyu.locale';

interface I18nValue {
  locale: LocaleCode;
  definition: LocaleDefinition;
  dir: 'ltr' | 'rtl';
  setLocale: (code: LocaleCode) => void;
  t: (key: MessageKey) => string;
}

const I18nContext = createContext<I18nValue>(null!);

function readStoredLocale(): LocaleCode | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return isLocaleCode(raw) ? raw : null;
  } catch {
    return null;                       // private mode / storage disabled
  }
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<LocaleCode>(() => {
    const stored = readStoredLocale();
    if (stored) return stored;
    // With no language step, the device's own preference is the best first
    // guess — and it costs a guest nothing to be wrong, because the header
    // dropdown is one tap away.
    try { return detectLocale(); } catch { return DEFAULT_LOCALE; }
  });

  const definition = useMemo(() => localeDefinition(locale), [locale]);

  // The document itself carries language and direction: screen readers, text
  // selection, form controls, punctuation mirroring and CSS logical properties
  // all key off these two attributes, and none of them can be faked in CSS.
  useEffect(() => {
    const root = document.documentElement;
    root.lang = definition.code;
    root.dir = definition.dir;
    if (definition.script) root.dataset.script = definition.script;
    else delete root.dataset.script;
  }, [definition]);

  const setLocale = useCallback((code: LocaleCode) => {
    setLocaleState(code);
    try { localStorage.setItem(STORAGE_KEY, code); } catch { /* storage disabled */ }
  }, []);

  // Falls back to English per key, not per catalogue: a locale that is missing
  // one string still renders every other string in its own language.
  const t = useCallback((key: MessageKey): string => {
    const table = CATALOGUES[locale];
    return table?.[key] ?? en[key] ?? key;
  }, [locale]);

  const value = useMemo<I18nValue>(() => ({
    locale, definition, dir: definition.dir, setLocale, t,
  }), [locale, definition, setLocale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  return useContext(I18nContext);
}

/** Shorthand for components that only need the translate function. */
export function useT(): (key: MessageKey) => string {
  return useContext(I18nContext).t;
}
