import { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { api } from '../../services/api';
import { useCart } from '../../hooks/useCart';
import { useApp } from '../../context/AppContext';
import { useDebounce } from '../../hooks/useDebounce';
import { resolveAssetPath, resolveImage } from '../../lib/imageResolver';
import { formatPrice } from '../../lib/menuUtils';
import type { CartItem } from '../../types/cart';
import type { MenuItem } from '../../types/menu';
import styles from './CartRecommendations.module.css';

interface Rec {
  name: string;
  price: number;
  img: string;
  source_title?: string;
  description?: string;
  categoryType?: string;
}

const FALLBACK_IMAGE = resolveAssetPath('Images/Tomahawk.jpg');

function recommendationImage(rec: Rec): string {
  return resolveImage({
    name: rec.name,
    price: rec.price,
    description: rec.description || '',
    img: rec.img,
    category: rec.categoryType || '',
  } as MenuItem);
}

export function CartRecommendations({ cartItems }: { cartItems: CartItem[] }) {
  const { addItem, setIsOpen } = useCart();
  const { setPendingItemName } = useApp();
  const [recs, setRecs] = useState<Rec[]>([]);

  const debouncedKey = useDebounce(JSON.stringify(cartItems.map(i => i.name)), 600);

  useEffect(() => {
    if (cartItems.length === 0) { setRecs([]); return; }
    let cancelled = false;

    api.getRecommendations({ items: cartItems.map(i => ({ name: i.name, price: i.price })) })
      .then((data: unknown) => {
        if (!cancelled) setRecs(Array.isArray(data) ? (data as Rec[]) : []);
      })
      .catch(() => {});

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedKey]);

  if (recs.length === 0) return null;

  return (
    <div className={styles.wrap}>
      <p className={styles.label}>You might also like</p>
      <div className={styles.strip}>
        {recs.map((rec, i) => {
          const imgSrc = recommendationImage(rec);
          return (
            <button
              key={`${rec.name}-${i}`}
              className={styles.card}
              onClick={() => {
                setPendingItemName(rec.name);
                setIsOpen(false);
              }}
              aria-label={`View ${rec.name}`}
            >
              {imgSrc ? (
                <img
                  src={imgSrc}
                  alt={rec.name}
                  className={styles.img}
                  loading="lazy"
                  onError={e => {
                    const img = e.currentTarget;
                    if (img.dataset.fallback === '1') {
                      img.style.display = 'none';
                      return;
                    }
                    img.dataset.fallback = '1';
                    img.src = FALLBACK_IMAGE;
                  }}
                />
              ) : (
                <div className={styles.imgPlaceholder} />
              )}
              <div className={styles.info}>
                {rec.source_title && (
                  <span className={styles.sourceTag}>{rec.source_title}</span>
                )}
                <span className={styles.name}>{rec.name}</span>
                {rec.price > 0 && (
                  <span className={styles.price}>{formatPrice(rec.price)}</span>
                )}
              </div>
              {rec.price > 0 && (
                <div
                  className={styles.addBtn}
                  role="button"
                  aria-label={`Add ${rec.name} to cart`}
                  onClick={e => {
                    e.stopPropagation();
                    addItem({ name: rec.name, price: rec.price, img: imgSrc, description: rec.description || '' });
                  }}
                >
                  <Plus size={12} />
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
