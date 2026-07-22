import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react';
import type { CartItem, CartTotals, TipMode } from '../types/cart';
import { VAT_RATE, SERVICE_RATE } from '../constants/config';
import { useApp } from './AppContext';
import { useSocket, useSocketEvent } from '../hooks/useSocket';
import { useDebounce } from '../hooks/useDebounce';
import { api } from '../services/api';
import { RESTAURANT_ID } from '../constants/api';
import type { SyncCartEvent, SyncHistoryEvent } from '../types/socket';
import type { RecommendationItem } from '../components/reco/RecommendationCard';

export interface CartRecommendation extends RecommendationItem {
  name: string;
  price: number;
}

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
  history: CartItem[];
  count: number;
  subtotal: number;
  tipMode: TipMode;
  customTip: number;
  isOpen: boolean;
  setIsOpen: (v: boolean) => void;
  setTipMode: (m: TipMode) => void;
  setCustomTip: (v: number) => void;
  justAdded: { name: string; t: number } | null;
  recommendations: CartRecommendation[];
  recommendationsLoading: boolean;
  addItem: (item: Omit<CartItem, 'qty' | 'note'> & { qty?: number; note?: string }) => void;
  updateQty: (index: number, delta: number) => void;
  removeAt: (index: number) => void;
  setNote: (index: number, note: string) => void;
  clear: () => void;
  replaceCart: (items: CartItem[]) => void;
  setHistory: (items: CartItem[]) => void;
  getTotals: () => CartTotals;
  syncCart: () => void;
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
    source: item.source ?? 'guest',
    categoryType: item.categoryType,
    beverageKind: item.beverageKind,
  };
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [history, setHistoryState] = useState<CartItem[]>([]);
  const [tipMode, setTipMode] = useState<TipMode>(0);
  const [customTip, setCustomTip] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [justAdded, setJustAdded] = useState<{ name: string; t: number } | null>(null);

  const addItem = useCallback((raw: Partial<CartItem>) => {
    const next = normalizeItem(raw);
    setItems(prev => {
      const existing = prev.find(e => e.name === next.name && e.price === next.price);
      if (existing) {
        return prev.map(e => e === existing ? { ...e, qty: e.qty + next.qty } : e);
      }
      return [...prev, next];
    });
    setJustAdded({ name: next.name, t: Date.now() });
  }, []);

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

  const setHistory = useCallback((newHistory: CartItem[]) => {
    setHistoryState(newHistory.map(normalizeItem));
  }, []);

  // Socket-sync side effects live here, in the Provider, so they run exactly
  // ONCE per table regardless of how many components call useCart() to read
  // cart state (previously these lived in the useCart hook itself and ran
  // once per call site -- MenuPage/Header/BottomBar/CartDrawer/
  // CartRecommendations/TipSelector all call it, so a single cart edit fired
  // that many duplicate socket emits, and every incoming syncCart broadcast
  // was independently replayed that many times, each rebuilding the items
  // array -- the root cause of "glitchy" cart behavior under real use.
  const { tableId, device } = useApp();
  const socket = useSocket();
  const normalizedTableId = normalizeClientTableId(tableId);
  const lastSyncSig = useRef<string>('');

  useEffect(() => {
    socket.emit('joinTable', { restaurantId: RESTAURANT_ID, tableId: normalizedTableId });
    // Re-join on (re)connect so cart sync survives server restarts / network blips.
    const onConnect = () => socket.emit('joinTable', { restaurantId: RESTAURANT_ID, tableId: normalizedTableId });
    socket.on('connect', onConnect);
    return () => {
      socket.off('connect', onConnect);
      socket.emit('leaveTable', { restaurantId: RESTAURANT_ID, tableId: normalizedTableId });
    };
  }, [socket, normalizedTableId]);

  // Server is the source of truth: apply whatever the table currently holds so
  // every device (phones, waiter) converges. Removals propagate too.
  useSocketEvent<SyncCartEvent>('syncCart', ({ tableId: tid, cart: syncedItems }) => {
    if (normalizeClientTableId(tid) !== normalizedTableId) return;
    lastSyncSig.current = cartSig(syncedItems || []);
    replaceCart(syncedItems || []);
  });

  useSocketEvent<SyncHistoryEvent>('syncHistory', ({ tableId: tid, history: syncedHistory }) => {
    if (normalizeClientTableId(tid) === normalizedTableId) setHistory(syncedHistory);
  });

  // Push local cart changes to the table room so they appear on all devices.
  // The signature guard skips the echo of an update we just received.
  useEffect(() => {
    const sig = cartSig(items);
    if (sig === lastSyncSig.current) return;
    lastSyncSig.current = sig;
    socket.emit('updateCart', {
      restaurantId: RESTAURANT_ID,
      tableId: normalizedTableId,
      cart: items,
      deviceId: device.deviceId,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, socket, normalizedTableId, device.deviceId]);

  const syncCart = useCallback(() => {
    socket.emit('updateCart', {
      restaurantId: RESTAURANT_ID,
      tableId: normalizedTableId,
      cart: items,
      deviceId: device.deviceId,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, normalizedTableId, items, device.deviceId]);

  // Cart-based recommendations now fetch here, in the Provider, so they start
  // loading the moment an item is added to the cart -- regardless of whether
  // the cart drawer is open -- instead of only once the guest opens the
  // drawer (CartRecommendations previously fetched its own data, but only
  // mounted as a child of the drawer's `{isOpen && ...}` JSX, so nothing
  // fetched until then). The drawer's CartRecommendations component now just
  // reads this and still tracks impressions itself, once a card is actually
  // on screen.
  const [recommendations, setRecommendations] = useState<CartRecommendation[]>([]);
  // Distinguishes "still fetching" from "fetch failed" / "engine has nothing
  // more to say" -- CartRecommendations previously couldn't tell these apart
  // (both rendered as nothing), so a slow network made a live pairing look
  // identical to the AI having no suggestion at all.
  const [recommendationsLoading, setRecommendationsLoading] = useState(false);
  const recoDebounceKey = useDebounce(items.map(i => `${i.name}:${i.qty}`).join('|'), 600);

  useEffect(() => {
    if (items.length === 0) { setRecommendations([]); setRecommendationsLoading(false); return; }
    let cancelled = false;
    setRecommendationsLoading(true);
    api.getRecommendations({ items: items.map(i => ({ name: i.name, price: i.price })), tableId })
      .then((data: unknown) => {
        if (cancelled) return;
        setRecommendations(Array.isArray(data) ? (data as CartRecommendation[]) : []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setRecommendationsLoading(false);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recoDebounceKey]);

  const getTotals = useCallback((): CartTotals => {
    const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
    const vat = subtotal * VAT_RATE;
    const service = subtotal * SERVICE_RATE;
    let tipRate = typeof tipMode === 'number' ? tipMode : 0;
    if (tipMode === 'custom') tipRate = customTip / 100;
    const tip = subtotal * tipRate;
    return { subtotal, vat, service, tip, total: subtotal + vat + service + tip };
  }, [items, tipMode, customTip]);

  const count = items.reduce((s, i) => s + i.qty, 0);
  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);

  return (
    <CartContext.Provider value={{
      items, history, count, subtotal,
      tipMode, customTip, isOpen, justAdded, recommendations, recommendationsLoading,
      setIsOpen, setTipMode, setCustomTip,
      addItem, updateQty, removeAt, setNote,
      clear, replaceCart, setHistory, getTotals, syncCart,
    }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  return useContext(CartContext);
}
