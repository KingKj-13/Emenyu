import { Link } from 'react-router-dom';
import { useRef, useState } from 'react';
import { Menu, Languages, User, ChefHat, ChevronDown } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useI18n } from '../../i18n';
import { LANDING_BRAND_NAME, BRAND_TAGLINE, DEMO_MODE } from '../../constants/api';
import { DayNightToggle } from './DayNightToggle';
import { LanguageMenu } from '../language/LanguageMenu';
import styles from './Header.module.css';

export function Header() {
  const { tableId, tableLabel, user, setDrawerOpen, dayParts } = useApp();
  const { definition, t } = useI18n();
  const langBtn = useRef<HTMLButtonElement>(null);
  const [langOpen, setLangOpen] = useState(false);
  // Carmella-only: tenants with no day-part engine get [] from the server
  // (see AppContext.tsx), so this is false for Trump/Demo and their existing
  // Book view / Waiter dashboard icon is untouched.
  const hasDayNightToggle = dayParts.length > 0;
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
