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

export function courseLabel(course: Course): string {
  return COURSE_LABELS[course];
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

export interface JourneySlot {
  rec: RecommendationItem;
  slotLabel: string;
  youChoice: boolean;
}

export interface JourneyPlan {
  slots: JourneySlot[];
  narrative: string;
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
    rec ? { rec, slotLabel: courseLabel(courseOf(rec)), youChoice: false } : null;

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
  const thisSlot: JourneySlot = { rec: thisRec, slotLabel: courseLabel(curCourse), youChoice: true };

  const pn = prettyName;
  let order: (JourneySlot | null)[];
  let narrative: string;

  switch (curCourse) {
    case 'STARTER': {
      const before = take(['DRINK', 'WINE']);
      const after = take(['MAIN']);
      order = [slot(before), thisSlot, slot(after)];
      narrative = after
        ? `Many guests begin with our ${pn(current.name)} before enjoying the ${pn(after.name)}.`
        : before
          ? `Start with our ${pn(current.name)} alongside a ${pn(before.name)}.`
          : `A refined way to begin the evening.`;
      break;
    }
    case 'MAIN': {
      const before = take(['STARTER', 'DRINK', 'WINE']);
      const after = take(['DESSERT', 'DRINK', 'WINE']);
      order = [slot(before), thisSlot, slot(after)];
      narrative = before && after
        ? `Pair your ${pn(current.name)} with our ${pn(before.name)}, then finish with the ${pn(after.name)}.`
        : before
          ? `Our ${pn(current.name)} pairs beautifully with our ${pn(before.name)}.`
          : after
            ? `Enjoy our ${pn(current.name)}, then finish with the ${pn(after.name)}.`
            : `Our signature ${pn(current.name)} — the heart of the table.`;
      break;
    }
    case 'DRINK':
    case 'WINE': {
      const c1 = take(['MAIN', 'STARTER']);
      const c2 = take(['STARTER', 'MAIN', 'DESSERT', 'SIDE']);
      order = [thisSlot, slot(c1), slot(c2)];
      narrative = c1 && c2
        ? `Our ${pn(current.name)} pairs beautifully with the ${pn(c1.name)} and the ${pn(c2.name)}.`
        : c1
          ? `Our ${pn(current.name)} pairs beautifully with the ${pn(c1.name)}.`
          : `A standout pour from our list.`;
      break;
    }
    case 'DESSERT': {
      const main = take(['MAIN', 'STARTER']);
      const sip = take(['DRINK', 'WINE']);
      order = [slot(main), slot(sip), thisSlot];
      narrative = main
        ? `After our ${pn(main.name)}, finish the evening with our ${pn(current.name)}${sip ? `, alongside a ${pn(sip.name)}` : ''}.`
        : `Finish the evening on a sweet note with our ${pn(current.name)}.`;
      break;
    }
    default: { // SIDE / OTHER
      const before = take(['MAIN']);
      const after = take(['DRINK', 'WINE', 'STARTER', 'DESSERT']);
      order = [slot(before), thisSlot, slot(after)];
      narrative = before
        ? `Our ${pn(current.name)} is the perfect companion to the ${pn(before.name)}.`
        : `A delicious addition to the table.`;
    }
  }

  const slots = order.filter((s): s is JourneySlot => s !== null);
  const leftovers = avail
    .filter(cand => !used.has(cand))
    .map((rec): JourneySlot => ({ rec, slotLabel: courseLabel(courseOf(rec)), youChoice: false }));
  return { slots, narrative, leftovers };
}
