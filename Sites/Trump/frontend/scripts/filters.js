export const FILTER_OPTIONS = [
  { key: 'Beef', label: 'No Beef', mode: 'exclude' },
  { key: 'Chicken', label: 'No Chicken', mode: 'exclude' },
  { key: 'Pork', label: 'No Pork', mode: 'exclude' },
  { key: 'Lamb', label: 'No Lamb', mode: 'exclude' },
  { key: 'Seafood', label: 'No Seafood', mode: 'exclude' },
  { key: 'Egg', label: 'No Egg', mode: 'exclude' },
  { key: 'Gluten', label: 'No Gluten', mode: 'exclude' },
  { key: 'Nuts', label: 'No Nuts', mode: 'exclude' },
  { key: 'Vegan', label: 'Vegan Only', mode: 'include' },
  { key: 'Vegetarian', label: 'Vegetarian Only', mode: 'include' }
];

const FILTER_EMOJI = {
  Beef: 'Beef',
  Chicken: 'Chicken',
  Pork: 'Pork',
  Lamb: 'Lamb',
  Seafood: 'Seafood',
  Egg: 'Egg',
  Gluten: 'Gluten',
  Nuts: 'Nuts',
  Vegan: 'Vegan',
  Vegetarian: 'Vegetarian'
};

export function getFilterEmoji(key) {
  return FILTER_EMOJI[key] || key;
}

export class FilterStore {
  constructor() {
    this.active = new Set();
    this.listeners = new Set();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  notify() {
    const activeFilters = new Set(this.active);
    this.listeners.forEach(listener => listener(activeFilters));
  }

  toggle(key) {
    if (this.active.has(key)) {
      this.active.delete(key);
    } else {
      this.active.add(key);
    }

    this.notify();
  }

  clear() {
    this.active.clear();
    this.notify();
  }

  remove(key) {
    this.active.delete(key);
    this.notify();
  }

  has(key) {
    return this.active.has(key);
  }

  values() {
    return [...this.active];
  }

  shouldHideItem(item = {}) {
    if (this.active.size === 0) {
      return false;
    }

    const allergens = String(item.allergens || '').toLowerCase();
    const types = String(item.types || '').toLowerCase();
    const fullText = [item.name, item.description, item.allergens, item.types].join(' ').toLowerCase();

    for (const filter of this.active) {
      const lower = filter.toLowerCase();
      if (lower === 'vegan' || lower === 'vegetarian') {
        if (!fullText.includes(lower)) {
          return true;
        }
        continue;
      }

      if (allergens.includes(lower) || types.includes(lower)) {
        return true;
      }
    }

    return false;
  }
}

function matchesSearch(item = {}, searchQuery = '') {
  if (!searchQuery) {
    return true;
  }

  const query = searchQuery.toLowerCase();
  const haystack = [item.name, item.description, item.allergens, item.types].join(' ').toLowerCase();
  return haystack.includes(query);
}

function visibleItems(items = [], filterStore, searchQuery) {
  return items.filter(item => item.visible !== false && !filterStore.shouldHideItem(item) && matchesSearch(item, searchQuery));
}

export function buildMenuSections(menuData, filterStore, searchQuery = '') {
  const sections = [];

  Object.entries(menuData || {}).forEach(([categoryTitle, categoryValue]) => {
    if (!categoryValue || categoryValue.visible === false) {
      return;
    }

    if (Array.isArray(categoryValue)) {
      const items = visibleItems(categoryValue, filterStore, searchQuery);
      if (items.length > 0) {
        sections.push({ title: categoryTitle, items, subSections: [] });
      }
      return;
    }

    const directItems = visibleItems(categoryValue.items || [], filterStore, searchQuery);
    const subSections = [];

    Object.entries(categoryValue).forEach(([subTitle, subValue]) => {
      if (subTitle === 'items' || subTitle === 'visible' || !subValue || subValue.visible === false) {
        return;
      }

      const items = visibleItems(subValue.items || [], filterStore, searchQuery);
      if (items.length > 0) {
        subSections.push({ title: subTitle, items });
      }
    });

    if (directItems.length > 0 || subSections.length > 0) {
      sections.push({
        title: categoryTitle,
        items: directItems,
        subSections
      });
    }
  });

  return sections;
}

export function flattenMenu(menuData) {
  const allItems = [];

  buildMenuSections(menuData, { shouldHideItem: () => false }, '').forEach(section => {
    section.items.forEach(item => allItems.push(item));
    section.subSections.forEach(subSection => {
      subSection.items.forEach(item => allItems.push(item));
    });
  });

  return allItems;
}
