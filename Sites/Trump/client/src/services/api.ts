import { ENDPOINTS } from '../constants/api';
import type { MenuData } from '../types/menu';
import type { LoginPayload, LoginResponse, AuthUser } from '../types/auth';
import type { OrderPayload } from '../types/cart';

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
  getMenu(): Promise<MenuData> {
    return fetchJson<MenuData>(ENDPOINTS.menu);
  },

  getDeals() {
    return fetchJson<unknown[]>(ENDPOINTS.deals);
  },

  getRecommendations(payload: unknown) {
    return postJson<unknown>(ENDPOINTS.recommend, payload);
  },

  chat(payload: unknown) {
    return postJson<unknown>(ENDPOINTS.chat, payload);
  },

  aiPairing(payload: unknown) {
    return postJson<unknown>(ENDPOINTS.aiPairing, payload);
  },

  submitOrder(payload: OrderPayload) {
    return postJson<{ ok: boolean }>(ENDPOINTS.submitOrder, payload);
  },

  authMe(): Promise<AuthUser | null> {
    return fetchJson<AuthUser | null>(ENDPOINTS.authMe).catch(() => null);
  },

  login(payload: LoginPayload): Promise<LoginResponse> {
    return postJson<LoginResponse>(ENDPOINTS.authLogin, payload);
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
    return fetchJson<unknown>(`/Trump/delete/${type}/${filename}`, { method: 'DELETE' });
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
    return fetchJson<unknown[]>(`/Trump/api/recommendations`);
  },

  saveRecommendations(data: unknown) {
    return postJson<unknown>(`/Trump/api/recommendations`, data);
  },

  getChatHistory() {
    return fetchJson<unknown[]>(`/Trump/api/chat-history`);
  },

  uploadFile(formData: FormData) {
    return fetchJson<{ filePath: string; type: string }>(ENDPOINTS.upload, {
      method: 'POST',
      body: formData,
    });
  },
};
