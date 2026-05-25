import { useState, useEffect } from 'react';
import { X, Wine } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Spinner } from '../ui/Spinner';
import { api } from '../../services/api';
import { useApp } from '../../context/AppContext';
import type { MenuItem } from '../../types/menu';
import styles from './PairingModal.module.css';

interface Pairing { name: string; reason: string; }

interface PairingResult {
  title?: string;
  pairings: Pairing[];
  talkTrack?: string;
}

interface PairingModalProps {
  item: MenuItem | null;
  open: boolean;
  onClose: () => void;
}

export function PairingModal({ item, open, onClose }: PairingModalProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PairingResult | null>(null);
  const [error, setError] = useState('');
  const { setPendingItemName } = useApp();

  useEffect(() => {
    if (!open || !item) { setResult(null); setError(''); return; }
    setLoading(true);
    setResult(null);
    setError('');
    api.aiPairing({ name: item.name, price: item.price, description: item.description })
      .then((data: unknown) => {
        setResult(data as PairingResult);
      })
      .catch(() => setError('Could not load pairings. Please try again.'))
      .finally(() => setLoading(false));
  }, [open, item]);

  return (
    <Modal open={open} onClose={onClose} size="md">
      <div className={styles.inner}>
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <Wine size={18} className={styles.wineIcon} />
            <div>
              <p className={styles.eyebrow}>Wine & Drink Pairing</p>
              <h2 className={styles.title}>{item?.name}</h2>
            </div>
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className={styles.body}>
          {loading ? (
            <div className={styles.loading}>
              <Spinner size={32} />
              <p>Finding perfect pairings…</p>
            </div>
          ) : error ? (
            <p className={styles.error}>{error}</p>
          ) : result ? (
            <>
              {result.pairings?.length > 0 && (
                <div className={styles.pairings}>
                  {result.pairings.map((p, i) => (
                    <button
                      key={i}
                      className={`${styles.pairingCard} ${styles.pairingCardClickable}`}
                      onClick={() => { setPendingItemName(p.name); onClose(); }}
                      aria-label={`View ${p.name}`}
                    >
                      <div className={styles.pairingName}>{p.name}</div>
                      <p className={styles.pairingReason}>{p.reason}</p>
                    </button>
                  ))}
                </div>
              )}
              {result.talkTrack && (
                <p className={styles.talkTrack}>{result.talkTrack}</p>
              )}
            </>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
