// Phase 3, Task 7: the single recommendation card used by EVERY recommendation
// surface (guest cart, chatbot, pairing modal, waiter upsell). Variants adapt the
// layout; colours use guest tokens with hardcoded gold/cream fallbacks so the card
// also looks right inside the waiter theme.
import { Plus, Sparkles } from 'lucide-react';
import { resolveImage, resolveAssetPath } from '../../lib/imageResolver';
import { formatPrice } from '../../lib/menuUtils';
import type { MenuItem } from '../../types/menu';
import styles from './RecommendationCard.module.css';

export interface RecommendationItem {
  name: string;
  price?: number;
  img?: string;
  description?: string;
  categoryType?: string;
  beverageKind?: string;
  source_title?: string;
  reason?: string;
  chef?: boolean;
  rotationGroup?: string;
  dbId?: number;
}

interface Props {
  item: RecommendationItem;
  variant?: 'compact' | 'detailed' | 'waiter';
  onOpen?: () => void;
  onAdd?: () => void;
  addLabel?: string;
  showReason?: boolean;
  note?: string;     // e.g. the waiter's upsell script
  uplift?: number;   // e.g. projected +R on the check
}

const FALLBACK_IMAGE = resolveAssetPath('Images/Tomahawk.jpg');

function imageFor(item: RecommendationItem): string {
  if (item.img && item.img.trim()) return resolveAssetPath(item.img);
  return resolveImage({
    name: item.name,
    price: item.price || 0,
    description: item.description || '',
    category: item.categoryType || ''
  } as MenuItem);
}

export function RecommendationCard({ item, variant = 'compact', onOpen, onAdd, addLabel = 'Add', showReason, note, uplift }: Props) {
  const src = imageFor(item);
  const price = Number(item.price) || 0;
  const tagText = item.chef ? "Chef's pick" : item.source_title;
  const reason = (showReason || variant !== 'compact') ? item.reason : '';

  return (
    <div className={`${styles.card} ${styles[variant]} ${item.chef ? styles.chef : ''}`}>
      <button type="button" className={styles.main} onClick={onOpen} aria-label={`View ${item.name}`}>
        {src ? (
          <img
            src={src}
            alt={item.name}
            className={styles.img}
            loading="lazy"
            onError={e => {
              const img = e.currentTarget;
              if (img.dataset.fb === '1') { img.style.visibility = 'hidden'; return; }
              img.dataset.fb = '1';
              img.src = FALLBACK_IMAGE;
            }}
          />
        ) : (
          <div className={styles.imgPh} />
        )}
        <div className={styles.info}>
          {tagText && (
            <span className={styles.tag}>
              {item.chef && <Sparkles size={10} className={styles.tagIcon} />}
              {tagText}
            </span>
          )}
          <span className={styles.name}>{item.name}</span>
          {reason && <span className={styles.reason}>{reason}</span>}
          <span className={styles.bottomRow}>
            {price > 0 && <span className={styles.price}>{formatPrice(price)}</span>}
            {typeof uplift === 'number' && uplift > 0 && <span className={styles.uplift}>+{formatPrice(uplift)}</span>}
          </span>
          {note && <span className={styles.note}>“{note}”</span>}
        </div>
      </button>
      {onAdd && price > 0 && (
        <button
          type="button"
          className={styles.addBtn}
          aria-label={`Add ${item.name}`}
          onClick={e => { e.stopPropagation(); onAdd(); }}
        >
          <Plus size={variant === 'compact' ? 12 : 15} />
          {variant !== 'compact' && <span>{addLabel}</span>}
        </button>
      )}
    </div>
  );
}
