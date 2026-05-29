// Types for the AI waiter API responses (see server/controllers/waiterApiController.js).
import type { MenuItem } from './menu';

export type WaiterRole = 'Head Waiter' | 'Server' | 'Runner';
export type WaiterTab = 'floor' | 'order' | 'menu' | 'coach' | 'today';
export type LeaderboardPeriod = 'today' | 'week' | 'month';

export type TableStatusKind = 'empty' | 'seated' | 'cooking' | 'ready' | 'calling';

export interface FloorTable {
  number: number;
  tableId: string;
  displayName: string;
  status: TableStatusKind;
  spend: number;
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

export interface CoachResponse {
  tableId: string | null;
  suggestion: SuggestedItem | null;
  expectedRevenue: number;
  successRate: number;
  sayToTable: string;
  whyItWorks: string;
  alternatives: SuggestedItem[];
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
}

export interface ServiceNotes {
  text: string;
  tags: string[];
}

export type SpeechTone = 'casual' | 'professional' | 'luxury' | 'short' | 'upsell';

export interface WaiterAlert {
  id: string;
  kind: 'bell' | 'ready' | 'manager';
  tableId?: string;
  title: string;
  message: string;
  time: string;
  state: 'live' | 'responded' | 'dismissed';
}
