import { useCallback, useEffect, useMemo, useRef, useState, Fragment } from 'react';
import { useParams } from 'react-router-dom';
import { ShoppingBag, MessageCircleHeart, Languages, ChevronDown } from 'lucide-react';
import { useMenu } from '../hooks/useMenu';
import { useCart } from '../hooks/useCart';
import { useApp } from '../context/AppContext';
import { buildMenuSections, flattenMenu, formatPrice, normalizeName } from '../lib/menuUtils';
import { resolveThumbnail, resolveImage, FALLBACK_IMAGE } from '../lib/imageResolver';
import { LANDING_BRAND_NAME, MAINS_CATEGORY_TITLE, RESTAURANT_ID } from '../constants/api';
import { track } from '../lib/engagement';
import { useI18n, useT } from '../i18n';
import { CowMeatSelector } from '../components/butchery/CowMeatSelector';
import { useButcheryCuts } from '../components/butchery/useButcheryCuts';
import { getCutMenuMapping, hasCutMenuMatches } from '../components/butchery/cutMenuMap';
import { useEnglishNameByDbId } from '../hooks/useEnglishMenu';
import { LanguageMenu } from '../components/language/LanguageMenu';
import type { MenuItem } from '../types/menu';
import { PremiumItemSheet } from './PremiumItemSheet';
import { PremiumCartSheet } from './PremiumCartSheet';
import { PremiumConcierge } from './chat/PremiumConcierge';
import { toRoman } from './romanNumeral';
import './theme.css';
import styles from './PremiumMenuPage.module.css';

function sectionAnchorId(title: string): string {
  return `p-section-${title.toLowerCase().replace(/\s+/g, '-')}`;
}

interface FeaturedCardProps {
  item: MenuItem;
  onOpen: () => void;
  onAdd: () => void;
}

function FeaturedCard({ item, onOpen, onAdd }: FeaturedCardProps) {
  const src = resolveThumbnail(item) || FALLBACK_IMAGE;
  const badge = item.chefPick ? "Chef's Selection" : item.popular ? 'Guest Favourite' : null;
  return (
    <div className={styles.featuredCard}>
      <button type="button" className={styles.featuredMedia} onClick={onOpen} aria-label={`View ${item.name}`}>
        <img src={src} alt={item.name} className={styles.featuredImg} loading="lazy" />
        <div className={styles.featuredScrim} />
        {badge && <span className={styles.featuredBadge}>{badge}</span>}
        <div className={styles.featuredInfo}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className={styles.featuredName}>{item.name}</div>
            {item.description && <div className={styles.featuredDesc}>{item.description}</div>}
          </div>
          <div className={styles.featuredPrice}>{formatPrice(item.price)}</div>
        </div>
      </button>
      <div className={styles.featuredFooter}>
        <button type="button" className={styles.detailsLink} onClick={onOpen}>Details</button>
        <button type="button" className={styles.smallAdd} onClick={onAdd}>Add</button>
      </div>
    </div>
  );
}

interface ItemRowProps {
  item: MenuItem;
  onOpen: () => void;
  onAdd: () => void;
}

function ItemRow({ item, onOpen, onAdd }: ItemRowProps) {
  const src = resolveThumbnail(item);
  const soldOut = item.available === false;
  return (
    <div className={styles.itemRow}>
      {src ? (
        <img src={src} alt={item.name} className={styles.itemThumb} loading="lazy" onClick={onOpen} />
      ) : (
        <div className={styles.itemThumbPh} onClick={onOpen} aria-hidden>tg</div>
      )}
      <button type="button" className={styles.itemBody} onClick={onOpen} style={{ textAlign: 'left' }}>
        <div className={styles.itemName}>
          {item.name}
          {item.chefPick && <span className={styles.chefDot} aria-hidden />}
        </div>
        {item.description && <div className={styles.itemDesc}>{item.description}</div>}
        {soldOut ? (
          <div className={styles.itemSoldOut}>Sold out</div>
        ) : (
          <div className={styles.itemPrice}>{formatPrice(item.price)}</div>
        )}
      </button>
      {!soldOut && (
        <button type="button" className={styles.addBtn} aria-label={`Add ${item.name}`} onClick={onAdd}>
          <span style={{ fontSize: 16, fontWeight: 300 }}>+</span>
        </button>
      )}
    </div>
  );
}

