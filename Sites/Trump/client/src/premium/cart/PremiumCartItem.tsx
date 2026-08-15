import { useEffect, useState } from 'react';
import { Plus, Minus, Trash2 } from 'lucide-react';
import { formatPrice } from '../../lib/menuUtils';
import { resolveThumbnail } from '../../lib/imageResolver';
import type { CartItem as CartItemType } from '../../types/cart';
import styles from './PremiumCartItem.module.css';

interface Props {
  item: CartItemType;
  index: number;
  onUpdateQty: (index: number, delta: number) => void;
  onRemove: (index: number) => void;
  onNoteChange: (index: number, note: string) => void;
  guestLabel?: string;
}

export function PremiumCartItem({ item, index, onUpdateQty, onRemove, onNoteChange, guestLabel }: Props) {
  const [imgError, setImgError] = useState(false);
  const imgSrc = imgError ? '' : resolveThumbnail({
    name: item.name, price: item.price, description: item.description, img: item.img,
  });

  useEffect(() => { setImgError(false); }, [item.name, item.img]);

  return (
    <div className={styles.row}>
      {imgSrc ? (
        <img src={imgSrc} alt={item.name} className={styles.thumb} loading="lazy" onError={() => setImgError(true)} />
      ) : (
        <div className={styles.thumbPh} />
      )}
      <div className={styles.info}>
        <span className={styles.name}>{item.name}</span>
        {guestLabel && <span className={styles.guestLabel}>{guestLabel}</span>}
        <span className={styles.price}>{formatPrice(item.price)} each</span>
        <input
          type="text"
          className={styles.noteInput}
          placeholder="Add a note…"
          value={item.note}
          onChange={e => onNoteChange(index, e.target.value)}
          aria-label={`Note for ${item.name}`}
        />
      </div>
      <div className={styles.controls}>
        <div className={styles.qty}>
          <button type="button" className={styles.qtyBtn} onClick={() => onUpdateQty(index, -1)} aria-label={`Decrease quantity of ${item.name}`}><Minus size={12} /></button>
          <span className={styles.qtyVal}>{item.qty}</span>
          <button type="button" className={styles.qtyBtn} onClick={() => onUpdateQty(index, 1)} aria-label={`Increase quantity of ${item.name}`}><Plus size={12} /></button>
        </div>
        <span className={styles.subtotal}>{formatPrice(item.price * item.qty)}</span>
        <button type="button" className={styles.removeBtn} onClick={() => onRemove(index)} aria-label={`Remove ${item.name}`}>
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}
