import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { api } from '../services/api';
import type { MenuData } from '../types/menu';

interface MenuContextValue {
  menuData: MenuData;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

const MenuContext = createContext<MenuContextValue>(null!);

export function MenuProvider({ children }: { children: ReactNode }) {
  const [menuData, setMenuData] = useState<MenuData>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    api.getMenu()
      .then(data => {
        if (!cancelled) { setMenuData(data); setLoading(false); }
      })
      .catch(err => {
        if (!cancelled) { setError(err.message); setLoading(false); }
      });

    return () => { cancelled = true; };
  }, [tick]);

  const reload = () => setTick(t => t + 1);

  return (
    <MenuContext.Provider value={{ menuData, loading, error, reload }}>
      {children}
    </MenuContext.Provider>
  );
}

export function useMenuData() {
  return useContext(MenuContext);
}
