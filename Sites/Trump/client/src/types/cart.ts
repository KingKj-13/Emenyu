export interface CartItem {
  name: string;
  price: number;
  qty: number;
  note: string;
  img: string;
  description: string;
  source?: 'guest' | 'waiter';
  // Phase 5 (AI Concierge): carried through when the adding surface has it
  // (menu items, chat/cart suggestions), so presentation-layer timing logic
  // can tell a drink from a main without re-deriving category from the name.
  // Optional — items added without it fall back to a keyword heuristic.
  categoryType?: string;
  beverageKind?: string;
}

export interface CartTotals {
  subtotal: number;
  vat: number;
  service: number;
  tip: number;
  total: number;
}

export type TipMode = 0 | 0.05 | 0.1 | 0.15 | 'custom';

export interface OrderPayload {
  items: Array<{ name: string; price: number; qty: number; note?: string; img?: string; description?: string }>;
  table_number: string;
}
