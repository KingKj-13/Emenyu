import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { api } from '../services/api';
import { resolveImage, resolveThumbnail, resolveVideo, FALLBACK_IMAGE } from '../lib/imageResolver';
import { formatPrice } from '../lib/menuUtils';
import { startDwell } from '../lib/engagement';
import { useVideoEngagement } from '../hooks/useVideoEngagement';
import { useCart } from '../hooks/useCart';
import type { MenuItem } from '../types/menu';
import styles from './PremiumItemSheet.module.css';

interface PairingItem {
  name: string;
  reason?: string;
  price?: number;
  img?: string;
}

interface PairingResult {
  foodPairings?: PairingItem[];
  drinkPairings?: PairingItem[];
}

interface Props {
  item: MenuItem | null;
  open: boolean;
  onClose: () => void;
  onOpenItem: (item: MenuItem) => void;
  onAdded: (message: string) => void;
}

export function PremiumItemSheet({ item, open, onClose, onOpenItem, onAdded }: Props) {
  const cart = useCart();
  const [qty, setQty] = useState(1);
  const [selectedVariant, setSelectedVariant] = useState<string | null>(null);
  const [pairing, setPairing] = useState<PairingItem | null>(null);
  const [imgError, setImgError] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [playMedia, setPlayMedia] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const video = useVideoEngagement(item?.dbId, item?.name ?? '');

  useEffect(() => {
    if (!open || !item) return;
    setQty(1);
    setImgError(false);
    setVideoError(false);
    setPlayMedia(false);
    setVideoReady(false);
    video.reset();
    const baseVariants = (item.variants || []).filter(v => !v.isAddon);
    setSelectedVariant(baseVariants[0]?.name ?? null);

    const stop = startDwell({ eventType: 'ITEM_VIEW', menuItemId: item.dbId ?? null, label: item.name, categoryName: item.category || '' });

    setPairing(null);
    api.aiPairing({ name: item.name, price: item.price, description: item.description })
      .then((data: unknown) => {
        const res = data as PairingResult;
        const first = (res?.drinkPairings ?? [])[0] || (res?.foodPairings ?? [])[0] || null;
        setPairing(first);
      })
      .catch(() => {});

    // Poster-first, same as Trump's ItemModal: the <video> tag (and the
    // network request it triggers) doesn't exist in the DOM at all until the
    // guest has actually lingered on this dish.
    const timer = window.setTimeout(() => setPlayMedia(true), 3000);
    return () => { stop(); window.clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item?.name]);

  useEffect(() => {
    if (!playMedia || !videoReady || !videoRef.current) return;
    videoRef.current.play().catch(() => {});
  }, [playMedia, videoReady]);

  if (!item) return null;

  const baseVariants = (item.variants || []).filter(v => !v.isAddon);
  const selected = baseVariants.find(v => v.name === selectedVariant) ?? null;
  const unitPrice = selected ? selected.price : item.price;
  const soldOut = item.available === false;
  const src = imgError ? FALLBACK_IMAGE : resolveImage(item);
  const videoSrc = videoError ? null : resolveVideo(item);

  function handleAdd() {
    if (!item || soldOut) return;
    const name = selected ? `${item.name} — ${selected.name}` : item.name;
    cart.addItem({
      name,
      price: unitPrice,
      qty,
      img: resolveImage(item),
      description: item.description || '',
      categoryType: item.categoryType,
      beverageKind: item.beverageKind,
    });
    onAdded(`${item.name} added to your table`);
    onClose();
  }

  function openPairing() {
    if (!pairing) return;
    onOpenItem({
      name: pairing.name,
      price: pairing.price || 0,
      description: '',
      img: pairing.img,
      category: '',
    } as MenuItem);
  }

  return open ? (
    <>
      <div className={styles.backdrop} onClick={onClose} />
      <div className={styles.sheet} role="dialog" aria-modal="true" aria-label={item.name}>
        <div className={styles.scroll}>
          <div className={styles.mediaWrap}>
            {playMedia && videoSrc && (
              <video
                ref={videoRef}
                src={videoSrc}
                muted
                loop
                playsInline
                className={styles.media}
                onCanPlay={() => setVideoReady(true)}
                onError={() => setVideoError(true)}
                onPlaying={video.onPlaying}
                onTimeUpdate={video.onTimeUpdate}
              />
            )}
            {src && (
              <img
                src={src}
                alt={item.name}
                className={`${styles.media}${videoReady ? ` ${styles.mediaHidden}` : ''}`}
                onError={() => setImgError(true)}
              />
            )}
            <div className={styles.mediaScrim} />
            <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
              <X size={15} />
            </button>
          </div>

          <div className={styles.body}>
            {soldOut && <div className={styles.soldOutBanner}>Sold out this evening</div>}

            <div className={styles.chips}>
              {item.chefPick && <span className={styles.chip}>Chef's Selection</span>}
              {item.popular && <span className={styles.chip}>Guest Favourite</span>}
            </div>

            <div className={styles.titleRow}>
              <div className={styles.name}>{item.name}</div>
              <div className={styles.price}>{formatPrice(unitPrice)}</div>
            </div>

            {item.story && <div className={styles.story}>{item.story}</div>}
            {item.description && <div className={styles.desc}>{item.description}</div>}

            {baseVariants.length > 0 && (
              <div className={styles.variantGroup} role="radiogroup" aria-label="Choose an option">
                {baseVariants.map(v => (
                  <label key={v.name} className={styles.variantOption}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="radio"
                        name="premium-variant"
                        checked={selectedVariant === v.name}
                        onChange={() => setSelectedVariant(v.name)}
                      />
                      {v.name}
                    </span>
                    <span>{formatPrice(v.price)}</span>
                  </label>
                ))}
              </div>
            )}

            {item.allergens && (
              <div className={styles.allergens}>
                <span className={styles.allergensLabel}>Contains</span>
                <span className={styles.allergensText}>{item.allergens} — adjustments gladly, just ask</span>
              </div>
            )}

            {pairing && (
              <div className={styles.recommends}>
                <div className={styles.recommendsEyebrow}>Trump Recommends</div>
                {pairing.reason && <div className={styles.recommendsLine}>&ldquo;{pairing.reason}&rdquo;</div>}
                <div className={styles.recommendsItem}>
                  {pairing.img && (
                    <img
                      src={resolveThumbnail({ name: pairing.name, img: pairing.img, price: pairing.price || 0 } as MenuItem)}
                      alt={pairing.name}
                      className={styles.recommendsImg}
                    />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className={styles.recommendsName}>{pairing.name}</div>
                    {typeof pairing.price === 'number' && pairing.price > 0 && (
                      <div className={styles.recommendsSub}>{formatPrice(pairing.price)}</div>
                    )}
                  </div>
                  <button type="button" className={styles.recommendsAdd} onClick={openPairing}>View</button>
                </div>
              </div>
            )}
          </div>
        </div>

        {!soldOut && (
          <div className={styles.actions}>
            <div className={styles.stepper}>
              <button type="button" className={styles.stepperBtn} onClick={() => setQty(q => Math.max(1, q - 1))} aria-label="Fewer">–</button>
              <span className={styles.stepperQty}>{qty}</span>
              <button type="button" className={styles.stepperBtn} onClick={() => setQty(q => q + 1)} aria-label="More">+</button>
            </div>
            <button type="button" className={styles.addToTable} onClick={handleAdd}>
              Add · {formatPrice(unitPrice * qty)}
            </button>
          </div>
        )}
      </div>
    </>
  ) : null;
}
