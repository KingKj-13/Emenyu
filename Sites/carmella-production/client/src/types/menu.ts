// Dietary/allergy tags. Carmella's source data is a flat array of plain
// category strings (e.g. ["seafood","spicy"], ["vegetarian"], ["alcohol"]).
export interface MenuItemTags {
  protein?: string[];
  dietary?: string[];
  flavour?: string[];
  texture?: string[];
}

export type MenuItemTagsField = MenuItemTags | string[];

export interface MenuItemVariant {
  dbId?: number;
  name: string;
  price: number;
  img?: string;
  isAddon?: boolean;
}

export interface MenuItem {
  id?: string;
  dbId?: number;
  name: string;
  price: number;
  description?: string;
  story?: string;
  subtitle?: string;
  calories?: string;
  allergens?: string;
  tags?: MenuItemTagsField;
  spice?: string;
  img?: string;
  imageVisible?: boolean;
  visible?: boolean;
  available?: boolean;
  // Three-state superset of `available` (available | ask | unavailable).
  // Falls back to `available` when absent.
  availability?: 'available' | 'ask' | 'unavailable';
  popular?: boolean;
  types?: string;
  category?: string;
  subcategory?: string;
  categoryType?: string;
  beverageKind?: string;
  // Multi-choice items (e.g. "Amy's Choice"). Absent/empty for single-price items.
  variants?: MenuItemVariant[];
}

export interface MenuSubSection {
  title: string;
  visible?: boolean;
  items: MenuItem[];
}

export interface MenuCategory {
  visible?: boolean;
  items?: MenuItem[];
  // Chapter narrative opener.
  intro?: string;
  slug?: string;
  [subKey: string]: MenuSubSection | MenuItem[] | boolean | string | undefined;
}

export interface MenuData {
  [categoryKey: string]: MenuCategory;
}

export interface MenuSection {
  title: string;
  intro?: string;
  items: MenuItem[];
  subSections: { title: string; items: MenuItem[] }[];
}

export interface AppConfig {
  brandName: string;
  tableCount: number;
  vatRate: number;
  serviceRate: number;
}

export interface Chapter {
  key: string;
  title: string;
  apiKey: string;
  subs?: string[] | null;
  excludeSubs?: string[];
}
