import { useState, useEffect, useRef } from 'react';
import { X, Heart, Plus, Minus, ShoppingCart, Sparkles, ChevronLeft } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Badge } from '../ui/Badge';
import { Spinner } from '../ui/Spinner';
import { resolveImage, resolveVideo, resolveYouTubeEmbed } from '../../lib/imageResolver';
import { BASE_PATH } from '../../constants/api';
import { formatPrice } from '../../lib/menuUtils';
import { api } from '../../services/api';
import type { MenuItem } from '../../types/menu';
import styles from './ItemModal.module.css';

interface ItemModalProps {
  item: MenuItem | null;
  open: boolean;
  onClose: () => void;
  isFavorite: boolean;
  onFavoriteToggle: (name: string) => void;
  onAddToCart: (item: MenuItem, qty: number, note: string) => void;
  onRequestItem?: (name: string) => void;
  canGoBack?: boolean;
  onBack?: () => void;
}

interface PairingItem {
  name: string;
  reason: string;
  categoryType?: string;
}

interface PairingResult {
  foodPairings?: PairingItem[];
  drinkPairings?: PairingItem[];
  pairings?: PairingItem[];
}

function ItemPairings({ item, onRequestItem }: { item: MenuItem; onRequestItem?: (name: string) => void }) {
  const [foodPairings, setFoodPairings] = useState<PairingItem[]>([]);
  const [drinkPairings, setDrinkPairings] = useState<PairingItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFoodPairings([]);
    setDrinkPairings([]);
    api.aiPairing({ name: item.name, price: item.price, description: item.description })
      .then((data: unknown) => {
        if (cancelled) return;
        const res = data as PairingResult;
        setFoodPairings(res?.foodPairings ?? []);
        setDrinkPairings(res?.drinkPairings ?? []);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [item.name]);

  const hasFood = foodPairings.length > 0;
  const hasDrink = drinkPairings.length > 0;
  if (!loading && !hasFood && !hasDrink) return null;

  return (
    <div className={styles.pairSection}>
      <div className={styles.pairHeader}>
        <Sparkles size={13} className={styles.pairIcon} />
        <span className={styles.pairLabel}>AI Recommendations</span>
      </div>
      {loading ? (
        <div className={styles.pairLoading}><Spinner size={16} /></div>
      ) : (
        <>
          {hasDrink && (
            <>
              <div className={styles.pairGroupLabel}>Drink pairings</div>
              <div className={styles.pairStrip} data-noswipe>
                {drinkPairings.map((p, i) => (
                  <button key={i} className={`${styles.pairChip} ${styles.pairChipDrink}`} onClick={() => onRequestItem?.(p.name)} aria-label={`View ${p.name}`}>
                    <span className={`${styles.pairBadge} ${styles.pairBadgeDrink}`}>Drink</span>
                    <span className={styles.pairName}>{p.name}</span>
                    <span className={styles.pairReason}>{p.reason}</span>
                  </button>
                ))}
              </div>
            </>
          )}
          {hasFood && (
            <>
              <div className={`${styles.pairGroupLabel} ${hasDrink ? styles.pairGroupLabelSecond : ''}`}>Goes well with</div>
              <div className={styles.pairStrip} data-noswipe>
                {foodPairings.map((p, i) => (
                  <button key={i} className={styles.pairChip} onClick={() => onRequestItem?.(p.name)} aria-label={`View ${p.name}`}>
                    <span className={styles.pairBadge}>Food</span>
                    <span className={styles.pairName}>{p.name}</span>
                    <span className={styles.pairReason}>{p.reason}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

export function ItemModal({
  item,
  open,
  onClose,
  isFavorite,
  onFavoriteToggle,
  onAddToCart,
  onRequestItem,
  canGoBack = false,
  onBack,
}: ItemModalProps) {
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState('');
  const [imgError, setImgError] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [playMedia, setPlayMedia] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [swipeX, setSwipeX] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const swipeActiveRef = useRef(false);
  const noSwipeRef = useRef(false);
  const SWIPE_THRESHOLD = 80;

  useEffect(() => {
    if (!open || !item) return;
    setPlayMedia(false);
    setVideoReady(false);
    setImgError(false);
    setVideoError(false);
    const timer = window.setTimeout(() => setPlayMedia(true), 3000);
    return () => window.clearTimeout(timer);
  }, [open, item?.name]);

  useEffect(() => {
    if (!playMedia || !videoReady || !videoRef.current) return;
    videoRef.current.play().catch(() => {});
  }, [playMedia, videoReady]);

  if (!item) return null;

  const imgSrc = imgError ? `${BASE_PATH}/Images/Tomahawk.jpg` : resolveImage(item);
  const videoSrc = videoError ? null : resolveVideo(item);
  const youtubeSrc = videoError ? null : resolveYouTubeEmbed(item, playMedia);

  function handleAdd() {
    onAddToCart(item!, qty, note);
    setQty(1);
    setNote('');
    onClose();
  }

  function handleTouchStart(e: React.TouchEvent) {
    // Don't hijack horizontal swipes that begin inside the recommendation strip
    // (or any opted-out region) — let them scroll/select on their own.
    noSwipeRef.current = !!(e.target as HTMLElement).closest('[data-noswipe]');
    if (noSwipeRef.current) {
      touchStartRef.current = null;
      return;
    }
    const t = e.touches[0];
    touchStartRef.current = { x: t.clientX, y: t.clientY };
    swipeActiveRef.current = false;
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (noSwipeRef.current || !touchStartRef.current) return;
    const t = e.touches[0];
    const dx = t.clientX - touchStartRef.current.x;
    const dy = t.clientY - touchStartRef.current.y;

    if (!swipeActiveRef.current) {
      if (Math.abs(dx) < 12) return;
      if (Math.abs(dx) > Math.abs(dy) * 1.5) {
        swipeActiveRef.current = true;
      } else {
        touchStartRef.current = null;
        return;
      }
    }
    setSwipeX(dx);
  }

  function handleTouchEnd() {
    const finalSwipe = swipeX;
    setSwipeX(0);
    touchStartRef.current = null;
    swipeActiveRef.current = false;
    if (finalSwipe > SWIPE_THRESHOLD) {
      handleAdd();
    } else if (finalSwipe < -SWIPE_THRESHOLD) {
      if (canGoBack && onBack) onBack();
      else onClose();
    }
  }

  function handleTouchCancel() {
    setSwipeX(0);
    touchStartRef.current = null;
    swipeActiveRef.current = false;
  }

  const swipeProgress = Math.min(1, Math.abs(swipeX) / SWIPE_THRESHOLD);
  const isRightSwipe = swipeX > 20;
  const isLeftSwipe = swipeX < -20;

  return (
    <Modal open={open} onClose={onClose} size="lg">
      <div
        className={styles.modal}
        style={{
          transform: `translateX(${swipeX}px) rotate(${swipeX * 0.04}deg)`,
          transition: swipeX === 0 ? 'transform 280ms ease' : 'none',
          transformOrigin: 'bottom center',
        }}
      >
        <div
          className={styles.media}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchCancel}
          style={{ touchAction: 'pan-y' }}
        >
          {videoSrc ? (
            <>
              <video
                ref={videoRef}
                src={videoSrc}
                muted
                loop
                playsInline
                className={styles.videoLayer}
                onCanPlay={() => setVideoReady(true)}
                onError={() => setVideoError(true)}
              />
              {imgSrc && (
                <img
                  src={imgSrc}
                  alt={item.name}
                  className={`${styles.imageOverlay}${playMedia && videoReady ? ` ${styles.imageOverlayHidden}` : ''}`}
                  onError={() => setImgError(true)}
                />
              )}
            </>
          ) : youtubeSrc ? (
            <iframe
              src={youtubeSrc}
              title={`${item.name} video`}
              className={styles.youtube}
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
            />
          ) : imgSrc ? (
            <img
              src={imgSrc}
              alt={item.name}
              className={styles.image}
              onError={() => setImgError(true)}
            />
          ) : null}
          <div className={styles.mediaTint} />
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
          {canGoBack && (
            <button className={styles.backBtn} onClick={onBack} aria-label="Back to previous item">
              <ChevronLeft size={20} />
            </button>
          )}
          <button
            className={`${styles.favBtn} ${canGoBack ? styles.favBtnOffset : ''} ${isFavorite ? styles.favActive : ''}`}
            onClick={() => onFavoriteToggle(item.name)}
            aria-label={isFavorite ? 'Remove from favourites' : 'Add to favourites'}
            aria-pressed={isFavorite}
          >
            <Heart size={18} fill={isFavorite ? 'currentColor' : 'none'} />
          </button>
        </div>

        <div className={styles.body}>
          {item.available === false && (
            <div className={styles.unavailableBanner}>
              Currently unavailable
            </div>
          )}

          <div className={styles.chips}>
            {item.chefPick && <Badge variant="gold">Chef Recommends</Badge>}
            {item.popular && <Badge variant="purple">AI Recommend</Badge>}
            {item.spice && <Badge variant="muted">{item.spice}</Badge>}
          </div>

          <h2 className={styles.name}>{item.name}</h2>
          <p className={styles.price}>{formatPrice(item.price)}</p>

          {item.description && (
            <p className={styles.description}>{item.description}</p>
          )}

          {item.allergens && (
            <p className={styles.allergens}>
              <strong>Contains:</strong> {item.allergens}
            </p>
          )}

          {item.calories && (
            <p className={styles.calories}>{item.calories}</p>
          )}

          {open && <ItemPairings item={item} onRequestItem={onRequestItem} />}

          <div className={styles.actions}>
            <div className={styles.qtyRow}>
              <button
                className={styles.qtyBtn}
                onClick={() => setQty(q => Math.max(1, q - 1))}
                aria-label="Decrease quantity"
              >
                <Minus size={16} />
              </button>
              <span className={styles.qtyValue} aria-live="polite">{qty}</span>
              <button
                className={styles.qtyBtn}
                onClick={() => setQty(q => q + 1)}
                aria-label="Increase quantity"
              >
                <Plus size={16} />
              </button>
            </div>

            <textarea
              className={styles.noteInput}
              data-noswipe
              placeholder="Special requests or dietary notes…"
              value={note}
              onChange={e => setNote(e.target.value)}
              rows={2}
              aria-label="Special notes for this item"
            />

            <button
              className={styles.addBtn}
              onClick={handleAdd}
              disabled={item.available === false}
              aria-label={item.available === false ? `${item.name} is currently unavailable` : `Add ${qty} ${item.name} to cart`}
            >
              <ShoppingCart size={18} />
              {item.available === false ? 'Unavailable' : `Add ${qty > 1 ? `${qty} × ` : ''}${formatPrice(item.price * qty)}`}
            </button>
          </div>
        </div>

        {isRightSwipe && (
          <div className={styles.swipeHintRight} style={{ opacity: swipeProgress }}>
            <ShoppingCart size={36} />
            <span>Add to Cart</span>
          </div>
        )}
        {isLeftSwipe && (
          <div className={styles.swipeHintLeft} style={{ opacity: swipeProgress }}>
            <ChevronLeft size={36} />
            <span>{canGoBack ? 'Back' : 'Close'}</span>
          </div>
        )}
      </div>
    </Modal>
  );
}
