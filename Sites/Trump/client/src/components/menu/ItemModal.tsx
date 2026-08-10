import { useState, useEffect, useRef } from 'react';
import { X, Heart, ChevronLeft, Flame, ConciergeBell } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Badge } from '../ui/Badge';
import { Spinner } from '../ui/Spinner';
import { resolveImage, resolveVideo, resolveYouTubeEmbed, FALLBACK_IMAGE } from '../../lib/imageResolver';
import { formatPrice } from '../../lib/menuUtils';
import { useT } from '../../i18n';
import { localizeAllergens } from '../../lib/allergens';
import { track, startDwell } from '../../lib/engagement';
import { useVideoEngagement } from '../../hooks/useVideoEngagement';
import { ItemGallery } from './ItemGallery';
import { api } from '../../services/api';
import { useMenuData } from '../../context/MenuContext';
import { normalizeName } from '../../lib/menuUtils';
import type { MenuItem } from '../../types/menu';
import type { RecommendationItem } from '../reco/RecommendationCard';
import { RecommendationJourney } from '../reco/RecommendationJourney';
import { trackImpressions, trackClick, markShown, flushDismissed, type RecoContext } from '../../lib/recoAnalytics';
import styles from './ItemModal.module.css';

interface ItemModalProps {
  item: MenuItem | null;
  open: boolean;
  onClose: () => void;
  isFavorite: boolean;
  onFavoriteToggle: (name: string) => void;
  onRequestItem?: (name: string) => void;
  onOpenItem?: (item: MenuItem) => void;
  canGoBack?: boolean;
  onBack?: () => void;
}

interface PairingItem {
  name: string;
  reason: string;
  categoryType?: string;
  price?: number;
  img?: string;
  beverageKind?: string;
  source_title?: string;
  chef?: boolean;
}

interface PairingResult {
  foodPairings?: PairingItem[];
  drinkPairings?: PairingItem[];
  pairings?: PairingItem[];
}

// The stored `spice` field is a raw chili-emoji string (🌶️ / 🌶️🌶️ / 🌶️🌶️🌶️),
// not a formatted label — map it to a level word instead of rendering emoji.
const SPICE_KEYS = ['', 'spice.mild', 'spice.medium', 'spice.hot'] as const;
function spiceLevelKey(spice: string): 'spice.mild' | 'spice.medium' | 'spice.hot' | 'spice.spiced' {
  const count = (spice.match(/🌶/gu) || []).length;
  return SPICE_KEYS[Math.min(count, SPICE_KEYS.length - 1)] || 'spice.spiced';
}

