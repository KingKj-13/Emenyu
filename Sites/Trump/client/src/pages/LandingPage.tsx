import { useEffect, type CSSProperties } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Beef, Fish, Salad, UtensilsCrossed, Wine, Sparkles, Martini, ArrowRight, Coffee, GlassWater } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useHomeBackGuard } from '../hooks/useHomeBackGuard';
import { LANDING_BRAND_NAME, BRAND_TAGLINE, MAINS_CATEGORY_TITLE, RESTAURANT_ID } from '../constants/api';
import styles from './LandingPage.module.css';

const sec = (t: string, s: string) => `/${t}/menu?section=${encodeURIComponent(s)}`;
const drink = (t: string, s: string) => `/${t}/drinks?section=${encodeURIComponent(s)}`;

interface Category {
  key: string;
  label: string;
  sub: string;
  glow: string;
  icon: typeof Beef;
  to: (t: string) => string;
  external?: boolean;
}

// 2×3 chooser grid (matches the phone-fit opening). Butchery lives as a footer link.
// Glow alphas are normalized so every tile reads at the same tint STRENGTH
// regardless of how saturated its underlying hue is (purple/orange naturally
// read stronger than olive/green at equal alpha — see the alpha inversely
// scaled to each color's HSL saturation, tuned around the wine tile's alpha).
const TRUMP_CATEGORIES: Category[] = [
  { key: 'wine', label: 'Wine', sub: 'The cellar', glow: 'rgba(122, 64, 130, 0.32)', icon: Wine, to: t => drink(t, 'Red Wine') },
  { key: 'cocktails', label: 'Cocktails', sub: 'Signature pours', glow: 'rgba(162, 102, 42, 0.19)', icon: Martini, to: t => drink(t, 'Cocktails') },
  { key: 'setmenu', label: 'Set Menu', sub: 'Curated combos', glow: 'rgba(128, 118, 52, 0.26)', icon: Sparkles, to: t => `/${t}/setmenu` },
  { key: 'mains', label: 'Mains', sub: 'Steaks, seafood and grill', glow: 'rgba(150, 72, 38, 0.19)', icon: Beef, to: t => sec(t, MAINS_CATEGORY_TITLE) },
  { key: 'starters', label: 'Starters', sub: 'To begin', glow: 'rgba(74, 122, 78, 0.45)', icon: Salad, to: t => sec(t, 'Starters') },
  { key: 'sushi', label: 'Sushi & Sashimi', sub: 'From the sea', glow: 'rgba(58, 112, 152, 0.25)', icon: Fish, to: t => sec(t, 'Sushi') },
];

// Carmella's own chapters (demo validation report Bug C-1 — the welcome
// screen previously showed Trump's steakhouse tiles verbatim: Wine,
// Cocktails, Set Menu, Mains, Starters, Sushi & Sashimi. Carmella serves
// none of that). Deep-links use the food route (`sec`, not `drink`) for
// every tile — Carmella has no separate drinks page; MenuPage's own
// Day/Night filtering already governs what's visible once there. Section
// values are the real top-level chapter titles from the live menu so
// MenuPage's focusSection scroll (exact-then-fuzzy title match) finds them.
const CARMELLA_CATEGORIES: Category[] = [
  { key: 'global-table', label: 'The Global Table', sub: 'Starters, pasta, fish & mains', glow: 'rgba(150, 72, 38, 0.19)', icon: UtensilsCrossed, to: t => sec(t, 'The Global Table') },
  { key: 'cellar', label: 'The Gaspard Cellar', sub: 'Champagne, wine & spirits', glow: 'rgba(122, 64, 130, 0.32)', icon: Wine, to: t => sec(t, 'The Gaspard Cellar') },
  { key: 'familys-toast', label: "Family's Toast", sub: 'Cocktails & celebration', glow: 'rgba(162, 102, 42, 0.19)', icon: Martini, to: t => sec(t, "The Family's Toast") },
  { key: 'memory-course', label: 'The Memory Course', sub: 'Desserts', glow: 'rgba(128, 118, 52, 0.26)', icon: Sparkles, to: t => sec(t, 'The Memory Course') },
  { key: 'morning-pages', label: 'The Morning Pages', sub: 'Breakfast & brunch', glow: 'rgba(74, 122, 78, 0.45)', icon: Coffee, to: t => sec(t, 'The Morning Pages') },
  { key: 'slow-drinks', label: 'Slow Drinks', sub: 'Coffee, juices & shakes', glow: 'rgba(58, 112, 152, 0.25)', icon: GlassWater, to: t => sec(t, 'Slow Drinks') },
];

const CATEGORIES: Category[] = RESTAURANT_ID === 'carmella' ? CARMELLA_CATEGORIES : TRUMP_CATEGORIES;

const FOOTER_LINK = RESTAURANT_ID === 'carmella'
  ? { section: 'The Interludes', label: 'The Interludes' }
  : { section: 'Butchery', label: 'Butchery' };

export function LandingPage() {
  const { tableId: paramTableId } = useParams<{ tableId: string }>();
  const navigate = useNavigate();
  const { setTableId } = useApp();
  const tableId = paramTableId || 'table1';
  const tableLabel = tableId.replace(/^table/i, 'Table ');
  useHomeBackGuard({ isHome: true });

  useEffect(() => {
    if (paramTableId) setTableId(paramTableId);
    // setTableId is stable from context; intentionally excluded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramTableId]);

  function go(c: Category) {
    if (c.external) window.location.href = c.to(tableId);
    else navigate(c.to(tableId));
  }

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <header className={styles.header}>
          <span className={styles.monogram} aria-hidden>{LANDING_BRAND_NAME.charAt(0)}</span>
          <span className={styles.eyebrow}>Welcome to</span>
          <h1 className={styles.brand}>{LANDING_BRAND_NAME}</h1>
          <div className={styles.brandSub}>{BRAND_TAGLINE}</div>
          <div className={styles.pill}>
            <span className={styles.dot} /> {tableLabel} · Scan · Order · Savour
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
