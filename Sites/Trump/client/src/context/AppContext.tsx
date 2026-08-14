import { createContext, useContext, useState, useEffect, useMemo, type ReactNode } from 'react';
import { getStoredTable, setStoredTable, getDeviceIdentity, type DeviceIdentity } from '../services/storage';
import { formatTableLabel } from '../lib/menuUtils';
import type { AuthUser } from '../types/auth';
import type { DayPart } from '../types/menu';
import { api } from '../services/api';

interface AppContextValue {
  tableId: string;
  tableLabel: string;
  setTableId: (id: string) => void;
  device: DeviceIdentity;
  user: AuthUser | null;
  setUser: (u: AuthUser | null) => void;
  authLoading: boolean;
  bookType: 'food' | 'drinks';
  setBookType: (v: 'food' | 'drinks') => void;
  chatOpen: boolean;
  setChatOpen: (v: boolean) => void;
  drawerOpen: boolean;
  setDrawerOpen: (v: boolean) => void;
  pendingItemName: string | null;
  setPendingItemName: (name: string | null) => void;
  // The header's cow icon and a dish's "From the X" link both open the same
  // butchery modal — one lives in Header.tsx, the other in ItemModal.tsx,
  // neither a parent of the other, so this is context rather than a prop.
  butcheryOpen: boolean;
  setButcheryOpen: (v: boolean) => void;
  // Which cut the modal should open pre-selected to, consumed once (same
  // pattern as pendingItemName) by whichever component mounts the modal.
  pendingCutId: string | null;
  setPendingCutId: (id: string | null) => void;
  // Day-part theming (ARCHITECTURE_DECISIONS.md AD-004) — null for tenants
  // with no day-part engine (Trump, Demo); the data-theme attribute is only
  // ever set when this is non-null, so their CSS is never touched.
  dayPart: DayPart | null;
  // Full day-part list (not just whichever one the server clock currently
  // resolves to) — [] for tenants with no day-part engine. Feeds the
  // Day/Night menu toggle's chapter-set computation in MenuContext.
  dayParts: DayPart[];
  // Manual Day/Night menu toggle. null when this tenant has no day-part
  // engine (dayParts is empty) -- Header only renders the toggle, and
  // MenuContext only filters chapters, when this is non-null.
  menuMode: 'day' | 'night' | null;
  toggleMenuMode: () => void;
  // Raw day-part slugs ("morning"/"midday"/"golden") the active mode maps
  // to -- for filtering bundles, which are tagged with one of these three,
  // not a chapter slug. null alongside menuMode.
  activeDayPartSlugs: Set<string> | null;
  // Single resolved day-part slug for the AI endpoints (chat/recommend/
  // cartRecommendations) to send as an explicit override -- without this the
  // server falls back to wall-clock time, which disagrees with the guest's
  // manually-toggled menu the moment they browse Night outside real evening
  // hours (see demo validation report Bug H-1). Night is unambiguous
  // ('golden'); Day covers two day-parts, so it prefers whichever of
  // morning/midday the server clock actually resolved to (still a "Day"
  // greeting either way) and falls back to 'midday' otherwise. null for
  // tenants with no day-part engine.
  effectiveDayPartSlug: string | null;
}

const AppContext = createContext<AppContextValue>(null!);

// "While they remain in the session" (not across visits) -- matches the
// sessionStorage-scoped pattern already used for the chat launcher hint.
const MENU_MODE_KEY = 'emenyu_menu_mode';
// Carmella's three named day-parts collapsed into the toggle's two states.
// Morning+midday (light, cafe-by-day) read as "Day"; golden hour (the one
// dark theme) reads as "Night" -- see FINAL_DEMO_REPORT.md-adjacent design
// notes for why golden hour is the only day-part with a dark palette.
const DAY_DAYPART_SLUGS = ['morning', 'midday'];
const NIGHT_DAYPART_SLUGS = ['golden'];

