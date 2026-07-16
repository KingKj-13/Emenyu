import { useState, useMemo, useEffect, useCallback, useRef, type ComponentType } from 'react';
import { preload } from 'react-dom';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Salad, Fish, Beef, Drumstick, UtensilsCrossed, Sandwich, Soup, Leaf, CakeSlice,
  Wine, Beer, Martini, Coffee, Check, Clock,
} from 'lucide-react';
import { useSocketEvent } from '../hooks/useSocket';
import { AppShell } from '../components/layout/AppShell';
import { SideDrawer } from '../components/layout/SideDrawer';
import { CategorySection } from '../components/menu/CategorySection';
import { MenuSkeletonGrid } from '../components/menu/MenuSkeletonGrid';
import { ItemModal } from '../components/menu/ItemModal';
import { DealOfDayModal } from '../components/menu/DealOfDayModal';
import { ComboModal } from '../components/menu/ComboModal';
import { CategoryTabBar } from '../components/menu/CategoryTabBar';
import { BottomBar } from '../components/cart/BottomBar';
import { CartDrawer } from '../components/cart/CartDrawer';
import { useMenu } from '../hooks/useMenu';
import { useCart } from '../hooks/useCart';
import { useFilters } from '../hooks/useFilters';
import { useApp } from '../context/AppContext';
import { useTheme } from '../context/ThemeContext';
import { api, type HappyHour, type Promotion, type Special, type ComboSpecial } from '../services/api';
import { buildMenuSections, flattenMenu, formatPrice, getCurrentMealPeriod, type MealPeriod } from '../lib/menuUtils';
import { resolveImage, resolveThumbnail } from '../lib/imageResolver';
import type { MenuItem } from '../types/menu';
import styles from './MenuPage.module.css';

