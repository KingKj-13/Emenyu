// Waiter-AI API response shapes — mirrored from the web client
// (client/src/types/waiter.ts). The SERVER owns these shapes; keep them identical so
// both UIs consume the same contract. The app reads and sends against the same
// endpoints the web waiter uses (server is the single source of truth).

export type TableStatusKind = 'empty' | 'seated' | 'cooking' | 'ready' | 'calling';

export interface FloorTable {
  number: number;
  tableId: string;
  displayName: string;
  status: TableStatusKind;
  spend: number;
  seatedMinutes?: number | null;
  orderCount: number;
  guests: number | null;
  waiter: string | null;
  vip: boolean;
  guestName: string | null;
}

export interface FloorState {
  tableCount: number;
  counts: { seated: number; cooking: number; ready: number; empty: number };
  tables: FloorTable[];
}

// A cart-level recommendation (POST /api/waiter/cart-recommendations).
export interface CartRec {
  name: string;
  price: number;
  img?: string;
  categoryType?: string;
  story?: string;
  reason: string;
  upsell: number;
  script?: string;
  relation?: string;
  complimentary?: boolean;
  source_title?: string;
  rotationGroup?: string;
  chef?: boolean;
}

export interface CartRecResponse {
  recommendations: CartRec[];
  eventRec: CartRec | null;
  potentialUplift: number;
}

export interface GuestFavorites {
  wine: string | null;
  main: string | null;
  dessert: string | null;
}

export interface GuestIntel {
  present: boolean;
  id?: number;
  name?: string;
  vip?: boolean;
  loyaltyTier?: string;
  returning?: boolean;
  visitCount?: number;
  lifetimeSpend?: number;
  avgSpend?: number;
  lastVisitAt?: string | null;
  favorites?: GuestFavorites;
  topItems?: string[];
  avoids?: string[];
  allergies?: string;
  dietary?: string;
  preferredSeating?: string | null;
  notes?: string;
}

export interface SuggestedItem {
  name: string;
  price: number;
  img?: string;
  categoryType?: string;
  source?: string;
  reason?: string;
}

export interface Opportunity {
  hasOpportunity: boolean;
  currentBill: number;
  potentialBill: number;
  increase: number;
  probability: number;
  bestAction: string | null;
  suggestedItem: SuggestedItem | null;
  alternatives: SuggestedItem[];
}

export interface TableInfo {
  guests: number | null;
  status: TableStatusKind | string;
  waiter: string | null;
}

export interface TableIntel {
  tableId: string;
  tableInfo: TableInfo;
  guestIntel: GuestIntel;
  opportunity: Opportunity;
  pitch: string;
}

export interface CourseSlice {
  label: string;
  value: number;
  pct: number;
}

export interface Performance {
  waiterName: string;
  period: string;
  salesDriven: number;
  tips: number;
  tablesServed: number;
  orderCount: number;
  avgCheck: number;
  upsellRate: number;
  upsellOffered: number;
  upsellAccepted: number;
  upsellRevenue: number;
  guestRating: number | null;
  ratingCount: number;
  salesByCourse: CourseSlice[];
  vsAverage: number | null;
}

export interface WaiterTask {
  id: number;
  tableId: string;
  waiterName: string;
  type: string;
  title: string;
  message: string;
  priority: number;
  status: string;
  payload?: Record<string, unknown>;
  requestedBy?: string;
  approvedBy?: string;
  dueAt?: string | null;
  acknowledgedAt?: string | null;
  resolvedAt?: string | null;
  createdAt: string;
}

export interface ChatConversation {
  tableId: string;
  lastMessage: string;
  timestamp: string;
  priority: number;
  events: Array<{ type: string; label: string }>;
}

export interface GuestEvent {
  type: string;
  label: string;
  emoji: string;
  action?: string;
  script?: string;
}

// A line the waiter is building for a table. `source` distinguishes the guest's
// live cart (synced from the customer app) from waiter-added lines.
export interface OrderLine {
  name: string;
  price: number;
  quantity: number;
  source: 'guest' | 'waiter';
  category?: string;
  categoryType?: string;
  img?: string;
}

// An item already sent to the kitchen (from syncHistory).
export interface PlacedLine {
  name: string;
  price: number;
  quantity: number;
}
