import { useEffect, useState, memo } from 'react';
import { Plus, Sparkles, Percent } from 'lucide-react';
import { resolveImage, resolveThumbnail, FALLBACK_IMAGE } from '../../lib/imageResolver';
import { formatPrice } from '../../lib/menuUtils';
import type { MenuItem } from '../../types/menu';
import styles from './MenuCard.module.css';

interface MenuCardProps {
  item: MenuItem;
  onAddToCart: (item: MenuItem) => void;
  onClick: (item: MenuItem) => void;
  // STEP 8 — set when this item is inside an active Happy Hour window.
  happyHourDiscountPct?: number;
}

export const MenuCard = memo(function MenuCard({ item, onAddToCart, onClick, happyHourDiscountPct }: MenuCardProps) {
  // Cards load the 300px thumbnail; if it's missing fall back to the full
  // image, then to the brand fallback (step 0 → 1 → 2).
  const [imgStep, setImgStep] = useState(0);
  const thumbSrc = resolveThumbnail(item);
  const fullSrc = resolveImage(item);
  const imgSrc = imgStep === 0 ? thumbSrc : imgStep === 1 && fullSrc !== thumbSrc ? fullSrc : FALLBACK_IMAGE;
  const soldOut = item.available === false;
  const discountedPrice = happyHourDiscountPct ? item.price * (1 - happyHourDiscountPct / 100) : null;

  useEffect(() => {
    setImgStep(0);
  }, [item.name]);

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
        {!soldOut && item.popular && (
          <span className={styles.chipAi} aria-label="Guest favourite">
            <Sparkles size={10} /> Guest Favourite
          </span>
        )}
        {!soldOut && happyHourDiscountPct ? (
          <span className={styles.chipHappyHour} aria-label={`Happy Hour: ${happyHourDiscountPct}% off`}>
            <Percent size={10} /> Happy Hour -{happyHourDiscountPct}%
          </span>
        ) : null}
      </div>

      <div className={styles.body}>
        <h3 className={styles.name}>{item.name}</h3>
        {item.description && <p className={styles.desc}>{item.description}</p>}
        <div className={styles.footer}>
          {discountedPrice != null ? (
            <span className={styles.price}>
              <span className={styles.priceStrike}>{formatPrice(item.price)}</span> {formatPrice(discountedPrice)}
            </span>
          ) : (
            <span className={styles.price}>{formatPrice(item.price)}</span>
          )}
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
