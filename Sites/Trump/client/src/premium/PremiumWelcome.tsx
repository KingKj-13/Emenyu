import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { LANDING_BRAND_NAME, BRAND_TAGLINE, BASE_PATH } from '../constants/api';
import './theme.css';
import styles from './PremiumWelcome.module.css';

const HERO_IMAGE = `${BASE_PATH}/Images/tomahawk_850g_900g.jpg`;

export function PremiumWelcome() {
  const { tableId: paramTableId } = useParams<{ tableId: string }>();
  const navigate = useNavigate();
  const { setTableId, tableLabel } = useApp();
  const tableId = paramTableId || 'table1';

  useEffect(() => {
    if (paramTableId) setTableId(paramTableId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramTableId]);

  return (
    <div className="premiumRoot">
      <div className={styles.stage}>
        <div className={styles.imgWrap}>
          <img src={HERO_IMAGE} alt="" className={styles.img} />
        </div>
        <div className={styles.scrim} />

        <div className={styles.topRow}>
          <div className={styles.monogram} aria-hidden>{LANDING_BRAND_NAME.charAt(0)}</div>
        </div>

        <div className={styles.bottom}>
          <div className={styles.rise1}>
            <div className={styles.greeting}>Good evening — {tableLabel}</div>
            <h1 className={styles.title}>{LANDING_BRAND_NAME}</h1>
            <div className={styles.taglineRow}>
              <div className={styles.rule} />
              <div className={styles.tagline}>{BRAND_TAGLINE}</div>
            </div>
          </div>
          <div className={styles.rise2}>
            <button className={styles.cta} onClick={() => navigate(`/${tableId}/menu`)}>
              View the Menu
            </button>
            <div className={styles.subtext}>Your order reaches the kitchen the moment you send it</div>
          </div>
        </div>
      </div>
    </div>
  );
}