const MEAL_PERIOD_LABEL: Record<MealPeriod, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner' };
const MEAL_PERIOD_HOURS: Record<MealPeriod, string> = { breakfast: '07:00–11:00', lunch: '11:00–17:00', dinner: '17:00 onwards' };

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
  const [combos, setCombos] = useState<ComboSpecial[]>([]);
  const [dealModalOpen, setDealModalOpen] = useState(false);
  const [selectedCombo, setSelectedCombo] = useState<ComboSpecial | null>(null);
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
    api.getCombos().then(setCombos).catch(() => {});
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

  // Special pricing keyed by item name; original price always comes from the
  // live MenuItem (never a snapshot), matching the server's own logic. There
  // is no dedicated "Today's Specials" showcase any more -- every Special's
  // discount just applies quietly wherever that item is normally sold.
  const specialPrices = useMemo(() => {
    const map = new Map<string, number>();
    specials.flatMap(s => s.items).forEach(entry => map.set(entry.name, entry.specialPrice));
    return map;
  }, [specials]);

  // Promotional hub (Deal of the Day, then Combo Offers, then Happy Hour and
  // any other Promotions) lives at the top of the Menu page. Exactly one
  // promotion can be admin-flagged isDealOfDay -- that's the featured hero;
  // every other active promotion (never array position) shows as a smaller
  // Promotions card further down the hub.
  const deal = promotions.find(p => p.isDealOfDay) ?? null;
  const dealHeroImage = deal?.bannerImage || deal?.items[0]?.img;
  const otherPromotions = promotions.filter(p => !p.isDealOfDay);

  // Which meal service is running right now (breakfast/lunch/dinner),
  // independent of the Day/Night visual theme -- refreshed every minute so a
  // guest sitting through a service boundary sees the menu update without
  // needing to reload, the same way the theme's own auto mode does.
  const [mealPeriod, setMealPeriod] = useState<MealPeriod>(() => getCurrentMealPeriod());
  useEffect(() => {
    const id = window.setInterval(() => setMealPeriod(getCurrentMealPeriod()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const sections = useMemo(
    () => buildMenuSections(menuData, activeFilters, searchQuery, theme?.activeTheme, mealPeriod),
    [menuData, activeFilters, searchQuery, theme?.activeTheme, mealPeriod]
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

  // Deal-of-Day / Combo "Add complete X" always adds ONE combined cart line
  // (name = the deal/combo's own title, price = its bundle/combo price when
  // set, description lists what's included) rather than distributing across
  // N item lines -- a restaurant POS rings up a combo as a single item, and
  // this also cleanly avoids double-counting against each item's own
  // Special/Happy-Hour pricing in its normal category listing.
  function handleAddDeal(deal: Promotion) {
    const price = deal.dealPrice ?? deal.items.reduce((s, i) => s + i.price, 0);
    addItem({
      name: deal.title,
      price,
      img: deal.bannerImage || deal.items[0]?.img || '',
      description: deal.items.length > 0 ? `Includes: ${deal.items.map(i => i.name).join(', ')}` : deal.description,
    });
    setDealModalOpen(false);
  }

  function handleAddCombo(combo: ComboSpecial) {
    const included = [...combo.items, ...combo.drinks].map(i => i.name).join(', ');
    addItem({
      name: combo.title,
      price: combo.comboPrice,
      img: combo.bannerImage || combo.items[0]?.img || '',
      description: included ? `Includes: ${included}` : combo.description,
    });
    setSelectedCombo(null);
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
            {/* Promotional hub — Deal of the Day, Specials, Happy Hour,
                Promotions/Combos, in that order, all above the category
                navigation. This is the primary customer experience now;
                the Home page just welcomes and links in. */}
            <div className={styles.nowServing}>
              <Clock size={13} />
              Now serving {MEAL_PERIOD_LABEL[mealPeriod]}
              <span className={styles.nowServingHours}>{MEAL_PERIOD_HOURS[mealPeriod]}</span>
            </div>

            {deal && (
              <button type="button" className={styles.dealHero} onClick={() => setDealModalOpen(true)} aria-label={`View Deal of the Day: ${deal.title}`}>
                {dealHeroImage && (
                  <img src={resolveThumbnail({ name: deal.title, price: 0, img: dealHeroImage })} alt="" className={styles.dealHeroImage} />
                )}
                <div className={styles.dealHeroTint} />
                <div className={styles.dealHeroContent}>
                  {deal.badge && <span className={styles.dealBadge}>{deal.badge}</span>}
                  <span className={styles.dealEyebrow}>Deal of the Day</span>
                  <h2 className={styles.dealTitle}>{deal.title}</h2>
                  {deal.description && <p className={styles.dealDesc}>{deal.description}</p>}
                  {deal.dealPrice != null && (
                    <p className={styles.dealDesc}>
                      <strong>{formatPrice(deal.dealPrice)}</strong>{deal.savings ? ` · save ${formatPrice(deal.savings)}` : ''}
                    </p>
                  )}
                  {deal.items.length > 0 && (
                    <div className={styles.dealItems}>
                      {deal.items.slice(0, 4).map(item => (
                        <span key={item.id} className={styles.dealItemChip}>{item.name}</span>
                      ))}
                    </div>
                  )}
                </div>
              </button>
            )}

            {combos.length > 0 && (
              <section className={styles.comboSection}>
                <h2 className={styles.comboSectionTitle}>Combo Offers</h2>
                <div className={styles.comboGrid}>
                  {combos.map(combo => (
                    <button key={combo.id} type="button" className={styles.comboCard} onClick={() => setSelectedCombo(combo)}>
                      {combo.bannerImage && (
                        <img src={resolveThumbnail({ name: combo.title, price: 0, img: combo.bannerImage })} alt="" className={styles.comboCardImage} />
                      )}
                      <div className={styles.comboCardBody}>
                        <h3 className={styles.comboCardTitle}>{combo.title}</h3>
                        {combo.description && <p className={styles.comboCardDesc}>{combo.description}</p>}
                        <div className={styles.comboCardPricing}>
                          <span className={styles.comboCardOriginal}>{formatPrice(combo.originalPrice)}</span>
                          <span className={styles.comboCardPrice}>{formatPrice(combo.comboPrice)}</span>
                        </div>
                        {combo.savings > 0 && <span className={styles.comboCardSavings}>Save {formatPrice(combo.savings)}</span>}
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {happyHours.length > 0 && (
              <section className={styles.happyHourBanner}>
                <div className={styles.happyHourHeading}>
                  <span className={styles.happyHourIcon}><Clock size={16} /></span>
                  Happy Hour is on now
                </div>
                {/* Each happy hour gets its own titled row -- with more than
                    one active, a single joined "A — x% · B — y%" string left
                    every individual happy hour's own name buried in a run-on
                    sentence instead of standing on its own. */}
                {happyHours.map(hh => (
                  <div key={hh.id} className={styles.happyHourRow}>
                    <strong>{hh.name}</strong>
                    <span>{hh.discountPct}% off</span>
                  </div>
                ))}
              </section>
            )}

            {otherPromotions.length > 0 && (
              <div className={styles.promoBanner}>
                {otherPromotions.map(promo => (
                  <div key={`promo-${promo.id}`} className={styles.promoCard}>
                    {promo.badge && <span className={styles.promoBadge}>{promo.badge}</span>}
                    <strong>{promo.title}</strong>
                    {promo.description && <span className={styles.promoDesc}> — {promo.description}</span>}
                  </div>
                ))}
              </div>
            )}

            <CategoryTabBar sections={sections} />

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

      <ItemModal
        item={selectedItem}
        open={modalOpen}
        onClose={() => setSelectedItem(null)}
        onAddToCart={handleAddToCartWithDetails}
        specialPrice={selectedItem ? specialPrices.get(selectedItem.name) : undefined}
        happyHourDiscountPct={selectedItem ? happyHourDiscounts.get(selectedItem.name) : undefined}
      />

      <DealOfDayModal
        deal={deal}
        open={dealModalOpen}
        onClose={() => setDealModalOpen(false)}
        onAddDeal={handleAddDeal}
      />

      <ComboModal
        combo={selectedCombo}
        open={selectedCombo !== null}
        onClose={() => setSelectedCombo(null)}
        onAddCombo={handleAddCombo}
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
