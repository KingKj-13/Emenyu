export interface CartItem {
  name: string;
  price: number;
  qty: number;
  note: string;
  img: string;
  description: string;
  categoryType?: string;
  beverageKind?: string;
}

// Estimate only — there is no order, no payment. VAT/service are computed
// client-side from the same rates the server exposes via GET /api/config.
export interface CartTotals {
  subtotal: number;
  vat: number;
  service: number;
  total: number;
}
