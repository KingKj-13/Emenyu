// Cross-screen state for the waiter app: shift, active tab, selected table,
// the order being built, service notes, and live floor alerts (socket-driven).
import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react';
import { getSocket } from '../services/socket';
import { useAuth } from '../hooks/useAuth';
import { api } from '../services/api';
import { RESTAURANT_ID } from '../constants/api';
import { clockTime } from '../lib/waiterFormat';
import type { MenuItem } from '../types/menu';
import type { WaiterTab, WaiterRole, OrderLine, ServiceNotes, WaiterAlert, GuestEvent } from '../types/waiter';

export type OverlayKind = 'notes' | 'split' | 'recovery' | 'alerts' | 'voice';

interface Shift {
  started: boolean;
  name: string;
  role: WaiterRole;
  section: number[];
  target: { revenue: number; avgCheck: number; upsell: number };
}

interface WaiterContextValue {
  shift: Shift;
  startShift: (name: string, role: WaiterRole, section: number[]) => void;
  endShift: () => void;

  tab: WaiterTab;
  setTab: (t: WaiterTab) => void;

  selectedTableId: string | null;
  selectTable: (tableId: string) => void;

  order: OrderLine[];
  seedGuestLines: (tableId: string, lines: { name?: string; price?: number; quantity?: number; qty?: number }[]) => void;
  addToOrder: (item: { name: string; price: number; img?: string; category?: string; categoryType?: string }, qty?: number) => void;
  changeQty: (index: number, delta: number) => void;
  removeLine: (index: number) => void;
  clearOrder: () => void;
  orderTotal: number;
  sendToKitchen: () => Promise<void>;
  sending: boolean;

  openItem: MenuItem | null;
  setOpenItem: (item: MenuItem | null) => void;

  overlay: OverlayKind | null;
  openOverlay: (o: OverlayKind) => void;
  closeOverlay: () => void;

  notes: Record<string, ServiceNotes>;
  setTableNotes: (tableId: string, notes: ServiceNotes) => void;

  alerts: WaiterAlert[];
  liveAlertCount: number;
  respondAlert: (id: string) => void;
  dismissAlert: (id: string) => void;

  events: Record<string, GuestEvent>;
  placedItems: { name: string; price: number; quantity: number }[];

  toast: string | null;
  showToast: (msg: string) => void;

  // Phase 2 (Waiter Experience): tables with activity the waiter hasn't seen
  // yet, WITHOUT interrupting whichever table they're currently viewing —
  // shown as a small badge, cleared the moment that table is opened.
  unseenTableUpdates: Set<string>;
}

const WaiterContext = createContext<WaiterContextValue>(null!);

