export const BASE_PATH = '/Trump';
export const API_PREFIX = '/Trump';
export const RESTAURANT_ID = 'trump';
export const SOCKET_PATH = '/Trump/socket.io';

export const ENDPOINTS = {
  menu: `${API_PREFIX}/api/menu`,
  deals: `${API_PREFIX}/api/deals`,
  recommend: `${API_PREFIX}/api/recommend`,
  chat: `${API_PREFIX}/api/chat`,
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
} as const;