export function AppProvider({ children, tableIdFromUrl }: { children: ReactNode; tableIdFromUrl?: string }) {
  const [tableId, setTableIdState] = useState<string>(() => tableIdFromUrl || getStoredTable());
  const [device] = useState<DeviceIdentity>(getDeviceIdentity);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [bookType, setBookType] = useState<'food' | 'drinks'>('food');
  const [chatOpen, setChatOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [pendingItemName, setPendingItemName] = useState<string | null>(null);
  const [butcheryOpen, setButcheryOpen] = useState(false);
  const [pendingCutId, setPendingCutId] = useState<string | null>(null);
  const [dayPart, setDayPart] = useState<DayPart | null>(null);
  const [dayParts, setDayParts] = useState<DayPart[]>([]);
  const [menuMode, setMenuModeState] = useState<'day' | 'night' | null>(null);

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

  // Fetched once per session load. A guest sitting through a day-part
  // boundary won't see a live flip without a refresh — acceptable for the
  // initial release (see FUTURE_ROADMAP.md); the alternative (a client-side
  // clock ticking independently of the server) would duplicate the exact
  // window logic server/utils/dayPartResolver.js already owns.
  useEffect(() => {
    api.getConfig().then(cfg => {
      if (cfg?.currentDayPart) setDayPart(cfg.currentDayPart);
      const parts = Array.isArray(cfg?.dayParts) ? cfg.dayParts : [];
      setDayParts(parts);
      if (parts.length === 0) return; // no day-part engine (Trump, Demo) -- menuMode stays null

      // A stored manual choice wins; otherwise default to whatever the
      // automatic day-part already resolved to, so the very first render
      // matches today's existing behavior exactly until the guest touches
      // the toggle themselves.
      const stored = sessionStorage.getItem(MENU_MODE_KEY);
      if (stored === 'day' || stored === 'night') {
        setMenuModeState(stored);
      } else {
        setMenuModeState(cfg.currentDayPart?.slug === 'golden' ? 'night' : 'day');
      }
    }).catch(() => { /* no day-part engine for this tenant, or config unreachable */ });
  }, []);

  // Theme now follows the manual toggle (once resolved) rather than being set
  // once from the initial config fetch -- this is what makes flipping the
  // toggle also swap the whole visual theme, not just the item list.
  useEffect(() => {
    if (dayParts.length === 0 || !menuMode) return;
    document.documentElement.dataset.theme = menuMode === 'night' ? 'golden' : 'midday';
  }, [menuMode, dayParts.length]);

  function setTableId(id: string) {
    setTableIdState(id);
    setStoredTable(id);
  }

  function toggleMenuMode() {
    setMenuModeState(prev => {
      const next = prev === 'night' ? 'day' : 'night';
      sessionStorage.setItem(MENU_MODE_KEY, next);
      return next;
    });
  }

  const activeDayPartSlugs = useMemo(() => {
    if (!menuMode) return null;
    return new Set(menuMode === 'night' ? NIGHT_DAYPART_SLUGS : DAY_DAYPART_SLUGS);
  }, [menuMode]);

  const effectiveDayPartSlug = useMemo(() => {
    if (!menuMode) return null;
    if (menuMode === 'night') return 'golden';
    return dayPart && DAY_DAYPART_SLUGS.includes(dayPart.slug) ? dayPart.slug : 'midday';
  }, [menuMode, dayPart]);

  return (
    <AppContext.Provider value={{
      tableId,
      tableLabel: formatTableLabel(tableId),
      setTableId,
      device,
      user,
      setUser,
      authLoading,
      bookType,
      setBookType,
      chatOpen,
      setChatOpen,
      drawerOpen,
      setDrawerOpen,
      pendingItemName,
      setPendingItemName,
      butcheryOpen,
      setButcheryOpen,
      pendingCutId,
      setPendingCutId,
      dayPart,
      dayParts,
      menuMode,
      toggleMenuMode,
      activeDayPartSlugs,
      effectiveDayPartSlug,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  return useContext(AppContext);
}
