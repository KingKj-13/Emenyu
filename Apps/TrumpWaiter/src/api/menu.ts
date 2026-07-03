// Menu read API. GET /api/menu is public and returns the full menu. Shape varies by
// data source (array, { items }, or { categories: [{ items }] }), so we normalize
// defensively to MenuItem[] for offline browse/quote. Read-only — the app never
// mutates the menu (owner does that on the web).
import { api } from './apiClient';
import { EP } from './endpoints';
import type { MenuItem } from '../types/api';

type RawItem = Record<string, unknown>;

function toItem(raw: RawItem): MenuItem | null {
  const name = (raw.name ?? raw.title) as string | undefined;
  if (!name) return null;
  const idValue = (raw.id ?? raw._id ?? raw.itemId ?? name) as string | number;
  const priceRaw = raw.price ?? raw.amount;
  return {
    id: idValue,
    name: String(name),
    price: typeof priceRaw === 'number' ? priceRaw : Number(priceRaw) || undefined,
    category: (raw.category ?? raw.categoryName) as string | undefined,
    subcategory: (raw.subcategory ?? raw.subCategory) as string | undefined,
    categoryType: (raw.categoryType ?? raw.category_type) as string | undefined,
    description: (raw.description ?? raw.desc) as string | undefined,
    img: (raw.img ?? raw.image ?? raw.imageUrl) as string | undefined,
    available: raw.available !== false && raw.visible !== false
  };
}

function flatten(payload: unknown): MenuItem[] {
  const out: MenuItem[] = [];
  // `categoryTitle` (when known) is stamped onto items lacking their own category
  // so the Add-Item browser can group/filter reliably.
  const pushAll = (arr: unknown, categoryTitle?: string) => {
    if (Array.isArray(arr)) {
      for (const r of arr) {
        const item = toItem(r as RawItem);
        if (item) {
          if (!item.category && categoryTitle) item.category = categoryTitle;
          out.push(item);
        }
      }
    }
  };

  if (Array.isArray(payload)) {
    pushAll(payload);
  } else if (payload && typeof payload === 'object') {
    const obj = payload as Record<string, unknown>;
    if (Array.isArray(obj.items)) pushAll(obj.items);
    if (Array.isArray(obj.categories)) {
      for (const c of obj.categories as Record<string, unknown>[]) {
        const title = (c.title ?? c.name ?? c.category) as string | undefined;
        pushAll(c.items, title);
      }
    }
    // Fallback: object keyed by category → array of items.
    if (!out.length) {
      for (const [key, v] of Object.entries(obj)) pushAll(v, key);
    }
  }
  return out;
}

export const menuApi = {
  getItems: async (): Promise<MenuItem[]> => {
    const payload = await api.get<unknown>(EP.menu);
    return flatten(payload);
  }
};
