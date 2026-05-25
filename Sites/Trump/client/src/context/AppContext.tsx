import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { getStoredTable, setStoredTable, getDeviceIdentity, type DeviceIdentity } from '../services/storage';
import { formatTableLabel } from '../lib/menuUtils';
import type { AuthUser } from '../types/auth';
import { api } from '../services/api';

interface AppContextValue {
  tableId: string;
  tableLabel: string;
  setTableId: (id: string) => void;
  device: DeviceIdentity;
  user: AuthUser | null;
  setUser: (u: AuthUser | null) => void;
  authLoading: boolean;
  bookMode: boolean;
  setBookMode: (v: boolean) => void;
  bookType: 'food' | 'drinks';
  setBookType: (v: 'food' | 'drinks') => void;
  chatOpen: boolean;
  setChatOpen: (v: boolean) => void;
  drawerOpen: boolean;
  setDrawerOpen: (v: boolean) => void;
  pendingItemName: string | null;
  setPendingItemName: (name: string | null) => void;
}

const AppContext = createContext<AppContextValue>(null!);

export function AppProvider({ children, tableIdFromUrl }: { children: ReactNode; tableIdFromUrl?: string }) {
  const [tableId, setTableIdState] = useState<string>(() => tableIdFromUrl || getStoredTable());
  const [device] = useState<DeviceIdentity>(getDeviceIdentity);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [bookMode, setBookMode] = useState(false);
  const [bookType, setBookType] = useState<'food' | 'drinks'>('food');
  const [chatOpen, setChatOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [pendingItemName, setPendingItemName] = useState<string | null>(null);

  useEffect(() => {
    if (tableIdFromUrl) {
      setTableIdState(tableIdFromUrl);
      setStoredTable(tableIdFromUrl);
    }
  }, [tableIdFromUrl]);

  useEffect(() => {
    api.authMe().then(u => {
      setUser(u);
      setAuthLoading(false);
    });
  }, []);

  function setTableId(id: string) {
    setTableIdState(id);
    setStoredTable(id);
  }

  return (
    <AppContext.Provider value={{
      tableId,
      tableLabel: formatTableLabel(tableId),
      setTableId,
      device,
      user,
      setUser,
      authLoading,
      bookMode,
      setBookMode,
      bookType,
      setBookType,
      chatOpen,
      setChatOpen,
      drawerOpen,
      setDrawerOpen,
      pendingItemName,
      setPendingItemName,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  return useContext(AppContext);
}
