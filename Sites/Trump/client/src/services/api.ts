import { ENDPOINTS } from '../constants/api';
import type { MenuData, ChefRec, ChefRecInput, RecommendationAnalytics, RecoInsightsResult, BundleAdmin, BundleInput, AppConfig } from '../types/menu';
import type { LoginPayload, LoginResponse, AuthUser } from '../types/auth';
import type { OrderPayload } from '../types/cart';

/** PATCH / PUT / DELETE — postJson only covers POST. */
async function sendJson<T>(url: string, method: 'PATCH' | 'PUT' | 'DELETE', body?: unknown): Promise<T> {
  return fetchJson<T>(url, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function qs(params: Record<string, string | undefined>): string {
  const entries = Object.entries(params).filter(([, v]) => v != null && v !== '');
  return entries.length ? `?${new URLSearchParams(entries as [string, string][])}` : '';
}

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

export const api = {
  // The server localizes menu CONTENT and falls back to English per field, so
  // the client never needs a translation table of its own.
  getMenu(locale?: string): Promise<MenuData> {
    const url = locale && locale !== 'en'
      ? `${ENDPOINTS.menu}?locale=${encodeURIComponent(locale)}`
      : ENDPOINTS.menu;
    return fetchJson<MenuData>(url);
  }
,

  getDeals() {
    return fetchJson<unknown[]>(ENDPOINTS.deals);
  },

  saveDeals(payload: unknown) {
    return fetchJson<{ ok: boolean }>(ENDPOINTS.deals, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  },

  getRecommendations(payload: unknown) {
    return postJson<unknown>(ENDPOINTS.recommend, payload);
  },

  // Curated Demo Mode
  getSettings() {
    return fetchJson<{ curatedDemoMode: boolean }>(ENDPOINTS.settings);
  },

  saveSettings(payload: { curatedDemoMode?: boolean }) {
    return postJson<{ ok: boolean; settings: { curatedDemoMode: boolean } }>(ENDPOINTS.settings, payload);
  },

  redeemReward(code: string) {
    return postJson<{ ok: boolean; reason?: string }>(ENDPOINTS.rewardRedeem(code), {});
  },

  chat(payload: unknown) {
    return postJson<unknown>(ENDPOINTS.chat, payload);
  },

  getConfig(): Promise<AppConfig> {
    return fetchJson<AppConfig>(ENDPOINTS.config);
  },

  aiPairing(payload: unknown) {
    return postJson<unknown>(ENDPOINTS.aiPairing, payload);
  },

  submitOrder(payload: OrderPayload) {
    return postJson<{ ok: boolean }>(ENDPOINTS.submitOrder, payload);
  },

  authMe(): Promise<AuthUser | null> {
    return fetchJson<{ user: AuthUser | null } | AuthUser | null>(ENDPOINTS.authMe)
      .then(result => {
        if (result && typeof result === 'object' && 'user' in result) return result.user;
        return result as AuthUser | null;
      })
      .catch(() => null);
  },

  async login(payload: LoginPayload): Promise<LoginResponse> {
    // Don't route through fetchJson (which throws on any non-2xx): a 401/403 is a
    // valid auth answer, not a connection failure. Surface the server's error
    // message so the UI can say "Invalid credentials" instead of "Unable to connect".
    // Only a genuine network failure (fetch rejects) propagates as a thrown error.
    const res = await fetch(ENDPOINTS.authLogin, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    const data = text.trim() ? (JSON.parse(text) as LoginResponse) : ({} as LoginResponse);
    if (res.ok) return data;
    return { ok: false, error: data.error || 'Invalid credentials. Please try again.' };
  },

  logout(): Promise<void> {
    return postJson<void>(ENDPOINTS.authLogout, {});
  },

  getAccounts() {
    return fetchJson<unknown[]>(ENDPOINTS.authAccounts);
  },

  createAccount(payload: unknown) {
    return postJson<unknown>(ENDPOINTS.authAccounts, payload);
  },

  updateAccount(username: string, payload: unknown) {
    return fetchJson<unknown>(`${ENDPOINTS.authAccounts}/${username}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  },

  getOrders() {
    return fetchJson<unknown[]>(ENDPOINTS.orders);
  },

  getHistory() {
    return fetchJson<unknown[]>(ENDPOINTS.history);
  },

  completeOrder(filename: string) {
    return postJson<unknown>(ENDPOINTS.complete, { filename });
  },

  incompleteOrder(filename: string) {
    return postJson<unknown>(ENDPOINTS.incomplete, { filename });
  },

  deleteOrder(type: 'orders' | 'history', filename: string) {
    return fetchJson<unknown>(ENDPOINTS.deleteOrder(type, filename), { method: 'DELETE' });
  },

  waiterTableStatus(tableId: string) {
    return fetchJson<unknown>(ENDPOINTS.waiterTableStatus(tableId));
  },

  waiterAddItems(payload: unknown) {
    return postJson<unknown>(ENDPOINTS.waiterAddItems, payload);
  },

  waiterArchiveTable(payload: unknown) {
    return postJson<unknown>(ENDPOINTS.waiterArchiveTable, payload);
  },

  saveMenu(menuData: MenuData) {
    return postJson<unknown>(ENDPOINTS.menu, menuData);
  },

  getRecommendationsAdmin() {
    return fetchJson<unknown[]>(ENDPOINTS.recommendationsAdmin);
  },

  saveRecommendations(data: unknown) {
    return postJson<unknown>(ENDPOINTS.recommendationsAdmin, data);
  },

  getChatHistory() {
    return fetchJson<unknown[]>(ENDPOINTS.chatHistory);
  },

  uploadFile(formData: FormData) {
    return fetchJson<{ filePath: string; type: string }>(ENDPOINTS.upload, {
      method: 'POST',
      body: formData,
    });
  },

  importOrdersCsv(formData: FormData) {
    return fetchJson<{ ordersCreated: number; itemsImported: number; skippedRows: number; errors: string[] }>(
      ENDPOINTS.ordersImport,
      { method: 'POST', body: formData }
    );
  },

  getAdminMenuItems() {
    return fetchJson<unknown[]>(ENDPOINTS.menuAdminItems);
  },

  // ── QR-menu redesign ────────────────────────────────────────────────────
  getEngagementSummary(params: { from?: string; to?: string } = {}) {
    return fetchJson<unknown>(`${ENDPOINTS.engagementSummary}${qs(params)}`);
  },

  getEngagementTimeline(params: { from?: string; to?: string } = {}) {
    return fetchJson<unknown>(`${ENDPOINTS.engagementTimeline}${qs(params)}`);
  },

  getEngagementLeastViewed(params: { from?: string; to?: string } = {}) {
    return fetchJson<unknown>(`${ENDPOINTS.engagementLeastViewed}${qs(params)}`);
  },

  getButcheryCuts(locale?: string) {
    return fetchJson<{ locale: string; cuts: unknown[] }>(
      locale && locale !== 'en' ? `${ENDPOINTS.butcheryCuts}?locale=${encodeURIComponent(locale)}` : ENDPOINTS.butcheryCuts
    );
  },

  getItemGallery(id: number) {
    return fetchJson<{ media: unknown[] }>(ENDPOINTS.itemGallery(id));
  },

  // ── owner content management ────────────────────────────────────────────
  getAdminMedia(entityType: string, entityId: number) {
    return fetchJson<{ media: unknown[] }>(`${ENDPOINTS.adminMedia}${qs({ entityType, entityId: String(entityId) })}`);
  },

  addAdminMedia(payload: Record<string, unknown>) {
    return postJson<unknown>(ENDPOINTS.adminMedia, payload);
  },

  updateAdminMedia(id: number, patch: Record<string, unknown>) {
    return sendJson<unknown>(ENDPOINTS.adminMediaItem(id), 'PATCH', patch);
  },

  reorderAdminMedia(payload: { entityType: string; entityId: number; ids: number[] }) {
    return postJson<unknown>(ENDPOINTS.adminMediaReorder, payload);
  },

  deleteAdminMedia(id: number) {
    return sendJson<unknown>(ENDPOINTS.adminMediaItem(id), 'DELETE');
  },

  getAdminTranslations(entityType: string, entityId: number) {
    return fetchJson<{ translations: unknown[] }>(`${ENDPOINTS.adminTranslations}${qs({ entityType, entityId: String(entityId) })}`);
  },

  saveAdminTranslations(payload: Record<string, unknown>) {
    return sendJson<unknown>(ENDPOINTS.adminTranslations, 'PUT', payload);
  },

  getTranslationCoverage() {
    return fetchJson<unknown>(ENDPOINTS.adminTranslationCoverage);
  },

  getAdminCuts() {
    return fetchJson<{ cuts: unknown[] }>(ENDPOINTS.adminCuts);
  },

  updateAdminCut(id: number, patch: Record<string, unknown>) {
    return sendJson<unknown>(ENDPOINTS.adminCut(id), 'PATCH', patch);
  },

  linkAdminCutItem(id: number, payload: Record<string, unknown>) {
    return postJson<unknown>(ENDPOINTS.adminCutItems(id), payload);
  },

  unlinkAdminCutItem(id: number, itemId: number) {
    return sendJson<unknown>(ENDPOINTS.adminCutItem(id, itemId), 'DELETE');
  },

  getMenuCategories() {
    return fetchJson<Array<{ id: number; title: string }>>(ENDPOINTS.menuCategories);
  },

  createMenuItem(payload: {
    name: string;
    category: string;
    price: number;
    description?: string;
    available?: boolean;
    chefPick?: boolean;
  }) {
    return postJson<{ ok: boolean; item: unknown }>(ENDPOINTS.menuAdminItems, payload);
  },

  toggleMenuItemAvailability(id: number, available: boolean) {
    return fetchJson<{ ok: boolean }>(`${ENDPOINTS.menuItemAvailability(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ available }),
    });
  },

  updateMenuItemMedia(id: number, payload: {
    img?: string;
    video?: string;
    youtubeId?: string;
    imageVisible?: boolean;
    videoVisible?: boolean;
  }) {
    return fetchJson<{ ok: boolean; item: unknown }>(ENDPOINTS.menuItemMedia(id), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  },

  updateMenuItem(id: number, patch: {
    name?: string;
    category?: string;
    price?: number;
    description?: string;
    calories?: string;
    allergens?: string;
    spice?: string;
    available?: boolean;
    chefPick?: boolean;
  }) {
    return fetchJson<{ ok: boolean; item: unknown }>(ENDPOINTS.menuItemUpdate(id), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
  },

  deleteMenuItem(id: number) {
    return fetchJson<{ ok: boolean }>(ENDPOINTS.menuItemDelete(id), { method: 'DELETE' });
  },

  // Chef recommendations (owner controls — Phase 3, Task 8)
  getChefRecs() {
    return fetchJson<ChefRec[]>(ENDPOINTS.chefRecs);
  },

  createChefRec(payload: ChefRecInput) {
    return postJson<{ ok: boolean; recommendation: ChefRec }>(ENDPOINTS.chefRecs, payload);
  },

  updateChefRec(id: number, patch: Partial<ChefRecInput>) {
    return fetchJson<{ ok: boolean; recommendation: ChefRec }>(ENDPOINTS.chefRec(id), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
  },

  deleteChefRec(id: number) {
    return fetchJson<{ ok: boolean }>(ENDPOINTS.chefRec(id), { method: 'DELETE' });
  },

  // Recommended-order bundles (Phase 5)
  getBundles() {
    return fetchJson<unknown[]>(ENDPOINTS.bundles);
  },

  getBundlesAdmin() {
    return fetchJson<BundleAdmin[]>(ENDPOINTS.bundlesAdmin);
  },

  createBundle(payload: BundleInput) {
    return postJson<{ ok: boolean; bundle: BundleAdmin }>(ENDPOINTS.bundles, payload);
  },

  updateBundle(id: number, patch: Partial<BundleInput>) {
    return fetchJson<{ ok: boolean; bundle: BundleAdmin }>(ENDPOINTS.bundle(id), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
  },

  deleteBundle(id: number) {
    return fetchJson<{ ok: boolean }>(ENDPOINTS.bundle(id), { method: 'DELETE' });
  },

  // Recommendation analytics dashboard (Phase 4, owner|manager)
  getRecommendationAnalytics(params: { from?: string; to?: string; category?: string; source?: string; rotationGroup?: string; mode?: string } = {}) {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v != null && v !== '') as [string, string][]
    ).toString();
    return fetchJson<RecommendationAnalytics>(`${ENDPOINTS.analyticsRecommendations}${qs ? `?${qs}` : ''}`);
  },

  getRecommendationInsights(params: { from?: string; to?: string; mode?: string } = {}) {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v != null && v !== '') as [string, string][]
    ).toString();
    return fetchJson<RecoInsightsResult>(`${ENDPOINTS.analyticsRecommendationsInsights}${qs ? `?${qs}` : ''}`);
  },

  bulkMenuItemAction(action: 'hide' | 'show' | 'delete', ids: number[]) {
    return postJson<{ ok: boolean; count: number }>(ENDPOINTS.menuItemBulk, { action, ids });
  },

  getKitchenOrders() {
    return fetchJson<unknown[]>(ENDPOINTS.kitchenOrders);
  },

  updateKitchenStatus(id: number, kitchenStatus: string) {
    return postJson<{ ok: boolean }>(ENDPOINTS.kitchenUpdateStatus(id), { kitchenStatus });
  },

  getAnalyticsSummary(params: { from?: string; to?: string }) {
    const q = new URLSearchParams(params as Record<string, string>).toString();
    return fetchJson<unknown>(`${ENDPOINTS.analyticsummary}?${q}`);
  },

  getAnalyticsItems(params: { from?: string; to?: string; order?: 'asc' | 'desc'; category?: string; excludeCategory?: string; limit?: number }) {
    const q = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)])
    ).toString();
    return fetchJson<{ name: string; quantity: number; revenue: number; categoryType: string }[]>(`${ENDPOINTS.analyticsItems}?${q}`);
  },

  getAnalyticsPairings(params: { from?: string; to?: string }) {
    const q = new URLSearchParams(params as Record<string, string>).toString();
    return fetchJson<{ a: string; b: string; count: number; revenue: number }[]>(`${ENDPOINTS.analyticsPairings}?${q}`);
  },

  getCustomerJourney(tableId: string) {
    return fetchJson<{
      tableId: string; found: boolean; status?: string; timestamp?: string; total?: number;
      waiterName?: string; rating?: number | null; error?: string;
      steps?: { key: string; label: string; done: boolean; items?: string[]; detail?: string }[];
    }>(`${ENDPOINTS.analyticsJourney}?tableId=${encodeURIComponent(tableId)}`);
  },

  getAnalyticsTrend(params: { from?: string; to?: string; bucket?: 'day' | 'week' | 'month' }) {
    const q = new URLSearchParams(params as Record<string, string>).toString();
    return fetchJson<{ bucket: string; points: { date: string; revenue: number; orders: number }[] }>(`${ENDPOINTS.analyticsTrend}?${q}`);
  },

  getAnalyticsDayOfWeek(params: { from?: string; to?: string }) {
    const q = new URLSearchParams(params as Record<string, string>).toString();
    return fetchJson<{ dow: number; label: string; count: number; revenue: number }[]>(`${ENDPOINTS.analyticsDayOfWeek}?${q}`);
  },

  getAnalyticsTables(params: { from?: string; to?: string }) {
    const q = new URLSearchParams(params as Record<string, string>).toString();
    return fetchJson<unknown[]>(`${ENDPOINTS.analyticsTables}?${q}`);
  },

  getAnalyticsHours(params: { from?: string; to?: string }) {
    const q = new URLSearchParams(params as Record<string, string>).toString();
    return fetchJson<unknown[]>(`${ENDPOINTS.analyticsHours}?${q}`);
  },

  getTableCarts() {
    return fetchJson<unknown[]>(ENDPOINTS.adminTableCarts);
  },

  getReservations(date?: string) {
    const q = date ? `?date=${date}` : '';
    return fetchJson<unknown[]>(`${ENDPOINTS.reservations}${q}`);
  },

  createReservation(payload: unknown) {
    return postJson<unknown>(ENDPOINTS.reservations, payload);
  },

  updateReservation(id: number, payload: unknown) {
    return fetchJson<unknown>(`${ENDPOINTS.reservations}/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  },

  deleteReservation(id: number) {
    return fetchJson<unknown>(`${ENDPOINTS.reservations}/${id}`, { method: 'DELETE' });
  },

  submitRating(payload: unknown) {
    return postJson<unknown>(ENDPOINTS.ratings, payload);
  },

  getRatings(params: { from?: string; to?: string }) {
    const q = new URLSearchParams(params as Record<string, string>).toString();
    return fetchJson<unknown>(`${ENDPOINTS.ratings}?${q}`);
  },

  getPushVapidKey() {
    return fetchJson<{ publicKey: string }>(ENDPOINTS.pushVapidKey);
  },

  subscribePush(subscription: unknown) {
    return postJson<unknown>(ENDPOINTS.pushSubscribe, subscription);
  },

  // ── Waiter-AI app ──
  getFloor() {
    return fetchJson<import('../types/waiter').FloorState>(ENDPOINTS.floor);
  },
  getTableIntel(tableId: string, tone?: string) {
    const q = tone ? `?tone=${encodeURIComponent(tone)}` : '';
    return fetchJson<import('../types/waiter').TableIntel>(`${ENDPOINTS.tableIntel(tableId)}${q}`);
  },
  coach(payload: { tableId?: string; cart?: unknown[]; dishName?: string; tone?: string }) {
    return postJson<import('../types/waiter').CoachResponse>(ENDPOINTS.coach, payload);
  },
  orderedTogether(payload: { cart?: unknown[]; limit?: number }) {
    return postJson<import('../types/waiter').OrderedTogetherResponse>(ENDPOINTS.orderedTogether, payload);
  },

  cartRecommendations(payload: { cart?: unknown[]; event?: string | null; reason?: string; mode?: 'standard' | 'luxury'; tableId?: string; skip?: boolean; declinedName?: string }) {
    return postJson<import('../types/waiter').CartRecResponse>(ENDPOINTS.cartRecommendations, payload);
  },
  sommelier(payload: { dish?: string; cart?: unknown[]; tone?: string }) {
    return postJson<import('../types/waiter').SommelierResponse>(ENDPOINTS.sommelier, payload);
  },
  ask(payload: { message: string; tableId?: string; cart?: unknown[] }) {
    return postJson<import('../types/waiter').AskResponse>(ENDPOINTS.ask, payload);
  },
  recovery(payload: { tableId: string; delayMinutes?: number; tone?: string }) {
    return postJson<import('../types/waiter').RecoveryResponse>(ENDPOINTS.recovery, payload);
  },
  recordUpsell(payload: { waiterName: string; tableId?: string; suggestedItem: string; accepted: boolean; source?: string; value?: number }) {
    return postJson<{ ok: boolean }>(ENDPOINTS.upsellEvent, payload);
  },
  getWaiterPerformance(params: { waiter?: string; period?: string }) {
    const q = new URLSearchParams(params as Record<string, string>).toString();
    return fetchJson<import('../types/waiter').Performance>(`${ENDPOINTS.waiterPerformance}?${q}`);
  },
  getWaiterShiftReport(params: { waiter?: string; period?: string }) {
    const q = new URLSearchParams(params as Record<string, string>).toString();
    return fetchJson<import('../types/waiter').ShiftReport>(`${ENDPOINTS.waiterShiftReport}?${q}`);
  },
  getWaiterLeaderboard(params: { waiter?: string; period?: string }) {
    const q = new URLSearchParams(params as Record<string, string>).toString();
    return fetchJson<import('../types/waiter').LeaderboardResponse>(`${ENDPOINTS.waiterLeaderboard}?${q}`);
  },
  getGuests() {
    return fetchJson<import('../types/waiter').Guest[]>(ENDPOINTS.guests);
  },
  seatGuest(tableId: string, guestId: number) {
    return postJson<{ ok: boolean; guestIntel: import('../types/waiter').GuestIntel }>(ENDPOINTS.seatGuest(tableId), { guestId });
  },
  getAiEvents(params: { status?: string; tableId?: string } = {}) {
    const q = new URLSearchParams(params as Record<string, string>).toString();
    return fetchJson<import('../types/waiter').AiEvent[]>(`${ENDPOINTS.aiEvents}${q ? `?${q}` : ''}`);
  },
  resolveAiEvent(id: number, status: string = 'resolved') {
    return postJson<import('../types/waiter').AiEvent>(ENDPOINTS.resolveAiEvent(id), { status });
  },
  verifyTable(tableId: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return fetchJson<any>(ENDPOINTS.verifyTable(tableId));
  },
  setTableCovers(tableId: string, covers: number) {
    return postJson<{ ok: boolean; tableId: string; covers: number }>(ENDPOINTS.tableCovers(tableId), { covers });
  },
  completeTable(tableId: string) {
    return postJson<{ ok: boolean; tableId: string; completedOrders: number }>(ENDPOINTS.completeTable(tableId), {});
  },
  getWaiterTasks(params: { status?: string; tableId?: string; waiterName?: string } = {}) {
    const q = new URLSearchParams(params as Record<string, string>).toString();
    return fetchJson<import('../types/waiter').WaiterTask[]>(`${ENDPOINTS.waiterTasks}${q ? `?${q}` : ''}`);
  },
  createWaiterTask(payload: Partial<import('../types/waiter').WaiterTask>) {
    return postJson<import('../types/waiter').WaiterTask>(ENDPOINTS.waiterTasks, payload);
  },
  acknowledgeWaiterTask(id: number | string) {
    return postJson<import('../types/waiter').WaiterTask>(ENDPOINTS.waiterTaskAck(id), {});
  },
  resolveWaiterTask(id: number | string) {
    return postJson<import('../types/waiter').WaiterTask>(ENDPOINTS.waiterTaskResolve(id), {});
  },
  getWaiterChatCenter() {
    return fetchJson<import('../types/waiter').ChatConversation[]>(ENDPOINTS.waiterChatCenter);
  },
  analyzeWaiterChat(payload: { tableId: string; message: string; waiterName?: string }) {
    return postJson<{ events: unknown[]; tasks: import('../types/waiter').WaiterTask[] }>(ENDPOINTS.waiterChatAnalysis, payload);
  },
  requestBirthdayApproval(payload: { tableId: string; waiterName?: string; itemName?: string; reason?: string }) {
    return postJson<import('../types/waiter').WaiterTask>(ENDPOINTS.waiterBirthdayRequest, payload);
  },
  approveBirthday(id: number | string, approved: boolean) {
    return postJson<import('../types/waiter').WaiterTask>(ENDPOINTS.waiterBirthdayApproval(id), { approved });
  },
};
