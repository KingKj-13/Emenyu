export interface MenuItem {
  id?: string;
  name: string;
  price: number;
  description?: string;
  calories?: string;
  allergens?: string;
  spice?: string;
  img?: string;
  video?: string;
  imageVisible?: boolean;
  videoVisible?: boolean;
  visible?: boolean;
  chefPick?: boolean;
  popular?: boolean;
  types?: string;
}

export interface MenuSubSection {
  title: string;
  visible?: boolean;
  items: MenuItem[];
}

export interface MenuCategory {
  visible?: boolean;
  items?: MenuItem[];
  [subKey: string]: MenuSubSection | MenuItem[] | boolean | undefined;
}

export interface MenuData {
  [categoryKey: string]: MenuCategory;
}

export interface MenuSection {
  title: string;
  items: MenuItem[];
  subSections: { title: string; items: MenuItem[] }[];
}

export interface Deal {
  items: MenuItem[];
  price: number;
}

export interface ChatSuggestionItem {
  name: string;
  price: number;
  description?: string;
  img?: string;
  category?: string;
  subcategory?: string;
  categoryType?: string;
  source_title?: string;
}

export interface ChatResponse {
  reply: string;
  suggestions?: ChatSuggestionItem[];
}

export interface Chapter {
  key: string;
  title: string;
  apiKey: string;
  subs?: string[] | null;
  excludeSubs?: string[];
}
