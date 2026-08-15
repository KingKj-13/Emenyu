export const BASE_PATH = import.meta.env.VITE_BASE_PATH || '/carmella-production';
export const API_PREFIX = BASE_PATH;
export const RESTAURANT_ID = import.meta.env.VITE_RESTAURANT_ID || 'carmella-production';
export const SOCKET_PATH = `${BASE_PATH}/socket.io`;
export const BRAND_NAME = import.meta.env.VITE_BRAND_NAME || 'Carmella';
export const LANDING_BRAND_NAME = import.meta.env.VITE_BRAND_NAME || 'Carmella';
export const QR_BASE = import.meta.env.VITE_QR_BASE || 'https://emenyu.com/Carmella';

export const ENDPOINTS = {
  menu: `${API_PREFIX}/api/menu`,
  config: `${API_PREFIX}/api/config`,
  upload: `${API_PREFIX}/api/upload`,
  deleteUpload: (filename: string) => `${API_PREFIX}/api/upload/${filename}`,

  menuAdminItems: `${API_PREFIX}/api/menu/items`,
  menuCreateItem: `${API_PREFIX}/api/menu/items`,
  menuCategories: `${API_PREFIX}/api/menu/categories`,
  menuCategoriesReorder: `${API_PREFIX}/api/menu/categories/reorder`,
  menuCategoryItem: (id: number) => `${API_PREFIX}/api/menu/categories/${id}`,
  menuItemAvailability: (id: number) => `${API_PREFIX}/api/menu/items/${id}/availability`,
  menuItemMedia: (id: number) => `${API_PREFIX}/api/menu/items/${id}/media`,
  menuItemUpdate: (id: number) => `${API_PREFIX}/api/menu/items/${id}`,
  menuItemDelete: (id: number) => `${API_PREFIX}/api/menu/items/${id}`,
  menuItemBulk: `${API_PREFIX}/api/menu/items/bulk`,

  promotions: `${API_PREFIX}/api/promotions`,
  promotionsAdmin: `${API_PREFIX}/api/admin/promotions`,
  promotionAdmin: (id: number) => `${API_PREFIX}/api/admin/promotions/${id}`,
  promotionDealOfDay: (id: number) => `${API_PREFIX}/api/admin/promotions/${id}/deal-of-day`,

  happyHour: `${API_PREFIX}/api/happy-hour`,
  happyHourAdmin: `${API_PREFIX}/api/admin/happy-hour`,
  happyHourAdminItem: (id: number) => `${API_PREFIX}/api/admin/happy-hour/${id}`,

  specials: `${API_PREFIX}/api/specials`,
  specialsAdmin: `${API_PREFIX}/api/admin/specials`,
  specialAdmin: (id: number) => `${API_PREFIX}/api/admin/specials/${id}`,

  combos: `${API_PREFIX}/api/combos`,
  combosAdmin: `${API_PREFIX}/api/admin/combos`,
  comboAdmin: (id: number) => `${API_PREFIX}/api/admin/combos/${id}`,

  analyticsEvent: `${API_PREFIX}/api/analytics/event`,
  analyticsDashboard: `${API_PREFIX}/api/admin/analytics/dashboard`,

  liveCarts: `${API_PREFIX}/api/admin/live-carts`,
  liveCartReset: (tableId: string) => `${API_PREFIX}/api/admin/live-carts/${tableId}/reset`,
  liveCartClear: (tableId: string) => `${API_PREFIX}/api/admin/live-carts/${tableId}/clear`,
  liveCartClearDevice: (tableId: string) => `${API_PREFIX}/api/admin/live-carts/${tableId}/clear-device`,
  liveCartFinish: (tableId: string) => `${API_PREFIX}/api/admin/live-carts/${tableId}/finish`,

  theme: `${API_PREFIX}/api/theme`,
  themeAdmin: `${API_PREFIX}/api/admin/theme`
} as const;
