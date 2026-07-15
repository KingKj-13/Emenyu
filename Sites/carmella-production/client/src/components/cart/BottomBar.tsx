import { ShoppingCart, ChevronUp } from 'lucide-react';
import { useCart } from '../../hooks/useCart';
import { formatPrice } from '../../lib/menuUtils';
import styles from './BottomBar.module.css';

export function BottomBar() {
  const { count, subtotal, setIsOpen } = useCart();

  if (count === 0) return null;

  return (
    <div className={styles.bar} role="complementary" aria-label="Cart summary">
      <button
        className={styles.trigger}
        onClick={() => setIsOpen(true)}
        aria-label={`Open cart — ${count} item${count !== 1 ? 's' : ''}, ${formatPrice(subtotal)}`}
      >
        <div className={styles.left}>
          <ShoppingCart size={20} />
          <span className={styles.count}>{count} item{count !== 1 ? 's' : ''}</span>
        </div>
        <div className={styles.right}>
          <span className={styles.total}>{formatPrice(subtotal)}</span>
          <ChevronUp size={18} />
        </div>
      </button>
    </div>
  );
}
