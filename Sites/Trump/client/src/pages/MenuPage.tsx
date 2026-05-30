import { useState, useMemo, useEffect, useCallback, useRef, Suspense, lazy } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useSocketEvent } from '../hooks/useSocket';
import { AppShell } from '../components/layout/AppShell';
import { SideDrawer } from '../components/layout/SideDrawer';
import { CategorySection } from '../components/menu/CategorySection';
import { RecommendedOrders } from '../components/menu/RecommendedOrders';
import { ItemModal } from '../components/menu/ItemModal';
import { PairingModal } from '../components/menu/PairingModal';
import { CategoryTabBar } from '../components/menu/CategoryTabBar';
import { BottomBar } from '../components/cart/BottomBar';
import { CartDrawer } from '../components/cart/CartDrawer';
import { ChatPanel } from '../components/chat/ChatPanel';
import { Spinner } from '../components/ui/Spinner';
import { useMenu } from '../hooks/useMenu';
import { useCart } from '../hooks/useCart';
import { useFilters } from '../hooks/useFilters';
import type { ChatSuggestionItem } from '../types/menu';
import { useFavorites } from '../hooks/useFavorites';
import { useRecentlyViewed } from '../hooks/useRecentlyViewed';
import { useApp } from '../context/AppContext';
import { buildMenuSections, flattenMenu, normalizeName } from '../lib/menuUtils';
import { resolveImage } from '../lib/imageResolver';
import { FOOD_CHAPTERS } from '../constants/chapters';
import type { MenuItem } from '../types/menu';
import styles from './MenuPage.module.css';

const BookViewer = lazy(() => import('../components/book/BookViewer').then(m => ({ default: m.BookViewer })));

const DRINKS_TITLES = new Set([
  'Sparkling', 'White Wine', 'Red Wine', 'Beer & Cider', 'Spirits',
  'Liqueurs & After-Dinner', 'Soft & Hot', 'Cocktails',
  'Champagne', 'Beers', 'Mocktails & Cold Beverages',
]);

const SETMENU_TITLES = new Set([
  'Signature Combos', 'Signature Platters', 'Set Menu', 'Set Menus',
]);

