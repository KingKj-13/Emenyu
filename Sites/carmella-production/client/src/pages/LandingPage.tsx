import { useEffect, useState, useCallback, type CSSProperties } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { UtensilsCrossed, Wine, Sparkles, Martini, ArrowRight, Coffee, GlassWater, Clock } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useSocketEvent } from '../hooks/useSocket';
import { api, type Promotion, type Special, type HappyHour } from '../services/api';
import { formatPrice } from '../lib/menuUtils';
import { resolveThumbnail } from '../lib/imageResolver';
import { LANDING_BRAND_NAME } from '../constants/api';
import styles from './LandingPage.module.css';

const sec = (t: string, s: string) => `/${t}/menu?section=${encodeURIComponent(s)}`;

interface Category {
  key: string;
  label: string;
  sub: string;
  glow: string;
  icon: typeof Wine;
  to: (t: string) => string;
}

const CATEGORIES: Category[] = [
  { key: 'global-table', label: 'Global Table', sub: 'Starters, pasta, fish & mains', glow: 'rgba(150, 72, 38, 0.19)', icon: UtensilsCrossed, to: t => sec(t, 'The Global Table') },
  { key: 'cellar', label: 'Gaspard Cellar', sub: 'Champagne, wine & spirits', glow: 'rgba(122, 64, 130, 0.32)', icon: Wine, to: t => sec(t, 'The Gaspard Cellar') },
  { key: 'familys-toast', label: "Family's Toast", sub: 'Cocktails & celebration', glow: 'rgba(162, 102, 42, 0.19)', icon: Martini, to: t => sec(t, "The Family's Toast") },
  { key: 'memory-course', label: 'Memory Course', sub: 'Desserts', glow: 'rgba(128, 118, 52, 0.26)', icon: Sparkles, to: t => sec(t, 'The Memory Course') },
  { key: 'morning-pages', label: 'Morning Pages', sub: 'Breakfast & brunch', glow: 'rgba(74, 122, 78, 0.45)', icon: Coffee, to: t => sec(t, 'The Morning Pages') },
  { key: 'slow-drinks', label: 'Slow Drinks', sub: 'Coffee, juices & shakes', glow: 'rgba(58, 112, 152, 0.25)', icon: GlassWater, to: t => sec(t, 'Slow Drinks') },
];

const FOOTER_LINK = { section: 'The Interludes', label: 'The Interludes' };

