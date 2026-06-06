export interface MenuItem {
  id?: string;
  dbId?: number;
  name: string;
  price: number;
  description?: string;
  calories?: string;
  allergens?: string;
  spice?: string;
  img?: string;
  video?: string;
  youtubeId?: string;
  imageVisible?: boolean;
  videoVisible?: boolean;
  visible?: boolean;
  available?: boolean;
  chefPick?: boolean;
  popular?: boolean;
  types?: string;
  category?: string;
  subcategory?: string;
  // Authoritative server-side classification (Phase 3). When present the client
  // consumes these instead of re-deriving the category locally.
  categoryType?: string;
  beverageKind?: string;
}

// Chef-controlled per-item recommendation (Phase 3, Task 8 owner controls).
export type ChefRecType = 'DISH' | 'SIDE' | 'DESSERT' | 'BEVERAGE';
export type ChefBeverageKind = 'WINE' | 'COCKTAIL' | 'BEER' | 'SOFT' | 'HOT' | 'NONE';

export interface ChefRec {
  id: number;
  sourceItemId: number;
  sourceName: string;
  targetItemId: number;
  targetName: string;
  recType: ChefRecType;
  beverageKind: ChefBeverageKind;
  priority: number;
  active: boolean;
  season: string;
  rotationGroup: string;
  reason: string;
}

export interface ChefRecInput {
  sourceItemId: number;
  targetItemId: number;
  recType: ChefRecType;
  beverageKind?: ChefBeverageKind;
  priority?: number;
  active?: boolean;
  season?: string;
  rotationGroup?: string;
  reason?: string;
}

// Recommendation analytics (Phase 4). One tally row + the dashboard payload.
export interface RecoTally {
  name?: string;
  source?: string;
  recType?: string;
  rotationGroup?: string;
  chef?: boolean;
  impressions: number;
  clicks: number;
  accepted: number;
  dismissed: number;
  ordered: number;
  revenue: number;
  revenueOrdered?: number;
  clickRate: number;
  acceptanceRate: number;
  dismissalRate: number;
  conversionRate: number;
}

export interface RecommendationAnalytics {
  totals: RecoTally;
  topShown: RecoTally[];
  topClicked: RecoTally[];
  topConverting: RecoTally[];
  topRevenue: RecoTally[];
  bySource: RecoTally[];
  byRotationGroup: RecoTally[];
  items: RecoTally[];
  eventCount: number;
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
  video?: string;
  youtubeId?: string;
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
