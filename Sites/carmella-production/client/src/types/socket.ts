import type { CartItem, CartDevice } from './cart';

export interface SyncCartEvent {
  restaurantId: string;
  tableId: string;
  cart: CartItem[];
  devices: CartDevice[];
}

export interface LiveCartsChangedEvent {
  restaurantId: string;
}
