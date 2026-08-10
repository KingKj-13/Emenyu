// Course-aware "meal journey" planner for the item modal's recommendation card.
//
// The dish whose modal is open always holds the "Your choice" slot; the two
// flanking slots and the italic narrative adapt to ITS course — a starter leads
// into a main, a main is bracketed by a starter/drink and a dessert, a drink
// fronts the dishes it complements, and so on. Slot labels are derived from each
// item's own course (categoryType, with text fallbacks) — never hard-coded.
import { isDrinkItem, isDessertItem } from '../../lib/imageResolver';
import type { MenuItem } from '../../types/menu';
import type { RecommendationItem } from './RecommendationCard';

export type Course = 'STARTER' | 'MAIN' | 'DESSERT' | 'DRINK' | 'WINE' | 'SIDE' | 'OTHER';

// The 3 planned slots are unbounded elsewhere in the pipeline, but the
// "extras beyond 3 continue in the scroll row" leftovers had no cap at all —
// the one path in the recommendation system with no budget ceiling. Matches
// the ~4-item cap every other recommendation surface already enforces.
const MAX_JOURNEY_LEFTOVERS = 4;

type Classifiable = {
  name: string;
  description?: string;
  category?: string;
  subcategory?: string;
  types?: string;
  categoryType?: string;
  beverageKind?: string;
};

const COURSE_LABELS: Record<Course, string> = {
  STARTER: 'Starter',
  MAIN: 'Main',
  DESSERT: 'Dessert',
  DRINK: 'Drink',
  WINE: 'Wine',
  SIDE: 'Side',
  OTHER: 'Dish',
};

/** Message key per course, so the slot chips read in the guest's language.
 *  SIDE and OTHER have no key of their own and fall back to the English. */
const COURSE_KEYS: Partial<Record<Course, MessageKey>> = {
  STARTER: 'reco.course.starter',
  MAIN: 'reco.course.main',
  DESSERT: 'reco.course.dessert',
  DRINK: 'reco.course.drink',
  WINE: 'reco.course.drink',
};

export function courseLabel(course: Course): string {
  return COURSE_LABELS[course];
}

export function courseLabelKey(course: Course): MessageKey | null {
  return COURSE_KEYS[course] ?? null;
}

