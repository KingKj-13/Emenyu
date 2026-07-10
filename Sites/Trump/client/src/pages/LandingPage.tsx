import { useEffect, type CSSProperties } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Beef, Fish, Salad, UtensilsCrossed, Wine, Sparkles, Martini, ArrowRight } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useHomeBackGuard } from '../hooks/useHomeBackGuard';
import { LANDING_BRAND_NAME, BRAND_TAGLINE, MAINS_CATEGORY_TITLE } from '../constants/api';
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
const CATEGORIES: Category[] = [
  { key: 'wine', label: 'Wine', sub: 'The cellar', glow: 'rgba(122, 64, 130, 0.32)', icon: Wine, to: t => drink(t, 'Red Wine') },
  { key: 'cocktails', label: 'Cocktails', sub: 'Signature pours', glow: 'rgba(162, 102, 42, 0.19)', icon: Martini, to: t => drink(t, 'Cocktails') },
  { key: 'setmenu', label: 'Set Menu', sub: 'Curated combos', glow: 'rgba(128, 118, 52, 0.26)', icon: Sparkles, to: t => `/${t}/setmenu` },
  { key: 'mains', label: 'Mains', sub: 'Steaks, seafood and grill', glow: 'rgba(150, 72, 38, 0.19)', icon: Beef, to: t => sec(t, MAINS_CATEGORY_TITLE) },
  { key: 'starters', label: 'Starters', sub: 'To begin', glow: 'rgba(74, 122, 78, 0.45)', icon: Salad, to: t => sec(t, 'Starters') },
  { key: 'sushi', label: 'Sushi & Sashimi', sub: 'From the sea', glow: 'rgba(58, 112, 152, 0.25)', icon: Fish, to: t => sec(t, 'Sushi') },
];

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
                  <span className={styles.tileLabel}>{c.label}</span>
                  <span className={styles.tileSub}>{c.sub}</span>
                </span>
              </button>
            );
          })}
        </div>

        <a className={styles.footer} href={sec(tableId, 'Butchery')} onClick={e => { e.preventDefault(); navigate(sec(tableId, 'Butchery')); }}>
          <span className={styles.butchery}><UtensilsCrossed size={11} /> Butchery</span>
        </a>
      </div>
    </div>
  );
}
