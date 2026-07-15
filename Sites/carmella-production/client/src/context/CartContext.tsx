import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react';
import type { CartItem, CartTotals } from '../types/cart';
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
  replaceCart: (items: CartItem[]) => void;
  getTotals: () => CartTotals;
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
  };
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [justAdded, setJustAdded] = useState<{ name: string; t: number } | null>(null);

  const { tableId, sessionId, config } = useApp();

  const addItem = useCallback((raw: Partial<CartItem> & { dbId?: number }) => {
    const next = normalizeItem(raw);
    setItems(prev => {
      const existing = prev.find(e => e.name === next.name && e.price === next.price);
      if (existing) {
        return prev.map(e => e === existing ? { ...e, qty: e.qty + next.qty } : e);
      }
      return [...prev, next];
    });
    setJustAdded({ name: next.name, t: Date.now() });
    api.recordAnalyticsEvent({ type: 'add_to_cart', itemId: raw.dbId, tableId, sessionId }).catch(() => {});
  }, [tableId, sessionId]);

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
    socket.emit('joinTable', { restaurantId: RESTAURANT_ID, tableId: normalizedTableId });
    const onConnect = () => socket.emit('joinTable', { restaurantId: RESTAURANT_ID, tableId: normalizedTableId });
    socket.on('connect', onConnect);
    return () => { socket.off('connect', onConnect); };
  }, [socket, normalizedTableId]);

  // Server is the source of truth: apply whatever the table currently holds so
  // every open browser tab for this table converges.
  useSocketEvent<SyncCartEvent>('syncCart', ({ tableId: tid, cart: syncedItems }) => {
    if (normalizeClientTableId(tid) !== normalizedTableId) return;
    lastSyncSig.current = cartSig(syncedItems || []);
    replaceCart(syncedItems || []);
  });

  // Push local cart changes to the table room. The signature guard skips the
  // echo of an update we just received.
  useEffect(() => {
    const sig = cartSig(items);
    if (sig === lastSyncSig.current) return;
    lastSyncSig.current = sig;
    socket.emit('updateCart', { restaurantId: RESTAURANT_ID, tableId: normalizedTableId, cart: items });
  }, [items, socket, normalizedTableId]);

  const getTotals = useCallback((): CartTotals => {
    const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
    const vatRate = config?.vatRate ?? VAT_RATE;
    const serviceRate = config?.serviceRate ?? SERVICE_RATE;
    const vat = subtotal * vatRate;
    const service = subtotal * serviceRate;
    return { subtotal, vat, service, total: subtotal + vat + service };
  }, [items, config]);

  const count = items.reduce((s, i) => s + i.qty, 0);
  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);

  return (
    <CartContext.Provider value={{
      items, count, subtotal, isOpen, justAdded,
      setIsOpen, addItem, updateQty, removeAt, setNote, clear, replaceCart, getTotals,
    }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  return useContext(CartContext);
}
