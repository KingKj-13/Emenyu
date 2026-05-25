import { useState, useMemo, useEffect, Suspense, lazy } from 'react';
import { useParams } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { SideDrawer } from '../components/layout/SideDrawer';
import { CategorySection } from '../components/menu/CategorySection';
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
import { buildMenuSections, normalizeName } from '../lib/menuUtils';
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
  const { setTableId, pendingItemName, setPendingItemName } = useApp();
  const { menuData, loading, error } = useMenu();
  const { addItem } = useCart();
  const { activeFilters, searchQuery, setSearchQuery, toggleFilter, clearFilters, filterOptions } = useFilters();
  const { favorites, toggle: toggleFavorite } = useFavorites();
  const { addItem: addRecent } = useRecentlyViewed();

  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [pairingItem, setPairingItem] = useState<MenuItem | null>(null);

  // Sync table ID from URL param
  if (paramTableId) setTableId(paramTableId);

  const sections = useMemo(() => {
    const all = buildMenuSections(menuData, activeFilters, searchQuery);
    if (sectionFilter === 'drinks') return all.filter(s => DRINKS_TITLES.has(s.title));
    if (sectionFilter === 'setmenu') return all.filter(s => SETMENU_TITLES.has(s.title));
    return all;
  }, [menuData, activeFilters, searchQuery, sectionFilter]);

  useEffect(() => {
    if (!pendingItemName) return;
    const key = normalizeName(pendingItemName);
    let found: MenuItem | null = null;
    outer: for (const section of sections) {
      for (const item of section.items) {
        if (normalizeName(item.name) === key) { found = item; break outer; }
      }
      for (const sub of section.subSections) {
        for (const item of sub.items) {
          if (normalizeName(item.name) === key) { found = item; break outer; }
        }
      }
    }
    if (found) handleItemClick(found);
    setPendingItemName(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingItemName]);

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
    setSelectedItem(item);
    setModalOpen(true);
    addRecent(item);
  }

  function handleChatItemClick(item: ChatSuggestionItem) {
    handleItemClick(item as unknown as MenuItem);
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
          onClose={() => setModalOpen(false)}
          isFavorite={selectedItem ? favorites.includes(selectedItem.name) : false}
          onFavoriteToggle={toggleFavorite}
          onAddToCart={handleAddToCartWithDetails}
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
          sections.map(section => (
            <CategorySection
              key={section.title}
              section={section}
              favorites={favorites}
              onFavoriteToggle={toggleFavorite}
              onAddToCart={handleAddToCart}
              onItemClick={handleItemClick}
              onPairingClick={setPairingItem}
            />
          ))
        )}
      </div>

      <CategoryTabBar sections={sections} />

      <ItemModal
        item={selectedItem}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        isFavorite={selectedItem ? favorites.includes(selectedItem.name) : false}
        onFavoriteToggle={toggleFavorite}
        onAddToCart={handleAddToCartWithDetails}
      />

      <PairingModal item={pairingItem} open={!!pairingItem} onClose={() => setPairingItem(null)} />

      <BottomBar />
      <CartDrawer />
      <ChatPanel />
    </AppShell>
  );
}
