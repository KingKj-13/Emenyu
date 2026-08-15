import { useEffect, type CSSProperties } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Beef, Fish, Salad, UtensilsCrossed, Wine, Sparkles, Martini, ArrowRight, Coffee, GlassWater } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useHomeBackGuard } from '../hooks/useHomeBackGuard';
import { useI18n } from '../i18n';
import type { MessageKey } from '../i18n/messages/en';
import { LANDING_BRAND_NAME, BRAND_TAGLINE, MAINS_CATEGORY_TITLE, RESTAURANT_ID } from '../constants/api';
import styles from './LandingPage.module.css';

const sec = (t: string, s: string) => `/${t}/menu?section=${encodeURIComponent(s)}`;
const drink = (t: string, s: string) => `/${t}/drinks?section=${encodeURIComponent(s)}`;

interface Category {
  key: string;
  /** Fallback wording. Tenants with a translated catalogue set `labelKey`
   *  instead and this is only used when no key is given (Carmella). */
  label: string;
  sub: string;
  labelKey?: MessageKey;
  subKey?: MessageKey;
  glow: string;
  icon: typeof Beef;
  to: (t: string) => string;
  external?: boolean;
}

// 2×3 chooser grid (matches the phone-fit opening). Butchery lives as a footer link.
// Glow alphas are normalized so every tile reads at the same tint STRENGTH
// regardless of how saturated its underlying hue is (purple/orange naturally
// read stronger than olive/green at equal alpha — see the alpha inversely
// scaled to each color's HSL saturation, tuned around the wine tile's alpha).
const TRUMP_CATEGORIES: Category[] = [
  { key: 'wine', label: 'Wine', sub: 'The cellar', labelKey: 'landing.wine', subKey: 'landing.wineSub', glow: 'rgba(122, 64, 130, 0.32)', icon: Wine, to: t => drink(t, 'Red Wine') },
  { key: 'cocktails', label: 'Cocktails', sub: 'Signature pours', labelKey: 'landing.cocktails', subKey: 'landing.cocktailsSub', glow: 'rgba(162, 102, 42, 0.19)', icon: Martini, to: t => drink(t, 'Cocktails') },
  { key: 'setmenu', label: 'Set Menu', sub: 'Curated combos', labelKey: 'landing.setMenu', subKey: 'landing.setMenuSub', glow: 'rgba(128, 118, 52, 0.26)', icon: Sparkles, to: t => `/${t}/setmenu` },
  { key: 'mains', label: 'Mains', sub: 'Steaks, seafood and grill', labelKey: 'landing.mains', subKey: 'landing.mainsSub', glow: 'rgba(150, 72, 38, 0.19)', icon: Beef, to: t => sec(t, MAINS_CATEGORY_TITLE) },
  { key: 'starters', label: 'Starters', sub: 'To begin', labelKey: 'landing.starters', subKey: 'landing.startersSub', glow: 'rgba(74, 122, 78, 0.45)', icon: Salad, to: t => sec(t, 'Starters') },
  { key: 'sushi', label: 'Sushi & Sashimi', sub: 'From the sea', labelKey: 'landing.sushi', subKey: 'landing.sushiSub', glow: 'rgba(58, 112, 152, 0.25)', icon: Fish, to: t => sec(t, 'Sushi') },
];

// Carmella's own chapters (demo validation report Bug C-1 — the welcome
// screen previously showed Trump's steakhouse tiles verbatim: Wine,
// Cocktails, Set Menu, Mains, Starters, Sushi & Sashimi. Carmella serves
// none of that). Deep-links use the food route (`sec`, not `drink`) for
// every tile — Carmella has no separate drinks page; MenuPage's own
// Day/Night filtering already governs what's visible once there. Section
// values are the real top-level chapter titles from the live menu so
// MenuPage's focusSection scroll (exact-then-fuzzy title match) finds them.
// Priority 1 (demo blocker pass 2) — labels here are the compact TILE display
// form only; the deep link's section title (the `to` field) still targets the
// real, full chapter name so MenuPage's title-match scrolling is unaffected.
// The 3-word forms ("The Global Table", "The Gaspard Cellar", "The Memory
// Course", "The Morning Pages") reliably wrapped to 3 physical lines at this
// tile width/font-size, and -webkit-line-clamp:2 then truncated that third
// line with "..." -- worse, on most real phone viewport heights (see
// LandingPage.module.css's .tile comment) the tile itself is shorter than
// even that clamped 2-line box needs, so the clamped fragment's own top line
// clips off too, leaving only a trailing word + ellipsis visible (e.g.
// "Morning..."). Dropping the leading "The" (matching the precedent already
// set by "Family's Toast" below) reliably keeps every label to 2 words / 2
// lines, matching what the tile actually has room for.
const CARMELLA_CATEGORIES: Category[] = [
  { key: 'global-table', label: 'Global Table', sub: 'Starters, pasta, fish & mains', glow: 'rgba(150, 72, 38, 0.19)', icon: UtensilsCrossed, to: t => sec(t, 'The Global Table') },
  { key: 'cellar', label: 'Gaspard Cellar', sub: 'Champagne, wine & spirits', glow: 'rgba(122, 64, 130, 0.32)', icon: Wine, to: t => sec(t, 'The Gaspard Cellar') },
  { key: 'familys-toast', label: "Family's Toast", sub: 'Cocktails & celebration', glow: 'rgba(162, 102, 42, 0.19)', icon: Martini, to: t => sec(t, "The Family's Toast") },
  { key: 'memory-course', label: 'Memory Course', sub: 'Desserts', glow: 'rgba(128, 118, 52, 0.26)', icon: Sparkles, to: t => sec(t, 'The Memory Course') },
  { key: 'morning-pages', label: 'Morning Pages', sub: 'Breakfast & brunch', glow: 'rgba(74, 122, 78, 0.45)', icon: Coffee, to: t => sec(t, 'The Morning Pages') },
  { key: 'slow-drinks', label: 'Slow Drinks', sub: 'Coffee, juices & shakes', glow: 'rgba(58, 112, 152, 0.25)', icon: GlassWater, to: t => sec(t, 'Slow Drinks') },
];

