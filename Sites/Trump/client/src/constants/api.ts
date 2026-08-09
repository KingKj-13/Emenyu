// Build-time overrides let the exact same client bundle be rebuilt once more
// for the public "Demo Steakhouse" tenant (VITE_BASE_PATH=/demo etc. — see
// Sites/Demo/), while Trump's own default build is byte-identical to before.
export const BASE_PATH = import.meta.env.VITE_BASE_PATH || '/Trump';
export const API_PREFIX = BASE_PATH;
export const RESTAURANT_ID = import.meta.env.VITE_RESTAURANT_ID || 'trump';
export const SOCKET_PATH = `${BASE_PATH}/socket.io`;
export const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true';
export const BRAND_NAME = import.meta.env.VITE_BRAND_NAME || 'Trump';
// LandingPage's h1 has always read "Trumps" (its own stylized form, distinct
// from the "Trump" used elsewhere) — same override, different Trump-default,
// so a demo build sets VITE_BRAND_NAME once and both render identically.
export const LANDING_BRAND_NAME = import.meta.env.VITE_BRAND_NAME || 'Trumps';
export const BRAND_TAGLINE = import.meta.env.VITE_BRAND_TAGLINE || 'Prime Grillhouse';
export const QR_BASE = import.meta.env.VITE_QR_BASE || 'https://emenyu.com/Trump';
// The one menu category whose *apiKey* (not just display label) is brand-prefixed
// in the live Trump data — everything downstream (landing-page deep links, the
// chapter list's category filter, the icon map) must key off the same value a
// given tenant's real MenuCategory.title uses. Defaults preserve Trump exactly.
export const MAINS_CATEGORY_TITLE = import.meta.env.VITE_MAINS_CATEGORY_TITLE || 'Trumps Premium Steaks';
export const PASTAS_CATEGORY_TITLE = import.meta.env.VITE_PASTAS_CATEGORY_TITLE || 'Trumps Pastas';

