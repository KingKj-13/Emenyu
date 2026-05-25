import { Plus, Minus, Trash2 } from 'lucide-react';
import { formatPrice } from '../../lib/menuUtils';
import type { CartItem as CartItemType } from '../../types/cart';
import styles from './CartItem.module.css';

interface CartItemProps {
  item: CartItemType;
  index: number;
  onUpdateQty: (index: number, delta: number) => void;
  onRemove: (index: number) => void;
  onNoteChange: (index: number, note: string) => void;
}

export function CartItemRow({ item, index, onUpdateQty, onRemove, onNoteChange }: CartItemProps) {
  return (
    <div className={styles.row}>
      {item.img && (
        <img src={item.img} alt={item.name} className={styles.thumb} loading="lazy" />
      )}
      <div className={styles.info}>
        <span className={styles.name}>{item.name}</span>
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