const CATEGORIES: Category[] = RESTAURANT_ID === 'carmella' ? CARMELLA_CATEGORIES : TRUMP_CATEGORIES;

// Trump's footer link used to deep-link at a menu section literally called
// "Butchery" — there has never been one in the live data, so the tile scrolled
// nowhere. It now opens the interactive butchery chart instead, which is what
// "Grillhouse & Butchery" was always pointing at. Carmella is untouched.
const FOOTER_LINK: { label: string; labelKey?: MessageKey; to: (t: string) => string } =
  RESTAURANT_ID === 'carmella'
    ? { label: 'The Interludes', to: t => sec(t, 'The Interludes') }
    : { label: 'The Butchery', labelKey: 'landing.butchery', to: t => `/${t}/butchery` };

export function LandingPage() {
  const { tableId: paramTableId } = useParams<{ tableId: string }>();
  const navigate = useNavigate();
  const { setTableId } = useApp();
  const { t } = useI18n();
  const tableId = paramTableId || 'table1';
  // "table7" -> "<localised word for Table> 7". The number is the only part the
  // guest matches against the physical table, so it never moves.
  const tableLabel = tableId.replace(/^table\s*/i, `${t('welcome.table')} `);
  useHomeBackGuard({ isHome: true });

  useEffect(() => {
    if (paramTableId) setTableId(paramTableId);
    // setTableId is stable from context; intentionally excluded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramTableId]);

  function go(c: Category) {
    if (c.external) window.location.href = c.to(tableId);
    else navigate(c.to(tableId));
  }

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <header className={styles.header}>
          <span className={styles.monogram} aria-hidden>{LANDING_BRAND_NAME.charAt(0)}</span>
          <span className={styles.eyebrow}>{t('welcome.eyebrow')}</span>
          {/* The brand NAME is the one thing that stays English everywhere. */}
          <h1 className={styles.brand}>{LANDING_BRAND_NAME}</h1>
          <div className={styles.brandSub}>
            {RESTAURANT_ID === 'carmella' ? BRAND_TAGLINE : t('brand.tagline')}
          </div>
          <div className={styles.pill}>
            <span className={styles.dot} /> {tableLabel} {t('welcome.pill')}
          </div>
        </header>

        <button className={styles.cta} onClick={() => navigate(`/${tableId}/menu`)}>
          <span className={styles.ctaText}>
            <span className={styles.ctaTitle}>{t('welcome.browseAll')}</span>
            <span className={styles.ctaSub}>{t('welcome.browseAllSub')}</span>
          </span>
          <span className={styles.ctaArrow} aria-hidden>
            <ArrowRight size={22} />
          </span>
        </button>

        <div className={styles.grid}>
          {CATEGORIES.map((c, i) => {
            const Icon = c.icon;
            return (
              <button
                key={c.key}
                className={styles.tile}
                style={{ '--glow': c.glow, '--stagger': i } as CSSProperties}
                onClick={() => go(c)}
              >
                <span className={styles.glow} aria-hidden />
                <span className={styles.icon} aria-hidden><Icon size={24} /></span>
                <span className={styles.tileText}>
                  <span className={styles.tileLabel}><span className={styles.tileLabelText}>{c.labelKey ? t(c.labelKey) : c.label}</span></span>
                  <span className={styles.tileSub}>{c.subKey ? t(c.subKey) : c.sub}</span>
                </span>
              </button>
            );
          })}
        </div>

        <a className={styles.footer} href={FOOTER_LINK.to(tableId)} onClick={e => { e.preventDefault(); navigate(FOOTER_LINK.to(tableId)); }}>
          <span className={styles.butchery}><UtensilsCrossed size={11} /> {FOOTER_LINK.labelKey ? t(FOOTER_LINK.labelKey) : FOOTER_LINK.label}</span>
        </a>
      </div>
    </div>
  );
}
