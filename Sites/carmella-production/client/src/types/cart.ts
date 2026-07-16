export interface CartItem {
  name: string;
  price: number;
  qty: number;
  note: string;
  img: string;
  description: string;
  categoryType?: string;
  beverageKind?: string;
  // STEP 12 — which device (browser/session, see storage.ts's per-tenant
  // sessionId, reused as the device identifier) added this item. Powers the
  // Shared Cart's "Your Cart" / "D1" / "D2" split -- absent on items written
  // before this feature shipped, which fall into an "unassigned" bucket.
  deviceId?: string;
}

export interface CartDevice {
  deviceId: string;
  deviceNumber: number;
}

export interface DeviceCartGroup {
  deviceId: string | null;
  label: string;
  items: CartItem[];
  subtotal: number;
}

// Estimate only — there is no order, no payment. VAT/service are computed
// client-side from the same rates the server exposes via GET /api/config.
export interface CartTotals {
  subtotal: number;
  vat: number;
  service: number;
  total: number;
}
