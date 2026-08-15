import { useEffect, useRef, useState, memo } from 'react';
import { Heart, Star, Sparkles, Wine, Video } from 'lucide-react';
import { resolveImage, resolveThumbnail, resolveVideo, FALLBACK_IMAGE } from '../../lib/imageResolver';
import { formatPrice } from '../../lib/menuUtils';
import { useT } from '../../i18n';
import { localizeAllergens } from '../../lib/allergens';
import type { MenuItem } from '../../types/menu';
import styles from './MenuCard.module.css';

interface MenuCardProps {
  item: MenuItem;
  isFavorite: boolean;
  onFavoriteToggle: (name: string) => void;
  onClick: (item: MenuItem) => void;
  onPairingClick?: (item: MenuItem) => void;
}

export const MenuCard = memo(function MenuCard({
  item, isFavorite, onFavoriteToggle, onClick, onPairingClick
}: MenuCardProps) {
  const t = useT();
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
            <span className={styles.soldOutBadge}>{t('menu.soldOut')}</span>
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
        <h3 className={styles.name} dir="auto">
          {item.name}
          {item.chefPick && <span className={styles.goldDot} aria-hidden="true" />}
        </h3>
        {item.description && (
          <p className={styles.desc} dir="auto">{item.description}</p>
        )}
        {/* The "Add" button lived here. This menu does not take orders — the
            card's job is now to invite a tap into the dish, where the photos,
            video and description are. Sold-out state still shows, because a
            guest deserves to know before they ask their waiter for it. */}
        <div className={styles.footer}>
          <span className={styles.price}>{formatPrice(item.price)}</span>
          {soldOut && <span className={styles.soldOut}>{t('menu.unavailable')}</span>}
        </div>
        {item.allergens && (
          <p className={styles.allergens} dir="auto"><strong>{t('menu.contains')}</strong> {localizeAllergens(item.allergens, t)}</p>
        )}
      </div>
    </article>
  );
});
