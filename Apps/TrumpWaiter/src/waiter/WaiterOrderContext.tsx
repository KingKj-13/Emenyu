// Shared order-taking state for the native waiter — the app's counterpart to the
// web's WaiterContext (client/src/context/WaiterContext.tsx). Holds the active
// table, its live order (guest cart synced in real time + waiter-added lines), the
// already-sent kitchen history, and per-table guest events. Wires the Socket.IO
// cart-sync events so the waiter sees guest changes instantly, and sends the order
// to the kitchen via REST (server validates + is the single source of truth).
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import type { ReactNode } from 'react';
import { useAuth } from '../auth/AuthContext';
import { waiterApi, type SendItem } from '../api/waiter';
import {
  onSocketEvent,
  joinTable,
  clearActiveTable,
  requestHistory,
  waiterResponding as emitWaiterResponding
} from '../services/socket';
import type { OrderLine, PlacedLine, GuestEvent } from '../types/waiter';

interface RawLine {
  name?: string;
  price?: number;
  quantity?: number;
  qty?: number;
}

interface WaiterOrderValue {
  selectedTableId: string | null;
  selectTable: (tableId: string) => void;
  leaveTable: () => void;

  order: OrderLine[];
  placedItems: PlacedLine[];
  orderTotal: number;

  addToOrder: (item: { name: string; price: number; img?: string; category?: string; categoryType?: string }, qty?: number) => void;
  changeQty: (index: number, delta: number) => void;
  removeLine: (index: number) => void;
  clearOrder: () => void;

  sending: boolean;
  sendToKitchen: () => Promise<boolean>;

  respondToTable: (tableId: string) => void;

  events: Record<string, GuestEvent>;

  toast: string | null;
  showToast: (msg: string) => void;
}

const WaiterOrderContext = createContext<WaiterOrderValue | null>(null);

