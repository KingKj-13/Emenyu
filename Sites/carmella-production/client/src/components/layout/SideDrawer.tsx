import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import styles from './SideDrawer.module.css';

interface NavLink {
  label: string;
  icon?: ReactNode;
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
  const { drawerOpen, setDrawerOpen } = useApp();

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
          <div className={styles.searchRow}>
            <input
              type="search"
              className={styles.searchInput}
              placeholder="Search by name, description, category…"
              value={searchQuery}
              onChange={e => onSearchChange(e.target.value)}
              aria-label="Search menu items"
            />
            {searchQuery && (
              <button
                type="button"
                className={styles.searchClearBtn}
                onClick={() => onSearchChange('')}
                aria-label="Clear search"
              >
                <X size={15} />
              </button>
            )}
          </div>
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
      </aside>
    </>
  );
}
