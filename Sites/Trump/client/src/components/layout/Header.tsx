import { Link } from 'react-router-dom';
import { useRef, useState, useMemo } from 'react';
import { Menu, Languages, User, ChefHat, ChevronDown, Beef } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useMenuData } from '../../context/MenuContext';
import { useI18n } from '../../i18n';
import { LANDING_BRAND_NAME, BRAND_TAGLINE, DEMO_MODE, RESTAURANT_ID } from '../../constants/api';
import { DayNightToggle } from './DayNightToggle';
import { LanguageMenu } from '../language/LanguageMenu';
import { flattenMenu } from '../../lib/menuUtils';
import { useEnglishNameByDbId } from '../../hooks/useEnglishMenu';
import { getCutMenuMapping, hasCutMenuMatches } from '../butchery/cutMenuMap';
import styles from './Header.module.css';

export function Header() {
  const { tableId, tableLabel, user, setDrawerOpen, dayParts, setButcheryOpen } = useApp();
  const { definition, t } = useI18n();
  const langBtn = useRef<HTMLButtonElement>(null);
  const [langOpen, setLangOpen] = useState(false);
  // Carmella-only: tenants with no day-part engine get [] from the server
  // (see AppContext.tsx), so this is false for Trump/Demo and their existing
  // Book view / Waiter dashboard icon is untouched.
  const hasDayNightToggle = dayParts.length > 0;

  // Same data-driven gate MenuPage.tsx uses for its own butchery entry point
  // — a tenant with no beef primals on the menu (Carmella) never gets the
  // icon. Header is shared across every guest page (via AppShell), so this
  // is computed here rather than threaded down as a prop from whichever page
  // happens to be current.
  const { menuData } = useMenuData();
  const englishNameByDbId = useEnglishNameByDbId();
  const showButchery = useMemo(() => {
    const allItems = flattenMenu(menuData);
    return hasCutMenuMatches(allItems, getCutMenuMapping(RESTAURANT_ID), item => {
      const english = item.dbId != null ? englishNameByDbId.get(item.dbId) : undefined;
      return english ?? item.name;
    });
  }, [menuData, englishNameByDbId]);
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
          {/* The name is the mark on the door and never translates. The
              tagline under it is ordinary prose and does. */}
          <p className={styles.brandTitle}>{LANDING_BRAND_NAME}</p>
          <p className={styles.brandSubtitle}>{t('brand.tagline').toUpperCase()}</p>
        </div>
      </Link>

      <nav className={styles.nav} aria-label="Main navigation">
        {/* tableLabel stays English in context (analytics and the waiter's view
            key off it); only the word shown to the guest is localised. */}
        {tableLabel && (
          <span className={styles.tablePill} aria-label={`${t('welcome.table')}: ${tableLabel}`}>
            {tableLabel.replace(/^Table\s*/i, `${t('welcome.table')} `)}
          </span>
        )}
        {/* The cart button used to live here. The QR menu no longer takes
            orders — guests order through their waiter — so the same slot now
            carries the language switch, which is what an international guest
            actually reaches for. */}
        <button
          ref={langBtn}
          className={styles.langButton}
          onClick={() => setLangOpen(o => !o)}
          aria-label={`${t('lang.change')}: ${definition.english}`}
          aria-expanded={langOpen}
          aria-haspopup="listbox"
          title={definition.native}
        >
          <Languages size={18} />
          <span className={styles.langCode}>{definition.code.split('-')[0].toUpperCase()}</span>
          <ChevronDown size={13} className={styles.langCaret} aria-hidden />
        </button>
        <LanguageMenu anchorRef={langBtn} open={langOpen} onClose={() => setLangOpen(false)} />
        {showButchery && (
          <button
            className={styles.menuButton}
            aria-label={t('cut.title')}
            title={t('cut.title')}
            onClick={() => setButcheryOpen(true)}
          >
            <Beef size={18} />
          </button>
        )}
        {user ? (
          <Link to="/Admin" className={styles.userButton} aria-label={DEMO_MODE ? 'Admin dashboard (demo — no login required)' : `Logged in as ${user.username}`}>
            <User size={18} />
          </Link>
        ) : null}
        <button
          className={styles.menuButton}
          aria-label={t('nav.categories')}
          onClick={() => setDrawerOpen(true)}
        >
          <Menu size={18} />
        </button>
      </nav>
    </header>
  );
}
