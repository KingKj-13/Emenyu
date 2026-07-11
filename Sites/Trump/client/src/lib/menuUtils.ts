import type { MenuData, MenuSection, MenuItem, Chapter } from '../types/menu';
import { formatCurrency } from './currency';

export function normalizeName(raw: string): string {
  return String(raw || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function matchesSearch(item: MenuItem, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return [item.name, item.description, item.allergens, item.types]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .includes(q);
}

// Protein-family "No X" filters map onto item.tags.protein, which
// scripts/enrich-menu-tags.js populates on every item (100% coverage, with a
// name-keyword fallback) -- unlike the legacy `allergens` string column,
// which is only set on ~38% of items and never uses "Shellfish" as a token
// (it uses "Seafood"), so a squid/prawn dish could slip through a "No
// Seafood" toggle or a "calamari" search with the old text-only check.
const PROTEIN_FILTER_KEYS = new Set(['beef', 'chicken', 'pork', 'lamb', 'seafood']);

// Allergen-style "No X" filters map onto item.tags.dietary, which normalizes
// the same allergens tokens into consistent values via DIETARY_TOKENS in
// enrich-menu-tags.js.
const DIETARY_EXCLUDE_TAG: Record<string, string> = {
  egg: 'contains-egg',
  gluten: 'contains-gluten',
  nuts: 'contains-nuts',
};

// Exported so useFilters.ts (the identical guest-facing menu drawer) shares
// this exact logic instead of maintaining its own copy that can drift.
export function shouldHideItemForFilters(item: MenuItem, activeFilters: Set<string>): boolean {
  if (activeFilters.size === 0) return false;
  const allergens = String(item.allergens || '').toLowerCase();
  const fullText = [item.name, item.description, item.allergens, item.types].join(' ').toLowerCase();
  const proteinTags = item.tags?.protein ?? [];
  const dietaryTags = item.tags?.dietary ?? [];

  for (const filter of activeFilters) {
    const lower = filter.toLowerCase();

    if (lower === 'vegan') {
      if (!dietaryTags.includes('vegan') && !fullText.includes('vegan')) return true;
      continue;
    }
    if (lower === 'vegetarian') {
      // Vegan dishes are also vegetarian even if a specific item's data only
      // ever tagged it "vegan" and not "vegetarian".
      const isVegetarian = dietaryTags.includes('vegetarian') || dietaryTags.includes('vegan') || fullText.includes('vegetarian');
      if (!isVegetarian) return true;
      continue;
    }
    if (PROTEIN_FILTER_KEYS.has(lower)) {
      if (proteinTags.includes(lower) || allergens.includes(lower) || fullText.includes(lower)) return true;
      continue;
    }
    if (DIETARY_EXCLUDE_TAG[lower]) {
      if (dietaryTags.includes(DIETARY_EXCLUDE_TAG[lower]) || allergens.includes(lower) || fullText.includes(lower)) return true;
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

function visibleItems(items: MenuItem[], activeFilters: Set<string>, query: string): MenuItem[] {
  return items.filter(
    item => item.visible !== false && !shouldHideItem(item, activeFilters) && matchesSearch(item, query)
  );
}

export function buildMenuSections(
  menuData: MenuData,
  activeFilters: Set<string>,
  searchQuery = ''
): MenuSection[] {
  const sections: MenuSection[] = [];

  Object.entries(menuData || {}).forEach(([categoryTitle, categoryValue]) => {
    if (!categoryValue || categoryValue.visible === false) return;

    if (Array.isArray(categoryValue)) {
      const items = visibleItems(categoryValue as MenuItem[], activeFilters, searchQuery);
      if (items.length > 0) sections.push({ title: categoryTitle, items, subSections: [] });
      return;
    }

    const directItems = visibleItems(
      (categoryValue.items as MenuItem[]) || [],
      activeFilters,
      searchQuery
    );
    const subSections: { title: string; items: MenuItem[] }[] = [];

    Object.entries(categoryValue).forEach(([subTitle, subValue]) => {
      if (subTitle === 'items' || subTitle === 'visible' || !subValue) return;
      if (typeof subValue !== 'object' || Array.isArray(subValue)) return;
      const sv = subValue as { visible?: boolean; items?: MenuItem[] };
      if (sv.visible === false) return;
      const items = visibleItems(sv.items || [], activeFilters, searchQuery);
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