export function PremiumMenuPage() {
  const { tableId: paramTableId } = useParams<{ tableId: string }>();
  const { setTableId, tableLabel, pendingItemName, setPendingItemName, setChatOpen } = useApp();
  const { menuData, loading, error } = useMenu();
  const cart = useCart();
  const t = useT();
  const { locale, definition } = useI18n();
  const serverCuts = useButcheryCuts(locale);
  const englishNameByDbId = useEnglishNameByDbId();
  const langBtn = useRef<HTMLButtonElement>(null);
  const [langOpen, setLangOpen] = useState(false);

  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (paramTableId) setTableId(paramTableId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramTableId]);

  useEffect(() => {
    if (loading) return;
    track({ eventType: 'MENU_VIEW', label: 'premium' });
  }, [loading]);

  const sections = useMemo(() => buildMenuSections(menuData, new Set(), ''), [menuData]);
  const allItems = useMemo(() => flattenMenu(menuData), [menuData]);

  // Matched against the English name (see MenuPage.tsx for why) — the cut
  // mapping regex is English-only, so a fully-translated menu would
  // otherwise make this false in every non-English locale.
  const showButchery = useMemo(
    () => hasCutMenuMatches(allItems, getCutMenuMapping(RESTAURANT_ID), item => {
      const english = item.dbId != null ? englishNameByDbId.get(item.dbId) : undefined;
      return english ?? item.name;
    }),
    [allItems, englishNameByDbId]
  );
  const scrollToSteaks = useCallback(() => {
    scrollToSection(MAINS_CATEGORY_TITLE);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const featured = useMemo(() => {
    const seen = new Set<string>();
    const picks: MenuItem[] = [];
    for (const item of allItems) {
      if (!item.chefPick && !item.popular) continue;
      if (item.available === false) continue;
      const key = normalizeName(item.name);
      if (seen.has(key)) continue;
      seen.add(key);
      picks.push(item);
      if (picks.length >= 6) break;
    }
    return picks;
  }, [allItems]);

  const findItemByName = useCallback((name: string): MenuItem | null => {
    const key = normalizeName(name);
    return allItems.find(i => normalizeName(i.name) === key)
      || allItems.find(i => normalizeName(i.name).includes(key) || key.includes(normalizeName(i.name)))
      || null;
  }, [allItems]);

  // Decoupled "open this dish somewhere" signal — cart recommendations,
  // favorites, and the concierge chat all just call setPendingItemName();
  // this is the one place that actually resolves it to a sheet.
  useEffect(() => {
    if (!pendingItemName) return;
    const found = findItemByName(pendingItemName);
    if (found) setSelectedItem(found);
    setPendingItemName(null);
  }, [pendingItemName, findItemByName, setPendingItemName]);

  function showToast(message: string) {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 1800);
  }

  function quickAdd(item: MenuItem) {
    const hasChoices = (item.variants || []).some(v => !v.isAddon);
    if (hasChoices || item.available === false) {
      setSelectedItem(item);
      return;
    }
    cart.addItem({
      name: item.name,
      price: item.price,
      img: resolveImage(item),
      description: item.description || '',
      categoryType: item.categoryType,
      beverageKind: item.beverageKind,
    });
    showToast(`${item.name} added to your table`);
  }

  function scrollToSection(title: string) {
    document.getElementById(sectionAnchorId(title))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <div className="premiumRoot">
      <header className={styles.header}>
        <span className={styles.tablePill}>{tableLabel}</span>
        <span className={styles.brand}>{LANDING_BRAND_NAME}</span>
        <button
          ref={langBtn}
          type="button"
          className={styles.langBtn}
          onClick={() => setLangOpen(o => !o)}
          aria-label={`${t('lang.change')}: ${definition.english}`}
          aria-expanded={langOpen}
          aria-haspopup="listbox"
          title={definition.native}
        >
          <Languages size={15} />
          <span className={styles.langCode}>{definition.code.split('-')[0].toUpperCase()}</span>
          <ChevronDown size={11} aria-hidden />
        </button>
        <LanguageMenu anchorRef={langBtn} open={langOpen} onClose={() => setLangOpen(false)} />
        <button type="button" className={styles.cartBtn} aria-label="Your order" onClick={() => cart.setIsOpen(true)}>
          <ShoppingBag size={16} />
          {cart.count > 0 && <span className={styles.cartCount}>{cart.count}</span>}
        </button>
      </header>

      {sections.length > 0 && (
        <nav className={styles.chapterNav} aria-label="Menu chapters">
          {sections.map((section, idx) => (
            <button
              key={section.title}
              type="button"
              className={styles.chapterNavItem}
              onClick={() => scrollToSection(section.title)}
            >
              <span className={styles.chapterNavNumeral}>{toRoman(idx + 1)}</span>
              <span className={styles.chapterNavLabel}>{section.displayTitle ?? section.title}</span>
            </button>
          ))}
        </nav>
      )}

      {loading ? (
        <div className={styles.emptyState}>Setting the table…</div>
      ) : error ? (
        <div className={styles.errorState}>{error}</div>
      ) : sections.length === 0 ? (
        <div className={styles.emptyState}>The kitchen is between courses. Please check back shortly.</div>
      ) : (
        <>
          {featured.length > 0 && (
            <div className={styles.featuredRow}>
              {featured.map(item => (
                <FeaturedCard
                  key={item.name}
                  item={item}
                  onOpen={() => setSelectedItem(item)}
                  onAdd={() => quickAdd(item)}
                />
              ))}
            </div>
          )}

          {sections.map((section, idx) => (
            <Fragment key={section.title}>
              {showButchery && section.title === MAINS_CATEGORY_TITLE && (
                <section className={styles.butcheryStage} aria-label={t('cut.title')}>
                  <CowMeatSelector
                    items={allItems}
                    serverCuts={serverCuts}
                    onOpenItem={item => setSelectedItem(item)}
                    onBrowseAll={scrollToSteaks}
                    mobileEntry
                  />
                </section>
              )}
              <div id={sectionAnchorId(section.title)} className={styles.section}>
                <div className={styles.sectionWatermark} aria-hidden>{toRoman(idx + 1)}</div>
                <div className={styles.sectionEyebrow}>
                  <span className={styles.chapterNavNumeral} style={{ color: 'var(--p-brass)' }}>{toRoman(idx + 1)}</span>
                </div>
                <h2 className={styles.sectionTitle}>{section.displayTitle ?? section.title}</h2>
                {section.intro && (
                  <div className={styles.sectionIntro}>
                    <div className={styles.sectionIntroRule} />
                    <div className={styles.sectionIntroText}>{section.intro}</div>
                  </div>
                )}
              </div>

              {section.items.map(item => (
                <ItemRow
                  key={item.name}
                  item={item}
                  onOpen={() => setSelectedItem(item)}
                  onAdd={() => quickAdd(item)}
                />
              ))}

              {section.subSections.map(sub => (
                <Fragment key={sub.title}>
                  <div className={styles.subHeading}>{sub.displayTitle ?? sub.title}</div>
                  {sub.items.map(item => (
                    <ItemRow
                      key={item.name}
                      item={item}
                      onOpen={() => setSelectedItem(item)}
                      onAdd={() => quickAdd(item)}
                    />
                  ))}
                </Fragment>
              ))}
            </Fragment>
          ))}
        </>
      )}

      <div style={{ height: 96 }} aria-hidden />

      <nav className={styles.bottomNav} aria-label="Primary">
        <div className={`${styles.navItem} ${styles.navItemActive}`}>
          <span className={styles.navLabel}>Menu</span>
          <span className={`${styles.navDot} ${styles.navDotActive}`} />
        </div>
        <button type="button" className={styles.navItem} onClick={() => setChatOpen(true)}>
          <span className={styles.navLabel}><MessageCircleHeart size={13} aria-hidden /> Concierge</span>
          <span className={styles.navDot} />
        </button>
        <button type="button" className={styles.navItem} onClick={() => cart.setIsOpen(true)}>
          <span className={styles.navLabel}>
            Order
            {cart.count > 0 && <span className={styles.navBadge}>{cart.count}</span>}
          </span>
          <span className={styles.navDot} />
        </button>
      </nav>

      {toast && (
        <div className={styles.toast} role="status">
          <span className={styles.toastDot} aria-hidden />
          <span className={styles.toastText}>{toast}</span>
        </div>
      )}

      <PremiumItemSheet
        item={selectedItem}
        open={!!selectedItem}
        onClose={() => setSelectedItem(null)}
        onOpenItem={item => setSelectedItem(item)}
        onAdded={message => showToast(message)}
      />

      <PremiumCartSheet
        open={cart.isOpen}
        onClose={() => cart.setIsOpen(false)}
      />

      <PremiumConcierge
        onItemClick={item => setSelectedItem({
          name: item.name,
          price: item.price,
          description: item.description || '',
          img: item.img,
          video: item.video,
          category: item.category || '',
          categoryType: item.categoryType,
          beverageKind: item.beverageKind,
        })}
      />
    </div>
  );
}
