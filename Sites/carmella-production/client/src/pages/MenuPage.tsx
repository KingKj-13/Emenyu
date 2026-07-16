import { useState, useMemo, useEffect, useCallback, useRef, type ComponentType } from 'react';
import { preload } from 'react-dom';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Salad, Fish, Beef, Drumstick, UtensilsCrossed, Sandwich, Soup, Leaf, CakeSlice,
  Wine, Beer, Martini, Coffee, Check,
} from 'lucide-react';
import { useSocketEvent } from '../hooks/useSocket';
import { AppShell } from '../components/layout/AppShell';
import { SideDrawer } from '../components/layout/SideDrawer';
import { CategorySection } from '../components/menu/CategorySection';
import { MenuSkeletonGrid } from '../components/menu/MenuSkeletonGrid';
import { ItemModal } from '../components/menu/ItemModal';
import { CategoryTabBar } from '../components/menu/CategoryTabBar';
import { BottomBar } from '../components/cart/BottomBar';
import { CartDrawer } from '../components/cart/CartDrawer';
import { useMenu } from '../hooks/useMenu';
import { useCart } from '../hooks/useCart';
import { useFilters } from '../hooks/useFilters';
import { useApp } from '../context/AppContext';
import { useTheme } from '../context/ThemeContext';
import { api, type HappyHour, type Promotion, type Special } from '../services/api';
import { buildMenuSections, flattenMenu } from '../lib/menuUtils';
import { resolveImage, resolveThumbnail } from '../lib/imageResolver';
import { MenuCard } from '../components/menu/MenuCard';
import type { MenuItem } from '../types/menu';
import styles from './MenuPage.module.css';

const SECTION_ICON_COMPONENTS: Record<string, ComponentType<{ size?: number }>> = {
  'To Start': Salad, 'Bespoke Salads': Salad,
  'Sushi & Sashimi': Fish, 'Signature Seafood': Fish,
  'Mains': Beef, 'Pork & Ribs': Drumstick,
  'Lamb': Beef, 'Venison & Game': Beef,
  'Gourmet Burgers': Sandwich, 'Chicken Dishes': Drumstick,
  'Pastas': Soup, 'Vegetarian': Leaf,
  'Sides & Extras': UtensilsCrossed, 'Dessert & Cakes': CakeSlice,
  'Sparkling': Wine, 'White Wine': Wine, 'Red Wine': Wine,
  'Beer & Cider': Beer, 'Spirits': Martini,
  'Cocktails': Martini, 'Slow Drinks': Coffee,
};

