import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowRight, Menu, Sun, Moon, Home, UserRound, Leaf, ChefHat, Heart, Users } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useTheme } from '../context/ThemeContext';
import { LANDING_BRAND_NAME } from '../constants/api';
import { useScrollReveal } from '../hooks/useScrollReveal';
import { resolveThumbnail } from '../lib/imageResolver';
import styles from './LandingPage.module.css';

const HERO_IMAGE = 'Images/048_bordeaux_flame.webp';
const CARMELLA_IMAGE = 'Images/162_irish_coffee.webp';
const MENU_CTA_IMAGE = 'Images/038_como_basilico.webp';

const VALUE_PROPS = [
  { icon: Leaf, label: 'Fresh Ingredients' },
  { icon: ChefHat, label: 'Made with Care' },
  { icon: Heart, label: 'Made for Moments' },
  { icon: Users, label: 'Made for You' },
];

function bg(path: string) {
  return resolveThumbnail({ name: '', price: 0, img: path });
}

// Home's only job is to welcome the guest, tell the two-line story of the
// house, and get them into the menu as fast as possible -- Deal of the Day /
// Combo Offers / Happy Hour / Promotions and all category navigation live
// exclusively on the Menu page now (see MenuPage.tsx's promotional hub).
export function LandingPage() {
  const { tableId: paramTableId } = useParams<{ tableId: string }>();
  const navigate = useNavigate();
  const { setTableId } = useApp();
  const { theme } = useTheme();
  const tableId = paramTableId || 'table1';
  const tableLabel = tableId.replace(/^table/i, 'Table ');

  const carmellaReveal = useScrollReveal<HTMLDivElement>();
  const gaspardReveal = useScrollReveal<HTMLDivElement>();

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
          <Menu size={19} />
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
          {theme?.activeTheme === 'night' ? <Moon size={17} /> : <Sun size={17} />}
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
            <span className={styles.tableDot} /> {tableLabel} · Browse the Menu
          </button>
        </div>
      </section>

      <section className={styles.story}>
        <div ref={carmellaReveal.ref} className={`${styles.storyCard} ${carmellaReveal.revealed ? styles.storyRevealed : ''}`}>
          <img src={bg(CARMELLA_IMAGE)} alt="" className={styles.storyImage} />
          <div className={styles.storyText}>
            <span className={styles.storyIcon} aria-hidden><Home size={17} /></span>
            <span className={styles.storyEyebrow}>About Carmella</span>
            <p className={styles.storyBody}>
              Carmella is a European café built on an old idea: that a good table can hold a whole
              evening. Long lunches, shared plates, unhurried mornings — in the heart of Cedar
              Square, we've built a room for exactly that.
            </p>
          </div>
        </div>

        <div ref={gaspardReveal.ref} className={`${styles.storyCard} ${styles.storyCardReverse} ${gaspardReveal.revealed ? styles.storyRevealed : ''}`}>
          <div className={styles.storyText}>
            <span className={styles.storyIcon} aria-hidden><UserRound size={17} /></span>
            <span className={styles.storyEyebrow}>About Sir Gaspard</span>
            <p className={styles.storyBody}>
              In 1948, a young man opened his first café in post-war Europe and named it for the
              feeling he wanted every guest to carry home: gentleness, grace, and good
              conversation. We call him Sir Gaspard — the spirit of this house.
            </p>
          </div>
          <div className={styles.storyMonogram} aria-hidden>SG</div>
        </div>
      </section>

      <section className={styles.ctaSection}>
        <button className={styles.cta} onClick={goToMenu}>
          <div className={styles.ctaText}>
            <span className={styles.ctaEyebrow}>Explore. Indulge. Enjoy.</span>
            <span className={styles.ctaTitle}>Browse the Full Menu</span>
            <span className={styles.ctaSub}>Every dish, pour and pairing curated for your experience.</span>
          </div>
          <img src={bg(MENU_CTA_IMAGE)} alt="" className={styles.ctaImage} />
          <span className={styles.ctaArrow} aria-hidden>
            <ArrowRight size={20} />
          </span>
        </button>
      </section>

      <footer className={styles.valueFooter}>
        {VALUE_PROPS.map(({ icon: Icon, label }, i) => (
          <div className={styles.valueItem} key={label}>
            <Icon size={16} />
            <span>{label}</span>
            {i < VALUE_PROPS.length - 1 && <span className={styles.valueDivider} aria-hidden />}
          </div>
        ))}
      </footer>
    </div>
  );
}
