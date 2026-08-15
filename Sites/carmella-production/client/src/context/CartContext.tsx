import { createContext, useContext, useState, useCallback, useEffect, useRef, useMemo, type ReactNode } from 'react';
import type { CartItem, CartTotals, CartDevice, DeviceCartGroup } from '../types/cart';
import { VAT_RATE, SERVICE_RATE } from '../constants/config';
import { useApp } from './AppContext';
import { useSocket, useSocketEvent } from '../hooks/useSocket';
import { api } from '../services/api';
import { RESTAURANT_ID } from '../constants/api';
import type { SyncCartEvent } from '../types/socket';

function normalizeClientTableId(value: string): string {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, '');
}

// Stable signature of a cart so we only sync real changes (and never echo a
// just-received update straight back to the server, which would loop).
function cartSig(items: Array<{ name?: string; price?: number; qty?: number }>): string {
  return (items || []).map(i => `${i.name}:${i.price}:${i.qty ?? 1}`).join('|');
}

interface CartContextValue {
  items: CartItem[];
  count: number;
  subtotal: number;
  isOpen: boolean;
  setIsOpen: (v: boolean) => void;
  justAdded: { name: string; t: number } | null;
  addItem: (item: Omit<CartItem, 'qty' | 'note'> & { qty?: number; note?: string; dbId?: number }) => void;
  updateQty: (index: number, delta: number) => void;
  removeAt: (index: number) => void;
  setNote: (index: number, note: string) => void;
  clear: () => void;
  // Removes only THIS device's own items -- once other guests' items are
  // visible in the same drawer, a whole-table clear is a foot-gun any single
  // guest could pull the trigger on. "Clear cart" now only ever touches
  // "Your Cart"; clearing another device's items is an Admin-only action
  // (see Live Carts' Clear Device control).
  clearMine: () => void;
  replaceCart: (items: CartItem[]) => void;
  getTotals: () => CartTotals;
  // STEP 12 — Shared Cart, per device. `myDeviceId` is this browser's own
  // identifier (reuses the tenant's existing per-browser sessionId); `mine`
  // is always this device's own items ("Your Cart"); `others` is every other
  // device that's joined this table, each with the SAME D1/D2/D3 label every
  // other guest at the table sees (assigned server-side on first join, see
  // TableDevice) -- never relabeled relative to whoever's viewing.
  myDeviceId: string;
  mine: DeviceCartGroup;
  others: DeviceCartGroup[];
}

const CartContext = createContext<CartContextValue>(null!);

