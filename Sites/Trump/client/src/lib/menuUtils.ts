import type { MenuData, MenuSection, MenuItem, Chapter } from '../types/menu';

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

function shouldHideItem(item: MenuItem, activeFilters: Set<string>): boolean {
  if (activeFilters.size === 0) return false;
  const allergens = String(item.allergens || '').toLowerCase();
  const fullText = [item.name, item.description, item.allergens, item.types].join(' ').toLowerCase();
  for (const filter of activeFilters) {
    const lower = filter.toLowerCase();
    if (lower === 'vegan' || lower === 'vegetarian') {
      if (!fullText.includes(lower)) return true;
      continue;
    }
    if (allergens.includes(lower) || fullText.includes(lower)) return true;
  }
  return false;
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
      sections.push({ title: categoryTitle, items: directItems, subSections });
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
  return `R ${price.toFixed(0)}`;
}

export function formatTableLabel(rawValue: string): string {
  const raw = String(rawValue || 'unknown');
  if (raw.toLowerCase().startsWith('table')) return raw.replace(/^table/i, 'Table ');
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}
