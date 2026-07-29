import { useEffect, useState } from 'react';
import { Plus, Minus, Trash2 } from 'lucide-react';
import { formatPrice } from '../../lib/menuUtils';
import { resolveThumbnail } from '../../lib/imageResolver';
import type { CartItem as CartItemType } from '../../types/cart';
import styles from './CartItem.module.css';

interface CartItemProps {
  item: CartItemType;
  index: number;
  onUpdateQty: (index: number, delta: number) => void;
  onRemove: (index: number) => void;
  onNoteChange: (index: number, note: string) => void;
  // Device Awareness: which guest at this table added this line — only ever
  // passed when the table has more than one distinct device ordering (see
  // CartDrawer.tsx), so a solo diner's cart never shows a redundant label.
  guestLabel?: string;
}

export function CartItemRow({ item, index, onUpdateQty, onRemove, onNoteChange, guestLabel }: CartItemProps) {
  const [imgError, setImgError] = useState(false);
  // 60x60 slot — the thumbnail, not the full-res image.
  const imgSrc = imgError ? '' : resolveThumbnail({
    name: item.name,
    price: item.price,
    description: item.description,
    img: item.img,
  });

  useEffect(() => {
    setImgError(false);
  }, [item.name, item.img]);

  return (
    <div className={styles.row}>
      {imgSrc && (
        <img
          src={imgSrc}
          alt={item.name}
          className={styles.thumb}
          loading="lazy"
          onError={() => setImgError(true)}
        />
      )}
      <div className={styles.info}>
        <span className={styles.name}>{item.name}</span>
        {guestLabel && <span className={styles.guestLabel}>{guestLabel}</span>}
        <span className={styles.price}>{formatPrice(item.price)}</span>
        <input
          type="text"
          className={styles.noteInput}
          placeholder="Add note…"
          value={item.note}
          onChange={e => onNoteChange(index, e.target.value)}
          aria-label={`Note for ${item.name}`}
        />
      </div>
      <div className={styles.controls}>
        <div className={styles.qty}>
          <button onClick={() => onUpdateQty(index, -1)} aria-label={`Decrease quantity of ${item.name}`}><Minus size={13} /></button>
          <span>{item.qty}</span>
          <button onClick={() => onUpdateQty(index, 1)} aria-label={`Increase quantity of ${item.name}`}><Plus size={13} /></button>
        </div>
        <span className={styles.subtotal}>{formatPrice(item.price * item.qty)}</span>
        <button className={styles.removeBtn} onClick={() => onRemove(index)} aria-label={`Remove ${item.name}`}>
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}
