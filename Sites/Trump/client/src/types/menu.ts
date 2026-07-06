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
  revenuePerImpression?: number;
}

// Recommended-order bundles (Phase 5). The public shape matches the existing
// PersonaOrder used by RecommendedOrders; admin shape adds the editable fields.
export interface BundleItemInput {
  course: string;
  itemName: string;
  price: number;
  itemId?: number | null;
  sortOrder?: number;
}

export interface BundleAdmin {
  id: number;
  slug: string;
  persona: string;
  description: string;
  icon: string;
  accent: string;
  active: boolean;
  priority: number;
  rotationGroup: string;
  sortOrder: number;
  items: BundleItemInput[];
}

export interface BundleInput {
  persona: string;
  description?: string;
  icon?: string;
  accent?: string;
  active?: boolean;
  priority?: number;
  rotationGroup?: string;
  sortOrder?: number;
  slug?: string;
  items?: BundleItemInput[];
}

export interface RecommendationAnalytics {
  totals: RecoTally;
  topShown: RecoTally[];
  topClicked: RecoTally[];
  topConverting: RecoTally[];
  underperforming?: RecoTally[];
  topRevenue: RecoTally[];
  bySource: RecoTally[];
  byRotationGroup: RecoTally[];
  byBundle?: RecoTally[];
  items: RecoTally[];
  eventCount: number;
}

export interface RecoInsight {
  severity: 'high' | 'medium' | 'low';
  type: string;
  title: string;
  detail: string;
  action: string;
  name?: string;
  recId?: number;
  rotationGroup?: string;
  impressions?: number;
  acceptanceRate?: number;
}

export interface RecoInsightsResult {
  count: number;
  counts: Record<string, number>;
  insights: RecoInsight[];
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
  // Phase 3 (Dining Concierge) -- same fields cartRecommendations()/recommend()
  // already return; the chat card can now show WHY and offer Replace/Premium.
  reason?: string;
  chef?: boolean;
  rotationGroup?: string;
  confidence?: number;
  expectedValue?: number;
  netRevenueIncrease?: number;
  replacement?: { name: string; previousPrice: number } | null;
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