export function MenuPage() {
  const { tableId: paramTableId } = useParams<{ tableId: string }>();
  const [searchParams] = useSearchParams();
  const focusSection = searchParams.get('section');
  const { setTableId, tableId: appTableId, sessionId } = useApp();
  const { theme } = useTheme();
  const { menuData, loading, error } = useMenu();
  const { addItem } = useCart();
  const { activeFilters, searchQuery, setSearchQuery, toggleFilter, clearFilters, filterOptions } = useFilters();

  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [happyHours, setHappyHours] = useState<HappyHour[]>([]);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [specials, setSpecials] = useState<Special[]>([]);
  const tableId = paramTableId || 'table1';
  const modalOpen = selectedItem !== null;

  useEffect(() => {
    if (paramTableId) setTableId(paramTableId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramTableId]);

  // STEP 10 — one session_start event per browser session, not per page view.
  const firedSessionStart = useRef(false);
  useEffect(() => {
    if (firedSessionStart.current) return;
    firedSessionStart.current = true;
    api.recordAnalyticsEvent({ type: 'session_start', tableId: appTableId, sessionId }).catch(() => {});
  }, [appTableId, sessionId]);

  // STEP 7/8/9 — active promotions/happy hours, refetched whenever the admin
  // changes one (promotionsUpdated) so the customer badge/banner never goes stale.
  const loadPromoData = useCallback(() => {
    api.getPromotions().then(setPromotions).catch(() => {});
    api.getHappyHours().then(setHappyHours).catch(() => {});
    api.getSpecials().then(setSpecials).catch(() => {});
  }, []);
  useEffect(loadPromoData, [loadPromoData]);
  useSocketEvent('promotionsUpdated', loadPromoData);

  const allItems = useMemo(() => flattenMenu(menuData), [menuData]);
  const itemIdByName = useMemo(() => {
    const map = new Map<string, number>();
    allItems.forEach(item => { if (item.dbId) map.set(item.name, item.dbId); });
    return map;
  }, [allItems]);

  const happyHourDiscounts = useMemo(() => {
    const map = new Map<string, number>();
    happyHours.forEach(hh => {
      allItems.forEach(item => {
        if (item.dbId && hh.itemIds.includes(item.dbId)) map.set(item.name, hh.discountPct);
      });
    });
    return map;
  }, [happyHours, allItems]);

  // STEP 5 — Special pricing keyed by item name; original price always comes
  // from the live MenuItem (never a snapshot), matching the server's own logic.
  const specialPrices = useMemo(() => {
    const map = new Map<string, number>();
    specials.flatMap(s => s.items).forEach(entry => map.set(entry.name, entry.specialPrice));
    return map;
  }, [specials]);

  const specialItems = useMemo(
    () => allItems.filter(item => specialPrices.has(item.name)),
    [allItems, specialPrices],
  );

  const sections = useMemo(
    () => buildMenuSections(menuData, activeFilters, searchQuery, theme?.activeTheme),
    [menuData, activeFilters, searchQuery, theme?.activeTheme]
  );

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

  const sectionIconFor = (title: string): ComponentType<{ size?: number }> => SECTION_ICON_COMPONENTS[title] ?? UtensilsCrossed;

  const gridNavLinks = useMemo(() => sections.map(s => {
    const Icon = sectionIconFor(s.title);
    return {
      label: s.title,
      icon: <Icon size={15} />,
      onClick: () => {
        const id = `section-${s.title.toLowerCase().replace(/\s+/g, '-')}`;
        setTimeout(() => { document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 280);
      },
    };
  }), [sections]);

  function handleItemClick(item: MenuItem) {
    setSelectedItem(item);
    api.recordAnalyticsEvent({ type: 'item_view', itemId: item.dbId, tableId: appTableId, sessionId }).catch(() => {});
  }

  // Cart pricing priority: Special > Happy Hour > Normal -- matches the
  // badge/strikethrough MenuCard already shows, so what the customer sees
  // is what actually gets charged. The quick-add button on a card doesn't
  // go through ItemModal (which resolves this itself), so it needs the same
  // resolution here.
  function resolveCartPrice(item: MenuItem): number {
    const special = specialPrices.get(item.name);
    if (special != null) return special;
    const hhPct = happyHourDiscounts.get(item.name);
    return hhPct ? item.price * (1 - hhPct / 100) : item.price;
  }

  function handleAddToCart(item: MenuItem) {
    addItem({
      name: item.name,
      price: resolveCartPrice(item),
      img: resolveImage(item),
      description: item.description || '',
      categoryType: item.categoryType,
      beverageKind: item.beverageKind,
      dbId: item.dbId ?? itemIdByName.get(item.name),
    });
  }

  function handleAddToCartWithDetails(item: MenuItem, qty: number, note: string) {
    for (let i = 0; i < qty; i++) {
      addItem({
        name: item.name,
        price: item.price,
        img: resolveImage(item),
        description: item.description || '',
        categoryType: item.categoryType,
        beverageKind: item.beverageKind,
        qty: 1,
        note,
        dbId: item.dbId ?? itemIdByName.get(item.name),
      });
    }
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
        {promotions.length > 0 && (
          <div className={styles.promoBanner}>
            {promotions.map(promo => (
              <div key={promo.id} className={styles.promoCard}>
                {promo.badge && <span className={styles.promoBadge}>{promo.badge}</span>}
                <strong>{promo.title}</strong>
                {promo.description && <span className={styles.promoDesc}> — {promo.description}</span>}
              </div>
            ))}
          </div>
        )}

        {loading ? (
          <MenuSkeletonGrid />
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
            {specialItems.length > 0 && (
              <section className={styles.specialsSection}>
                <h2 className={styles.specialsTitle}>Today's Specials</h2>
                <div className={styles.specialsGrid}>
                  {specialItems.map((item, i) => (
                    <MenuCard
                      key={`special-${item.name}-${i}`}
                      item={item}
                      onAddToCart={handleAddToCart}
                      onClick={handleItemClick}
                      specialPrice={specialPrices.get(item.name)}
                    />
                  ))}
                </div>
              </section>
            )}
            {sections.map(section => (
              <CategorySection
                key={section.title}
                section={section}
                onAddToCart={handleAddToCart}
                onItemClick={handleItemClick}
                happyHourDiscounts={happyHourDiscounts}
                specialPrices={specialPrices}
              />
            ))}
          </>
        )}
      </div>

      <CategoryTabBar sections={sections} />

      <ItemModal
        item={selectedItem}
        open={modalOpen}
        onClose={() => setSelectedItem(null)}
        onAddToCart={handleAddToCartWithDetails}
        specialPrice={selectedItem ? specialPrices.get(selectedItem.name) : undefined}
        happyHourDiscountPct={selectedItem ? happyHourDiscounts.get(selectedItem.name) : undefined}
      />

      <BottomBar />
      <CartDrawer />
      <AddedToast />
    </AppShell>
  );
}

function AddedToast() {
  const { justAdded } = useCart();
  const [visible, setVisible] = useState(false);
  const [label, setLabel] = useState('');
  useEffect(() => {
    if (!justAdded) return;
    setLabel(justAdded.name);
    setVisible(true);
    const id = window.setTimeout(() => setVisible(false), 1800);
    return () => window.clearTimeout(id);
  }, [justAdded?.t]);
  return (
    <div className={`${styles.addedToast} ${visible ? styles.addedToastShow : ''}`} role="status" aria-live="polite">
      <span className={styles.addedCheck} aria-hidden><Check size={13} strokeWidth={3} /></span> Added to cart · {label}
    </div>
  );
}
