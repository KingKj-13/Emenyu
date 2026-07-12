import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useCart } from '../../hooks/useCart';
import { useApp } from '../../context/AppContext';
import { resolveImage } from '../../lib/imageResolver';
import { RecommendationCard } from '../reco/RecommendationCard';
import { trackImpressions, trackClick, trackAccepted, type RecoContext } from '../../lib/recoAnalytics';
import type { CartRecommendation } from '../../context/CartContext';
import type { CartItem } from '../../types/cart';
import type { MenuItem } from '../../types/menu';
import styles from './CartRecommendations.module.css';

function recommendationImage(rec: CartRecommendation): string {
  return resolveImage({
    name: rec.name,
    price: rec.price,
    description: rec.description || '',
    img: rec.img,
    category: rec.categoryType || '',
  } as MenuItem);
}

function recoCtx(cartItems: CartItem[]): RecoContext {
  return { mode: 'customer', source: 'cart', originatingName: cartItems[cartItems.length - 1]?.name };
}

export function CartRecommendations({ cartItems }: { cartItems: CartItem[] }) {
  // Fetching itself now happens in CartProvider (starts the moment an item is
  // added to the cart, not just once this component -- a child of the
  // drawer's open state -- happens to mount). This just reads the result and
  // renders one at a time.
  const { addItem, setIsOpen, recommendations: recs } = useCart();
  const { setPendingItemName } = useApp();
  const [index, setIndex] = useState(0);

  // A fresh recommendation set (new cart signature) always starts back at
  // the top pick rather than whatever index the guest had scrolled to before.
  useEffect(() => { setIndex(0); }, [recs]);

  const ctx = recoCtx(cartItems);
  const current = recs[index];

  useEffect(() => {
    if (current) trackImpressions([current], ctx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  if (!current) return null;

  function go(delta: number) {
    setIndex(i => (i + delta + recs.length) % recs.length);
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.labelRow}>
        <p className={styles.label}>You might also like</p>
        {recs.length > 1 && (
          <div className={styles.nav}>
            <button type="button" className={styles.navBtn} onClick={() => go(-1)} aria-label="Previous recommendation">
              <ChevronLeft size={16} />
            </button>
            <span className={styles.navCount}>{index + 1}/{recs.length}</span>
            <button type="button" className={styles.navBtn} onClick={() => go(1)} aria-label="Next recommendation">
              <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>
      <div className={styles.strip}>
        <RecommendationCard
          key={`${current.name}-${index}`}
          variant="compact"
          item={current}
          onOpen={() => { trackClick(current, ctx); setPendingItemName(current.name); setIsOpen(false); }}
          onAdd={() => { trackAccepted(current, ctx); addItem({ name: current.name, price: current.price, img: recommendationImage(current), description: current.description || '', categoryType: current.categoryType, beverageKind: current.beverageKind }); }}
        />
      </div>
    </div>
  );
}
