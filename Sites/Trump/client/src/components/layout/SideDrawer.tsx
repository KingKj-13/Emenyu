import { X, UtensilsCrossed, Wine, Star, Beef } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import styles from './SideDrawer.module.css';

interface NavLink {
  label: string;
  icon?: string;
  onClick: () => void;
}

interface SideDrawerProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  activeFilters: Set<string>;
  onToggleFilter: (key: string) => void;
  onClearAll: () => void;
  filterOptions: Array<{ key: string; label: string; mode: 'include' | 'exclude' }>;
  navLinks?: NavLink[];
}

export function SideDrawer({
  searchQuery, onSearchChange, activeFilters, onToggleFilter, onClearAll, filterOptions, navLinks
}: SideDrawerProps) {
  const { drawerOpen, setDrawerOpen, tableId } = useApp();
  const navigate = useNavigate();

  if (!drawerOpen) return null;

  const hasActive = activeFilters.size > 0 || Boolean(searchQuery);

  function close() { setDrawerOpen(false); }

  return (
    <>
      <div className={styles.backdrop} onClick={close} aria-hidden="true" />
      <aside className={styles.panel} aria-label="Filters and navigation">
        <div className={styles.header}>
          <h2 className={styles.title}>Menu</h2>
          <button className={styles.closeBtn} onClick={close} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {/* Quick Access icon tiles */}
        <div className={styles.quickSection}>
          <p className={styles.sectionLabel}>Quick Access</p>
          <div className={styles.quickGrid}>
            <button
              className={styles.quickTile}
              onClick={() => { close(); navigate(`/${tableId}/menu`); }}
            >
              <UtensilsCrossed size={22} />
              <span>Food Menu</span>
            </button>
            <button
              className={styles.quickTile}
              onClick={() => { close(); navigate(`/${tableId}/drinks`); }}
            >
              <Wine size={22} />
              <span>Wine & Drinks</span>
            </button>
            <button
              className={styles.quickTile}
              onClick={() => { close(); navigate(`/${tableId}/setmenu`); }}
            >
              <Star size={22} />
              <span>Signature Set Menus</span>
            </button>
            <a
              className={styles.quickTile}
              href="/Trump/frontend/pages/butchery.html"
              onClick={close}
            >
              <Beef size={22} />
              <span>The Butchery</span>
            </a>
          </div>
        </div>

        {/* Section navigation */}
        {navLinks && navLinks.length > 0 && (
          <div className={styles.section}>
            <p className={styles.sectionLabel}>Menu Sections</p>
            <nav className={styles.navList}>
              {navLinks.map(link => (
                <button
                  key={link.label}
                  className={styles.navLink}
                  onClick={() => { link.onClick(); close(); }}
                >
                  {link.icon && <span className={styles.navIcon}>{link.icon}</span>}
                  {link.label}
                </button>
              ))}
            </nav>
          </div>
        )}

        <div className={styles.section}>
          <p className={styles.sectionLabel}>Search</p>
          <input
            type="search"
            className={styles.searchInput}
            placeholder="Search menu…"
            value={searchQuery}
            onChange={e => onSearchChange(e.target.value)}
            aria-label="Search menu items"
          />
        </div>

        <div className={styles.section}>
          <p className={styles.sectionLabel}>Dietary Filters</p>
          <div className={styles.chips}>
            {filterOptions.map(opt => (
              <button
                key={opt.key}
                className={`${styles.chip} ${activeFilters.has(opt.key) ? styles.chipActive : ''} ${opt.mode === 'include' ? styles.chipInclude : ''}`}
                onClick={() => onToggleFilter(opt.key)}
                aria-pressed={activeFilters.has(opt.key)}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {hasActive && (
            <button className={styles.clearAll} onClick={onClearAll}>Clear all filters</button>
          )}
        </div>

        <div className={styles.staff}>
          <p className={styles.sectionLabel}>Staff Access</p>
          <Link to="/Waiter" className={styles.staffBtn} onClick={close}>
            <span>&#128119;</span> Waiter App
          </Link>
          <Link to="/Admin" className={styles.staffBtn} onClick={close}>
            <span>&#9881;</span> Admin Dashboard
          </Link>
        </div>
      </aside>
    </>
  );
}
