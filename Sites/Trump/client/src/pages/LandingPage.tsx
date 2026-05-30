import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import styles from './LandingPage.module.css';

interface ChooserTile {
  key: string;
  label: string;
  sub: string;
  icon: string;
  to: (tableId: string) => string;
  accent: string;
  external?: boolean;
}

const TILES: ChooserTile[] = [
  { key: 'starters', label: 'Starters', sub: 'To begin', icon: '🥗', accent: '#71806a', to: t => `/${t}/menu?section=${encodeURIComponent('Starters')}` },
  { key: 'sushi', label: 'Sushi & Sashimi', sub: 'From the sea', icon: '🍱', accent: '#4d7f82', to: t => `/${t}/menu?section=${encodeURIComponent('Sushi')}` },
  { key: 'steaks', label: 'Premium Steaks', sub: 'Aged on-site', icon: '🥩', accent: '#a52b2d', to: t => `/${t}/menu?section=${encodeURIComponent('Trumps Premium Steaks')}` },
  { key: 'butchery', label: 'Butchery', sub: 'Cuts to take home', icon: '🔪', accent: '#8a4b2f', external: true, to: () => '/Trump/frontend/pages/butchery.html' },
  { key: 'setmenu', label: 'Set Menu', sub: 'Curated combos', icon: '⭐', accent: '#c8a555', to: t => `/${t}/setmenu` },
  { key: 'wine', label: 'Wine', sub: 'The cellar', icon: '🍷', accent: '#722f37', to: t => `/${t}/drinks?section=${encodeURIComponent('Red Wine')}` },
  { key: 'cocktails', label: 'Cocktails', sub: 'Signature pours', icon: '🍹', accent: '#b5651d', to: t => `/${t}/drinks?section=${encodeURIComponent('Cocktails')}` },
  { key: 'drinks', label: 'Drinks', sub: 'All beverages', icon: '🥂', accent: '#4d7f82', to: t => `/${t}/drinks` },
];

export function LandingPage() {
  const { tableId: paramTableId } = useParams<{ tableId: string }>();
  const navigate = useNavigate();
  const { setTableId } = useApp();
  const tableId = paramTableId || 'table1';

  useEffect(() => {
    if (paramTableId) setTableId(paramTableId);
    // setTableId comes from context and is stable; intentionally excluded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramTableId]);

  const tableLabel = tableId.replace(/^table/i, 'Table ');

  return (
    <div className={styles.page}>
      <div className={styles.glow} aria-hidden />

      <header className={styles.hero}>
        <div className={styles.brandMark}>
          <svg width="34" height="34" viewBox="0 0 32 32" fill="none" aria-hidden>
            <circle cx="16" cy="16" r="14" stroke="var(--color-gold)" strokeWidth="1.2" />
            <path d="M10 21l6-12 6 12M12.5 16h7" stroke="var(--color-gold-soft)" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </div>
        <div className={styles.eyebrow}>Welcome to</div>
        <h1 className={styles.brandName}>TRUMP</h1>
        <p className={styles.tagline}>Steakhouse · Wine Cellar · Butchery</p>
        <div className={styles.tablePill}>
          <span className={styles.tableDot} />
          {tableLabel} · Scan · Order · Savour
        </div>
      </header>

      <button
        className={styles.fullMenuCta}
        onClick={() => navigate(`/${tableId}/menu`)}
      >
        <div className={styles.ctaIcon}>📖</div>
        <div className={styles.ctaText}>
          <div className={styles.ctaTitle}>Browse the Full Menu</div>
          <div className={styles.ctaSub}>Every dish, drink and pairing</div>
        </div>
        <div className={styles.ctaArrow}>→</div>
      </button>

      <div className={styles.divider}>
        <span>or jump straight to</span>
      </div>

      <div className={styles.grid}>
        {TILES.map(tile => (
          <button
            key={tile.key}
            className={styles.tile}
            style={{ ['--tile-accent' as string]: tile.accent }}
            onClick={() => {
              if (tile.external) window.location.href = tile.to(tableId);
              else navigate(tile.to(tableId));
            }}
          >
            <span className={styles.tileIcon}>{tile.icon}</span>
            <span className={styles.tileLabel}>{tile.label}</span>
            <span className={styles.tileSub}>{tile.sub}</span>
          </button>
        ))}
      </div>

      <footer className={styles.footer}>
        Powered by <span className={styles.footerBrand}>Emenyu</span>
      </footer>
    </div>
  );
}
