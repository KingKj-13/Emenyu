import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { LANDING_BRAND_NAME } from '../constants/api';
import styles from './LandingPage.module.css';

// Home's only job is to welcome the guest, tell the two-line story of the
// house, and get them into the menu as fast as possible -- Deal of the Day /
// Specials / Happy Hour / Promotions and all category navigation live
// exclusively on the Menu page now (see MenuPage.tsx's promotional hub).
export function LandingPage() {
  const { tableId: paramTableId } = useParams<{ tableId: string }>();
  const navigate = useNavigate();
  const { setTableId } = useApp();
  const tableId = paramTableId || 'table1';
  const tableLabel = tableId.replace(/^table/i, 'Table ');

  useEffect(() => {
    if (paramTableId) setTableId(paramTableId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramTableId]);

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <header className={styles.header}>
          <span className={styles.monogram} aria-hidden>{LANDING_BRAND_NAME.charAt(0)}</span>
          <span className={styles.eyebrow}>Welcome to</span>
          <h1 className={styles.brand}>{LANDING_BRAND_NAME}</h1>
          <div className={styles.pill}>
            <span className={styles.dot} /> {tableLabel} · Browse the menu
          </div>
        </header>

        <section className={styles.storyCard}>
          <span className={styles.storyEyebrow}>About Carmella</span>
          <p className={styles.storyBody}>
            Carmella is a European café built on an old idea: that a good table can hold a whole
            evening. Long lunches, shared plates, unhurried mornings — in the heart of Cedar
            Square, we've built a room for exactly that, filled with dishes worth lingering over.
          </p>
        </section>

        <section className={styles.storyCard}>
          <span className={styles.storyEyebrow}>About Sir Gaspard</span>
          <p className={styles.storyBody}>
            In 1948, a young man opened his first café in post-war Europe and named it for the
            feeling he wanted every guest to carry home: gentleness, grace, and good conversation.
            We call him Sir Gaspard — the spirit of this house, and still the host who greets you
            at the table.
          </p>
        </section>

        <button className={styles.cta} onClick={() => navigate(`/${tableId}/menu`)}>
          <span className={styles.ctaText}>
            <span className={styles.ctaTitle}>Browse the Full Menu</span>
            <span className={styles.ctaSub}>Every dish, pour and pairing</span>
          </span>
          <span className={styles.ctaArrow} aria-hidden>
            <ArrowRight size={22} />
          </span>
        </button>
      </div>
    </div>
  );
}
