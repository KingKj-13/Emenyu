import { useState, memo } from 'react';
import { Heart, Plus, Star, TrendingUp, Wine } from 'lucide-react';
import { resolveImage } from '../../lib/imageResolver';
import { formatPrice } from '../../lib/menuUtils';
import type { MenuItem } from '../../types/menu';
import styles from './MenuCard.module.css';

interface MenuCardProps {
  item: MenuItem;
  isFavorite: boolean;
  onFavoriteToggle: (name: string) => void;
  onAddToCart: (item: MenuItem) => void;
  onClick: (item: MenuItem) => void;
  onPairingClick?: (item: MenuItem) => void;
}

export const MenuCard = memo(function MenuCard({
  item, isFavorite, onFavoriteToggle, onAddToCart, onClick, onPairingClick
}: MenuCardProps) {
  const [imgError, setImgError] = useState(false);
  const imgSrc = imgError ? '/Trump/Images/Tomahawk.jpg' : resolveImage(item);

  return (
    <article
      className={styles.card}
      role="button"
      tabIndex={0}
      aria-label={`${item.name}, ${formatPrice(item.price)}`}
      onClick={() => onClick(item)}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onClick(item); }}
    >
      <div className={styles.imageWrap}>
        {imgSrc && (
          <img
            src={imgSrc}
            alt={item.name}
            className={styles.image}
            loading="lazy"
            onError={() => setImgError(true)}
          />
        )}
        <div className={styles.imageTint} />
        {item.chefPick && (
          <span className={styles.chipChef} aria-label="Chef's pick">
            <Star size={10} /> Chef
          </span>
        )}
        {item.popular && (
          <span className={styles.chipPopular} aria-label="Popular item">
            <TrendingUp size={10} /> Popular
          </span>
        )}
        <button
          className={`${styles.favoriteBtn} ${isFavorite ? styles.favActive : ''}`}
          aria-label={isFavorite ? `Remove ${item.name} from favourites` : `Add ${item.name} to favourites`}
          aria-pressed={isFavorite}
          onClick={e => { e.stopPropagation(); onFavoriteToggle(item.name); }}
        >
          <Heart size={15} fill={isFavorite ? 'currentColor' : 'none'} />
        </button>
        {onPairingClick && (
          <button
            className={styles.pairingBtn}
            aria-label={`Wine pairing for ${item.name}`}
            onClick={e => { e.stopPropagation(); onPairingClick(item); }}
          >
            <Wine size={13} />
          </button>
        )}
      </div>

      <div className={styles.body}>
        <h3 className={styles.name}>{item.name}</h3>
        {item.description && (
          <p className={styles.desc}>{item.description}</p>
        )}
        <div className={styles.footer}>
          <span className={styles.price}>{formatPrice(item.price)}</span>
          <button
            className={styles.addBtn}
            aria-label={`Add ${item.name} to cart`}
            onClick={e => { e.stopPropagation(); onAddToCart(item); }}
          >
            <Plus size={16} />
          </button>
        </div>
        {item.allergens && (
          <p className={styles.allergens}>{item.allergens}</p>
        )}
      </div>
    </article>
  );
});
