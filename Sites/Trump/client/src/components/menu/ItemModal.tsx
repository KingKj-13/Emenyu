import { useState, useEffect } from 'react';
import { X, Heart, Plus, Minus, ShoppingCart, Wine } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Badge } from '../ui/Badge';
import { Spinner } from '../ui/Spinner';
import { resolveImage, resolveVideo } from '../../lib/imageResolver';
import { formatPrice } from '../../lib/menuUtils';
import { api } from '../../services/api';
import { useApp } from '../../context/AppContext';
import type { MenuItem } from '../../types/menu';
import styles from './ItemModal.module.css';

interface ItemModalProps {
  item: MenuItem | null;
  open: boolean;
  onClose: () => void;
  isFavorite: boolean;
  onFavoriteToggle: (name: string) => void;
  onAddToCart: (item: MenuItem, qty: number, note: string) => void;
}

interface PairingResult {
  pairings?: { name: string; reason: string }[];
}

function DrinkPairings({ item }: { item: MenuItem }) {
  const [pairings, setPairings] = useState<{ name: string; reason: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const { setPendingItemName } = useApp();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setPairings([]);
    api.aiPairing({ name: item.name, price: item.price, description: item.description })
      .then((data: unknown) => {
        if (cancelled) return;
        const res = data as PairingResult;
        if (res?.pairings?.length) setPairings(res.pairings);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [item.name]);

  if (!loading && pairings.length === 0) return null;

  return (
    <div className={styles.pairSection}>
      <div className={styles.pairHeader}>
        <Wine size={13} className={styles.pairIcon} />
        <span className={styles.pairLabel}>Pair With</span>
      </div>
      {loading ? (
        <div className={styles.pairLoading}><Spinner size={16} /></div>
      ) : (
        <div className={styles.pairStrip}>
          {pairings.map((p, i) => (
            <button
              key={i}
              className={styles.pairChip}
              onClick={() => setPendingItemName(p.name)}
              aria-label={`View ${p.name}`}
            >
              <span className={styles.pairName}>{p.name}</span>
              <span className={styles.pairReason}>{p.reason}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ItemModal({ item, open, onClose, isFavorite, onFavoriteToggle, onAddToCart }: ItemModalProps) {
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState('');
  const [imgError, setImgError] = useState(false);

  if (!item) return null;

  const imgSrc = imgError ? '/Trump/Images/Tomahawk.jpg' : resolveImage(item);
  const videoSrc = resolveVideo(item);

  function handleAdd() {
    onAddToCart(item!, qty, note);
    setQty(1);
    setNote('');
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} size="lg">
      <div className={styles.modal}>
        <div className={styles.media}>
          {videoSrc ? (
            <video src={videoSrc} autoPlay muted loop playsInline className={styles.video} />
          ) : imgSrc ? (
            <img
              src={imgSrc}
              alt={item.name}
              className={styles.image}
              onError={() => setImgError(true)}
            />
          ) : null}
          <div className={styles.mediaTint} />
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
          <button
            className={`${styles.favBtn} ${isFavorite ? styles.favActive : ''}`}
            onClick={() => onFavoriteToggle(item.name)}
            aria-label={isFavorite ? 'Remove from favourites' : 'Add to favourites'}
            aria-pressed={isFavorite}
          >
            <Heart size={18} fill={isFavorite ? 'currentColor' : 'none'} />
          </button>
        </div>

        <div className={styles.body}>
          <div className={styles.chips}>
            {item.chefPick && <Badge variant="gold">Chef's Pick</Badge>}
            {item.popular && <Badge variant="red">Popular</Badge>}
            {item.spice && <Badge variant="muted">{item.spice}</Badge>}
          </div>

          <h2 className={styles.name}>{item.name}</h2>
          <p className={styles.price}>{formatPrice(item.price)}</p>

          {item.description && (
            <p className={styles.description}>{item.description}</p>
          )}

          {item.allergens && (
            <p className={styles.allergens}>
              <strong>Contains:</strong> {item.allergens}
            </p>
          )}

          {item.calories && (
            <p className={styles.calories}>{item.calories}</p>
          )}

          {open && <DrinkPairings item={item} />}

          <div className={styles.actions}>
            <div className={styles.qtyRow}>
              <button
                className={styles.qtyBtn}
                onClick={() => setQty(q => Math.max(1, q - 1))}
                aria-label="Decrease quantity"
              >
                <Minus size={16} />
              </button>
              <span className={styles.qtyValue} aria-live="polite">{qty}</span>
              <button
                className={styles.qtyBtn}
                onClick={() => setQty(q => q + 1)}
                aria-label="Increase quantity"
              >
                <Plus size={16} />
              </button>
            </div>

            <textarea
              className={styles.noteInput}
              placeholder="Special requests or dietary notes…"
              value={note}
              onChange={e => setNote(e.target.value)}
              rows={2}
              aria-label="Special notes for this item"
            />

            <button className={styles.addBtn} onClick={handleAdd} aria-label={`Add ${qty} ${item.name} to cart`}>
              <ShoppingCart size={18} />
              Add {qty > 1 ? `${qty} × ` : ''}{formatPrice(item.price * qty)}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