function ItemPairings({ item, onRequestItem }: { item: MenuItem; onRequestItem?: (name: string) => void }) {
  const { activeItemNames } = useMenuData();
  const [pool, setPool] = useState<RecommendationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const pairCtx: RecoContext = { mode: 'customer', source: 'pairing', originatingName: item.name };
  const surfaceKey = `pairing:${item.name}`;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setPool([]);
    api.aiPairing({ name: item.name, price: item.price, description: item.description })
      .then((data: unknown) => {
        if (cancelled) return;
        const res = data as PairingResult;
        // One ordered pool the journey planner draws from — drinks first (they
        // open the meal), then food. De-dupe by name so nothing fills two slots.
        const merged = [...(res?.drinkPairings ?? []), ...(res?.foodPairings ?? [])] as RecommendationItem[];
        const seen = new Set<string>();
        const deduped = merged.filter(p => {
          const key = (p.name || '').toLowerCase().trim();
          if (!key || seen.has(key)) return false;
          seen.add(key);
          return true;
        // The pairing endpoint has no idea about the Day/Night toggle (it's a
        // server-side lookup over the full catalog) -- drop anything outside
        // the currently active menu so a Night-mode guest never gets steered
        // toward a breakfast pairing that isn't even orderable right now.
        }).filter(p => !activeItemNames || activeItemNames.has(normalizeName(p.name)));
        setPool(deduped);
        if (deduped.length) {
          trackImpressions(deduped, pairCtx);
          markShown(surfaceKey, deduped, pairCtx);
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    // Record pairings shown but never opened as a dismissal when the strip unmounts.
    return () => { cancelled = true; flushDismissed(surfaceKey); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.name]);

  if (loading) {
    return <div className={styles.pairLoading}><Spinner size={18} /></div>;
  }
  if (pool.length === 0) return null;

  return (
    <RecommendationJourney
      item={item}
      pool={pool}
      onOpenItem={rec => { trackClick(rec, pairCtx); onRequestItem?.(rec.name); }}
    />
  );
}

export function ItemModal({
  item,
  open,
  onClose,
  isFavorite,
  onFavoriteToggle,
  onRequestItem,
  onOpenItem,
  canGoBack = false,
  onBack,
}: ItemModalProps) {
  const t = useT();

  const video = useVideoEngagement(item?.dbId, item?.name ?? '');

  // How long a dish detail stayed open is the closest thing a menu without a
  // cart has to "interest". Emitted on close so the duration is real.
  useEffect(() => {
    if (!open || !item) return;
    video.reset();
    const stop = startDwell({
      eventType: 'ITEM_VIEW',
      menuItemId: item.dbId ?? null,
      label: item.name,
      categoryName: item.category || '',
    });
    return stop;
  }, [open, item?.dbId, item?.name]);
  const [selectedVariantName, setSelectedVariantName] = useState<string | null>(null);
  const [selectedAddonNames, setSelectedAddonNames] = useState<string[]>([]);
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
    const baseVariants = (item.variants || []).filter(v => !v.isAddon);
    setSelectedVariantName(baseVariants[0]?.name ?? null);
    setSelectedAddonNames([]);
    const timer = window.setTimeout(() => setPlayMedia(true), 3000);
    return () => window.clearTimeout(timer);
  }, [open, item?.name]);

  useEffect(() => {
    if (!playMedia || !videoReady || !videoRef.current) return;
    videoRef.current.play().catch(() => {});
  }, [playMedia, videoReady]);

  if (!item) return null;

  const imgSrc = imgError ? FALLBACK_IMAGE : resolveImage(item);
  const videoSrc = videoError ? null : resolveVideo(item);
  const youtubeSrc = videoError ? null : resolveYouTubeEmbed(item, playMedia);

  const baseVariants = (item.variants || []).filter(v => !v.isAddon);
  const addonVariants = (item.variants || []).filter(v => v.isAddon);
  const selectedVariant = baseVariants.find(v => v.name === selectedVariantName) ?? null;
  const selectedAddons = addonVariants.filter(a => selectedAddonNames.includes(a.name));
  const effectivePrice = (selectedVariant ? selectedVariant.price : item.price)
    + selectedAddons.reduce((sum, a) => sum + a.price, 0);
  const effectiveName = selectedVariant
    ? [item.name, selectedVariant.name, ...selectedAddons.map(a => a.name)].join(' — ')
    : item.name;

  function toggleAddon(name: string) {
    setSelectedAddonNames(current =>
      current.includes(name) ? current.filter(n => n !== name) : [...current, name]
    );
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
    if (finalSwipe < -SWIPE_THRESHOLD) {
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
  const isLeftSwipe = swipeX < -20;

  return (
    <Modal open={open} onClose={onClose} size="lg">
      <div
        className={styles.modal}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchCancel}
        style={{
          transform: `translateX(${swipeX}px) rotate(${swipeX * 0.04}deg)`,
          transition: swipeX === 0 ? 'transform 280ms ease' : 'none',
          transformOrigin: 'bottom center',
          touchAction: 'pan-y',
        }}
      >
        <div className={styles.media}>
          {videoSrc && playMedia ? (
            // Poster-first, same as RecommendationCard/WaiterPage: the <video> tag
            // (and the network request it triggers) doesn't exist in the DOM at all
            // until the 3s dwell timer has already elapsed — before that, guests see
            // only the plain photo below, identical to an item with no video.
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
                onPlaying={video.onPlaying}
                onTimeUpdate={video.onTimeUpdate}
              />
              {imgSrc && (
                <img
                  src={imgSrc}
                  alt={item.name}
                  className={`${styles.imageOverlay}${videoReady ? ` ${styles.imageOverlayHidden}` : ''}`}
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
          {(item.available === false || item.availability === 'unavailable') && (
            <div className={styles.unavailableBanner}>
              Sold Out
            </div>
          )}
          {item.availability === 'ask' && item.available !== false && (
            <div className={styles.unavailableBanner}>
              Please ask your host — subject to availability today
            </div>
          )}

          <div className={styles.chips}>
            {item.chefPick && <Badge variant="gold">Chef Recommends</Badge>}
            {item.popular && <Badge variant="gold">Guest Favourite</Badge>}
            {item.spice && <Badge variant="muted"><Flame size={11} /> {t(spiceLevelKey(item.spice))}</Badge>}
          </div>

          <h2 className={styles.name} dir="auto">{item.name}</h2>
          {item.subtitle ? <p className={styles.description} dir="auto">{item.subtitle}</p> : null}
          <p className={styles.price}>{formatPrice(effectivePrice)}</p>

          {item.story ? <p className={styles.story}>{item.story}</p> : null}
          {item.description ? <p className={styles.description} dir="auto">{item.description}</p> : null}

          {baseVariants.length > 0 && (
            <div className={styles.variantGroup} role="radiogroup" aria-label="Choose an option">
              {baseVariants.map(variant => (
                <label key={variant.name} className={styles.variantOption}>
                  <input
                    type="radio"
                    name="variant"
                    checked={selectedVariantName === variant.name}
                    onChange={() => setSelectedVariantName(variant.name)}
                  />
                  <span>{variant.name}</span>
                  <span className={styles.variantPrice}>{formatPrice(variant.price)}</span>
                </label>
              ))}
            </div>
          )}

          {addonVariants.length > 0 && (
            <div className={styles.variantGroup} aria-label="Add extras">
              {addonVariants.map(addon => (
                <label key={addon.name} className={styles.variantOption}>
                  <input
                    type="checkbox"
                    checked={selectedAddonNames.includes(addon.name)}
                    onChange={() => toggleAddon(addon.name)}
                  />
                  <span>+ {addon.name}</span>
                  <span className={styles.variantPrice}>+{formatPrice(addon.price)}</span>
                </label>
              ))}
            </div>
          )}

          {item.allergens && (
            <p className={styles.allergens}>
              <strong>{t('menu.contains')}</strong> {localizeAllergens(item.allergens, t)}
            </p>
          )}

          {item.calories && (
            <p className={styles.calories}>{item.calories}</p>
          )}

          {open && <ItemPairings item={item} onRequestItem={onRequestItem} />}
          {item.dbId != null && <ItemGallery menuItemId={item.dbId} itemName={item.name} />}
        </div>

        {/* Moved out of .body (Bug #3 fix): .actions used to be the last child
            INSIDE the scrollable .body, sticky-pinned to the bottom of the
            modal's scroll viewport. ItemPairings loads asynchronously (an API
            call) and can insert ~300px of real content well after the initial
            layout settles -- since sticky elements don't reserve/vacate space
            the way normal flow does, the already-"stuck" actions bar ended up
            visually overlapping the freshly-loaded recommendation cards (and,
            depending on a given dish's text length, whatever else happened to
            fall in that same screen region). Now .actions is a true flex
            sibling of .media/.body, outside the scrollable region entirely
            (see the .modal/.body/.actions rewrite in ItemModal.module.css) --
            it can no longer overlap anything, sticky or not. */}
        {/* The quantity stepper, the special-requests box and the
            "Add to cart" button used to sit here. This menu does not take
            orders: the guest reads, then speaks to their waiter, which is the
            hospitality the restaurant is built on. What replaces them is the
            price and a plain statement of how to order. */}
        <div className={styles.actions}>
          <div className={styles.orderHint}>
            <ConciergeBell size={17} aria-hidden />
            <span>{t('dish.orderHint')}</span>
          </div>
          <span className={styles.priceTag}>
            {item.available === false ? t('menu.unavailable') : formatPrice(effectivePrice)}
          </span>
        </div>

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
