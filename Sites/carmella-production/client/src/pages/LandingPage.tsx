import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowRight, Menu, Sun, Moon, Home, UserRound, Leaf, ChefHat, Heart, Users } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useTheme } from '../context/ThemeContext';
import { LANDING_BRAND_NAME } from '../constants/api';
import { resolveThumbnail } from '../lib/imageResolver';
import styles from './LandingPage.module.css';

const HERO_IMAGE = 'Images/048_bordeaux_flame.webp';
const MENU_CTA_IMAGE = 'Images/038_como_basilico.webp';

const VALUE_PROPS = [
  { icon: Leaf, label: 'Fresh' },
  { icon: ChefHat, label: 'Care' },
  { icon: Heart, label: 'Moments' },
  { icon: Users, label: 'You' },
];

function bg(path: string) {
  return resolveThumbnail({ name: '', price: 0, img: path });
}

// Home's only job is to welcome the guest, tell the two-line story of the
// house, and get them into the menu as fast as possible -- Deal of the Day /
// Combo Offers / Happy Hour / Promotions and all category navigation live
// exclusively on the Menu page now (see MenuPage.tsx's promotional hub).
//
// Deliberately a fixed, single-viewport layout (position:fixed + internal
// flex sizing, NOT a scrollable page) -- every section below is sized as a
// share of 100dvh rather than its own natural content height, and compacts
// further at short-viewport breakpoints, so the whole page is always
// visible at once with no scrolling on any real phone.
export function LandingPage() {
  const { tableId: paramTableId } = useParams<{ tableId: string }>();
  const navigate = useNavigate();
  const { setTableId } = useApp();
  const { theme } = useTheme();
  const tableId = paramTableId || 'table1';
  const tableLabel = tableId.replace(/^table/i, 'Table ');

  useEffect(() => {
    if (paramTableId) setTableId(paramTableId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramTableId]);

  function goToMenu() {
    navigate(`/${tableId}/menu`);
  }

  return (
    <div className={styles.page}>
      <header className={styles.topBar}>
        <button type="button" className={styles.topBarIcon} onClick={goToMenu} aria-label="Browse the menu">
          <Menu size={17} />
        </button>
        <div className={styles.topBarBrand}>
          <span className={styles.topBarWordmark}>{LANDING_BRAND_NAME}</span>
          <span className={styles.topBarSubtitle}>By Sir Gaspard</span>
        </div>
        {/* Theme is set by the restaurant (Admin), never by an individual
            guest's device -- the customer menu and Admin always show the
            same theme (see ThemeContext). This is a status indicator, not a
            toggle, so it never lets one guest change what everyone sees. */}
        <span className={styles.topBarIcon} aria-hidden title={theme?.activeTheme === 'night' ? 'Night' : 'Day'}>
          {theme?.activeTheme === 'night' ? <Moon size={15} /> : <Sun size={15} />}
        </span>
      </header>

      <section className={styles.hero}>
        <img src={bg(HERO_IMAGE)} alt="" className={styles.heroImage} />
        <div className={styles.heroTint} />
        <div className={styles.heroContent}>
          <span className={styles.monogramRing} aria-hidden>{LANDING_BRAND_NAME.charAt(0)}</span>
          <span className={styles.eyebrow}>Welcome to</span>
          <h1 className={styles.wordmark}>{LANDING_BRAND_NAME}</h1>
          <p className={styles.tagline}>A table for every moment</p>
          <button type="button" className={styles.tablePill} onClick={goToMenu}>
            <span className={styles.tableDot} /> {tableLabel} · Shared Cart
          </button>
        </div>
      </section>

      <div className={styles.midRow}>
        <section className={styles.about}>
          <div className={styles.aboutCol}>
            <span className={styles.aboutIcon} aria-hidden><Home size={15} /></span>
            <span className={styles.aboutEyebrow}>About Carmella</span>
            <p className={styles.aboutBody}>A European café where a good table holds a whole evening.</p>
          </div>
          <div className={styles.aboutDivider} aria-hidden />
          <div className={styles.aboutCol}>
            <span className={styles.aboutIcon} aria-hidden><UserRound size={15} /></span>
            <span className={styles.aboutEyebrow}>About Sir Gaspard</span>
            <p className={styles.aboutBody}>Founded 1948 on gentleness, grace, and good conversation.</p>
          </div>
        </section>

        <section className={styles.ctaSection}>
          <button className={styles.cta} onClick={goToMenu}>
            <img src={bg(MENU_CTA_IMAGE)} alt="" className={styles.ctaImage} />
            <div className={styles.ctaText}>
              <span className={styles.ctaTitle}>Browse the Full Menu</span>
              <span className={styles.ctaSub}>Every dish, pour and pairing</span>
            </div>
            <span className={styles.ctaArrow} aria-hidden>
              <ArrowRight size={18} />
            </span>
          </button>
        </section>
      </div>

      <footer className={styles.valueFooter}>
        {VALUE_PROPS.map(({ icon: Icon, label }, i) => (
          <div className={styles.valueItem} key={label}>
            <Icon size={13} />
            <span>{label}</span>
            {i < VALUE_PROPS.length - 1 && <span className={styles.valueDivider} aria-hidden />}
          </div>
        ))}
      </footer>
    </div>
  );
}
