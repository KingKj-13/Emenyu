import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { BASE_PATH } from '../constants/api';
import styles from './LandingPage.module.css';

interface Tile {
  key: string;
  label: string;
  sub: string;
  img: string;
  span: 'wide' | 'tall' | 'normal';
  to: (tableId: string) => string;
  external?: boolean;
}

const img = (file: string) => `${BASE_PATH}/Images/${encodeURIComponent(file)}`;
const sec = (t: string, s: string) => `/${t}/menu?section=${encodeURIComponent(s)}`;

const TILES: Tile[] = [
  { key: 'menu', label: 'Full Menu', sub: 'Every dish & drink', img: img('Tomahawk.jpg'), span: 'wide', to: t => `/${t}/menu` },
  { key: 'steaks', label: 'Premium Steaks', sub: 'Aged on-site', img: img('Rump Steak.jpg'), span: 'tall', to: t => sec(t, 'Trumps Premium Steaks') },
  { key: 'sushi', label: 'Sushi', sub: 'From the sea', img: img('Seafood Meze Platter.jpg'), span: 'normal', to: t => sec(t, 'Sushi') },
  { key: 'cocktails', label: 'Cocktails', sub: 'Signature pours', img: img('Margarita.jpg'), span: 'normal', to: t => `/${t}/drinks?section=${encodeURIComponent('Cocktails')}` },
  { key: 'seafood', label: 'Seafood', sub: 'Line to plate', img: img('Butter-garlic-prawns.jpg'), span: 'wide', to: t => sec(t, 'Signature Seafood') },
  { key: 'wine', label: 'Wine', sub: 'The cellar', img: img('Porcupine Ridge Shiraz.jpg'), span: 'normal', to: t => `/${t}/drinks?section=${encodeURIComponent('Red Wine')}` },
  { key: 'starters', label: 'Starters', sub: 'To begin', img: img('Cheese Croquettes.jpg'), span: 'normal', to: t => sec(t, 'Starters') },
  { key: 'butchery', label: 'Butchery', sub: 'Cuts to take home', img: img('Meat Meze Platter.jpg'), span: 'wide', external: true, to: () => `${BASE_PATH}/frontend/pages/butchery.html` },
  { key: 'setmenu', label: 'Set Menu', sub: 'Curated combos', img: img('Beef Fillet Pasta.jpg'), span: 'normal', to: t => `/${t}/setmenu` },
  { key: 'dessert', label: 'Dessert', sub: 'Sweet finishes', img: img('Cheese Cake.jpg'), span: 'normal', to: t => sec(t, 'Dessert') },
  { key: 'veg', label: 'Vegetarian', sub: 'Garden-forward', img: img('Veg Meze Platter.jpg'), span: 'normal', to: t => sec(t, 'Vegetarian') },
  { key: 'drinks', label: 'Drinks', sub: 'All beverages', img: img('Mojito.jpg'), span: 'normal', to: t => `/${t}/drinks` },
];

export function LandingPage() {
  const { tableId: paramTableId } = useParams<{ tableId: string }>();
  const navigate = useNavigate();
  const { setTableId } = useApp();
  const tableId = paramTableId || 'table1';

  useEffect(() => {
    if (paramTableId) setTableId(paramTableId);
    // setTableId is stable from context; intentionally excluded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramTableId]);

  const tableLabel = tableId.replace(/^table/i, 'Table ');

  function go(tile: Tile) {
    if (tile.external) window.location.href = tile.to(tableId);
    else navigate(tile.to(tableId));
  }

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.brandRow}>
          <svg width="28" height="28" viewBox="0 0 32 32" fill="none" aria-hidden>
            <circle cx="16" cy="16" r="14" stroke="var(--color-gold)" strokeWidth="1.2" />
            <path d="M10 21l6-12 6 12M12.5 16h7" stroke="var(--color-gold-soft)" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          <span className={styles.brandName}>TRUMP</span>
        </div>
        <p className={styles.tagline}>Steakhouse · Wine Cellar · Butchery</p>
        <div className={styles.tablePill}><span className={styles.dot} /> {tableLabel} · Tap to explore</div>
      </header>

      <div className={styles.mosaic}>
        {TILES.map(tile => (
          <button
            key={tile.key}
            className={`${styles.tile} ${styles[tile.span]}`}
            style={{ backgroundImage: `url("${tile.img}")` }}
            onClick={() => go(tile)}
            aria-label={tile.label}
          >
            <span className={styles.scrim} />
            <span className={styles.tileText}>
              <span className={styles.tileLabel}>{tile.label}</span>
              <span className={styles.tileSub}>{tile.sub}</span>
            </span>
          </button>
        ))}
      </div>

      <footer className={styles.footer}>Powered by <span className={styles.footerBrand}>Emenyu</span></footer>
    </div>
  );
}
