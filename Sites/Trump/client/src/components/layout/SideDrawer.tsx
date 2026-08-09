import type { ReactNode } from 'react';
import { X, UtensilsCrossed, Wine, Star, UserCog, ShieldCheck } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { useT } from '../../i18n';
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
  const { drawerOpen, setDrawerOpen, tableId } = useApp();
  const t = useT();
  const navigate = useNavigate();

  if (!drawerOpen) return null;

  const hasActive = activeFilters.size > 0 || Boolean(searchQuery);

  function close() { setDrawerOpen(false); }

  return (
    <>
      <div className={styles.backdrop} onClick={close} aria-hidden="true" />
      <aside className={styles.panel} aria-label={t('nav.menu')}>
        <div className={styles.header}>
          <h2 className={styles.title}>{t('nav.menu')}</h2>
          <button className={styles.closeBtn} onClick={close} aria-label={t('nav.close')}>
            <X size={18} />
          </button>
        </div>

        {/* Quick Access icon tiles */}
        <div className={styles.quickSection}>
          <p className={styles.sectionLabel}>{t('nav.quickAccess')}</p>
          <div className={styles.quickGrid}>
            <button
              className={styles.quickTile}
              onClick={() => { close(); navigate(`/${tableId}/menu`); }}
            >
              <UtensilsCrossed size={22} />
              <span>{t('nav.foodMenu')}</span>
            </button>
            <button
              className={styles.quickTile}
              onClick={() => { close(); navigate(`/${tableId}/drinks`); }}
            >
              <Wine size={22} />
              <span>{t('nav.drinks')}</span>
            </button>
            <button
              className={styles.quickTile}
              onClick={() => { close(); navigate(`/${tableId}/setmenu`); }}
            >
              <Star size={22} />
              <span>{t('nav.setMenus')}</span>
            </button>
          </div>
        </div>

        {/* Section navigation */}
        {navLinks && navLinks.length > 0 && (
          <div className={styles.section}>
            <p className={styles.sectionLabel}>{t('nav.sections')}</p>
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
          <p className={styles.sectionLabel}>{t('nav.searchLabel')}</p>
          <input
            type="search"
            className={styles.searchInput}
            placeholder={t('nav.searchPlaceholder')}
            value={searchQuery}
            onChange={e => onSearchChange(e.target.value)}
            aria-label={t('nav.searchPlaceholder')}
          />
        </div>

        <div className={styles.section}>
          <p className={styles.sectionLabel}>{t('nav.dietary')}</p>
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
            <button className={styles.clearAll} onClick={onClearAll}>{t('nav.clearAllFilters')}</button>
          )}
        </div>

        <div className={styles.staff}>
          <p className={styles.sectionLabel}>{t('nav.staffAccess')}</p>
          <Link to="/Waiter" className={styles.staffBtn} onClick={close}>
            <UserCog size={15} /> Waiter App
          </Link>
          <Link to="/Admin" className={styles.staffBtn} onClick={close}>
            <ShieldCheck size={15} /> Admin Dashboard
          </Link>
        </div>
      </aside>
    </>
  );
}
