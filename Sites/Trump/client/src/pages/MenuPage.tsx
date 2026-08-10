import { useState, useMemo, useEffect, useCallback, useRef, Fragment, Suspense, lazy, type ComponentType, type ReactNode } from 'react';
import { preload } from 'react-dom';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Salad, Fish, Beef, Drumstick, UtensilsCrossed, Sandwich, Soup, Leaf, CakeSlice,
  Wine, Beer, Martini, Coffee, Star,
} from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { SideDrawer } from '../components/layout/SideDrawer';
import { CategorySection } from '../components/menu/CategorySection';
import { MenuSkeletonGrid } from '../components/menu/MenuSkeletonGrid';
import { ItemModal } from '../components/menu/ItemModal';
import { PairingModal } from '../components/menu/PairingModal';
import { CategoryTabBar } from '../components/menu/CategoryTabBar';
import { Spinner } from '../components/ui/Spinner';
import { CowMeatSelector } from '../components/butchery/CowMeatSelector';
import { useButcheryCuts } from '../components/butchery/useButcheryCuts';
import { RecommendedOrders } from '../components/menu/RecommendedOrders';
import { getCutMenuMapping, hasCutMenuMatches } from '../components/butchery/cutMenuMap';
import { useMenu } from '../hooks/useMenu';
import { useFilters } from '../hooks/useFilters';
import { useT, useI18n } from '../i18n';
import { track } from '../lib/engagement';
import { useDebounce } from '../hooks/useDebounce';
import { useFavorites } from '../hooks/useFavorites';
import { useRecentlyViewed } from '../hooks/useRecentlyViewed';
import { useApp } from '../context/AppContext';
import { buildMenuSections, flattenMenu, normalizeName } from '../lib/menuUtils';
import { resolveImage, resolveThumbnail } from '../lib/imageResolver';
import { FOOD_CHAPTERS } from '../constants/chapters';
import { MAINS_CATEGORY_TITLE, PASTAS_CATEGORY_TITLE, RESTAURANT_ID } from '../constants/api';
import type { MenuItem } from '../types/menu';
import styles from './MenuPage.module.css';


const DRINKS_TITLES = new Set([
  'Sparkling', 'White Wine', 'Red Wine', 'Beer & Cider', 'Spirits',
  'Liqueurs & After-Dinner', 'Soft & Hot', 'Cocktails',
  'Champagne', 'Beers', 'Mocktails & Cold Beverages',
]);

const SETMENU_TITLES = new Set([
  'Signature Combos', 'Signature Platters', 'Set Menu', 'Set Menus',
]);

const SECTION_ICON_COMPONENTS: Record<string, ComponentType<{ size?: number }>> = {
  'To Start': Salad, 'Tempura': Sandwich, 'Bespoke Salads': Salad,
  'Sushi & Sashimi': Fish, 'Signature Seafood': Fish,
  [MAINS_CATEGORY_TITLE]: Beef, 'Pork & Ribs': Drumstick,
  'Lamb': Beef, 'Venison & Game': Beef, 'Oxtail & Beef Ribs': Beef,
  'Signature Combos': Star, 'Signature Platters': UtensilsCrossed,
  'Gourmet Burgers': Sandwich, 'Chicken Dishes': Drumstick,
  [PASTAS_CATEGORY_TITLE]: Soup, 'Vegetarian': Leaf,
  'Sides & Extras': UtensilsCrossed, 'Dessert & Cakes': CakeSlice,
  'Sparkling': Wine, 'White Wine': Wine, 'Red Wine': Wine,
  'Beer & Cider': Beer, 'Spirits': Martini,
  'Liqueurs & After-Dinner': Martini, 'Soft & Hot': Coffee, 'Cocktails': Martini,
};

