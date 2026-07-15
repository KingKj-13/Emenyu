import type { CartItem } from './cart';

export interface SyncCartEvent {
  restaurantId: string;
  tableId: string;
  cart: CartItem[];
}

export interface LiveCartsChangedEvent {
  restaurantId: string;
}
