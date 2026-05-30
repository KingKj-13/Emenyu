import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import styles from './LandingPage.module.css';

export function LandingPage() {
  const { tableId: paramTableId } = useParams<{ tableId: string }>();
  const navigate = useNavigate();
  const { setTableId } = useApp();
  const tableId = paramTableId || 'table1';
  const [showHint, setShowHint] = useState(false);

  useEffect(() => {
    if (paramTableId) setTableId(paramTableId);
    const t = window.setTimeout(() => setShowHint(true), 1500);
    return () => window.clearTimeout(t);
    // setTableId is stable from context; intentionally excluded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramTableId]);

  function enter() {
    navigate(`/${tableId}/menu`);
  }

  return (
    <div
      className={styles.screen}
      onClick={enter}
      role="button"
      tabIndex={0}
      aria-label="Tap to enter the menu"
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') enter(); }}
    >
      <span className={`${styles.hint} ${showHint ? styles.show : ''}`}>Tap to begin</span>
    </div>
  );
}
