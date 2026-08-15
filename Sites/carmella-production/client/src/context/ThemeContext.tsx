import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { api, type ThemeSettings } from '../services/api';
import { useSocket, useSocketEvent } from '../hooks/useSocket';

interface ThemeContextValue {
  theme: ThemeSettings | null;
  reload: () => void;
}

const ThemeContext = createContext<ThemeContextValue>(null!);

// STEP 2/10 — fetched once here, at the app root, so the exact same value
// drives both the customer menu and the Admin panel (both sit inside this
// provider) — there is no separate "admin always dark" path anymore, and no
// per-page fetch that could ever disagree with another page's.
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeSettings | null>(null);
  const socket = useSocket();

  const load = useCallback(() => {
    api.getTheme().then(setTheme).catch(() => {});
  }, []);

  useEffect(load, [load]);
  useSocketEvent('themeUpdated', load);

  // Re-sync on every (re)connect -- this is what made theme switching feel
  // "intermittent": (1) if the very first load() above failed (a transient
  // blip, a server restart mid-request), nothing ever retried it, so the
  // theme silently stuck at null/the CSS default until a manual refresh;
  // (2) a themeUpdated broadcast while this client was briefly offline
  // (mobile networks hopping WiFi/cellular is routine) was simply missed --
  // in manual mode there was no periodic poll to notice and catch up the
  // way autoEnabled mode already does below. The socket's own 'connect'
  // event fires on the initial connection AND every reconnection, so this
  // one listener closes both gaps at once.
  useEffect(() => {
    socket.on('connect', load);
    return () => { socket.off('connect', load); };
  }, [socket, load]);

  useEffect(() => {
    if (!theme) return;
    document.documentElement.dataset.theme = theme.activeTheme;
  }, [theme]);

  // In auto mode the active theme can flip purely because time passed, with
  // no server-side event to tell us — re-resolve locally every minute so a
  // guest sitting through the day/night boundary sees it change without a
  // refresh. Manual mode doesn't need this (nothing changes without an
  // explicit admin action, which already arrives via the socket event).
  useEffect(() => {
    if (!theme?.autoEnabled) return;
    const id = window.setInterval(load, 60_000);
    return () => window.clearInterval(id);
  }, [theme?.autoEnabled, load]);

  return (
    <ThemeContext.Provider value={{ theme, reload: load }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
