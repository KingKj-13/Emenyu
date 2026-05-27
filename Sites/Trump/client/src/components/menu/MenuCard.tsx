import { useState, memo } from 'react';
import { Heart, Plus, Star, Sparkles, Wine, PlayCircle } from 'lucide-react';
import { resolveImage, resolveVideo, normalizeYouTubeId } from '../../lib/imageResolver';
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
  const videoSrc = resolveVideo(item);
  const hasVideo = Boolean(videoSrc || normalizeYouTubeId(item.youtubeId));
  const soldOut = item.available === false;

  return (
    <article
      className={`${styles.card} ${soldOut ? styles.cardSoldOut : ''}`}
      role="button"
      tabIndex={0}
      aria-label={`${item.name}, ${formatPrice(item.price)}${soldOut ? ', sold out' : ''}`}
      onClick={() => onClick(item)}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onClick(item); }}
    >
      <div className={styles.imageWrap}>
        {videoSrc ? (
          <video
            src={videoSrc}
            poster={imgSrc || undefined}
            className={styles.image}
            muted
            loop
            playsInline
            preload="metadata"
            onMouseEnter={event => event.currentTarget.play().catch(() => {})}
            onMouseLeave={event => {
              event.currentTarget.pause();
              event.currentTarget.currentTime = 0;
            }}
          />
        ) : imgSrc && (
          <img
            src={imgSrc}
            alt={item.name}
            className={styles.image}
            loading="lazy"
            onError={() => setImgError(true)}
          />
        )}
        <div className={styles.imageTint} />
        {hasVideo && (
          <span className={styles.mediaBadge} aria-label="Video available">
            <PlayCircle size={11} /> Video
          </span>
        )}
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
          <span className={styles.chipAi} aria-label="AI recommended item">
            <Sparkles size={10} /> AI Recommend
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
          <p className={styles.allergens}>{item.allergens}</p>
        )}
      </div>
    </article>
  );
});
