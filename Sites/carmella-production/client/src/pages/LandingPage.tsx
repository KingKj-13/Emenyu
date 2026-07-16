import { useEffect, type CSSProperties } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { UtensilsCrossed, Wine, Sparkles, Martini, ArrowRight, Coffee, GlassWater } from 'lucide-react';
import { useApp } from '../context/AppContext';
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

// Deal of the Day / Specials / Happy Hour / Promotions all live on the Menu
// page now (the primary customer experience) -- the Home page's only job is
// to welcome the guest and get them into the menu as fast as possible.
export function LandingPage() {
  const { tableId: paramTableId } = useParams<{ tableId: string }>();
  const navigate = useNavigate();
  const { setTableId } = useApp();
  const tableId = paramTableId || 'table1';
  const tableLabel = tableId.replace(/^table/i, 'Table ');

  useEffect(() => {
    if (paramTableId) setTableId(paramTableId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramTableId]);

  function go(c: Category) {
    navigate(c.to(tableId));
  }

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <header className={styles.header}>
          <span className={styles.monogram} aria-hidden>{LANDING_BRAND_NAME.charAt(0)}</span>
          <span className={styles.eyebrow}>Welcome to</span>
          <h1 className={styles.brand}>{LANDING_BRAND_NAME}</h1>
          <div className={styles.pill}>
            <span className={styles.dot} /> {tableLabel} · Browse the menu
          </div>
        </header>

        <button className={styles.cta} onClick={() => navigate(`/${tableId}/menu`)}>
          <span className={styles.ctaText}>
            <span className={styles.ctaTitle}>Browse the Full Menu</span>
            <span className={styles.ctaSub}>Every dish, pour and pairing</span>
          </span>
          <span className={styles.ctaArrow} aria-hidden>
            <ArrowRight size={22} />
          </span>
        </button>

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