export function LandingPage() {
  const { tableId: paramTableId } = useParams<{ tableId: string }>();
  const navigate = useNavigate();
  const { setTableId } = useApp();
  const tableId = paramTableId || 'table1';
  const tableLabel = tableId.replace(/^table/i, 'Table ');

  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [specials, setSpecials] = useState<Special[]>([]);
  const [happyHours, setHappyHours] = useState<HappyHour[]>([]);

  // STEP 7 — the homepage's promo sections auto-show/hide based on what's
  // actually active right now, and re-fetch live the moment an admin changes
  // a promotion/special/happy hour (or its schedule window opens/closes on
  // the next poll from ThemeContext-style socket updates).
  const loadPromos = useCallback(() => {
    api.getPromotions().then(setPromotions).catch(() => {});
    api.getSpecials().then(setSpecials).catch(() => {});
    api.getHappyHours().then(setHappyHours).catch(() => {});
  }, []);
  useEffect(loadPromos, [loadPromos]);
  useSocketEvent('promotionsUpdated', loadPromos);

  useEffect(() => {
    if (paramTableId) setTableId(paramTableId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramTableId]);

  function go(c: Category) {
    navigate(c.to(tableId));
  }

  const deal = promotions[0] ?? null;
  const heroImage = deal?.bannerImage || deal?.items[0]?.img;

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        {deal ? (
          <button className={styles.dealHero} onClick={() => navigate(`/${tableId}/menu`)}>
            {heroImage && <img src={resolveThumbnail({ name: deal.title, price: 0, img: heroImage })} alt="" className={styles.dealHeroImage} />}
            <div className={styles.dealHeroTint} />
            <div className={styles.dealHeroContent}>
              {deal.badge && <span className={styles.dealBadge}>{deal.badge}</span>}
              <span className={styles.dealEyebrow}>Deal of the Day</span>
              <h1 className={styles.dealTitle}>{deal.title}</h1>
              {deal.description && <p className={styles.dealDesc}>{deal.description}</p>}
              {deal.items.length > 0 && (
                <div className={styles.dealItems}>
                  {deal.items.slice(0, 4).map(item => (
                    <span key={item.id} className={styles.dealItemChip}>{item.name}</span>
                  ))}
                </div>
              )}
              <span className={styles.dealCta}>View Deal <ArrowRight size={16} /></span>
            </div>
          </button>
        ) : (
          <header className={styles.header}>
            <span className={styles.monogram} aria-hidden>{LANDING_BRAND_NAME.charAt(0)}</span>
            <span className={styles.eyebrow}>Welcome to</span>
            <h1 className={styles.brand}>{LANDING_BRAND_NAME}</h1>
            <div className={styles.pill}>
              <span className={styles.dot} /> {tableLabel} · Browse the menu
            </div>
          </header>
        )}

        <button className={styles.cta} onClick={() => navigate(`/${tableId}/menu`)}>
          <span className={styles.ctaText}>
            <span className={styles.ctaTitle}>Browse the Full Menu</span>
            <span className={styles.ctaSub}>Every dish, pour and pairing</span>
          </span>
          <span className={styles.ctaArrow} aria-hidden>
            <ArrowRight size={22} />
          </span>
        </button>

        {happyHours.length > 0 && (
          <section className={styles.promoSection}>
            <div className={styles.promoSectionTitle}><Clock size={14} /> Happy Hour is on now</div>
            <div className={styles.promoRow}>
              {happyHours.flatMap(hh => hh.itemIds).length > 0 && (
                <span className={styles.promoRowText}>
                  {happyHours.map(hh => `${hh.name} — ${hh.discountPct}% off`).join(' · ')}
                </span>
              )}
              <button className={styles.promoRowBtn} onClick={() => navigate(`/${tableId}/menu`)}>See items</button>
            </div>
          </section>
        )}

        {specials.length > 0 && (
          <section className={styles.promoSection}>
            <div className={styles.promoSectionTitle}><Sparkles size={14} /> Today's Specials</div>
            <div className={styles.specialsGrid}>
              {specials.flatMap(s => s.items).slice(0, 6).map(item => (
                <button key={item.itemId} className={styles.specialTile} onClick={() => navigate(`/${tableId}/menu`)}>
                  {item.img && <img src={resolveThumbnail({ name: item.name, price: 0, img: item.img })} alt="" className={styles.specialTileImage} />}
                  <span className={styles.specialTileName}>{item.name}</span>
                  <span className={styles.specialTilePrice}>
                    <span className={styles.specialTileStrike}>{formatPrice(item.originalPrice)}</span> {formatPrice(item.specialPrice)}
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        <div className={styles.grid}>
          {CATEGORIES.map((c, i) => {
            const Icon = c.icon;
            return (
              <button
                key={c.key}
                className={styles.tile}
                style={{ '--glow': c.glow, '--stagger': i } as CSSProperties}
                onClick={() => go(c)}
              >
                <span className={styles.glow} aria-hidden />
                <span className={styles.icon} aria-hidden><Icon size={24} /></span>
                <span className={styles.tileText}>
                  <span className={styles.tileLabel}><span className={styles.tileLabelText}>{c.label}</span></span>
                  <span className={styles.tileSub}>{c.sub}</span>
                </span>
              </button>
            );
          })}
        </div>

        <a className={styles.footer} href={sec(tableId, FOOTER_LINK.section)} onClick={e => { e.preventDefault(); navigate(sec(tableId, FOOTER_LINK.section)); }}>
          <span className={styles.butchery}><UtensilsCrossed size={11} /> {FOOTER_LINK.label}</span>
        </a>
      </div>
    </div>
  );
}