export function MenuPage({ sectionFilter }: { sectionFilter?: string } = {}) {
  const { tableId: paramTableId } = useParams<{ tableId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const focusSection = searchParams.get('section');
  const { setTableId, pendingItemName, setPendingItemName } = useApp();
  const { menuData, loading, error } = useMenu();
  const { addItem } = useCart();
  const { activeFilters, searchQuery, setSearchQuery, toggleFilter, clearFilters, filterOptions } = useFilters();
  const { favorites, toggle: toggleFavorite } = useFavorites();
  const { addItem: addRecent } = useRecentlyViewed();

  const [itemStack, setItemStack] = useState<MenuItem[]>([]);
  const [pairingItem, setPairingItem] = useState<MenuItem | null>(null);
  const [orderStatus, setOrderStatus] = useState<string | null>(null);
  const [ratingOrderId, setRatingOrderId] = useState<number | null>(null);
  const [ratingModalOpen, setRatingModalOpen] = useState(false);
  const tableId = paramTableId || 'table1';
  const itemStackRef = useRef<MenuItem[]>([]);
  const modalDepthRef = useRef(0);
  const suppressNextPopRef = useRef(false);
  const selectedItem = itemStack[itemStack.length - 1] ?? null;
  const modalOpen = itemStack.length > 0;

  useSocketEvent<{ order: { tableId: string; id?: number; kitchenStatus?: string } }>('orderPlaced', useCallback(({ order }) => {
    if (order.tableId === tableId) setOrderStatus('new');
  }, [tableId]));

  useSocketEvent<{ orderId: number; kitchenStatus: string; order?: { tableId: string } }>('kitchenStatusUpdate', useCallback(({ orderId, kitchenStatus, order }) => {
    if (!order || order.tableId === tableId) {
      setOrderStatus(kitchenStatus);
      if (kitchenStatus === 'served') {
        const key = `rated_${orderId}`;
        if (!sessionStorage.getItem(key)) {
          setRatingOrderId(orderId);
          setTimeout(() => setRatingModalOpen(true), 2000);
        }
        setTimeout(() => setOrderStatus(null), 4000);
      }
    }
  }, [tableId]));

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

  const SECTION_ICONS: Record<string, string> = {
    'To Start': '🥗', 'Tempura': '🍤', 'Bespoke Salads': '🥙',
    'Sushi & Sashimi': '🍱', 'Signature Seafood': '🦞',
    'Trumps Premium Steaks': '🥩', 'Pork & Ribs': '🍖',
    'Lamb': '🍗', 'Venison & Game': '🦌', 'Oxtail & Beef Ribs': '🍖',
    'Signature Combos': '⭐', 'Signature Platters': '🍽️',
    'Gourmet Burgers': '🍔', 'Chicken Dishes': '🐔',
    'Trumps Pastas': '🍝', 'Vegetarian': '🥦',
    'Sides & Extras': '🍟', 'Dessert & Cakes': '🍰',
    'Sparkling': '🥂', 'White Wine': '🍾', 'Red Wine': '🍷',
    'Beer & Cider': '🍺', 'Spirits': '🥃',
    'Liqueurs & After-Dinner': '🍫', 'Soft & Hot': '☕', 'Cocktails': '🍹',
  };

  // Nav links for the SideDrawer
  const gridNavLinks = useMemo(() => sections.map(s => ({
    label: s.title,
    icon: SECTION_ICONS[s.title] ?? '▸',
    onClick: () => {
      const id = `section-${s.title.toLowerCase().replace(/\s+/g, '-')}`;
      setTimeout(() => {
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 280);
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  })), [sections]);

  const bookNavLinks = useMemo(() => FOOD_CHAPTERS.map(ch => ({
    label: ch.title,
    icon: SECTION_ICONS[ch.title] ?? '▸',
    onClick: () => {},
  })), []);

  function handleItemClick(item: MenuItem) {
    openItem(item, 'replace');
  }

  function handleChatItemClick(item: ChatSuggestionItem) {
    const fullItem = findItemByName(item.name);
    handleItemClick(fullItem ?? (item as unknown as MenuItem));
  }

  function handleAddToCart(item: MenuItem) {
    addItem({
      name: item.name,
      price: item.price,
      img: resolveImage(item),
      description: item.description || '',
    });
  }

  function handleAddToCartWithDetails(item: MenuItem, qty: number, note: string) {
    for (let i = 0; i < qty; i++) {
      addItem({
        name: item.name,
        price: item.price,
        img: resolveImage(item),
        description: item.description || '',
        qty: 1,
        note,
      });
    }
  }

  if (sectionFilter === 'book') {
    return (
      <AppShell>
        <SideDrawer
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          activeFilters={activeFilters}
          onToggleFilter={toggleFilter}
          onClearAll={clearFilters}
          filterOptions={filterOptions}
          navLinks={bookNavLinks}
        />
        <Suspense fallback={<div className={styles.loadingState}><Spinner size={40} /></div>}>
          <BookViewer
            menuData={menuData}
            onItemClick={handleItemClick}
            onAddToCart={handleAddToCart}
            onPairingClick={setPairingItem}
          />
        </Suspense>
        <ItemModal
          item={selectedItem}
          open={modalOpen}
          onClose={closeItemModal}
          isFavorite={selectedItem ? favorites.includes(selectedItem.name) : false}
          onFavoriteToggle={toggleFavorite}
          onAddToCart={handleAddToCartWithDetails}
          onRequestItem={(name) => openItemByName(name, 'push')}
          canGoBack={itemStack.length > 1}
          onBack={goBackItem}
        />
        <PairingModal item={pairingItem} open={!!pairingItem} onClose={() => setPairingItem(null)} />
        <BottomBar />
        <CartDrawer />
        <ChatPanel onItemClick={handleChatItemClick} />
      </AppShell>
    );
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
          <div className={styles.loadingState}>
            <Spinner size={48} />
            <p>Loading menu…</p>
          </div>
        ) : error ? (
          <div className={styles.errorState}>
            <p>Unable to load menu. Please try refreshing.</p>
            <p className={styles.errorDetail}>{error}</p>
          </div>
        ) : sections.length === 0 ? (
          <div className={styles.emptyState}>
            <p>No items match your filters.</p>
            <button className={styles.clearBtn} onClick={clearFilters}>Clear filters</button>
          </div>
        ) : (
          <>
            {!sectionFilter && !searchQuery && activeFilters.size === 0 && (
              <RecommendedOrders
                resolveItem={findItemByName}
                onOpenItem={(name) => openItemByName(name, 'replace')}
                onAddOrder={(names) => names.forEach(n => {
                  const found = findItemByName(n);
                  if (found) handleAddToCart(found);
                })}
              />
            )}
            {sections.map(section => (
              <CategorySection
                key={section.title}
                section={section}
                favorites={favorites}
                onFavoriteToggle={toggleFavorite}
                onAddToCart={handleAddToCart}
                onItemClick={handleItemClick}
                onPairingClick={setPairingItem}
              />
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
        onAddToCart={handleAddToCartWithDetails}
        onRequestItem={(name) => openItemByName(name, 'push')}
        canGoBack={itemStack.length > 1}
        onBack={goBackItem}
      />

      <PairingModal item={pairingItem} open={!!pairingItem} onClose={() => setPairingItem(null)} />

      <BottomBar />
      {orderStatus && <OrderStatusBar status={orderStatus} />}
      {ratingModalOpen && ratingOrderId && (
        <RatingModal
          orderId={ratingOrderId}
          tableId={tableId}
          onClose={() => {
            setRatingModalOpen(false);
            sessionStorage.setItem(`rated_${ratingOrderId}`, '1');
          }}
        />
      )}
      <CartDrawer />
      <ChatPanel onItemClick={handleChatItemClick} />
    </AppShell>
  );
}

const STATUS_STEPS: { key: string; label: string; icon: string }[] = [
  { key: 'new', label: 'Order Received', icon: '✓' },
  { key: 'preparing', label: 'Being Prepared', icon: '🍳' },
  { key: 'ready', label: 'Ready for Service', icon: '✅' },
  { key: 'served', label: 'Enjoy your meal!', icon: '🎉' },
];

function RatingModal({ orderId, tableId, onClose }: { orderId: number; tableId: string; onClose: () => void }) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState('');
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit() {
    if (rating === 0) return;
    try {
      const { api } = await import('../services/api');
      await api.submitRating({ orderId, tableId, rating, comment });
    } catch {}
    setSubmitted(true);
    setTimeout(onClose, 1800);
  }

  return (
    <div className={styles.ratingOverlay} onClick={onClose}>
      <div className={styles.ratingModal} onClick={e => e.stopPropagation()}>
        {submitted ? (
          <div className={styles.ratingThanks}>🎉 Thank you for your feedback!</div>
        ) : (
          <>
            <h3 className={styles.ratingTitle}>How was your experience?</h3>
            <div className={styles.ratingStars}>
              {[1,2,3,4,5].map(s => (
                <button
                  key={s}
                  className={`${styles.ratingStar} ${s <= (hover || rating) ? styles.ratingStarActive : ''}`}
                  onMouseEnter={() => setHover(s)}
                  onMouseLeave={() => setHover(0)}
                  onClick={() => setRating(s)}
                  aria-label={`Rate ${s} star${s !== 1 ? 's' : ''}`}
                >★</button>
              ))}
            </div>
            <textarea
              className={styles.ratingComment}
              placeholder="Optional comment…"
              value={comment}
              onChange={e => setComment(e.target.value)}
              rows={2}
            />
            <div className={styles.ratingActions}>
              <button className={styles.ratingSkip} onClick={onClose}>Skip</button>
              <button className={styles.ratingSubmit} onClick={handleSubmit} disabled={rating === 0}>Submit</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function OrderStatusBar({ status }: { status: string }) {
  const activeIdx = STATUS_STEPS.findIndex(s => s.key === status);
  const active = STATUS_STEPS[Math.max(0, activeIdx)];
  return (
    <div className={styles.statusBar}>
      <div className={styles.statusSteps}>
        {STATUS_STEPS.slice(0, 3).map((step, i) => (
          <div
            key={step.key}
            className={`${styles.statusStep} ${i <= activeIdx ? styles.statusStepDone : ''} ${i === activeIdx ? styles.statusStepActive : ''}`}
          >
            <span className={styles.statusIcon}>{step.icon}</span>
            <span className={styles.statusLabel}>{step.label}</span>
          </div>
        ))}
      </div>
      {status === 'served' && (
        <div className={styles.statusServed}>{active.icon} {active.label}</div>
      )}
    </div>
  );
}