// Loose table-id equality (table7 == Table 7 == "7"): strip non-alphanumerics.
function sameTable(a?: string | null, b?: string | null): boolean {
  const norm = (v?: string | null) => String(v || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return norm(a) === norm(b);
}

export function WaiterOrderProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [order, setOrder] = useState<OrderLine[]>([]);
  const [placedItems, setPlacedItems] = useState<PlacedLine[]>([]);
  const [events, setEvents] = useState<Record<string, GuestEvent>>({});
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const selectedRef = useRef<string | null>(null);

  useEffect(() => {
    selectedRef.current = selectedTableId;
  }, [selectedTableId]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast((cur) => (cur === msg ? null : cur)), 2600);
  }, []);

  // Replace the GUEST-tagged lines with the guest's live cart on every sync;
  // waiter-added lines are preserved (a guest line whose name collides with a
  // waiter line is dropped so it isn't double-counted). Mirrors the web.
  const seedGuestLines = useCallback((lines: RawLine[]) => {
    setOrder((prev) => {
      const waiterLines = prev.filter((l) => l.source !== 'guest');
      const waiterNames = new Set(waiterLines.map((l) => l.name));
      const guestLines: OrderLine[] = (lines || [])
        .filter((l) => l.name && !waiterNames.has(String(l.name)))
        .map((l) => ({
          name: String(l.name),
          price: Number(l.price) || 0,
          quantity: Number(l.quantity ?? l.qty) || 1,
          source: 'guest' as const
        }));
      return [...guestLines, ...waiterLines];
    });
  }, []);

  const selectTable = useCallback((tableId: string) => {
    setSelectedTableId(tableId);
    selectedRef.current = tableId;
    setOrder([]);
    setPlacedItems([]);
    joinTable(tableId); // server replies with syncCart + syncHistory for this table
  }, []);

  const leaveTable = useCallback(() => {
    const tid = selectedRef.current;
    clearActiveTable(tid ?? undefined);
    setSelectedTableId(null);
    selectedRef.current = null;
    setOrder([]);
    setPlacedItems([]);
  }, []);

  const addToOrder = useCallback(
    (item: { name: string; price: number; img?: string; category?: string; categoryType?: string }, qty = 1) => {
      setOrder((prev) => {
        const idx = prev.findIndex((l) => l.name === item.name && l.source === 'waiter');
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = { ...next[idx], quantity: next[idx].quantity + qty };
          return next;
        }
        return [
          ...prev,
          { name: item.name, price: item.price, quantity: qty, source: 'waiter', img: item.img, category: item.category, categoryType: item.categoryType }
        ];
      });
    },
    []
  );

  const changeQty = useCallback((index: number, delta: number) => {
    setOrder((prev) => prev.map((l, i) => (i === index ? { ...l, quantity: Math.max(1, l.quantity + delta) } : l)));
  }, []);

  const removeLine = useCallback((index: number) => {
    setOrder((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const clearOrder = useCallback(() => setOrder([]), []);

  const orderTotal = useMemo(() => order.reduce((sum, l) => sum + l.price * l.quantity, 0), [order]);

  const waiterName = user?.label && user.label !== 'Waiter' ? user.label : user?.username || 'waiter';

  const sendToKitchen = useCallback(async (): Promise<boolean> => {
    const tableId = selectedRef.current;
    if (!tableId || order.length === 0) return false;
    setSending(true);
    try {
      const items: SendItem[] = order.map((l) => ({ name: l.name, price: l.price, qty: l.quantity }));
      await waiterApi.sendToKitchen({ tableId, items, waiterName });
      // The server clears the table cart and re-emits history → syncHistory updates
      // placedItems. Clear local order so we don't double-show while it lands.
      setOrder([]);
      requestHistory(tableId);
      showToast('Sent to kitchen');
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not send';
      showToast(msg.startsWith('HTTP') ? 'Could not send — try again' : msg);
      return false;
    } finally {
      setSending(false);
    }
  }, [order, waiterName, showToast]);

  const respondToTable = useCallback((tableId: string) => {
    emitWaiterResponding(tableId);
  }, []);

  // ─── Socket cart-sync wiring (parity with the web waiter) ───────────────────
  useEffect(() => {
    const offCart = onSocketEvent('syncCart', (p: { tableId?: string; cart?: RawLine[] }) => {
      if (!p || !Array.isArray(p.cart)) return;
      if (!sameTable(p.tableId, selectedRef.current)) return;
      seedGuestLines(p.cart);
    });
    const offHistory = onSocketEvent('syncHistory', (p: { tableId?: string; history?: RawLine[] }) => {
      if (!p || !sameTable(p.tableId, selectedRef.current) || !Array.isArray(p.history)) return;
      setPlacedItems(
        p.history
          .filter((h) => h && h.name)
          .map((h) => ({ name: String(h.name), price: Number(h.price) || 0, quantity: Number(h.quantity ?? h.qty) || 1 }))
      );
    });
    const offGuestEvent = onSocketEvent('guestEvent', (p: { tableId?: string; event?: GuestEvent | null }) => {
      if (!p?.event || !p.tableId) return;
      setEvents((prev) => ({ ...prev, [String(p.tableId)]: p.event as GuestEvent }));
    });
    const offOrderPlaced = onSocketEvent('orderPlaced', () => {
      const tid = selectedRef.current;
      if (tid) requestHistory(tid);
    });
    return () => {
      offCart();
      offHistory();
      offGuestEvent();
      offOrderPlaced();
    };
  }, [seedGuestLines]);

  const value = useMemo<WaiterOrderValue>(
    () => ({
      selectedTableId,
      selectTable,
      leaveTable,
      order,
      placedItems,
      orderTotal,
      addToOrder,
      changeQty,
      removeLine,
      clearOrder,
      sending,
      sendToKitchen,
      respondToTable,
      events,
      toast,
      showToast
    }),
    [selectedTableId, selectTable, leaveTable, order, placedItems, orderTotal, addToOrder, changeQty, removeLine, clearOrder, sending, sendToKitchen, respondToTable, events, toast, showToast]
  );

  return <WaiterOrderContext.Provider value={value}>{children}</WaiterOrderContext.Provider>;
}

export function useWaiterOrder(): WaiterOrderValue {
  const ctx = useContext(WaiterOrderContext);
  if (!ctx) throw new Error('useWaiterOrder must be used within WaiterOrderProvider');
  return ctx;
}
