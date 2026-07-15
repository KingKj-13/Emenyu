import { ENDPOINTS } from '../constants/api';
import type { MenuData, AppConfig } from '../types/menu';

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  const text = await res.text();
  if (!text.trim()) return null as T;
  return JSON.parse(text) as T;
}

function postJson<T>(url: string, payload: unknown): Promise<T> {
  return fetchJson<T>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

function patchJson<T>(url: string, payload: unknown): Promise<T> {
  return fetchJson<T>(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export interface Promotion {
  id: number;
  title: string;
  description: string;
  bannerImage: string;
  badge: string;
  startDate: string | null;
  endDate: string | null;
  startTime: string;
  endTime: string;
  active?: boolean;
  isLiveNow?: boolean;
}

export interface HappyHour {
  id: number;
  name: string;
  itemIds: number[];
  discountPct: number;
  startTime: string;
  endTime: string;
  activeDays: number[];
  active?: boolean;
  isLiveNow?: boolean;
}

export interface Special {
  id: number;
  title: string;
  bannerImage: string;
  itemIds: number[];
  discountPct: number | null;
  startDate: string | null;
  endDate: string | null;
  startTime: string;
  endTime: string;
  active?: boolean;
  isLiveNow?: boolean;
}

export interface LiveCart {
  tableId: string;
  cart: Array<{ name: string; price: number; qty: number }>;
  updatedAt: string;
}

export interface AnalyticsDashboard {
  activeLiveCarts: number;
  activeGuests: number;
  mostViewedItems: { itemId: number; name: string; count: number }[];
  mostAddedToCart: { itemId: number; name: string; count: number }[];
  popularCategories: { category: string; count: number }[];
  peakUsageHours: { hour: number; count: number }[];
  dailyVisitors: number;
  weeklyVisitors: number;
  monthlyVisitors: number;
  dealPerformance: { id: number; title: string; active: boolean; addToCartCount: number }[];
  happyHourPerformance: { id: number; name: string; active: boolean; addToCartCount: number }[];
  specialsPerformance: { id: number; title: string; active: boolean; addToCartCount: number }[];
  availableItems: number;
  unavailableItems: number;
}

export const api = {
  getMenu(): Promise<MenuData> {
    return fetchJson<MenuData>(ENDPOINTS.menu);
  },

  getConfig(): Promise<AppConfig> {
    return fetchJson<AppConfig>(ENDPOINTS.config);
  },

  uploadFile(formData: FormData) {
    return fetchJson<{ filePath: string; type: string }>(ENDPOINTS.upload, {
      method: 'POST',
      body: formData,
    });
  },

  deleteUpload(filename: string) {
    return fetchJson<{ ok: boolean }>(ENDPOINTS.deleteUpload(filename), { method: 'DELETE' });
  },

  // ── Menu management ──
  getAdminMenuItems() {
    return fetchJson<unknown[]>(ENDPOINTS.menuAdminItems);
  },

  getMenuCategories() {
    return fetchJson<Array<{ id: number; title: string; sortOrder: number; visible: boolean }>>(ENDPOINTS.menuCategories);
  },

  createCategory(title: string) {
    return postJson<{ ok: boolean; category: { id: number; title: string } }>(ENDPOINTS.menuCategories, { title });
  },

  reorderCategories(orderedIds: number[]) {
    return patchJson<{ ok: boolean }>(ENDPOINTS.menuCategoriesReorder, { orderedIds });
  },

  createMenuItem(payload: { name: string; category: string; price: number; description?: string; available?: boolean }) {
    return postJson<{ ok: boolean; item: unknown }>(ENDPOINTS.menuCreateItem, payload);
  },

  toggleMenuItemAvailability(id: number, available: boolean) {
    return patchJson<{ ok: boolean }>(ENDPOINTS.menuItemAvailability(id), { available });
  },

  updateMenuItemMedia(id: number, payload: { img?: string; imageVisible?: boolean }) {
    return patchJson<{ ok: boolean; item: unknown }>(ENDPOINTS.menuItemMedia(id), payload);
  },

  updateMenuItem(id: number, patch: {
    name?: string; category?: string; price?: number; description?: string;
    calories?: string; allergens?: string; spice?: string; available?: boolean; visible?: boolean; popular?: boolean;
  }) {
    return patchJson<{ ok: boolean; item: unknown }>(ENDPOINTS.menuItemUpdate(id), patch);
  },

  deleteMenuItem(id: number) {
    return fetchJson<{ ok: boolean }>(ENDPOINTS.menuItemDelete(id), { method: 'DELETE' });
  },

  bulkMenuItemAction(action: 'hide' | 'show' | 'delete', ids: number[]) {
    return postJson<{ ok: boolean; count: number }>(ENDPOINTS.menuItemBulk, { action, ids });
  },

  // ── Promotions (Deal of the Day) ──
  getPromotions() {
    return fetchJson<Promotion[]>(ENDPOINTS.promotions);
  },
  getPromotionsAdmin() {
    return fetchJson<Promotion[]>(ENDPOINTS.promotionsAdmin);
  },
  createPromotion(payload: Partial<Promotion>) {
    return postJson<{ ok: boolean; promotion: Promotion }>(ENDPOINTS.promotionsAdmin, payload);
  },
  updatePromotion(id: number, patch: Partial<Promotion>) {
    return patchJson<{ ok: boolean; promotion: Promotion }>(ENDPOINTS.promotionAdmin(id), patch);
  },
  deletePromotion(id: number) {
    return fetchJson<{ ok: boolean }>(ENDPOINTS.promotionAdmin(id), { method: 'DELETE' });
  },

  // ── Happy Hour ──
  getHappyHours() {
    return fetchJson<HappyHour[]>(ENDPOINTS.happyHour);
  },
  getHappyHoursAdmin() {
    return fetchJson<HappyHour[]>(ENDPOINTS.happyHourAdmin);
  },
  createHappyHour(payload: Partial<HappyHour>) {
    return postJson<{ ok: boolean; happyHour: HappyHour }>(ENDPOINTS.happyHourAdmin, payload);
  },
  updateHappyHour(id: number, patch: Partial<HappyHour>) {
    return patchJson<{ ok: boolean; happyHour: HappyHour }>(ENDPOINTS.happyHourAdminItem(id), patch);
  },
  deleteHappyHour(id: number) {
    return fetchJson<{ ok: boolean }>(ENDPOINTS.happyHourAdminItem(id), { method: 'DELETE' });
  },

  // ── Specials ──
  getSpecials() {
    return fetchJson<Special[]>(ENDPOINTS.specials);
  },
  getSpecialsAdmin() {
    return fetchJson<Special[]>(ENDPOINTS.specialsAdmin);
  },
  createSpecial(payload: Partial<Special>) {
    return postJson<{ ok: boolean; special: Special }>(ENDPOINTS.specialsAdmin, payload);
  },
  updateSpecial(id: number, patch: Partial<Special>) {
    return patchJson<{ ok: boolean; special: Special }>(ENDPOINTS.specialAdmin(id), patch);
  },
  deleteSpecial(id: number) {
    return fetchJson<{ ok: boolean }>(ENDPOINTS.specialAdmin(id), { method: 'DELETE' });
  },

  // ── Analytics ──
  recordAnalyticsEvent(payload: { type: 'session_start' | 'item_view' | 'add_to_cart' | 'remove_from_cart'; itemId?: number; categoryId?: number; tableId?: string; sessionId?: string }) {
    return postJson<{ ok: boolean }>(ENDPOINTS.analyticsEvent, payload);
  },
  getAnalyticsDashboard() {
    return fetchJson<AnalyticsDashboard>(ENDPOINTS.analyticsDashboard);
  },

  // ── Live carts ──
  getLiveCarts() {
    return fetchJson<LiveCart[]>(ENDPOINTS.liveCarts);
  },
};
