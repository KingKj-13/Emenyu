import type { CartItem } from './cart';

export interface SyncCartEvent {
  restaurantId: string;
  tableId: string;
  cart: CartItem[];
}

export interface SyncHistoryEvent {
  restaurantId: string;
  tableId: string;
  history: CartItem[];
}

export interface AdminOverrideEvent {
  restaurantId: string;
  tableId: string;
  overrides: Record<string, unknown>;
}

export interface OrderPlacedEvent {
  restaurantId: string;
  order: unknown;
}