export function MenuPage({ sectionFilter }: { sectionFilter?: string } = {}) {
  const { tableId: paramTableId } = useParams<{ tableId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const focusSection = searchParams.get('section');
  const { setTableId, pendingItemName, setPendingItemName } = useApp();
  const { menuData, loading, error } = useMenu();
  const { activeFilters, searchQuery, setSearchQuery, toggleFilter, clearFilters, filterOptions } = useFilters();
  const { favorites, toggle: toggleFavorite } = useFavorites();
  const { addItem: addRecent } = useRecentlyViewed();
  const t = useT();
  const { locale } = useI18n();
  const serverCuts = useButcheryCuts(locale);

  const [itemStack, setItemStack] = useState<MenuItem[]>([]);
  const [pairingItem, setPairingItem] = useState<MenuItem | null>(null);
  const tableId = paramTableId || 'table1';
  const itemStackRef = useRef<MenuItem[]>([]);
  const modalDepthRef = useRef(0);
  const suppressNextPopRef = useRef(false);
  const selectedItem = itemStack[itemStack.length - 1] ?? null;
  const modalOpen = itemStack.length > 0;

  // The order-status ticker and the post-meal rating prompt used to live here.
  // Both were driven by orders the guest placed from this screen; with ordering
  // handled by the waiter there is no order for this device to follow, so
  // listening for those socket events would only ever show another table's.

  useEffect(() => {
    if (paramTableId) setTableId(paramTableId);
    // setTableId is provided by context and intentionally not used as a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramTableId]);

  const sections = useMemo(() => {
    const all = buildMenuSections(menuData, activeFilters, searchQuery);
    if (sectionFilter === 'drinks') return all.filter(s => DRINKS_TITLES.has(s.title));
    if (sectionFilter === 'setmenu') return all.filter(s => SETMENU_TITLES.has(s.title));
    return all;
  }, [menuData, activeFilters, searchQuery, sectionFilter]);

  const allItems = useMemo(() => flattenMenu(menuData), [menuData]);

  // The butchery chart only earns its place on a menu that actually sells beef
  // primals — this is data-driven rather than tenant-gated, so a menu without
  // them (Carmella) simply never renders the banner.
  const showButchery = useMemo(
    () => hasCutMenuMatches(allItems, getCutMenuMapping(RESTAURANT_ID)),
    [allItems]
  );
  const scrollToSteaks = useCallback(() => {
    const id = `section-${MAINS_CATEGORY_TITLE.toLowerCase().replace(/\s+/g, '-')}`;
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  // What guests search for, recorded once they stop typing — a per-keystroke
  // event would record "r", "ri", "rib" and tell us nothing. Only the query is
  // stored; there is no guest to attach it to.
  const settledQuery = useDebounce(searchQuery, 900);
  useEffect(() => {
    const q = settledQuery.trim();
    if (q.length < 2) return;
    track({ eventType: 'SEARCH', label: q.slice(0, 60) });
  }, [settledQuery]);

  // One MENU_VIEW per screen entry — the denominator every other figure in the
  // admin engagement report is read against.
  useEffect(() => {
    if (loading) return;
    track({ eventType: 'MENU_VIEW', label: sectionFilter || 'grid' });
  }, [loading, sectionFilter]);

  // Warm the first-screen card images: preload the first section's leading
  // thumbnails so the top of the menu paints immediately (the rest lazy-load).
  useEffect(() => {
    const firstItems = sections[0]?.items?.slice(0, 6) ?? [];
    for (const item of firstItems) {
      const src = resolveThumbnail(item);
      if (src) preload(src, { as: 'image' });
    }
  }, [sections]);

  const scrolledSectionRef = useRef<string | null>(null);
  useEffect(() => {
    if (loading || !focusSection || sections.length === 0) return;
    if (scrolledSectionRef.current === focusSection) return;
    const want = focusSection.toLowerCase();
    // Match the rendered section by exact slug, then fall back to a fuzzy title match
    // so a tile's section name never silently fails to scroll.
    const match =
      sections.find(s => s.title.toLowerCase() === want) ||
      sections.find(s => s.title.toLowerCase().includes(want) || want.includes(s.title.toLowerCase()));
    if (!match) return;
    const el = document.getElementById(`section-${match.title.toLowerCase().replace(/\s+/g, '-')}`);
    if (el) {
      scrolledSectionRef.current = focusSection;
      setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 200);
    }
  }, [loading, focusSection, sections]);

  const findItemByName = useCallback((name: string) => {
    const key = normalizeName(name);
    const exact = allItems.find(item => normalizeName(item.name) === key);
    if (exact) return exact;

    const partial = allItems.find(item => {
      const itemKey = normalizeName(item.name);
      return itemKey.includes(key) || key.includes(itemKey);
    });
    if (partial) return partial;

    const tokens = String(name || '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(token => token.length > 2);
    if (tokens.length === 0) return null;

    let best: MenuItem | null = null;
    let bestScore = 0;
    allItems.forEach(item => {
      const haystack = `${item.name} ${item.description || ''} ${item.types || ''}`.toLowerCase();
      const score = tokens.reduce((sum, token) => sum + (haystack.includes(token) ? 1 : 0), 0);
      if (score > bestScore) {
        best = item;
        bestScore = score;
      }
    });

    return bestScore >= Math.min(2, tokens.length) ? best : null;
  }, [allItems]);

  const pushModalHistory = useCallback((depth: number) => {
    window.history.pushState(
      { ...(window.history.state || {}), emenyuModal: true, emenyuModalDepth: depth },
      '',
      window.location.href
    );
    modalDepthRef.current = depth;
  }, []);

  const setStack = useCallback((next: MenuItem[]) => {
    itemStackRef.current = next;
    setItemStack(next);
    modalDepthRef.current = next.length;
  }, []);

  const openItem = useCallback((item: MenuItem, mode: 'replace' | 'push' = 'replace') => {
    const current = itemStackRef.current;
    const next = mode === 'push' && current.length > 0 ? [...current, item] : [item];
    setStack(next);
    pushModalHistory(next.length);
    addRecent(item);
  }, [addRecent, pushModalHistory, setStack]);

  const openItemByName = useCallback((name: string, mode: 'replace' | 'push' = 'push') => {
    const found = findItemByName(name);
    if (!found) {
      setSearchQuery(name);
      return;
    }
    openItem(found, mode);
  }, [findItemByName, openItem, setSearchQuery]);

  const closeItemModal = useCallback(() => {
    const depth = modalDepthRef.current;
    setStack([]);
    if (depth > 0 && window.history.state?.emenyuModal) {
      suppressNextPopRef.current = true;
      window.history.go(-depth);
    }
  }, [setStack]);

  const goBackItem = useCallback(() => {
    if (itemStackRef.current.length > 1) {
      window.history.back();
    }
  }, []);

  useEffect(() => {
    const state = window.history.state || {};
    if (!state.emenyuBase && !state.emenyuGuard && !state.emenyuModal) {
      window.history.replaceState({ ...state, emenyuBase: true }, '', window.location.href);
    }
    if (!window.history.state?.emenyuGuard && !window.history.state?.emenyuModal) {
      window.history.pushState(
        { ...(window.history.state || {}), emenyuGuard: true },
        '',
        window.location.href
      );
    }
  }, [tableId, sectionFilter]);

  useEffect(() => {
    function handlePopState() {
      if (suppressNextPopRef.current) {
        suppressNextPopRef.current = false;
        return;
      }

      const stack = itemStackRef.current;
      if (stack.length > 1) {
        const next = stack.slice(0, -1);
        setStack(next);
        return;
      }

      if (stack.length === 1) {
        setStack([]);
        return;
      }

      // All menu views now sit beneath the landing chooser — back returns there.
      navigate(`/${tableId}`, { replace: true });
    }

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [navigate, sectionFilter, setStack, tableId]);

  useEffect(() => {
    if (!pendingItemName) return;
    const found = findItemByName(pendingItemName);
    if (found) openItem(found, itemStackRef.current.length > 0 ? 'push' : 'replace');
    else setSearchQuery(pendingItemName);
    setPendingItemName(null);
  }, [findItemByName, openItem, pendingItemName, setPendingItemName, setSearchQuery]);

  // Gold line-glyph per section, matching the icon system used everywhere else
  // in the app (lucide-react) — no emoji.
  const sectionIconFor = (title: string): ComponentType<{ size?: number }> => SECTION_ICON_COMPONENTS[title] ?? UtensilsCrossed;

  // Nav links for the SideDrawer
  const gridNavLinks = useMemo(() => sections.map(s => {
    const Icon = sectionIconFor(s.title);
    return {
      // The English title is the scroll key; the guest reads displayTitle.
      label: s.displayTitle ?? s.title,
      icon: <Icon size={15} />,
      onClick: () => {
        const id = `section-${s.title.toLowerCase().replace(/\s+/g, '-')}`;
        setTimeout(() => {
          document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 280);
      },
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [sections]);

  function handleItemClick(item: MenuItem) {
    openItem(item, 'replace');
  }

  return (
    <AppShell>
      <SideDrawer
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        activeFilters={activeFilters}
        onToggleFilter={toggleFilter}
        onClearAll={clearFilters}
        filterOptions={filterOptions}
        navLinks={gridNavLinks}
      />

      <div className={styles.content}>
        {loading ? (
          <MenuSkeletonGrid />
        ) : error ? (
          <div className={styles.errorState}>
            <p>{t('menu.error')}</p>
            <p className={styles.errorDetail}>{error}</p>
          </div>
        ) : sections.length === 0 ? (
          <div className={styles.emptyState}>
            <p>{t('menu.empty')}</p>
            <button className={styles.clearBtn} onClick={clearFilters}>{t('nav.clearFilters')}</button>
          </div>
        ) : (
          <>
            {/* "Not sure what to order?" — the curated bundles. Still first:
                only the butchery block moved (see below), this stays put. */}
            {!sectionFilter && !searchQuery && activeFilters.size === 0 && (
              <RecommendedOrders
                resolveItem={findItemByName}
                onOpenItem={name => openItemByName(name, 'replace')}
              />
            )}

            {sections.map(section => (
              <Fragment key={section.title}>
                {/* The animal sits under Mains now, not before every category —
                    it's a beef-primal tool, and on mobile the old placement put
                    a full-viewport chart between a guest and every Starter. Gated
                    on the exact section title so it appears once, in the one
                    place it's actually about. showButchery itself stays
                    data-driven (hasCutMenuMatches): a tenant with no beef
                    primals on the menu, matched or curated, never renders it,
                    on any category. */}
                {showButchery && !sectionFilter && !searchQuery && activeFilters.size === 0
                  && section.title === MAINS_CATEGORY_TITLE && (
                  <section className={styles.butcheryStage} aria-label={t('cut.title')}>
                    <CowMeatSelector
                      items={allItems}
                      serverCuts={serverCuts}
                      onOpenItem={item => openItem(item, 'replace')}
                      onBrowseAll={scrollToSteaks}
                      mobileEntry
                    />
                  </section>
                )}
                <CategorySection
                  section={section}
                  favorites={favorites}
                  onFavoriteToggle={toggleFavorite}
                  onItemClick={handleItemClick}
                  onPairingClick={setPairingItem}
                />
              </Fragment>
            ))}
          </>
        )}
      </div>

      <CategoryTabBar sections={sections} />

      <ItemModal
        item={selectedItem}
        open={modalOpen}
        onClose={closeItemModal}
        isFavorite={selectedItem ? favorites.includes(selectedItem.name) : false}
        onFavoriteToggle={toggleFavorite}
        onRequestItem={(name) => openItemByName(name, 'push')}
        onOpenItem={(it) => openItem(it, 'push')}
        canGoBack={itemStack.length > 1}
        onBack={goBackItem}
      />

      <PairingModal item={pairingItem} open={!!pairingItem} onClose={() => setPairingItem(null)} />
    </AppShell>
  );
}

/* The cart toast, the order-status ticker and the post-meal rating modal all
   lived here. Every one of them was downstream of the guest placing an order
   from this screen, which the QR menu no longer does. */
