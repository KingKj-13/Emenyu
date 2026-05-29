// Cross-screen state for the waiter app: shift, active tab, selected table,
// the order being built, service notes, and live floor alerts (socket-driven).
import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react';
import { getSocket } from '../services/socket';
import { useAuth } from '../hooks/useAuth';
import { api } from '../services/api';
import { RESTAURANT_ID } from '../constants/api';
import { clockTime } from '../lib/waiterFormat';
import type { MenuItem } from '../types/menu';
import type { WaiterTab, WaiterRole, OrderLine, ServiceNotes, WaiterAlert } from '../types/waiter';

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

  toast: string | null;
  showToast: (msg: string) => void;
}

const WaiterContext = createContext<WaiterContextValue>(null!);

const DEFAULT_SECTION = [5, 7, 12, 18, 21, 24];

export function WaiterProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const socketRef = useRef(getSocket());
  const seededTableRef = useRef<string | null>(null);

  const [shift, setShift] = useState<Shift>({
    started: false,
    name: '',
    role: 'Head Waiter',
    section: DEFAULT_SECTION,
    target: { revenue: 50000, avgCheck: 1200, upsell: 0.6 }
  });
  const [tab, setTab] = useState<WaiterTab>('floor');
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [order, setOrder] = useState<OrderLine[]>([]);
  const [openItem, setOpenItem] = useState<MenuItem | null>(null);
  const [notes, setNotes] = useState<Record<string, ServiceNotes>>({});
  const [overlay, setOverlay] = useState<OverlayKind | null>(null);
  const [alerts, setAlerts] = useState<WaiterAlert[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

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
    setTab('floor');
  }, []);

  const selectTable = useCallback((tableId: string) => {
    setSelectedTableId(tableId);
    setOrder([]);
    seededTableRef.current = null;
    setTab('order');
    const socket = socketRef.current;
    socket.emit('joinTable', { restaurantId: RESTAURANT_ID, tableId });
    socket.emit('fetchHistory', { restaurantId: RESTAURANT_ID, tableId });
  }, []);

  // Merge the guest's live cart (from syncCart) into the order as GUEST-tagged lines, once per table.
  const seedGuestLines = useCallback((tableId: string, lines: { name?: string; price?: number; quantity?: number; qty?: number }[]) => {
    if (seededTableRef.current === tableId) return;
    seededTableRef.current = tableId;
    setOrder(prev => {
      const existing = new Set(prev.map(l => l.name));
      const guestLines: OrderLine[] = (lines || [])
        .filter(l => l.name && !existing.has(l.name))
        .map(l => ({ name: String(l.name), price: Number(l.price) || 0, quantity: Number(l.quantity ?? l.qty) || 1, source: 'guest' as const }));
      return [...guestLines, ...prev];
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
      showToast('Could not send — try again');
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
    const pushAlert = (a: Omit<WaiterAlert, 'id' | 'time' | 'state'>) => {
      const alert: WaiterAlert = { ...a, id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, time: clockTime(), state: 'live' };
      setAlerts(prev => [alert, ...prev].slice(0, 30));
    };
    const onBell = (p: { tableId?: string; displayTable?: string }) => {
      const label = p.displayTable || (p.tableId ? p.tableId.replace('table', 'Table ') : 'A table');
      pushAlert({ kind: 'bell', tableId: p.tableId, title: label, message: `${label} just rang the service bell` });
    };
    const onManager = (p: { message?: string }) => {
      pushAlert({ kind: 'manager', title: 'Manager', message: p.message || 'Manager called you to the front' });
    };
    const onKitchen = (p: { tableId?: string; kitchenStatus?: string; displayTable?: string }) => {
      if ((p.kitchenStatus || '').toLowerCase() !== 'ready') return;
      const label = p.displayTable || (p.tableId ? p.tableId.replace('table', 'Table ') : 'A table');
      pushAlert({ kind: 'ready', tableId: p.tableId, title: label, message: `Order ready — bring to ${label.toLowerCase()}` });
    };
    socket.on('incomingWaiterCall', onBell);
    socket.on('managerCallWaiter', onManager);
    socket.on('kitchenStatusUpdate', onKitchen);
    return () => {
      socket.off('incomingWaiterCall', onBell);
      socket.off('managerCallWaiter', onManager);
      socket.off('kitchenStatusUpdate', onKitchen);
    };
  }, []);

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
      toast, showToast
    }}>
      {children}
    </WaiterContext.Provider>
  );
}

export function useWaiter() {
  return useContext(WaiterContext);
}
