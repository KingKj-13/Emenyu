import { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { useCart } from '../../hooks/useCart';
import { useApp } from '../../context/AppContext';
import { useDebounce } from '../../hooks/useDebounce';
import { resolveImage } from '../../lib/imageResolver';
import { RecommendationCard, type RecommendationItem } from '../reco/RecommendationCard';
import type { CartItem } from '../../types/cart';
import type { MenuItem } from '../../types/menu';
import styles from './CartRecommendations.module.css';

interface Rec extends RecommendationItem {
  name: string;
  price: number;
}

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
        {recs.map((rec, i) => (
          <RecommendationCard
            key={`${rec.name}-${i}`}
            variant="compact"
            item={rec}
            onOpen={() => { setPendingItemName(rec.name); setIsOpen(false); }}
            onAdd={() => addItem({ name: rec.name, price: rec.price, img: recommendationImage(rec), description: rec.description || '' })}
          />
        ))}
      </div>
    </div>
  );
}
