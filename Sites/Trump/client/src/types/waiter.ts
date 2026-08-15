// Types for the AI waiter API responses (see server/controllers/waiterApiController.js).
import type { MenuItem } from './menu';

export type WaiterRole = 'Head Waiter' | 'Server' | 'Runner';
export type WaiterTab = 'home' | 'tables' | 'alerts' | 'chat' | 'profile';

export interface GuestEvent {
  type: string;
  label: string;
  emoji: string;
  action?: string;
  script?: string;
}

// Phase 1 (Recommendation Brain): what a recommendation would replace in the
// current cart (a same-role swap), used to explain a price delta.
export interface RecommendationReplacement {
  name: string;
  previousPrice: number;
}

// Phase 2 (Waiter Experience): three delivery styles for the same recommendation.
// "friendly" is served from the existing 'casual' NLG tone (no separate tone exists).
export interface RecommendationScripts {
  professional: string;
  friendly: string;
  luxury: string;
}

export type RecommendationStatus = 'pending' | 'suggested' | 'accepted' | 'declined' | 'ignored';

export interface CartRec {
  name: string;
  price: number;
  img?: string;
  categoryType?: string;
  story?: string;
  reason: string;
  upsell: number;
  script?: string;
  scripts?: RecommendationScripts;
  relation?: string;
  complimentary?: boolean;
  // Phase 4 analytics attribution.
  source_title?: string;
  rotationGroup?: string;
  chef?: boolean;
  // Phase 1 (Recommendation Brain).
  confidence?: number;
  expectedValue?: number;
  replacement?: RecommendationReplacement | null;
}

export interface CartRecResponse {
  recommendations: CartRec[];
  eventRec: CartRec | null;
  // Phase 2 — cart-signal occasion detection (e.g. Champagne added), same
  // detector the customer chatbot already uses.
  occasionPrompt?: string | null;
  potentialUplift: number;
}

// Phase 3C: waiter-only "ordered together" (counted co-occurrence + flavour why).
export interface OrderedTogetherRec {
  name: string;
  price: number;
  img?: string;
  categoryType?: string;
  count: number;
  countLabel: string;
  why: string;
  upsell: number;
}

export interface OrderedTogetherResponse {
  recommendations: OrderedTogetherRec[];
}
export type LeaderboardPeriod = 'today' | 'week' | 'month';

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
  isLuxury: boolean;
}

export interface FloorState {
  tableCount: number;
  luxuryTableCount: number;
  counts: { seated: number; cooking: number; ready: number; empty: number };
  tables: FloorTable[];
}

export interface GuestFavorites {
  wine: string | null;
  main: string | null;
  dessert: string | null;
}

// The raw Guest record (guestService.js) — used by the guest search/seat
// picker. GuestIntel below is the derived, richer object for a SEATED guest.
export interface Guest {
  id: number;
  name: string;
  phone: string;
  email: string;
  vip: boolean;
  loyaltyTier: string;
  dietary: string;
  allergies: string;
  preferences: Record<string, unknown> | null;
  notes: string;
  visitCount: number;
  lifetimeSpend: number;
  avgSpend: number;
  lastVisitAt: string | null;
}

// AI Shared Event System — mirrors server/services/aiEventService.js's
// publicEvent() shape exactly; admin and waiter render from this one type.
export interface AiEvent {
  id: number;
  eventType: string;
  label: string;
  icon: string;
  guestId: number | null;
  tableId: string;
  waiterName: string;
  priority: number;
  confidence: number;
  recommendedAction: string;
  suggestedWaiterMessage: string;
  suggestedManagerAction: string;
  status: 'open' | 'acknowledged' | 'resolved' | 'dismissed';
  source: string;
  payload: Record<string, unknown>;
  waiterTaskId: number | null;
  createdAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
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
  // Phase 1 (Recommendation Brain).
  confidence?: number;
  expectedValue?: number;
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
  // Phase 1 (Recommendation Brain).
  expectedValue?: number;
  replacement?: RecommendationReplacement | null;
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

export interface CoachResponse {
  tableId: string | null;
  suggestion: SuggestedItem | null;
  expectedRevenue: number;
  successRate: number;
  sayToTable: string;
  whyItWorks: string;
  alternatives: SuggestedItem[];
  // Phase 1 (Recommendation Brain).
  expectedValue?: number;
  replacement?: RecommendationReplacement | null;
}

export interface SommelierResponse {
  wine: SuggestedItem | null;
  alternatives: SuggestedItem[];
  explanation: string;
}

export interface AskResponse {
  reply: string;
  suggestions?: MenuItem[];
}

export interface RecoveryResponse {
  tableId: string;
  severity: 'none' | 'low' | 'medium' | 'high';
  triggered: boolean;
  waitMinutes: number;
  rating: number | null;
  suggestedActions: string[];
  sayToTable: string;
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

export interface ShiftReport extends Performance {
  rank: number | null;
  topTable: { tableId: string; revenue: number } | null;
  bestUpsell: { item: string; value: number } | null;
  improvements: { key: string; metric: number }[];
  coaching: string[];
}

export interface LeaderboardRow {
  rank: number;
  waiterName: string;
  salesDriven: number;
  tips: number;
  tablesServed: number;
}

export interface Achievement {
  key: string;
  label: string;
  earned: boolean;
}

export interface LeaderboardResponse {
  period: string;
  leaderboard: LeaderboardRow[];
  rank: number | null;
  achievements: Achievement[];
}

export interface Guest {
  id: number;
  name: string;
  vip: boolean;
  loyaltyTier: string;
  allergies: string;
  dietary: string;
  preferences: Record<string, unknown> | null;
  notes: string;
  visitCount: number;
  lifetimeSpend: number;
  avgSpend: number;
  lastVisitAt: string | null;
}

// A line item the waiter is building for a table.
export interface OrderLine {
  name: string;
  price: number;
  quantity: number;
  source?: 'guest' | 'waiter';
  category?: string;
  img?: string;
  categoryType?: string;
  // Device Awareness / split-bill-by-device: which guest device added this
  // line (carried through from CartItem.addedByDevice via WaiterContext's
  // seedGuestLines) and when — blank/undefined for waiter-added lines and
  // legacy/pre-rollout carts.
  addedByDevice?: string;
  addedAt?: number;
}

// Device Awareness: one entry per guest device that has joined this table's
// visit — populated from the server's `tableDevices` socket broadcast
// (socketService.js's getOrAssignDeviceLabel/emitTableDevices).
export interface TableDeviceInfo {
  deviceId: string;
  label: string;
  joinedAt: number;
}

export interface ServiceNotes {
  text: string;
  tags: string[];
}

export type SpeechTone = 'casual' | 'professional' | 'luxury' | 'short' | 'upsell';

export interface WaiterAlert {
  id: string;
  kind: 'bell' | 'ready' | 'manager' | 'event' | 'complaint' | 'vip' | 'birthday';
  tableId?: string;
  title: string;
  message: string;
  time: string;
  createdAt: number;
  state: 'live' | 'responded' | 'dismissed';
  emoji?: string;
  action?: string;
  script?: string;
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
