import { memo } from 'react';
import { Plus, Wine } from 'lucide-react';
import { resolveImage } from '../../lib/imageResolver';
import { formatPrice } from '../../lib/menuUtils';
import type { MenuItem } from '../../types/menu';
import styles from './BookPage.module.css';

interface BookPageProps {
  title: string;
  items: MenuItem[];
  onItemClick: (item: MenuItem) => void;
  onAddToCart: (item: MenuItem) => void;
  onPairingClick?: (item: MenuItem) => void;
}

export const BookPage = memo(function BookPage({ title, items, onItemClick, onAddToCart, onPairingClick }: BookPageProps) {
  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h2 className={styles.pageTitle}>{title}</h2>
        <div className={styles.pageDivider} />
      </div>
      <div className={styles.itemList}>
        {items.slice(0, 6).map((item, i) => (
          <BookItem
            key={`${item.name}-${i}`}
            item={item}
            onItemClick={onItemClick}
            onAddToCart={onAddToCart}
            onPairingClick={onPairingClick}
          />
        ))}
      </div>
      <div className={styles.pageCorner} aria-hidden="true" />
    </div>
  );
});

function BookItem({ item, onItemClick, onAddToCart, onPairingClick }: {
  item: MenuItem;
  onItemClick: (item: MenuItem) => void;
  onAddToCart: (item: MenuItem) => void;
  onPairingClick?: (item: MenuItem) => void;
}) {
  const imgSrc = resolveImage(item);

  return (
    <div
      className={styles.item}
      role="button"
      tabIndex={0}
      onClick={() => onItemClick(item)}
      onKeyDown={e => { if (e.key === 'Enter') onItemClick(item); }}
      aria-label={`${item.name}, ${formatPrice(item.price)}`}
    >
      {imgSrc && (
        <div className={styles.thumb}>
          <img src={imgSrc} alt={item.name} loading="lazy" className={styles.thumbImg} />
        </div>
      )}
      <div className={styles.info}>
        <span className={styles.name}>{item.name}</span>
        {item.description && <span className={styles.desc}>{item.description}</span>}
        <span className={styles.price}>{formatPrice(item.price)}</span>
      </div>
      <button
        className={styles.addBtn}
        aria-label={`Add ${item.name}`}
        onClick={e => { e.stopPropagation(); onAddToCart(item); }}
      >
        <Plus size={13} />
      </button>
      {onPairingClick && (
        <button
          className={styles.pairingBtn}
          aria-label={`Wine pairing for ${item.name}`}
          onClick={e => { e.stopPropagation(); onPairingClick(item); }}
        >
          <Wine size={11} />
        </button>
      )}
    </div>
  );
}
