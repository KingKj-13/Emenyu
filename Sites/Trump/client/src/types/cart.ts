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
  // Device-aware recommendations: which device (storage.ts#getDeviceIdentity)
  // added this item to the shared table cart. Empty for legacy/pre-rollout
  // items and waiter-added items — aiService.readCart() falls back to the
  // full cart when nothing in it carries this tag.
  addedByDevice?: string;
  // Device Awareness / split-bill-by-device: epoch ms when this line was
  // added — stamped once by CartContext.addItem(), never recomputed on sync,
  // so a split-by-device grouping can label each guest's group with when
  // they actually started ordering.
  addedAt?: number;
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
  // Server never trusts client pricing/subtotal/vat/service (recomputed from
  // its own menu data) but DOES read totals.tip as the customer's chosen tip
  // (orderValidationService.js clamps it server-side) -- omitting this field
  // entirely silently drops every order's tip to R0.
  totals?: CartTotals;
  // Phase 05A idempotency key: the server already enforces a per-restaurant
  // unique constraint on this field (orderValidationService.js /
  // prismaOrderService.js) -- a retried submit carrying the same value
  // resolves to the original order instead of creating a duplicate. Must stay
  // stable across retries of the *same* attempt and only regenerate once
  // that attempt actually succeeds.
  clientOrderId?: string;
}