function normalizeItem(item: Partial<CartItem>): CartItem {
  return {
    name: item.name || '',
    price: Number(item.price) || 0,
    qty: Number(item.qty) || 1,
    note: item.note || '',
    img: item.img || '',
    description: item.description || '',
    categoryType: item.categoryType,
    beverageKind: item.beverageKind,
    deviceId: item.deviceId,
  };
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [devices, setDevices] = useState<CartDevice[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [justAdded, setJustAdded] = useState<{ name: string; t: number } | null>(null);

  const { tableId, sessionId, config } = useApp();
  // This browser's own device identity, for the Shared Cart split -- reuses
  // the tenant's existing stable per-browser sessionId (storage.ts) rather
  // than minting a second, redundant identifier.
  const myDeviceId = sessionId;

  const addItem = useCallback((raw: Partial<CartItem> & { dbId?: number }) => {
    const next = normalizeItem({ ...raw, deviceId: myDeviceId });
    setItems(prev => {
      // Only merge quantities with an existing line from the SAME device --
      // two different guests adding "the same dish" must stay two separate
      // lines, each attributed to its own device, or the Shared Cart split
      // silently loses one guest's item into the other's.
      const existing = prev.find(e => e.name === next.name && e.price === next.price && e.deviceId === next.deviceId);
      if (existing) {
        return prev.map(e => e === existing ? { ...e, qty: e.qty + next.qty } : e);
      }
      return [...prev, next];
    });
    setJustAdded({ name: next.name, t: Date.now() });
    api.recordAnalyticsEvent({ type: 'add_to_cart', itemId: raw.dbId, tableId, sessionId }).catch(() => {});
  }, [tableId, sessionId, myDeviceId]);

  const updateQty = useCallback((index: number, delta: number) => {
    setItems(prev => {
      const updated = [...prev];
      if (!updated[index]) return prev;
      updated[index] = { ...updated[index], qty: updated[index].qty + delta };
      if (updated[index].qty < 1) updated.splice(index, 1);
      return updated;
    });
  }, []);

  const removeAt = useCallback((index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index));
  }, []);

  const setNote = useCallback((index: number, note: string) => {
    setItems(prev => prev.map((item, i) => i === index ? { ...item, note: note.trim() } : item));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const clearMine = useCallback(() => {
    setItems(prev => prev.filter(item => item.deviceId !== myDeviceId));
  }, [myDeviceId]);

  const replaceCart = useCallback((newItems: CartItem[]) => {
    setItems(newItems.map(normalizeItem));
  }, []);

  // Socket-sync side effects live here, in the Provider, so they run exactly
  // ONCE per table regardless of how many components call useCart() to read
  // cart state (a single Provider-owned effect, not one per call site,
  // avoids duplicate emits/replays — a real bug found the hard way in the
  // platform's Trump/Carmella build).
  const socket = useSocket();
  const normalizedTableId = normalizeClientTableId(tableId);
  const lastSyncSig = useRef<string>('');

  useEffect(() => {
    const join = () => socket.emit('joinTable', { restaurantId: RESTAURANT_ID, tableId: normalizedTableId, deviceId: myDeviceId });
    // A disconnected socket.io client buffers `emit` and replays it once
    // 'connect' fires -- calling join() here too would then double-send it
    // (harmless for cart sync, but wasteful, and was masking a real device-
    // registration race server-side). Only emit immediately when already
    // connected; otherwise the 'connect' handler alone covers it.
    if (socket.connected) join();
    socket.on('connect', join);
    return () => { socket.off('connect', join); };
  }, [socket, normalizedTableId, myDeviceId]);

  // Server is the source of truth: apply whatever the table currently holds so
  // every open browser tab for this table converges. `devices` is the whole
  // table's roster (every device that's ever joined this seating), which is
  // what makes D1/D2/D3 labels consistent across every guest's own screen.
  useSocketEvent<SyncCartEvent>('syncCart', ({ tableId: tid, cart: syncedItems, devices: syncedDevices }) => {
    if (normalizeClientTableId(tid) !== normalizedTableId) return;
    lastSyncSig.current = cartSig(syncedItems || []);
    replaceCart(syncedItems || []);
    setDevices(syncedDevices || []);
  });

  // Push local cart changes to the table room. The signature guard skips the
  // echo of an update we just received.
  useEffect(() => {
    const sig = cartSig(items);
    if (sig === lastSyncSig.current) return;
    lastSyncSig.current = sig;
    socket.emit('updateCart', { restaurantId: RESTAURANT_ID, tableId: normalizedTableId, cart: items });
  }, [items, socket, normalizedTableId]);

  // Round subtotal/vat/service to whole currency units BEFORE summing for
  // total, not after -- rounding each independently at display time only
  // (the previous behavior) means the three displayed line items don't
  // always add up to the displayed total (e.g. R449 + R67 + R22 displayed
  // while total showed R539, a silent 1-unit gap from summing the
  // *unrounded* figures then rounding the sum separately). formatCurrency
  // rounds again on display, but rounding an already-integer value is a
  // no-op, so what's computed here is exactly what renders.
  const getTotals = useCallback((): CartTotals => {
    const rawSubtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
    const vatRate = config?.vatRate ?? VAT_RATE;
    const serviceRate = config?.serviceRate ?? SERVICE_RATE;
    const subtotal = Math.round(rawSubtotal);
    const vat = Math.round(rawSubtotal * vatRate);
    const service = Math.round(rawSubtotal * serviceRate);
    return { subtotal, vat, service, total: subtotal + vat + service };
  }, [items, config]);

  const count = items.reduce((s, i) => s + i.qty, 0);
  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);

  // STEP 12 — group the flat cart array by device for the Shared Cart UI.
  // "Your Cart" is always this device's own items; "others" is every OTHER
  // device on the table roster, ordered by its server-assigned deviceNumber
  // (stable across every guest's screen -- never renumbered relative to who's
  // viewing). A device with zero items still gets a section (an empty D2 is
  // meaningful: that guest is at the table and simply hasn't ordered yet).
  const groupFor = useCallback((deviceId: string | null, label: string): DeviceCartGroup => {
    const groupItems = items.filter(i => (i.deviceId || null) === deviceId);
    return { deviceId, label, items: groupItems, subtotal: groupItems.reduce((s, i) => s + i.price * i.qty, 0) };
  }, [items]);

  const mine = useMemo(() => groupFor(myDeviceId, 'Your Cart'), [groupFor, myDeviceId]);

  const others = useMemo(() => {
    const otherDevices = devices.filter(d => d.deviceId !== myDeviceId).sort((a, b) => a.deviceNumber - b.deviceNumber);
    const groups = otherDevices.map(d => groupFor(d.deviceId, `D${d.deviceNumber}`));
    // Items whose deviceId isn't in the roster at all (carts written before
    // this feature, or a caller that never joined via a device) get their
    // own bucket rather than vanishing from the total.
    const knownIds = new Set([myDeviceId, ...otherDevices.map(d => d.deviceId)]);
    const unassignedItems = items.filter(i => !knownIds.has(i.deviceId || ''));
    if (unassignedItems.length > 0) {
      groups.push({ deviceId: null, label: 'Other items', items: unassignedItems, subtotal: unassignedItems.reduce((s, i) => s + i.price * i.qty, 0) });
    }
    return groups;
  }, [devices, items, myDeviceId, groupFor]);

  return (
    <CartContext.Provider value={{
      items, count, subtotal, isOpen, justAdded,
      setIsOpen, addItem, updateQty, removeAt, setNote, clear, clearMine, replaceCart, getTotals,
      myDeviceId, mine, others,
    }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  return useContext(CartContext);
}
