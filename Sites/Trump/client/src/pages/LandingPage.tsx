import { useEffect, type CSSProperties, type ReactNode } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { BASE_PATH } from '../constants/api';
import styles from './LandingPage.module.css';

const sec = (t: string, s: string) => `/${t}/menu?section=${encodeURIComponent(s)}`;
const drink = (t: string, s: string) => `/${t}/drinks?section=${encodeURIComponent(s)}`;

interface Category {
  key: string;
  label: string;
  sub: string;
  glow: string;
  icon: ReactNode;
  to: (t: string) => string;
  external?: boolean;
}

const I = {
  steak: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 9c0-3 3-5 7-5s7 2 7 6c0 5-4 9-9 9-3 0-5-2-5-5 0-2 0-3 0-5Z" />
      <circle cx="9.5" cy="10.5" r="1.4" />
    </svg>
  ),
  sushi: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 15a4 4 0 0 1 4-4h10a4 4 0 0 1 0 8H7a4 4 0 0 1-4-4Z" />
      <path d="M5 12c2.5-2.5 11.5-2.5 14 0" />
    </svg>
  ),
  starters: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 17a8 8 0 0 1 16 0" />
      <path d="M3 17h18" />
      <path d="M12 9V7" />
      <circle cx="12" cy="6" r="1.1" />
    </svg>
  ),
  butchery: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 17 16 4l4 4c-3.5 3.5-8 5.5-12 7Z" />
      <path d="M3 17l3 3" />
    </svg>
  ),
  wine: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 3h10l-1 6a4 4 0 0 1-8 0L7 3Z" />
      <path d="M12 15v5" />
      <path d="M8 21h8" />
    </svg>
  ),
  setmenu: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l2.6 5.7 6.2.6-4.7 4.2 1.4 6.1L12 16.8 6.3 19.6l1.4-6.1L3 9.3l6.2-.6L12 3Z" />
    </svg>
  ),
  cocktails: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 5h16l-8 8L4 5Z" />
      <path d="M12 13v6" />
      <path d="M8 21h8" />
    </svg>
  ),
  drinks: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 2h4v3l1 2v12a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2V7l1-2V2Z" />
      <path d="M9.5 11h5" />
    </svg>
  ),
};

const HERO: Category = {
  key: 'steaks', label: 'Premium Steaks', sub: 'Dry-aged on-site · olive-wood fire',
  glow: 'rgba(150, 72, 38, 0.20)', icon: I.steak, to: t => sec(t, 'Trumps Premium Steaks'),
};

const CATEGORIES: Category[] = [
  { key: 'sushi', label: 'Sushi & Sashimi', sub: 'From the sea', glow: 'rgba(58, 112, 152, 0.34)', icon: I.sushi, to: t => sec(t, 'Sushi') },
  { key: 'starters', label: 'Starters', sub: 'To begin', glow: 'rgba(74, 122, 78, 0.30)', icon: I.starters, to: t => sec(t, 'Starters') },
  { key: 'butchery', label: 'Butchery', sub: 'Cuts to take home', glow: 'rgba(158, 58, 46, 0.34)', icon: I.butchery, external: true, to: () => `${BASE_PATH}/frontend/pages/butchery.html` },
  { key: 'wine', label: 'Wine', sub: 'The cellar', glow: 'rgba(122, 64, 130, 0.32)', icon: I.wine, to: t => drink(t, 'Red Wine') },
  { key: 'setmenu', label: 'Set Menu', sub: 'Curated combos', glow: 'rgba(128, 118, 52, 0.32)', icon: I.setmenu, to: t => `/${t}/setmenu` },
  { key: 'cocktails', label: 'Cocktails', sub: 'Signature pours', glow: 'rgba(162, 102, 42, 0.32)', icon: I.cocktails, to: t => drink(t, 'Cocktails') },
  { key: 'drinks', label: 'Drinks', sub: 'All beverages', glow: 'rgba(56, 102, 148, 0.32)', icon: I.drinks, to: t => `/${t}/drinks` },
];

export function LandingPage() {
  const { tableId: paramTableId } = useParams<{ tableId: string }>();
  const navigate = useNavigate();
  const { setTableId } = useApp();
  const tableId = paramTableId || 'table1';
  const tableLabel = tableId.replace(/^table/i, 'Table ');

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
          <span className={styles.monogram} aria-hidden>T</span>
          <span className={styles.eyebrow}>Welcome to</span>
          <h1 className={styles.brand}>Trumps</h1>
          <div className={styles.brandSub}>Prime Grillhouse</div>
          <div className={styles.pill}>
            <span className={styles.dot} /> {tableLabel} · Scan · Order · Savour
          </div>
        </header>

        <div className={styles.grid}>
          <button className={`${styles.tile} ${styles.hero}`} style={{ '--glow': HERO.glow } as CSSProperties} onClick={() => go(HERO)}>
            <span className={styles.glow} aria-hidden />
            <span className={styles.tileText}>
              <span className={styles.tileLabel}>{HERO.label}</span>
              <span className={styles.tileSub}>{HERO.sub}</span>
            </span>
          </button>

          {CATEGORIES.map(c => (
            <button key={c.key} className={styles.tile} style={{ '--glow': c.glow } as CSSProperties} onClick={() => go(c)}>
              <span className={styles.glow} aria-hidden />
              <span className={styles.icon} aria-hidden>{c.icon}</span>
              <span className={styles.tileText}>
                <span className={styles.tileLabel}>{c.label}</span>
                <span className={styles.tileSub}>{c.sub}</span>
              </span>
            </button>
          ))}
        </div>

        <button className={styles.cta} onClick={() => navigate(`/${tableId}/menu`)}>
          <span className={styles.ctaText}>
            <span className={styles.ctaTitle}>Browse the Full Menu</span>
            <span className={styles.ctaSub}>Every dish, pour and pairing</span>
          </span>
          <span className={styles.ctaArrow} aria-hidden>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14" /><path d="M13 6l6 6-6 6" />
            </svg>
          </span>
        </button>

        <p className={styles.footer}>Powered by Emenyu</p>
      </div>
    </div>
  );
}