function norm(value: string): string {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

// Resolve an item's course. Prefer the authoritative server classification
// (categoryType); fall back to the shared drink/dessert detectors and then to
// keyword heuristics so legacy items without categoryType still slot sensibly.
export function courseOf(item: Classifiable): Course {
  const ct = String(item.categoryType || '').toUpperCase();
  if (ct === 'STARTER' || ct === 'MAIN' || ct === 'DESSERT' || ct === 'DRINK' || ct === 'WINE' || ct === 'SIDE') {
    return ct as Course;
  }
  const asMenu = {
    name: item.name,
    categoryType: item.categoryType,
    beverageKind: item.beverageKind,
    category: item.category,
    subcategory: item.subcategory,
    types: item.types,
  } as MenuItem;
  if (isDrinkItem(asMenu)) return 'DRINK';
  if (isDessertItem(asMenu)) return 'DESSERT';
  const text = `${item.name} ${item.description || ''} ${item.category || ''} ${item.subcategory || ''} ${item.types || ''}`.toLowerCase();
  if (/(starter|appet|meze|mezze|tapas|small plate|snack|\bdip\b)/.test(text)) return 'STARTER';
  if (/(\bside\b|fries|chips|onion ring|garlic bread|coleslaw)/.test(text)) return 'SIDE';
  return 'MAIN';
}

// Re-case fully-uppercase menu names for the narrative; leave nicely-cased
// names untouched ("SPRINGBOK CARPACCIO" → "Springbok Carpaccio").
export function prettyName(name: string): string {
  const value = String(name || '').trim();
  if (!value || /[a-z]/.test(value)) return value;
  return value.toLowerCase().replace(/\b([a-z])/g, (_, c: string) => c.toUpperCase());
}

import type { MessageKey } from '../../i18n/messages/en';

/** A narrative as a message key plus its dish-name slots, so the sentence can
 *  be reordered by the translator instead of concatenated here. */
export interface JourneyNarrative {
  key: MessageKey;
  params?: Record<string, string>;
}

export interface JourneySlot {
  rec: RecommendationItem;
  slotLabel: string;
  slotLabelKey: MessageKey | null;
  youChoice: boolean;
}

export interface JourneyPlan {
  slots: JourneySlot[];
  narrative: JourneyNarrative;
  // Recommendations the engine returned beyond the 3-slot journey. They continue
  // in the same horizontal row so nothing the engine produced is ever dropped.
  leftovers: JourneySlot[];
}

export function planJourney(current: MenuItem, pool: RecommendationItem[]): JourneyPlan {
  const curCourse = courseOf(current as Classifiable);
  const curKey = norm(current.name);
  const avail = pool.filter(p => norm(p.name) !== curKey);
  const used = new Set<RecommendationItem>();

  // Pull the first available recommendation whose course matches one of `prefs`
  // (in order of preference), marking it used so a slot is never filled twice.
  const take = (prefs: Course[]): RecommendationItem | null => {
    for (const course of prefs) {
      const found = avail.find(cand => !used.has(cand) && courseOf(cand) === course);
      if (found) { used.add(found); return found; }
    }
    return null;
  };

  const slot = (rec: RecommendationItem | null): JourneySlot | null =>
    rec ? { rec, slotLabel: courseLabel(courseOf(rec)), slotLabelKey: courseLabelKey(courseOf(rec)), youChoice: false } : null;

  const thisRec: RecommendationItem = {
    name: current.name,
    price: current.price,
    description: current.description,
    categoryType: current.categoryType,
    beverageKind: current.beverageKind,
    img: current.img,
    video: current.video,
    reason: current.description,
  };
  const thisSlot: JourneySlot = { rec: thisRec, slotLabel: courseLabel(curCourse), slotLabelKey: courseLabelKey(curCourse), youChoice: true };

  const pn = prettyName;
  let order: (JourneySlot | null)[];
  let narrative: JourneyNarrative;

  switch (curCourse) {
    case 'STARTER': {
      const before = take(['DRINK', 'WINE']);
      const after = take(['MAIN']);
      order = [slot(before), thisSlot, slot(after)];
      narrative = after
        ? { key: 'journey.starterThenMain', params: { a: pn(current.name), b: pn(after.name) } }
        : before
          ? { key: 'journey.starterWithDrink', params: { a: pn(current.name), b: pn(before.name) } }
          : { key: 'journey.starterOnly' };
      break;
    }
    case 'MAIN': {
      const before = take(['STARTER', 'DRINK', 'WINE']);
      const after = take(['DESSERT', 'DRINK', 'WINE']);
      order = [slot(before), thisSlot, slot(after)];
      narrative = before && after
        ? { key: 'journey.mainBoth', params: { a: pn(current.name), b: pn(before.name), c: pn(after.name) } }
        : before
          ? { key: 'journey.mainBefore', params: { a: pn(current.name), b: pn(before.name) } }
          : after
            ? { key: 'journey.mainAfter', params: { a: pn(current.name), b: pn(after.name) } }
            : { key: 'journey.mainOnly', params: { a: pn(current.name) } };
      break;
    }
    case 'DRINK':
    case 'WINE': {
      const c1 = take(['MAIN', 'STARTER']);
      const c2 = take(['STARTER', 'MAIN', 'DESSERT', 'SIDE']);
      order = [thisSlot, slot(c1), slot(c2)];
      narrative = c1 && c2
        ? { key: 'journey.drinkTwo', params: { a: pn(current.name), b: pn(c1.name), c: pn(c2.name) } }
        : c1
          ? { key: 'journey.drinkOne', params: { a: pn(current.name), b: pn(c1.name) } }
          : { key: 'journey.drinkOnly' };
      break;
    }
    case 'DESSERT': {
      const main = take(['MAIN', 'STARTER']);
      const sip = take(['DRINK', 'WINE']);
      order = [slot(main), slot(sip), thisSlot];
      narrative = main
        ? (sip
          ? { key: 'journey.dessertAfterWithSip', params: { a: pn(main.name), b: pn(current.name), c: pn(sip.name) } }
          : { key: 'journey.dessertAfter', params: { a: pn(main.name), b: pn(current.name) } })
        : { key: 'journey.dessertOnly', params: { a: pn(current.name) } };
      break;
    }
    default: { // SIDE / OTHER
      const before = take(['MAIN']);
      const after = take(['DRINK', 'WINE', 'STARTER', 'DESSERT']);
      order = [slot(before), thisSlot, slot(after)];
      narrative = before
        ? { key: 'journey.sideWith', params: { a: pn(current.name), b: pn(before.name) } }
        : { key: 'journey.sideOnly' };
    }
  }

  const slots = order.filter((s): s is JourneySlot => s !== null);
  const leftovers = avail
    .filter(cand => !used.has(cand))
    .slice(0, MAX_JOURNEY_LEFTOVERS)
    .map((rec): JourneySlot => ({ rec, slotLabel: courseLabel(courseOf(rec)), slotLabelKey: courseLabelKey(courseOf(rec)), youChoice: false }));
  return { slots, narrative, leftovers };
}