const DEFAULT_SECTION = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export function WaiterProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const socketRef = useRef(getSocket());
  const selectedTableRef = useRef<string | null>(null);

  const [shift, setShift] = useState<Shift>({
    started: false,
    name: '',
    role: 'Head Waiter',
    section: DEFAULT_SECTION,
    target: { revenue: 50000, avgCheck: 1200, upsell: 0.6 }
  });
  const [tab, setTab] = useState<WaiterTab>('home');
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [order, setOrder] = useState<OrderLine[]>([]);
  const [openItem, setOpenItem] = useState<MenuItem | null>(null);
  const [notes, setNotes] = useState<Record<string, ServiceNotes>>({});
  const [overlay, setOverlay] = useState<OverlayKind | null>(null);
  const [alerts, setAlerts] = useState<WaiterAlert[]>([]);
  const [events, setEvents] = useState<Record<string, GuestEvent>>({});
  const [placedItems, setPlacedItems] = useState<{ name: string; price: number; quantity: number }[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [unseenTableUpdates, setUnseenTableUpdates] = useState<Set<string>>(new Set());

  const markTableUpdated = useCallback((tableId?: string | null) => {
    if (!tableId) return;
    // Don't badge the table the waiter is already looking at — they'll see the change directly.
    if (tableId === selectedTableRef.current) return;
    setUnseenTableUpdates(prev => (prev.has(tableId) ? prev : new Set(prev).add(tableId)));
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  }, []);

  const startShift = useCallback((name: string, role: WaiterRole, section: number[]) => {
    setShift(s => ({ ...s, started: true, name, role, section }));
    const socket = socketRef.current;
    socket.emit('joinAsWaiter', { restaurantId: RESTAURANT_ID, name });
    socket.emit('joinAdmin', { restaurantId: RESTAURANT_ID });
  }, []);

  const endShift = useCallback(() => {
    setShift(s => ({ ...s, started: false }));
    setSelectedTableId(null);
    setOrder([]);
    setTab('home');
  }, []);

  const selectTable = useCallback((tableId: string) => {
    setSelectedTableId(tableId);
    selectedTableRef.current = tableId;
    setOrder([]);
    setPlacedItems([]);
    setTab('tables');
    // Opening a table is the "refresh immediately" moment — clear its badge.
    setUnseenTableUpdates(prev => (prev.has(tableId) ? (() => { const next = new Set(prev); next.delete(tableId); return next; })() : prev));
    const socket = socketRef.current;
    socket.emit('joinTable', { restaurantId: RESTAURANT_ID, tableId });
    socket.emit('fetchHistory', { restaurantId: RESTAURANT_ID, tableId });
  }, []);
  useEffect(() => { selectedTableRef.current = selectedTableId; }, [selectedTableId]);
  const shiftRef = useRef(shift);
  useEffect(() => { shiftRef.current = shift; }, [shift]);

  // Replace the GUEST-tagged lines with the guest's current live cart on EVERY
  // sync (waiter-added lines are preserved) — so the waiter sees guest changes
  // in real time without reloading.
  const seedGuestLines = useCallback((_tableId: string, lines: { name?: string; price?: number; quantity?: number; qty?: number }[]) => {
    setOrder(prev => {
      const waiterLines = prev.filter(l => l.source !== 'guest');
      const waiterNames = new Set(waiterLines.map(l => l.name));
      const guestLines: OrderLine[] = (lines || [])
        .filter(l => l.name && !waiterNames.has(l.name))
        .map(l => ({ name: String(l.name), price: Number(l.price) || 0, quantity: Number(l.quantity ?? l.qty) || 1, source: 'guest' as const }));
      return [...guestLines, ...waiterLines];
    });
  }, []);

  const addToOrder = useCallback((item: { name: string; price: number; img?: string; category?: string; categoryType?: string }, qty = 1) => {
    setOrder(prev => {
      const idx = prev.findIndex(l => l.name === item.name && l.source === 'waiter');
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + qty };
        return next;
      }
      return [...prev, { name: item.name, price: item.price, quantity: qty, source: 'waiter', img: item.img, category: item.category, categoryType: item.categoryType }];
    });
  }, []);

  const changeQty = useCallback((index: number, delta: number) => {
    setOrder(prev => prev.map((l, i) => (i === index ? { ...l, quantity: Math.max(1, l.quantity + delta) } : l)));
  }, []);

  const removeLine = useCallback((index: number) => {
    setOrder(prev => prev.filter((_, i) => i !== index));
  }, []);

  const clearOrder = useCallback(() => setOrder([]), []);

  const orderTotal = order.reduce((sum, l) => sum + l.price * l.quantity, 0);

  const sendToKitchen = useCallback(async () => {
    if (!selectedTableId || order.length === 0) return;
    setSending(true);
    try {
      await api.waiterAddItems({
        tableId: selectedTableId,
        items: order.map(l => ({ name: l.name, price: l.price, qty: l.quantity })),
        waiterName: shift.name || user?.username || 'waiter',
        notes: notes[selectedTableId]?.text || ''
      });
      clearOrder();
      showToast('Sent to kitchen');
    } catch {
      showToast('Could not send - try again');
    } finally {
      setSending(false);
    }
  }, [selectedTableId, order, shift.name, user, notes, clearOrder, showToast]);

  const setTableNotes = useCallback((tableId: string, n: ServiceNotes) => {
    setNotes(prev => ({ ...prev, [tableId]: n }));
  }, []);

  const respondAlert = useCallback((id: string) => {
    setAlerts(prev => prev.map(a => (a.id === id ? { ...a, state: 'responded' } : a)));
    const alert = alerts.find(a => a.id === id);
    if (alert?.tableId) {
      socketRef.current.emit('waiterResponding', { restaurantId: RESTAURANT_ID, tableId: alert.tableId });
    }
  }, [alerts]);

  const dismissAlert = useCallback((id: string) => {
    setAlerts(prev => prev.filter(a => a.id !== id));
  }, []);

  // Live floor alerts from socket events.
  useEffect(() => {
    const socket = socketRef.current;
    const pushAlert = (a: Omit<WaiterAlert, 'id' | 'time' | 'createdAt' | 'state'>) => {
      const alert: WaiterAlert = { ...a, id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, time: clockTime(), createdAt: Date.now(), state: 'live' };
      setAlerts(prev => [alert, ...prev].slice(0, 30));
    };
    const onBell = (p: { tableId?: string; displayTable?: string }) => {
      const label = p.displayTable || (p.tableId ? p.tableId.replace('table', 'Table ') : 'A table');
      pushAlert({ kind: 'bell', tableId: p.tableId, title: label, message: `${label} just rang the service bell` });
      showToast(`🔔 ${label} is calling you`);
    };
    const onManager = (p: { message?: string }) => {
      pushAlert({ kind: 'manager', title: 'Manager', message: p.message || 'Manager called you to the front' });
    };
    const onKitchen = (p: { tableId?: string; kitchenStatus?: string; displayTable?: string }) => {
      if ((p.kitchenStatus || '').toLowerCase() !== 'ready') return;
      const label = p.displayTable || (p.tableId ? p.tableId.replace('table', 'Table ') : 'A table');
      pushAlert({ kind: 'ready', tableId: p.tableId, title: label, message: `Order ready - bring to ${label.toLowerCase()}` });
      markTableUpdated(p.tableId);
    };
    const onWaiterTaskCreated = (p: { task?: { tableId?: string } }) => {
      markTableUpdated(p?.task?.tableId);
    };
    const onGuestEvent = (p: { tableId?: string; event?: GuestEvent | null }) => {
      if (!p?.event) return;
      const label = p.tableId ? p.tableId.replace('table', 'Table ') : 'A table';
      setEvents(prev => ({ ...prev, [String(p.tableId)]: p.event as GuestEvent }));
      markTableUpdated(p.tableId);
      pushAlert({
        kind: 'event',
        tableId: p.tableId,
        title: `${p.event.emoji} ${p.event.label} · ${label}`,
        message: p.event.action || `${p.event.label} detected at ${label}`,
        emoji: p.event.emoji,
        action: p.event.action,
        script: p.event.script
      });
      // Prominent real-time nudge so the waiter sees it immediately.
      showToast(`${p.event.emoji} ${label} - offer a complimentary Chocolate Lava Cake`);
    };
    const sameTable = (a?: string | null, b?: string | null) =>
      String(a || '').toLowerCase().replace(/[^a-z0-9]/g, '') === String(b || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const onSyncCart = (p: { tableId?: string; cart?: { name?: string; price?: number; quantity?: number; qty?: number }[] }) => {
      if (!p || !Array.isArray(p.cart)) return;
      if (!sameTable(p.tableId, selectedTableRef.current)) return;
      seedGuestLines(String(p.tableId), p.cart);
    };
    const onSyncHistory = (p: { tableId?: string; history?: { name?: string; price?: number; quantity?: number; qty?: number }[] }) => {
      if (!p || !sameTable(p.tableId, selectedTableRef.current) || !Array.isArray(p.history)) return;
      setPlacedItems(
        p.history
          .filter(h => h && h.name)
          .map(h => ({ name: String(h.name), price: Number(h.price) || 0, quantity: Number(h.quantity ?? h.qty) || 1 }))
      );
    };
    const onOrderPlaced = (p?: { tableId?: string }) => {
      const tid = selectedTableRef.current;
      if (tid) socket.emit('fetchHistory', { restaurantId: RESTAURANT_ID, tableId: tid });
      markTableUpdated(p?.tableId);
    };
    // On (re)connect — e.g. after a server restart — re-join the waiter/admin
    // rooms and the selected table so notifications and cart sync keep working.
    const onConnect = () => {
      if (shiftRef.current.started) {
        socket.emit('joinAsWaiter', { restaurantId: RESTAURANT_ID, name: shiftRef.current.name });
        socket.emit('joinAdmin', { restaurantId: RESTAURANT_ID });
      }
      const tid = selectedTableRef.current;
      if (tid) {
        socket.emit('joinTable', { restaurantId: RESTAURANT_ID, tableId: tid });
        socket.emit('fetchHistory', { restaurantId: RESTAURANT_ID, tableId: tid });
      }
    };
    socket.on('connect', onConnect);
    socket.on('incomingWaiterCall', onBell);
    socket.on('managerCallWaiter', onManager);
    socket.on('kitchenStatusUpdate', onKitchen);
    socket.on('guestEvent', onGuestEvent);
    socket.on('syncCart', onSyncCart);
    socket.on('syncHistory', onSyncHistory);
    socket.on('orderPlaced', onOrderPlaced);
    socket.on('waiterTaskCreated', onWaiterTaskCreated);
    return () => {
      socket.off('connect', onConnect);
      socket.off('incomingWaiterCall', onBell);
      socket.off('managerCallWaiter', onManager);
      socket.off('kitchenStatusUpdate', onKitchen);
      socket.off('guestEvent', onGuestEvent);
      socket.off('syncCart', onSyncCart);
      socket.off('syncHistory', onSyncHistory);
      socket.off('orderPlaced', onOrderPlaced);
      socket.off('waiterTaskCreated', onWaiterTaskCreated);
    };
  }, [seedGuestLines, showToast, markTableUpdated]);

  const liveAlertCount = alerts.filter(a => a.state === 'live').length;

  return (
    <WaiterContext.Provider value={{
      shift, startShift, endShift,
      tab, setTab,
      selectedTableId, selectTable,
      order, seedGuestLines, addToOrder, changeQty, removeLine, clearOrder, orderTotal, sendToKitchen, sending,
      openItem, setOpenItem,
      overlay, openOverlay: setOverlay, closeOverlay: () => setOverlay(null),
      notes, setTableNotes,
      alerts, liveAlertCount, respondAlert, dismissAlert,
      events, placedItems,
      toast, showToast,
      unseenTableUpdates
    }}>
      {children}
    </WaiterContext.Provider>
  );
}

export function useWaiter() {
  return useContext(WaiterContext);
}
