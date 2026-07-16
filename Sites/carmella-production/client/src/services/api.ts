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

export interface DealItem {
  id: number;
  name: string;
  price: number;
  img: string;
}

export interface Promotion {
  id: number;
  title: string;
  description: string;
  bannerImage: string;
  badge: string;
  items: DealItem[];
  dealPrice: number | null;
  originalPrice: number;
  savings: number | null;
  isDealOfDay: boolean;
  startDate: string | null;
  endDate: string | null;
  startTime: string;
  endTime: string;
  active?: boolean;
  isLiveNow?: boolean;
}

export interface ComboSpecial {
  id: number;
  title: string;
  description: string;
  bannerImage: string;
  items: DealItem[];
  drinks: DealItem[];
  comboPrice: number;
  originalPrice: number;
  savings: number;
  startDate: string | null;
  endDate: string | null;
  startTime: string;
  endTime: string;
  active?: boolean;
  isLiveNow?: boolean;
}

export interface ComboInput {
  title?: string;
  description?: string;
  bannerImage?: string;
  itemIds?: number[];
  drinkItemIds?: number[];
  comboPrice?: number;
  startDate?: string | null;
  endDate?: string | null;
  startTime?: string;
  endTime?: string;
  active?: boolean;
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

export interface SpecialItem {
  itemId: number;
  name: string;
  img: string;
  originalPrice: number;
  specialPrice: number;
  discountPct: number | null;
  silent: boolean;
}

export interface Special {
  id: number;
  title: string;
  bannerImage: string;
  items: SpecialItem[];
  startDate: string | null;
  endDate: string | null;
  startTime: string;
  endTime: string;
  active?: boolean;
  isLiveNow?: boolean;
}

export interface LiveCartDevice {
  deviceId: string | null;
  deviceNumber: number | null;
  items: Array<{ name: string; price: number; qty: number; deviceId?: string }>;
  subtotal: number;
}

export interface LiveCart {
  tableId: string;
  cart: Array<{ name: string; price: number; qty: number; deviceId?: string }>;
  updatedAt: string;
  status: string;
  devices: LiveCartDevice[];
  tableTotal: number;
}

export interface AnalyticsDashboard {
  isSeeded: boolean;
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

export interface ThemeSettings {
  autoEnabled: boolean;
  manualTheme: 'day' | 'night';
  dayStartTime: string;
  nightStartTime: string;
  activeTheme: 'day' | 'night';
}

export interface PromotionInput {
  title?: string;
  description?: string;
  bannerImage?: string;
  badge?: string;
  itemIds?: number[];
  dealPrice?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  startTime?: string;
  endTime?: string;
  active?: boolean;
}

export interface SpecialItemInput {
  itemId: number;
  specialPrice?: number | null;
  discountPct?: number | null;
  silent?: boolean;
}

export interface SpecialInput {
  title?: string;
  bannerImage?: string;
  items?: SpecialItemInput[];
  startDate?: string | null;
  endDate?: string | null;
  startTime?: string;
  endTime?: string;
  active?: boolean;
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
    return fetchJson<Array<{
      id: number; title: string; sortOrder: number; visible: boolean; itemCount: number;
      subcategories: Array<{ id: number; title: string; sortOrder: number; visible: boolean; itemCount: number }>;
    }>>(ENDPOINTS.menuCategories);
  },

  createCategory(title: string) {
    return postJson<{ ok: boolean; category: { id: number; title: string } }>(ENDPOINTS.menuCategories, { title });
  },

  reorderCategories(orderedIds: number[]) {
    return patchJson<{ ok: boolean }>(ENDPOINTS.menuCategoriesReorder, { orderedIds });
  },

  renameCategory(id: number, title: string) {
    return patchJson<{ ok: boolean; category: { id: number; title: string } }>(ENDPOINTS.menuCategoryItem(id), { title });
  },

