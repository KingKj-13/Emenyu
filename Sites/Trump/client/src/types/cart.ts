export interface CartItem {
  name: string;
  price: number;
  qty: number;
  note: string;
  img: string;
  description: string;
}

export interface CartTotals {
  subtotal: number;
  vat: number;
  service: number;
  tip: number;
  total: number;
}

export type TipMode = 0 | 0.05 | 0.1 | 'custom';

export interface OrderPayload {
  items: Array<{ name: string; price: number; qty: number; note?: string; img?: string; description?: string }>;
  table_number: string;
}
