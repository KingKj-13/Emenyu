import { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { api } from '../../services/api';
import { useCart } from '../../hooks/useCart';
import { useApp } from '../../context/AppContext';
import { useDebounce } from '../../hooks/useDebounce';
import { formatPrice } from '../../lib/menuUtils';
import type { CartItem } from '../../types/cart';
import styles from './CartRecommendations.module.css';

interface Rec {
  name: string;
  price: number;
  img: string;
  source_title?: string;
  description?: string;
}

const DRINK_SOURCES = new Set([
  'Champagne', 'White Wine', 'Red Wine', 'Beers',
  'Spirits', 'Mocktails & Cold Beverages', 'Cocktails',
]);

function sortDrinksFirst(data: Rec[]): Rec[] {
  return [...data].sort((a, b) => {
    const aD = DRINK_SOURCES.has(a.source_title ?? '');
    const bD = DRINK_SOURCES.has(b.source_title ?? '');
    return aD === bD ? 0 : aD ? -1 : 1;
  });
}

export function CartRecommendations({ cartItems }: { cartItems: CartItem[] }) {
  const { addItem } = useCart();
  const { setPendingItemName } = useApp();
  const [recs, setRecs] = useState<Rec[]>([]);

  const debouncedKey = useDebounce(JSON.stringify(cartItems.map(i => i.name)), 600);

  useEffect(() => {
    if (cartItems.length === 0) { setRecs([]); return; }
    let cancelled = false;

    api.getRecommendations({ items: cartItems.map(i => ({ name: i.name, price: i.price })) })
      .then(async (data: unknown) => {
        if (cancelled) return;
        const arr = Array.isArray(data) ? (data as Rec[]) : [];
        const sorted = sortDrinksFirst(arr);

        const hasDrink = sorted.some(r => DRINK_SOURCES.has(r.source_title ?? ''));
        if (!hasDrink && cartItems.length > 0) {
          try {
            const first = cartItems[0];
            const pairing = await api.aiPairing({ name: first.name, price: first.price, description: first.description });
            const p = pairing as { pairings?: { name: string; reason: string }[] };
            if (!cancelled && p?.pairings?.length) {
              const wine: Rec = {
                name: p.pairings[0].name,
                price: 0,
                img: '',
                source_title: 'Wine Pairing',
                description: p.pairings[0].reason,
              };
              setRecs([wine, ...sorted]);
              return;
            }
          } catch { /* silently ignore pairing errors */ }
        }

        if (!cancelled) setRecs(sorted);
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
        {recs.map((rec, i) => (
          <button
            key={`${rec.name}-${i}`}
            className={`${styles.card} ${rec.price === 0 ? styles.cardPairing : ''}`}
            onClick={() => setPendingItemName(rec.name)}
            aria-label={`View ${rec.name}`}
          >
            {rec.img ? (
              <img src={rec.img} alt={rec.name} className={styles.img} loading="lazy" />
            ) : rec.price === 0 ? (
              <div className={styles.wineThumb}>🍷</div>
            ) : null}
            <div className={styles.info}>
              <span className={styles.name}>{rec.name}</span>
              {rec.price > 0 ? (
                <span className={styles.price}>{formatPrice(rec.price)}</span>
              ) : (
                <span className={styles.pairingTag}>Wine Pairing</span>
              )}
            </div>
            {rec.price > 0 && (
              <div
                className={styles.addBtn}
                role="button"
                aria-label={`Add ${rec.name} to cart`}
                onClick={e => {
                  e.stopPropagation();
                  addItem({ name: rec.name, price: rec.price, img: rec.img, description: rec.description || '' });
                }}
              >
                <Plus size={12} />
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