  // Bespoke (not deleteJson/fetchJson): the server's 400/409 error bodies
  // carry the actual reason ("category has items", with itemCount) that the
  // admin UI needs to show -- fetchJson throws before the caller can read
  // that body, so this reads the JSON regardless of status instead.
  async deleteCategory(id: number, moveItemsTo?: number): Promise<{ ok: boolean; movedItems?: number; error?: string; itemCount?: number }> {
    const res = await fetch(ENDPOINTS.menuCategoryItem(id), {
      method: 'DELETE',
      ...(moveItemsTo !== undefined ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ moveItemsTo }) } : {}),
    });
    const body = await res.json().catch(() => ({}));
    return res.ok ? { ok: true, movedItems: body.movedItems } : { ok: false, error: body.error || `HTTP ${res.status}`, itemCount: body.itemCount };
  },

  createMenuItem(payload: { name: string; category: string; subcategory?: string; price: number; description?: string; available?: boolean }) {
    return postJson<{ ok: boolean; item: unknown }>(ENDPOINTS.menuCreateItem, payload);
  },

  toggleMenuItemAvailability(id: number, available: boolean) {
    return patchJson<{ ok: boolean }>(ENDPOINTS.menuItemAvailability(id), { available });
  },

  updateMenuItemMedia(id: number, payload: { img?: string; imageVisible?: boolean }) {
    return patchJson<{ ok: boolean; item: unknown }>(ENDPOINTS.menuItemMedia(id), payload);
  },

  updateMenuItem(id: number, patch: {
    name?: string; category?: string; subcategory?: string; price?: number; description?: string;
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
  createPromotion(payload: PromotionInput) {
    return postJson<{ ok: boolean; promotion: Promotion }>(ENDPOINTS.promotionsAdmin, payload);
  },
  updatePromotion(id: number, patch: PromotionInput) {
    return patchJson<{ ok: boolean; promotion: Promotion }>(ENDPOINTS.promotionAdmin(id), patch);
  },
  deletePromotion(id: number) {
    return fetchJson<{ ok: boolean }>(ENDPOINTS.promotionAdmin(id), { method: 'DELETE' });
  },
  // isDealOfDay:false un-sets it (no Deal of the Day); any other value makes
  // this the ONE featured deal, clearing the flag off every other promotion.
  setDealOfDay(id: number, isDealOfDay: boolean) {
    return postJson<{ ok: boolean }>(ENDPOINTS.promotionDealOfDay(id), { isDealOfDay });
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
  createSpecial(payload: SpecialInput) {
    return postJson<{ ok: boolean; special: Special }>(ENDPOINTS.specialsAdmin, payload);
  },
  updateSpecial(id: number, patch: SpecialInput) {
    return patchJson<{ ok: boolean; special: Special }>(ENDPOINTS.specialAdmin(id), patch);
  },
  deleteSpecial(id: number) {
    return fetchJson<{ ok: boolean }>(ENDPOINTS.specialAdmin(id), { method: 'DELETE' });
  },

  // ── Combo Specials ──
  getCombos() {
    return fetchJson<ComboSpecial[]>(ENDPOINTS.combos);
  },
  getCombosAdmin() {
    return fetchJson<ComboSpecial[]>(ENDPOINTS.combosAdmin);
  },
  createCombo(payload: ComboInput) {
    return postJson<{ ok: boolean; combo: ComboSpecial }>(ENDPOINTS.combosAdmin, payload);
  },
  updateCombo(id: number, patch: ComboInput) {
    return patchJson<{ ok: boolean; combo: ComboSpecial }>(ENDPOINTS.comboAdmin(id), patch);
  },
  deleteCombo(id: number) {
    return fetchJson<{ ok: boolean }>(ENDPOINTS.comboAdmin(id), { method: 'DELETE' });
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
  // "Table has paid and left" -- clears the cart AND the device roster, so
  // the next seating gets fresh D1/D2/D3 numbering.
  resetLiveCart(tableId: string) {
    return postJson<{ ok: boolean }>(ENDPOINTS.liveCartReset(tableId), {});
  },
  // Empties every device's items but the SAME seating's device numbers stay.
  clearLiveCart(tableId: string) {
    return postJson<{ ok: boolean }>(ENDPOINTS.liveCartClear(tableId), {});
  },
  clearLiveCartDevice(tableId: string, deviceId: string) {
    return postJson<{ ok: boolean }>(ENDPOINTS.liveCartClearDevice(tableId), { deviceId });
  },
  finishLiveCart(tableId: string) {
    return postJson<{ ok: boolean }>(ENDPOINTS.liveCartFinish(tableId), {});
  },

  // ── Theme ──
  getTheme() {
    return fetchJson<ThemeSettings>(ENDPOINTS.theme);
  },
  updateTheme(patch: Partial<Omit<ThemeSettings, 'activeTheme'>>) {
    return patchJson<ThemeSettings>(ENDPOINTS.themeAdmin, patch);
  },
};
