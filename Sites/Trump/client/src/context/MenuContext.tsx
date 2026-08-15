import { createContext, useContext, useState, useEffect, useMemo, type ReactNode } from 'react';
import { api } from '../services/api';
import { useApp } from './AppContext';
import { useI18n } from '../i18n';
import { flattenMenu, normalizeName } from '../lib/menuUtils';
import type { MenuData, MenuCategory } from '../types/menu';

interface MenuContextValue {
  menuData: MenuData;
  loading: boolean;
  error: string | null;
  reload: () => void;
  // Every item name (normalized) present in the currently-active Day/Night
  // menu -- null for tenants with no day-part engine, where nothing is ever
  // filtered. Lets recommendation/pairing surfaces that source items from a
  // server call (not menuData directly) still respect the active toggle.
  activeItemNames: Set<string> | null;
}

const MenuContext = createContext<MenuContextValue>(null!);

// A category is chapter-filterable only if it carries a slug (tenants
// without the chapter/day-part engine never get one from the server) and
// isn't the rare array-storage shape (no slug concept there either).
function filterByActiveChapters(raw: MenuData, activeChapterSlugs: Set<string> | null): MenuData {
  if (!activeChapterSlugs) return raw;
  const out: MenuData = {};
  for (const [title, category] of Object.entries(raw)) {
    if (Array.isArray(category)) { out[title] = category; continue; }
    const slug = (category as MenuCategory).slug;
    // No slug on this category (shouldn't happen for a tenant with the
    // day-part engine, but fail open rather than hide content on a gap).
    const included = !slug || activeChapterSlugs.has(slug);
    out[title] = { ...category, visible: category.visible !== false && included };
  }
  return out;
}

export function MenuProvider({ children }: { children: ReactNode }) {
  const { dayParts, menuMode } = useApp();
  const { locale } = useI18n();
  const [rawMenuData, setRawMenuData] = useState<MenuData>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    api.getMenu(locale)
      .then(data => {
        if (!cancelled) { setRawMenuData(data); setLoading(false); }
      })
      .catch(err => {
        if (!cancelled) { setError(err.message); setLoading(false); }
      });

    return () => { cancelled = true; };
    // Refetching on locale change is the whole localization path for content:
    // the server returns a menu already translated wherever translations exist.
  }, [tick, locale]);

  const reload = () => setTick(t => t + 1);

  // Union of leadChapters across whichever day-parts the active mode maps
  // to (day = morning+midday, night = golden) -- null (no filtering) for
  // tenants with no day-part engine at all.
  const activeChapterSlugs = useMemo(() => {
    if (dayParts.length === 0 || !menuMode) return null;
    const targetSlugs = menuMode === 'night' ? ['golden'] : ['morning', 'midday'];
    const set = new Set<string>();
    dayParts
      .filter(dp => targetSlugs.includes(dp.slug))
      .forEach(dp => (dp.leadChapters || []).forEach(slug => set.add(slug)));
    return set;
  }, [dayParts, menuMode]);

  const menuData = useMemo(
    () => filterByActiveChapters(rawMenuData, activeChapterSlugs),
    [rawMenuData, activeChapterSlugs]
  );

  const activeItemNames = useMemo(() => {
    if (!activeChapterSlugs) return null;
    return new Set(flattenMenu(menuData).map(item => normalizeName(item.name)));
  }, [menuData, activeChapterSlugs]);

  return (
    <MenuContext.Provider value={{ menuData, loading, error, reload, activeItemNames }}>
      {children}
    </MenuContext.Provider>
  );
}

export function useMenuData() {
  return useContext(MenuContext);
}