export const ENDPOINTS = {
  menu: `${API_PREFIX}/api/menu`,
  deals: `${API_PREFIX}/api/deals`,
  recommend: `${API_PREFIX}/api/recommend`,
  chat: `${API_PREFIX}/api/chat`,
  config: `${API_PREFIX}/api/config`,
  aiPairing: `${API_PREFIX}/api/ai-pairing`,
  submitOrder: `${API_PREFIX}/submit_order`,
  authMe: `${API_PREFIX}/api/auth/me`,
  authLogin: `${API_PREFIX}/api/auth/login`,
  authLogout: `${API_PREFIX}/api/auth/logout`,
  authAccounts: `${API_PREFIX}/api/auth/accounts`,
  orders: `${API_PREFIX}/orders`,
  history: `${API_PREFIX}/history`,
  complete: `${API_PREFIX}/complete`,
  incomplete: `${API_PREFIX}/incomplete`,
  upload: `${API_PREFIX}/api/upload`,
  waiterTableStatus: (tableId: string) => `${API_PREFIX}/api/waiter/table/${tableId}/status`,
  waiterAddItems: `${API_PREFIX}/api/waiter/add-items`,
  waiterArchiveTable: `${API_PREFIX}/api/waiter/archive-table`,
  // Priority 8 (demo polish) — these 3 were hand-typed as literal "/Trump/..."
  // strings in api.ts instead of going through API_PREFIX like everything
  // else here, so any non-Trump tenant calling them (Carmella's Admin "Chat
  // Logs"/"Chef Recs" pages, in particular) hit Trump's own endpoints, not
  // its own tenant's.
  deleteOrder: (type: 'orders' | 'history', filename: string) => `${API_PREFIX}/delete/${type}/${filename}`,
  recommendationsAdmin: `${API_PREFIX}/api/recommendations`,
  chatHistory: `${API_PREFIX}/api/chat-history`,
  menuAdminItems: `${API_PREFIX}/api/menu/items`,
  menuCategories: `${API_PREFIX}/api/menu/categories`,
  menuItemAvailability: (id: number) => `${API_PREFIX}/api/menu/items/${id}/availability`,
  menuItemMedia: (id: number) => `${API_PREFIX}/api/menu/items/${id}/media`,
  menuItemUpdate: (id: number) => `${API_PREFIX}/api/menu/items/${id}`,
  menuItemDelete: (id: number) => `${API_PREFIX}/api/menu/items/${id}`,
  menuItemBulk: `${API_PREFIX}/api/menu/items/bulk`,
  chefRecs: `${API_PREFIX}/api/menu/chef-recs`,
  chefRec: (id: number) => `${API_PREFIX}/api/menu/chef-recs/${id}`,
  bundles: `${API_PREFIX}/api/menu/bundles`,
  bundlesAdmin: `${API_PREFIX}/api/menu/bundles/admin`,
  bundle: (id: number) => `${API_PREFIX}/api/menu/bundles/${id}`,
  kitchenOrders: `${API_PREFIX}/api/kitchen/orders`,
  kitchenUpdateStatus: (id: number) => `${API_PREFIX}/api/kitchen/orders/${id}/status`,
  analyticsummary: `${API_PREFIX}/api/analytics/summary`,
  analyticsItems: `${API_PREFIX}/api/analytics/items`,
  analyticsTables: `${API_PREFIX}/api/analytics/tables`,
  analyticsHours: `${API_PREFIX}/api/analytics/hours`,
  analyticsTrend: `${API_PREFIX}/api/analytics/trend`,
  analyticsDayOfWeek: `${API_PREFIX}/api/analytics/day-of-week`,
  analyticsPairings: `${API_PREFIX}/api/analytics/pairings`,
  analyticsJourney: `${API_PREFIX}/api/analytics/journey`,
  analyticsRecommendations: `${API_PREFIX}/api/analytics/recommendations`,
  analyticsRecommendationsInsights: `${API_PREFIX}/api/analytics/recommendations/insights`,
  recoEvents: `${API_PREFIX}/api/reco/events`,
  // QR-menu redesign — guest engagement (anonymous) and the reports built on it
  engagement: `${API_PREFIX}/api/engagement`,
  engagementSummary: `${API_PREFIX}/api/analytics/engagement`,
  engagementTimeline: `${API_PREFIX}/api/analytics/engagement/timeline`,
  engagementLeastViewed: `${API_PREFIX}/api/analytics/engagement/least-viewed`,
  butcheryCuts: `${API_PREFIX}/api/butchery/cuts`,
  itemGallery: (id: number) => `${API_PREFIX}/api/menu/items/${id}/gallery`,
  locales: `${API_PREFIX}/api/locales`,
  // Owner content management (media galleries, translations, butchery cuts)
  adminContentFields: `${API_PREFIX}/api/admin/content/fields`,
  adminMedia: `${API_PREFIX}/api/admin/content/media`,
  adminMediaItem: (id: number) => `${API_PREFIX}/api/admin/content/media/${id}`,
  adminMediaReorder: `${API_PREFIX}/api/admin/content/media/reorder`,
  adminTranslations: `${API_PREFIX}/api/admin/content/translations`,
  adminTranslationCoverage: `${API_PREFIX}/api/admin/content/translations/coverage`,
  adminCuts: `${API_PREFIX}/api/admin/content/cuts`,
  adminCut: (id: number) => `${API_PREFIX}/api/admin/content/cuts/${id}`,
  adminCutItems: (id: number) => `${API_PREFIX}/api/admin/content/cuts/${id}/items`,
  adminCutItem: (id: number, itemId: number) => `${API_PREFIX}/api/admin/content/cuts/${id}/items/${itemId}`,
  adminTableCarts: `${API_PREFIX}/api/admin/tables/carts`,
  reservations: `${API_PREFIX}/api/reservations`,
  ratings: `${API_PREFIX}/api/ratings`,
  pushVapidKey: `${API_PREFIX}/api/push/vapid-key`,
  pushSubscribe: `${API_PREFIX}/api/push/subscribe`,
  // Waiter-AI app
  floor: `${API_PREFIX}/api/floor`,
  tableIntel: (tableId: string) => `${API_PREFIX}/api/waiter/table/${tableId}/intel`,
  coach: `${API_PREFIX}/api/waiter/coach`,
  cartRecommendations: `${API_PREFIX}/api/waiter/cart-recommendations`,
  orderedTogether: `${API_PREFIX}/api/waiter/ordered-together`,
  sommelier: `${API_PREFIX}/api/sommelier`,
  ask: `${API_PREFIX}/api/ask`,
  recovery: `${API_PREFIX}/api/waiter/recovery`,
  upsellEvent: `${API_PREFIX}/api/upsell-event`,
  waiterPerformance: `${API_PREFIX}/api/waiter/me/performance`,
  waiterShiftReport: `${API_PREFIX}/api/waiter/me/shift-report`,
  waiterLeaderboard: `${API_PREFIX}/api/waiter/leaderboard`,
  guests: `${API_PREFIX}/api/guests`,
  guest: (id: number) => `${API_PREFIX}/api/guests/${id}`,
  seatGuest: (tableId: string) => `${API_PREFIX}/api/waiter/table/${tableId}/seat-guest`,
  aiEvents: `${API_PREFIX}/api/ai-events`,
  resolveAiEvent: (id: number) => `${API_PREFIX}/api/ai-events/${id}/resolve`,
  verifyTable: (tableId: string) => `${API_PREFIX}/api/admin/verify/${tableId}`,
  tableCovers: (tableId: string) => `${API_PREFIX}/api/waiter/table/${tableId}/covers`,
  completeTable: (tableId: string) => `${API_PREFIX}/api/waiter/table/${tableId}/complete`,
  nlgStatus: `${API_PREFIX}/api/waiter/nlg-status`,
  waiterTasks: `${API_PREFIX}/api/waiter/tasks`,
  waiterTaskAck: (id: number | string) => `${API_PREFIX}/api/waiter/tasks/${id}/ack`,
  waiterTaskResolve: (id: number | string) => `${API_PREFIX}/api/waiter/tasks/${id}/resolve`,
  waiterChatCenter: `${API_PREFIX}/api/waiter/chat-center`,
  waiterChatAnalysis: `${API_PREFIX}/api/waiter/chat-analysis`,
  waiterBirthdayRequest: `${API_PREFIX}/api/waiter/birthday-request`,
  waiterBirthdayApproval: (id: number | string) => `${API_PREFIX}/api/waiter/birthday-approval/${id}`,
  // Phase 03 — staff operations (shifts, ownership, notifications, owner ops, audit)
  shiftMe: `${API_PREFIX}/api/shift/me`,
  shiftStart: `${API_PREFIX}/api/shift/start`,
  shiftEnd: `${API_PREFIX}/api/shift/end`,
  shifts: `${API_PREFIX}/api/shifts`,
  shiftsHistory: `${API_PREFIX}/api/shifts/history`,
  shiftForceEnd: (username: string) => `${API_PREFIX}/api/shifts/${username}/end`,
  ownership: `${API_PREFIX}/api/ownership`,
  ownershipTable: (tableId: string) => `${API_PREFIX}/api/ownership/${tableId}`,
  ownershipHistory: (tableId: string) => `${API_PREFIX}/api/ownership/${tableId}/history`,
  ownershipAssign: (tableId: string) => `${API_PREFIX}/api/ownership/${tableId}/assign`,
  ownershipTransfer: (tableId: string) => `${API_PREFIX}/api/ownership/${tableId}/transfer`,
  ownershipTakeover: (tableId: string) => `${API_PREFIX}/api/ownership/${tableId}/takeover`,
  ownershipReassign: (tableId: string) => `${API_PREFIX}/api/ownership/${tableId}/reassign`,
  notifications: `${API_PREFIX}/api/notifications`,
  notificationsUnread: `${API_PREFIX}/api/notifications/unread-count`,
  notificationAck: (id: number | string) => `${API_PREFIX}/api/notifications/${id}/ack`,
  notificationsAckAll: `${API_PREFIX}/api/notifications/ack-all`,
  ownerOperations: `${API_PREFIX}/api/owner/operations`,
  auditTrail: `${API_PREFIX}/api/audit`,
  // Curated Demo Mode
  settings: `${API_PREFIX}/api/settings`,
  rewardRedeem: (code: string) => `${API_PREFIX}/api/rewards/${encodeURIComponent(code)}/redeem`,
} as const;
