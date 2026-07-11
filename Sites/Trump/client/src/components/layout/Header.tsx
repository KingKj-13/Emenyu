import { Link, useLocation } from 'react-router-dom';
import { Menu, BookOpen, Grid, ShoppingCart, User, ChefHat } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useCart } from '../../hooks/useCart';
import { LANDING_BRAND_NAME, BRAND_TAGLINE, DEMO_MODE } from '../../constants/api';
import styles from './Header.module.css';

export function Header() {
  const { tableId, tableLabel, user, setDrawerOpen } = useApp();
  const { count, setIsOpen } = useCart();
  // The "Book view" toggle used to flip a bookMode boolean in AppContext that
  // only drove its own highlight styling -- it never navigated anywhere or
  // set MenuPage's sectionFilter, so clicking it visibly highlighted but did
  // nothing else. The real, working book view lives at its own route
  // (App.tsx: /:tableId/book -> MenuPage sectionFilter="book"), so both
  // buttons now navigate there/back instead of toggling a disconnected flag.
  const location = useLocation();
  const inBookView = location.pathname.endsWith('/book');

  return (
    <header className={styles.header} role="banner">
      <Link to={`/${tableId}`} className={styles.brand} aria-label={`${LANDING_BRAND_NAME} ${BRAND_TAGLINE} — back to start`}>
        <div className={styles.brandMark} aria-hidden="true">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 19V5h16v14" />
            <path d="M8 19V9h8v10" />
          </svg>
        </div>
        <div className={styles.brandText}>
          <p className={styles.brandTitle}>{LANDING_BRAND_NAME}</p>
          <p className={styles.brandSubtitle}>{BRAND_TAGLINE.toUpperCase()}</p>
        </div>
      </Link>

      <nav className={styles.nav} aria-label="Main navigation">
        {tableLabel && (
          <span className={styles.tablePill} aria-label={`Table: ${tableLabel}`}>
            {tableLabel}
          </span>
        )}
        <Link
          to={`/${tableId}/menu`}
          className={`${styles.viewToggle} ${!inBookView ? styles.active : ''}`}
          aria-label="Grid view"
          aria-current={!inBookView ? 'page' : undefined}
          title="Menu grid"
        >
          <Grid size={18} />
        </Link>
        {DEMO_MODE ? (
          <Link
            to="/Waiter"
            className={styles.viewToggle}
            aria-label="Waiter dashboard (demo — no login required)"
            title="Waiter dashboard"
          >
            <ChefHat size={18} />
          </Link>
        ) : (
          <Link
            to={`/${tableId}/book`}
            className={`${styles.viewToggle} ${inBookView ? styles.active : ''}`}
            aria-label="Book view"
            aria-current={inBookView ? 'page' : undefined}
            title="Book view"
          >
            <BookOpen size={18} />
          </Link>
        )}
        <button
          className={styles.cartButton}
          onClick={() => setIsOpen(true)}
          aria-label={`Open cart, ${count} item${count !== 1 ? 's' : ''}`}
        >
          <ShoppingCart size={18} />
          {count > 0 && <span className={styles.cartBadge}>{count}</span>}
        </button>
        {user ? (
          <Link to="/Admin" className={styles.userButton} aria-label={DEMO_MODE ? 'Admin dashboard (demo — no login required)' : `Logged in as ${user.username}`}>
            <User size={18} />
          </Link>
        ) : null}
        <button
          className={styles.menuButton}
          aria-label="Open navigation menu"
          onClick={() => setDrawerOpen(true)}
        >
          <Menu size={18} />
        </button>
      </nav>
    </header>
  );
}
