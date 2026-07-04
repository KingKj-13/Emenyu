// Phase 3, Task 7: the single recommendation card used by EVERY recommendation
// surface (guest cart, chatbot, pairing modal, waiter upsell). Variants adapt the
// layout; colours use guest tokens with hardcoded gold/cream fallbacks so the card
// also looks right inside the waiter theme.
import { useState } from 'react';
import { Plus, Sparkles, Play } from 'lucide-react';
import { resolveImage, resolveAssetPath, resolveVideo, FALLBACK_IMAGE } from '../../lib/imageResolver';
import { formatPrice } from '../../lib/menuUtils';
import type { MenuItem } from '../../types/menu';
import styles from './RecommendationCard.module.css';

export interface RecommendationItem {
  name: string;
  price?: number;
  img?: string;
  video?: string;
  description?: string;
  categoryType?: string;
  beverageKind?: string;
  source_title?: string;
  reason?: string;
  chef?: boolean;
  rotationGroup?: string;
  dbId?: number;
  // Phase 1 (Recommendation Brain) — not yet rendered by this card (no UI
  // redesign this phase); typed here so callers can read them without `any`.
  confidence?: number;
  expectedValue?: number;
  netRevenueIncrease?: number;
  replacement?: { name: string; previousPrice: number } | null;
}

interface Props {
  item: RecommendationItem;
  variant?: 'compact' | 'detailed' | 'waiter' | 'journey';
  onOpen?: () => void;
  onAdd?: () => void;
  addLabel?: string;
  showReason?: boolean;
  note?: string;     // e.g. the waiter's upsell script
  uplift?: number;   // e.g. projected +R on the check
  // ── Journey-card extras (course-aware 3-slot meal journey) ──
  slotLabel?: string;   // course label shown top-left, data-driven (e.g. "Starter")
  youChoice?: boolean;  // marks the dish whose modal is currently open
  playable?: boolean;   // poster-first, tap-to-play video (never autoplays/eager-loads)
}

// A RecommendationItem carries only the fields the engine returns; project it onto
// the MenuItem shape the image/video resolvers expect (categoryType drives both the
// drink/dessert classification and the demo-clip fallback).
function asMenuItem(item: RecommendationItem): MenuItem {
  return {
    name: item.name,
    price: item.price || 0,
    description: item.description || '',
    category: item.categoryType || '',
    categoryType: item.categoryType,
    beverageKind: item.beverageKind,
    img: item.img,
    video: item.video,
  } as MenuItem;
}

function imageFor(item: RecommendationItem): string {
  if (item.img && item.img.trim()) return resolveAssetPath(item.img);
  return resolveImage(asMenuItem(item));
}

export function RecommendationCard({
  item,
  variant = 'compact',
  onOpen,
  onAdd,
  addLabel = 'Add',
  showReason,
  note,
  uplift,
  slotLabel,
  youChoice,
  playable,
}: Props) {
  const [playing, setPlaying] = useState(false);
  const src = imageFor(item);
  const price = Number(item.price) || 0;
  const reason = (showReason || variant !== 'compact') ? item.reason : '';
  // Poster-first: resolve the video only to decide whether to offer a play button.
  // The <video> element is mounted (and the file requested) ONLY after a tap.
  const videoSrc = playable ? resolveVideo(asMenuItem(item)) : null;

  // ── Journey variant: large poster card with course chip + tap-to-play video ──
  if (variant === 'journey') {
    const infoBody = (
      <>
        {item.chef && (
          <span className={styles.chefTag}>
            <Sparkles size={10} className={styles.tagIcon} />Chef's pick
          </span>
        )}
        <span className={styles.jName}>{item.name}</span>
        {reason && <span className={styles.jReason}>{reason}</span>}
        {price > 0 && <span className={styles.jPrice}>{formatPrice(price)}</span>}
      </>
    );

    return (
      <div className={`${styles.card} ${styles.journey} ${item.chef ? styles.chef : ''} ${youChoice ? styles.current : ''}`}>
        <div className={styles.media}>
          {playing && videoSrc ? (
            <video
              className={styles.video}
              src={videoSrc}
              muted
              playsInline
              autoPlay
              loop
              onError={() => setPlaying(false)}
            />
          ) : src ? (
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

          <div className={styles.mediaChips}>
            {slotLabel && <span className={styles.slotChip}>{slotLabel}</span>}
            {youChoice && <span className={styles.choiceChip}>Your choice</span>}
          </div>

          {videoSrc && !playing && (
            <button
              type="button"
              className={styles.playBtn}
              aria-label={`Play ${item.name} video`}
              onClick={e => { e.stopPropagation(); setPlaying(true); }}
            >
              <Play size={16} fill="currentColor" />
            </button>
          )}
        </div>

        {onOpen ? (
          <button type="button" className={styles.jInfo} onClick={onOpen} aria-label={`View ${item.name}`}>
            {infoBody}
          </button>
        ) : (
          <div className={styles.jInfo}>{infoBody}</div>
        )}

        {onAdd && price > 0 && (
          <button
            type="button"
            className={styles.jAddBtn}
            aria-label={`Add ${item.name}`}
            onClick={e => { e.stopPropagation(); onAdd(); }}
          >
            <Plus size={15} /><span>{addLabel}</span>
          </button>
        )}
      </div>
    );
  }

  // ── Existing variants (compact / detailed / waiter) — unchanged ──
  const tagText = item.chef ? "Chef's pick" : item.source_title;

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
