// Typed client for the waiter-AI + order-taking API — the SAME endpoints the web
// waiter (client/src/services/api.ts) uses. Every call rides the app's Bearer access
// token; the server (waiterAuth = requireRoles owner|manager|waiter) accepts Bearer
// identically to the web cookie. No business logic here — the server owns it.
import { api } from './apiClient';
import { EP, qs } from './endpoints';
import type {
  FloorState,
  TableIntel,
  CartRecResponse,
  Performance,
  WaiterTask,
  ChatConversation
} from '../types/waiter';

export interface SendItem {
  name: string;
  price: number;
  qty: number;
}

export interface TableStatus {
  status: string;
  orderCount: number;
  total: number;
  oldestOrderAt: string | null;
}

export const waiterApi = {
  // ---- floor + table intelligence (read) ----
  getFloor: () => api.get<FloorState>(EP.floor),
  getTableStatus: (t: string) => api.get<TableStatus>(EP.tableStatus(t)),
  getTableIntel: (t: string) => api.get<TableIntel>(EP.tableIntel(t)),

  // ---- cart-level AI recommendations (revenue opportunity panel) ----
  cartRecommendations: (payload: { cart: unknown[]; event?: string | null; reason?: string }) =>
    api.post<CartRecResponse>(EP.cartRecommendations, payload),

  // ---- send to kitchen (write) ----
  // Mirrors the web waiter's `waiterAddItems`. The server validates every item
  // against the live menu (existence/availability/price) and resets the table cart.
  sendToKitchen: (payload: { tableId: string; items: SendItem[]; waiterName?: string; notes?: string }) =>
    api.post<{ ok: boolean }>(EP.addItems, payload),

  // ---- accepted-upsell logging (write) ----
  recordUpsell: (payload: {
    waiterName: string;
    tableId?: string;
    suggestedItem: string;
    accepted: boolean;
    source?: string;
    value?: number;
  }) => api.post<{ ok: boolean }>(EP.upsellEvent, payload),

  // ---- workflow tasks (Call Manager, alerts, ack/resolve) ----
  listTasks: (opts: { status?: string; tableId?: string; waiterName?: string } = {}) =>
    api.get<WaiterTask[]>(EP.tasks + qs(opts)),
  createTask: (payload: Partial<WaiterTask>) => api.post<WaiterTask>(EP.tasks, payload),
  ackTask: (id: number | string) => api.post<WaiterTask>(EP.taskAck(id), {}),
  resolveTask: (id: number | string) => api.post<WaiterTask>(EP.taskResolve(id), {}),

  // ---- chat center ----
  getChatCenter: () => api.get<ChatConversation[]>(EP.chatCenter),
  analyzeChat: (payload: { tableId: string; message: string; waiterName?: string }) =>
    api.post<{ events: unknown[]; tasks: WaiterTask[] }>(EP.chatAnalysis, payload),

  // ---- birthday / complimentary-item approval request ----
  requestBirthdayApproval: (payload: { tableId: string; waiterName?: string; itemName?: string; reason?: string }) =>
    api.post<WaiterTask>(EP.birthdayRequest, payload),

  // ---- personal performance (Profile) ----
  getMyPerformance: (period = 'today') =>
    api.get<Performance>(EP.myPerformance + qs({ period }))
};
