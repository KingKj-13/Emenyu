import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { getStoredTable, setStoredTable, getSessionId } from '../services/storage';
import { formatTableLabel } from '../lib/menuUtils';
import type { AppConfig } from '../types/menu';
import { api } from '../services/api';

interface AppContextValue {
  tableId: string;
  tableLabel: string;
  setTableId: (id: string) => void;
  sessionId: string;
  drawerOpen: boolean;
  setDrawerOpen: (v: boolean) => void;
  config: AppConfig | null;
}

const AppContext = createContext<AppContextValue>(null!);

export function AppProvider({ children, tableIdFromUrl }: { children: ReactNode; tableIdFromUrl?: string }) {
  const [tableId, setTableIdState] = useState<string>(() => tableIdFromUrl || getStoredTable());
  const [sessionId] = useState<string>(getSessionId);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [config, setConfig] = useState<AppConfig | null>(null);

  useEffect(() => {
    if (tableIdFromUrl) {
      setTableIdState(tableIdFromUrl);
      setStoredTable(tableIdFromUrl);
    }
  }, [tableIdFromUrl]);

  useEffect(() => {
    api.getConfig().then(setConfig).catch(() => { /* fall back to constants/config.ts defaults */ });
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
      sessionId,
      drawerOpen,
      setDrawerOpen,
      config,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  return useContext(AppContext);
}
