import { Link, useLocation } from 'react-router-dom';
import { Menu, BookOpen, Grid, ShoppingCart, User } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useCart } from '../../hooks/useCart';
import { LANDING_BRAND_NAME, BRAND_TAGLINE } from '../../constants/api';
import styles from './Header.module.css';

export function Header() {
  const { tableId, tableLabel, setDrawerOpen } = useApp();
  const { count, setIsOpen } = useCart();
  const location = useLocation();
  const path = location.pathname.toLowerCase();
  const isWaiter = path === '/waiter' || path.endsWith('/book');
  const isAdmin = path === '/admin';
  const isMenu = !isWaiter && !isAdmin;

  return (
    <header className={styles.header} role="banner">
      <Link to={`/${tableId}`} className={styles.brand} aria-label={`${LANDING_BRAND_NAME} ${BRAND_TAGLINE} - back to start`}>
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
          className={`${styles.viewToggle} ${isMenu ? styles.active : ''}`}
          aria-label="Calculator"
          aria-current={isMenu ? 'page' : undefined}
          title="Calculator"
        >
          <Grid size={18} />
        </Link>
        <Link
          to="/Waiter"
          className={`${styles.viewToggle} ${isWaiter ? styles.active : ''}`}
          aria-label="Waiter"
          aria-current={isWaiter ? 'page' : undefined}
          title="Waiter"
        >
          <BookOpen size={18} />
        </Link>
        <Link
          to="/Admin"
          className={`${styles.userButton} ${isAdmin ? styles.active : ''}`}
          aria-label="Admin"
          aria-current={isAdmin ? 'page' : undefined}
          title="Admin"
        >
          <User size={18} />
        </Link>
        <button
          className={styles.cartButton}
          onClick={() => setIsOpen(true)}
          aria-label={`Cart, ${count} item${count !== 1 ? 's' : ''}`}
          title="Cart"
        >
          <ShoppingCart size={18} />
          {count > 0 && <span className={styles.cartBadge}>{count}</span>}
        </button>
        <button
          className={styles.menuButton}
          aria-label="Menu"
          title="Menu"
          onClick={() => setDrawerOpen(true)}
        >
          <Menu size={18} />
        </button>
      </nav>
    </header>
  );
}
