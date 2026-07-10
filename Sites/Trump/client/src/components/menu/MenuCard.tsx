import { useEffect, useRef, useState, memo } from 'react';
import { Heart, Plus, Star, Sparkles, Wine, Video } from 'lucide-react';
import { resolveImage, resolveThumbnail, resolveVideo, FALLBACK_IMAGE } from '../../lib/imageResolver';
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
  // Cards load the 300px thumbnail; if it's missing fall back to the full
  // image, then to the brand fallback (step 0 → 1 → 2).
  const [imgStep, setImgStep] = useState(0);
  const cardRef = useRef<HTMLElement | null>(null);
  const thumbSrc = resolveThumbnail(item);
  const fullSrc = resolveImage(item);
  const imgSrc = imgStep === 0 ? thumbSrc : imgStep === 1 && fullSrc !== thumbSrc ? fullSrc : FALLBACK_IMAGE;
  const soldOut = item.available === false;
  const hasVideo = !!resolveVideo(item);

  useEffect(() => {
    setImgStep(0);
  }, [item.name]);

  return (
    <article
      ref={cardRef}
      className={`${styles.card} ${soldOut ? styles.cardSoldOut : ''}`}
      role="button"
      tabIndex={0}
      aria-label={`${item.name}, ${formatPrice(item.price)}${soldOut ? ', sold out' : ''}`}
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
            decoding="async"
            width={600}
            height={400}
            onError={() => setImgStep(step => (step < 2 ? step + 1 : step))}
          />
        )}
        <div className={styles.imageTint} />
        {soldOut && (
          <div className={styles.soldOutOverlay}>
            <span className={styles.soldOutBadge}>Sold Out</span>
          </div>
        )}
        {!soldOut && item.chefPick && (
          <span className={styles.chipChef} aria-label="Chef's pick">
            <Star size={10} /> Chef Recommends
          </span>
        )}
        {!soldOut && item.popular && (
          <span className={styles.chipAi} aria-label="Guest favourite">
            <Sparkles size={10} /> Guest Favourite
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
        {!soldOut && onPairingClick && (
          <button
            className={styles.pairingBtn}
            aria-label={`Wine pairing for ${item.name}`}
            onClick={e => { e.stopPropagation(); onPairingClick(item); }}
          >
            <Wine size={13} />
          </button>
        )}
        {!soldOut && hasVideo && (
          <span className={styles.videoBadge} title="Video available" aria-hidden="true">
            <Video size={11} />
          </span>
        )}
      </div>

      <div className={styles.body}>
        <h3 className={styles.name}>
          {item.name}
          {item.chefPick && <span className={styles.goldDot} aria-hidden="true" />}
        </h3>
        {item.description && (
          <p className={styles.desc}>{item.description}</p>
        )}
        <div className={styles.footer}>
          <span className={styles.price}>{formatPrice(item.price)}</span>
          <button
            className={styles.addBtn}
            aria-label={soldOut ? `${item.name} is sold out` : `Add ${item.name} to cart`}
            onClick={e => { e.stopPropagation(); if (!soldOut) onAddToCart(item); }}
            disabled={soldOut}
          >
            <Plus size={16} />
            <span>Add</span>
          </button>
        </div>
        {item.allergens && (
          <p className={styles.allergens}><strong>Contains:</strong> {item.allergens}</p>
        )}
      </div>
    </article>
  );
});
