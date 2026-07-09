import { useState, useEffect } from 'react';
import { X, Wine } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Spinner } from '../ui/Spinner';
import { api } from '../../services/api';
import { useApp } from '../../context/AppContext';
import type { MenuItem } from '../../types/menu';
import { RecommendationCard, type RecommendationItem } from '../reco/RecommendationCard';
import styles from './PairingModal.module.css';

interface Pairing { name: string; reason: string; categoryType?: string; price?: number; img?: string; source_title?: string; chef?: boolean; }

interface PairingResult {
  title?: string;
  pairings: Pairing[];
  drinkPairings?: Pairing[];
  talkTrack?: string;
}

const DRINK_TYPES = new Set(['WINE', 'DRINK']);

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
            (() => {
              // This is the "Wine & Drink Pairing" modal — show drinks/wine only,
              // never food. Prefer the typed drinkPairings; otherwise filter.
              const drinks = (result.drinkPairings && result.drinkPairings.length)
                ? result.drinkPairings
                : (result.pairings || []).filter(p => DRINK_TYPES.has((p.categoryType || '').toUpperCase()));
              const curKey = (item?.name || '').toLowerCase().trim();
              const list = (drinks.length ? drinks : (result.pairings || []))
                .filter(p => (p.name || '').toLowerCase().trim() !== curKey);
              if (list.length === 0 && !result.talkTrack) {
                return <p className={styles.error}>No pairing suggestions available for this dish yet.</p>;
              }
              return (
                <>
                  {list.length > 0 && (
                    <div className={styles.pairings}>
                      {list.map((p, i) => (
                        <RecommendationCard
                          key={i}
                          variant="detailed"
                          showReason
                          item={p as RecommendationItem}
                          onOpen={() => { setPendingItemName(p.name); onClose(); }}
                        />
                      ))}
                    </div>
                  )}
                  {result.talkTrack && (
                    <p className={styles.talkTrack}>{result.talkTrack}</p>
                  )}
                </>
              );
            })()
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
