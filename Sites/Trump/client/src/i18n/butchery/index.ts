/**
 * Localised copy for the butcher's chart.
 *
 * The chart's ENGLISH copy lives in `components/butchery/cutCatalog.ts`
 * alongside the geometry, because the two were traced together and must stay
 * in step. This module is a per-locale OVERLAY on top of it: a partial object
 * per cut, merged field by field, so a language that has translated only some
 * of a cut still shows English for the rest rather than a hole.
 *
 * That mirrors how menu content is localised on the server (`localizationService`):
 * English is the source of truth and is never stored as a translation, and a
 * missing translation degrades per field.
 *
 * Precedence, highest first:
 *   1. a cut the restaurant has curated in the admin panel (server `CowCut`)
 *   2. this locale overlay
 *   3. the English catalogue
 */
import type { LocaleCode } from '../locales';
import type { CutDefinition, NamingScheme } from '../../components/butchery/cutCatalog';

import { af } from './af';
import { de } from './de';
import { fr } from './fr';
import { nl } from './nl';
import { it } from './it';
import { es } from './es';
import { ptBR } from './pt-BR';
import { zhHans } from './zh-Hans';
import { ja } from './ja';
import { ko } from './ko';
import { hi } from './hi';
import { ru } from './ru';
import { ar } from './ar';

export interface CutDish { name: string; blurb: string }

export interface CutOverlay {
  name?: Partial<Record<NamingScheme, string>>;
  /** Short label drawn INSIDE the animal. Must stay short or it overflows. */
  tag?: Partial<Record<NamingScheme, string>>;
  usNote?: string;
  description?: string;
  texture?: string;
  bestFor?: string[];
  dishes?: CutDish[];
}

/** cut id -> overlay. A locale may omit cuts entirely. */
export type ButcheryOverlay = Record<string, CutOverlay>;

const OVERLAYS: Partial<Record<LocaleCode, ButcheryOverlay>> = {
  af, de, fr, nl, it, es,
  'pt-BR': ptBR,
  'zh-Hans': zhHans,
  ja, ko, hi, ru, ar,
  // `en` is deliberately absent — the catalogue IS English.
};

export interface ResolvedCutCopy {
  name: string;
  tag: string;
  usNote: string;
  description: string;
  texture: string;
  bestFor: string[];
  dishes: CutDish[];
}

/**
 * Merge the English catalogue entry with the locale overlay, per field.
 * `scheme` selects the ZA or US butchery naming convention.
 */
export function resolveCutCopy(
  cut: CutDefinition,
  locale: LocaleCode,
  scheme: NamingScheme,
): ResolvedCutCopy {
  const o = OVERLAYS[locale]?.[cut.id];
  return {
    name: o?.name?.[scheme] || cut.names[scheme],
    tag: o?.tag?.[scheme] || cut.tag[scheme],
    // An empty usNote is meaningful ("the conventions agree"), so only fall
    // back when the overlay omits the field entirely.
    usNote: o?.usNote ?? cut.usNote,
    description: o?.description || cut.description,
    texture: o?.texture || cut.texture,
    bestFor: o?.bestFor?.length ? o.bestFor : cut.bestFor,
    dishes: o?.dishes?.length ? o.dishes : cut.dishes,
  };
}

/** True when this locale has any butchery copy at all. */
export function hasButcheryOverlay(locale: LocaleCode): boolean {
  return !!OVERLAYS[locale];
}
