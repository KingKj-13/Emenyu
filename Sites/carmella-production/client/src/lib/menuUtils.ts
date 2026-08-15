import type { MenuData, MenuSection, MenuItem, Chapter } from '../types/menu';
import { formatCurrency } from './currency';

export function normalizeName(raw: string): string {
  return String(raw || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function matchesSearch(item: MenuItem, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return [item.name, item.description, item.allergens, item.types, item.category, item.subcategory]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .includes(q);
}

// Two different tag shapes exist across tenants' real data (see
// MenuItemTagsField's own comment in types/menu.ts): Trump's is a structured
// object (tags.protein: [...], tags.dietary: [...]); Carmella's is a flat
// array of plain category strings (tags: ["seafood","spicy"]). Checking only
// `.protein`/`.dietary` silently no-ops on Carmella's flat-array items
// (item.tags.protein is undefined there) -- this normalizes either shape
// into one flat, lowercased list so a single check works against both.
function tagList(item: MenuItem): string[] {
  const tags = item.tags;
  if (Array.isArray(tags)) return tags.map(t => String(t).toLowerCase());
  if (tags && typeof tags === 'object') {
    return [...(tags.protein ?? []), ...(tags.dietary ?? [])].map(t => String(t).toLowerCase());
  }
  return [];
}

// "Pork Free" maps onto the protein-ish tag values, which
// scripts/enrich-menu-tags.js populates on every Trump item (100% coverage,
// with a name-keyword fallback) and Carmella's data carries directly in its
// flat tag array -- unlike the legacy `allergens` string column, which is
// only set on ~38% of items.
const PROTEIN_FILTER_KEYS = new Set(['pork']);

// Allergen-style "X Free" filters -- Trump's data normalizes these into
// "contains-x" tag values (DIETARY_TOKENS in enrich-menu-tags.js); check both
// that form and the bare word, since Carmella's flat tags may use either.
const DIETARY_EXCLUDE_TAGS: Record<string, string[]> = {
  egg: ['contains-egg', 'egg'],
  gluten: ['contains-gluten', 'gluten'],
  nuts: ['contains-nuts', 'nuts', 'nut'],
  dairy: ['contains-dairy', 'dairy'],
};

// "Include only" filters beyond vegan/vegetarian (which get their own
// bespoke matching below) -- an item must be explicitly tagged/labeled
// halal to pass; there is no negative-inference rule for it the way pork
// mentions imply "not halal" (a menu simply not saying "halal" doesn't mean
// it isn't -- absence of a tag isn't a certification claim either way), so
// this only ever surfaces items positively marked as such.
const INCLUDE_ONLY_TAGS = new Set(['halal']);

// Exported so useFilters.ts (the identical guest-facing menu drawer) shares
// this exact logic instead of maintaining its own copy that can drift.
export function shouldHideItemForFilters(item: MenuItem, activeFilters: Set<string>): boolean {
  if (activeFilters.size === 0) return false;
  const allergens = String(item.allergens || '').toLowerCase();
  const fullText = [item.name, item.description, item.allergens, item.types].join(' ').toLowerCase();
  const tags = tagList(item);

  for (const filter of activeFilters) {
    const lower = filter.toLowerCase();

    if (lower === 'vegan') {
      if (!tags.includes('vegan') && !fullText.includes('vegan')) return true;
      continue;
    }
    if (lower === 'vegetarian') {
      // Vegan dishes are also vegetarian even if a specific item's data only
      // ever tagged it "vegan" and not "vegetarian".
      const isVegetarian = tags.includes('vegetarian') || tags.includes('vegan') || fullText.includes('vegetarian');
      if (!isVegetarian) return true;
      continue;
    }
    if (INCLUDE_ONLY_TAGS.has(lower)) {
      if (!tags.includes(lower) && !fullText.includes(lower)) return true;
      continue;
    }
    if (PROTEIN_FILTER_KEYS.has(lower)) {
      if (tags.includes(lower) || allergens.includes(lower) || fullText.includes(lower)) return true;
      continue;
    }
    if (DIETARY_EXCLUDE_TAGS[lower]) {
      if (DIETARY_EXCLUDE_TAGS[lower].some(t => tags.includes(t)) || allergens.includes(lower) || fullText.includes(lower)) return true;
      continue;
    }
    // Fallback for any filter key not explicitly mapped above.
    if (allergens.includes(lower) || fullText.includes(lower)) return true;
  }
  return false;
}

function shouldHideItem(item: MenuItem, activeFilters: Set<string>): boolean {
  return shouldHideItemForFilters(item, activeFilters);
}

// Daypart filter is separate from the Day/Night visual theme: an item tagged
// 'day' or 'night' only appears in the browsable menu during that half of the
// clock; 'both' (the default) always shows. `activeDaypart` is undefined
// while the theme hasn't loaded yet, in which case nothing is filtered out.
function matchesDaypart(item: MenuItem, activeDaypart?: 'day' | 'night'): boolean {
  if (!activeDaypart) return true;
  const itemDaypart = item.daypart || 'both';
  return itemDaypart === 'both' || itemDaypart === activeDaypart;
}

export type MealPeriod = 'breakfast' | 'lunch' | 'dinner';

// Breakfast 07:00-11:00, Lunch 11:00-17:00, Dinner 17:00 onward (including
// the overnight stretch back round to 07:00 -- late-night service is still
// "dinner", not a fourth period). Based on the guest's own local clock, same
// as the Day/Night theme's own time source.
export function getCurrentMealPeriod(now: Date = new Date()): MealPeriod {
  const mins = now.getHours() * 60 + now.getMinutes();
  if (mins >= 7 * 60 && mins < 11 * 60) return 'breakfast';
  if (mins >= 11 * 60 && mins < 17 * 60) return 'lunch';
  return 'dinner';
}

// Independent of matchesDaypart (that's the visual theme; this actually
// hides the item outside its own meal service window). 'all_day' or an
// absent value always shows.
function matchesMealPeriod(item: MenuItem, currentMealPeriod?: MealPeriod): boolean {
  if (!currentMealPeriod) return true;
  const itemPeriod = item.mealPeriod || 'all_day';
  return itemPeriod === 'all_day' || itemPeriod === currentMealPeriod;
}

function visibleItems(items: MenuItem[], activeFilters: Set<string>, query: string, activeDaypart?: 'day' | 'night', currentMealPeriod?: MealPeriod): MenuItem[] {
  return items.filter(
    item => item.visible !== false
      && matchesDaypart(item, activeDaypart)
      && matchesMealPeriod(item, currentMealPeriod)
      && !shouldHideItem(item, activeFilters)
      && matchesSearch(item, query)
  );
}

export function buildMenuSections(
  menuData: MenuData,
  activeFilters: Set<string>,
  searchQuery = '',
  activeDaypart?: 'day' | 'night',
  currentMealPeriod?: MealPeriod
): MenuSection[] {
  const sections: MenuSection[] = [];

  Object.entries(menuData || {}).forEach(([categoryTitle, categoryValue]) => {
    if (!categoryValue || categoryValue.visible === false) return;

    if (Array.isArray(categoryValue)) {
      const items = visibleItems(categoryValue as MenuItem[], activeFilters, searchQuery, activeDaypart, currentMealPeriod);
      if (items.length > 0) sections.push({ title: categoryTitle, items, subSections: [] });
      return;
    }

    const directItems = visibleItems(
      (categoryValue.items as MenuItem[]) || [],
      activeFilters,
      searchQuery,
      activeDaypart,
      currentMealPeriod
    );
    const subSections: { title: string; items: MenuItem[] }[] = [];

    Object.entries(categoryValue).forEach(([subTitle, subValue]) => {
      if (subTitle === 'items' || subTitle === 'visible' || !subValue) return;
      if (typeof subValue !== 'object' || Array.isArray(subValue)) return;
      const sv = subValue as { visible?: boolean; items?: MenuItem[] };
      if (sv.visible === false) return;
      const items = visibleItems(sv.items || [], activeFilters, searchQuery, activeDaypart, currentMealPeriod);
      if (items.length > 0) subSections.push({ title: subTitle, items });
    });

    if (directItems.length > 0 || subSections.length > 0) {
      const intro = typeof categoryValue.intro === 'string' ? categoryValue.intro : undefined;
      sections.push({ title: categoryTitle, intro, items: directItems, subSections });
    }
  });

  return sections;
}

export function flattenMenu(menuData: MenuData): MenuItem[] {
  const all: MenuItem[] = [];
  buildMenuSections(menuData, new Set(), '').forEach(section => {
    section.items.forEach(item => all.push(item));
    section.subSections.forEach(sub => sub.items.forEach(item => all.push(item)));
  });
  return all;
}

export function getChapterItems(menuData: MenuData, chapter: Chapter): MenuItem[] {
  const category = menuData[chapter.apiKey];
  if (!category) return [];

  const subs = chapter.subs;
  const excludeSubs = chapter.excludeSubs || [];

  if (subs && subs.length > 0) {
    const items: MenuItem[] = [];
    subs.forEach(subKey => {
      const sub = category[subKey] as { items?: MenuItem[] } | undefined;
      if (sub?.items) items.push(...sub.items);
    });
    return items.filter(i => i.visible !== false);
  }

  if (excludeSubs.length > 0) {
    const direct = ((category.items as MenuItem[]) || []).filter(i => i.visible !== false);
    const fromSubs: MenuItem[] = [];
    Object.entries(category).forEach(([key, val]) => {
      if (key === 'items' || key === 'visible') return;
      if (excludeSubs.includes(key)) return;
      const sv = val as { items?: MenuItem[] } | undefined;
      if (sv?.items) fromSubs.push(...sv.items.filter(i => i.visible !== false));
    });
    return [...direct, ...fromSubs];
  }

  const direct = ((category.items as MenuItem[]) || []).filter(i => i.visible !== false);
  const fromSubs: MenuItem[] = [];
  Object.entries(category).forEach(([key, val]) => {
    if (key === 'items' || key === 'visible') return;
    const sv = val as { items?: MenuItem[] } | undefined;
    if (sv?.items) fromSubs.push(...sv.items.filter(i => i.visible !== false));
  });
  return [...direct, ...fromSubs];
}

export function formatPrice(price: number): string {
  return formatCurrency(price);
}

export function formatTableLabel(rawValue: string): string {
  const raw = String(rawValue || 'unknown');
  if (raw.toLowerCase().startsWith('table')) return raw.replace(/^table/i, 'Table ');
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}
