import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { CartItem, CartTotals, TipMode } from '../types/cart';
import { VAT_RATE, SERVICE_RATE } from '../constants/config';

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
  addItem: (item: Omit<CartItem, 'qty' | 'note'> & { qty?: number; note?: string }) => void;
  updateQty: (index: number, delta: number) => void;
  removeAt: (index: number) => void;
  setNote: (index: number, note: string) => void;
  clear: () => void;
  replaceCart: (items: CartItem[]) => void;
  setHistory: (items: CartItem[]) => void;
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
  };
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [history, setHistoryState] = useState<CartItem[]>([]);
  const [tipMode, setTipMode] = useState<TipMode>(0);
  const [customTip, setCustomTip] = useState(0);
  const [isOpen, setIsOpen] = useState(false);

  const addItem = useCallback((raw: Partial<CartItem>) => {
    const next = normalizeItem(raw);
    setItems(prev => {
      const existing = prev.find(e => e.name === next.name && e.price === next.price);
      if (existing) {
        return prev.map(e => e === existing ? { ...e, qty: e.qty + next.qty } : e);
      }
      return [...prev, next];
    });
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
      tipMode, customTip, isOpen,
      setIsOpen, setTipMode, setCustomTip,
      addItem, updateQty, removeAt, setNote,
      clear, replaceCart, setHistory, getTotals,
    }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  return useContext(CartContext);
}
