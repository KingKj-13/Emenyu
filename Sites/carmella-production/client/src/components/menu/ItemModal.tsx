import { useState, useEffect, useRef } from 'react';
import { X, Plus, Minus, ShoppingCart, Flame } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Badge } from '../ui/Badge';
import { resolveImage, FALLBACK_IMAGE } from '../../lib/imageResolver';
import { formatPrice } from '../../lib/menuUtils';
import type { MenuItem } from '../../types/menu';
import styles from './ItemModal.module.css';

interface ItemModalProps {
  item: MenuItem | null;
  open: boolean;
  onClose: () => void;
  onAddToCart: (item: MenuItem, qty: number, note: string) => void;
}

// The stored `spice` field is a raw chili-emoji string (🌶️ / 🌶️🌶️ / 🌶️🌶️🌶️),
// not a formatted label — map it to a level word instead of rendering emoji.
const SPICE_LEVELS = ['', 'Mild heat', 'Medium heat', 'Hot'];
function spiceLevelLabel(spice: string): string {
  const count = (spice.match(/🌶/gu) || []).length;
  return SPICE_LEVELS[Math.min(count, SPICE_LEVELS.length - 1)] || 'Spiced';
}

function dietaryTags(item: MenuItem): string[] {
  const tags = item.tags;
  if (Array.isArray(tags)) return tags;
  if (tags && typeof tags === 'object') return [...(tags.dietary || [])];
  return [];
}

export function ItemModal({ item, open, onClose, onAddToCart }: ItemModalProps) {
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState('');
  const [selectedVariantName, setSelectedVariantName] = useState<string | null>(null);
  const [selectedAddonNames, setSelectedAddonNames] = useState<string[]>([]);
  const [imgError, setImgError] = useState(false);
  const [swipeX, setSwipeX] = useState(0);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const swipeActiveRef = useRef(false);
  const noSwipeRef = useRef(false);
  const SWIPE_THRESHOLD = 80;

  useEffect(() => {
    if (!open || !item) return;
    setImgError(false);
    const baseVariants = (item.variants || []).filter(v => !v.isAddon);
    setSelectedVariantName(baseVariants[0]?.name ?? null);
    setSelectedAddonNames([]);
  }, [open, item?.name]);

  if (!item) return null;

  const imgSrc = imgError ? FALLBACK_IMAGE : resolveImage(item);

  const baseVariants = (item.variants || []).filter(v => !v.isAddon);
  const addonVariants = (item.variants || []).filter(v => v.isAddon);
  const selectedVariant = baseVariants.find(v => v.name === selectedVariantName) ?? null;
  const selectedAddons = addonVariants.filter(a => selectedAddonNames.includes(a.name));
  const effectivePrice = (selectedVariant ? selectedVariant.price : item.price)
    + selectedAddons.reduce((sum, a) => sum + a.price, 0);
  const effectiveName = selectedVariant
    ? [item.name, selectedVariant.name, ...selectedAddons.map(a => a.name)].join(' — ')
    : item.name;
  const tags = dietaryTags(item);

  function toggleAddon(name: string) {
    setSelectedAddonNames(current =>
      current.includes(name) ? current.filter(n => n !== name) : [...current, name]
    );
  }

  function handleAdd() {
    const cartItem: MenuItem = selectedVariant
      ? { ...item!, name: effectiveName, price: effectivePrice, img: selectedVariant.img || item!.img }
      : item!;
    onAddToCart(cartItem, qty, note);
    setQty(1);
    setNote('');
    onClose();
  }

  function handleTouchStart(e: React.TouchEvent) {
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
      onClose();
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
          {imgSrc ? (
            <img src={imgSrc} alt={item.name} className={styles.image} onError={() => setImgError(true)} />
          ) : null}
          <div className={styles.mediaTint} />
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className={styles.body}>
          {(item.available === false || item.availability === 'unavailable') && (
            <div className={styles.unavailableBanner}>Sold Out</div>
          )}
          {item.availability === 'ask' && item.available !== false && (
            <div className={styles.unavailableBanner}>Please ask your host — subject to availability today</div>
          )}

          <div className={styles.chips}>
            {item.popular && <Badge variant="gold">Guest Favourite</Badge>}
            {item.spice && <Badge variant="muted"><Flame size={11} /> {spiceLevelLabel(item.spice)}</Badge>}
            {tags.map(tag => <Badge key={tag} variant="muted">{tag.replace(/-/g, ' ')}</Badge>)}
          </div>

          <h2 className={styles.name}>{item.name}</h2>
          {item.subtitle ? <p className={styles.description}>{item.subtitle}</p> : null}
          <p className={styles.price}>{formatPrice(effectivePrice)}</p>

          {item.story ? <p className={styles.story}>{item.story}</p> : null}
          {item.description ? <p className={styles.description}>{item.description}</p> : null}

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
            <p className={styles.allergens}><strong>Contains:</strong> {item.allergens}</p>
          )}

          {item.calories && <p className={styles.calories}>{item.calories}</p>}
        </div>

        <div className={styles.actions}>
          <div className={styles.qtyRow}>
            <button className={styles.qtyBtn} onClick={() => setQty(q => Math.max(1, q - 1))} aria-label="Decrease quantity">
              <Minus size={16} />
            </button>
            <span className={styles.qtyValue} aria-live="polite">{qty}</span>
            <button className={styles.qtyBtn} onClick={() => setQty(q => q + 1)} aria-label="Increase quantity">
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
            aria-label={item.available === false ? `${item.name} is sold out` : `Add ${qty} ${item.name} to cart`}
          >
            <ShoppingCart size={18} />
            {item.available === false ? 'Sold Out' : `Add ${qty > 1 ? `${qty} × ` : ''}${formatPrice(item.price * qty)}`}
          </button>
        </div>

        {isRightSwipe && (
          <div className={styles.swipeHintRight} style={{ opacity: swipeProgress }}>
            <ShoppingCart size={36} />
            <span>Add to Cart</span>
          </div>
        )}
        {isLeftSwipe && (
          <div className={styles.swipeHintLeft} style={{ opacity: swipeProgress }}>
            <span>Close</span>
          </div>
        )}
      </div>
    </Modal>
  );
}
