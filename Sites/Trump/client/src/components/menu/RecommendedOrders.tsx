import { useState } from 'react';
import { Plus, ShoppingCart } from 'lucide-react';
import { RECOMMENDED_ORDERS, type PersonaOrder } from '../../constants/recommendedOrders';
import { formatPrice } from '../../lib/menuUtils';
import { RecommendationCard } from '../reco/RecommendationCard';
import type { MenuItem } from '../../types/menu';
import styles from './RecommendedOrders.module.css';

interface Props {
  resolveItem: (name: string) => MenuItem | null;
  onOpenItem: (name: string) => void;
  onAddOrder: (names: string[]) => void;
}

function OrderCard({ order, resolveItem, onOpenItem, onAddOrder }: Props & { order: PersonaOrder }) {
  const [added, setAdded] = useState(false);
  const total = order.courses.reduce((s, c) => s + c.price, 0);

  function addAll() {
    onAddOrder(order.courses.map(c => c.name));
    setAdded(true);
    setTimeout(() => setAdded(false), 1600);
  }

  return (
    <div className={styles.card} style={{ ['--accent' as string]: order.accent }}>
      <div className={styles.cardHead}>
        <span className={styles.icon}>{order.icon}</span>
        <div className={styles.headText}>
          <span className={styles.persona}>{order.persona}</span>
          <span className={styles.blurb}>{order.blurb}</span>
        </div>
      </div>

      {/* Each course reuses the shared RecommendationCard (detailed variant) so the
          bundle shares the one card visual language; the bundle keeps its own
          persona header + add-all footer. The course label rides in as the card's
          source tag. (Phase 4, Task 3.) */}
      <div className={styles.courses}>
        {order.courses.map(course => {
          const item = resolveItem(course.name);
          return (
            <RecommendationCard
              key={course.course}
              variant="detailed"
              item={{
                name: item?.name || course.name,
                price: course.price,
                img: item?.img,
                description: item?.description,
                categoryType: item?.categoryType,
                source_title: course.course
              }}
              onOpen={() => onOpenItem(course.name)}
            />
          );
        })}
      </div>

      <div className={styles.cardFoot}>
        <div className={styles.totalWrap}>
          <span className={styles.totalLabel}>Full order</span>
          <span className={styles.total}>{formatPrice(total)}</span>
        </div>
        <button className={`${styles.addBtn} ${added ? styles.addBtnDone : ''}`} onClick={addAll}>
          {added ? <>Added ✓</> : <><ShoppingCart size={15} /> Add order</>}
        </button>
      </div>
    </div>
  );
}

export function RecommendedOrders(props: Props) {
  return (
    <section className={styles.wrap} aria-label="Recommended orders">
      <div className={styles.header}>
        <h2 className={styles.title}>Not sure what to order?</h2>
        <p className={styles.sub}>One-tap chef pairings — a drink, starter, main &amp; dessert</p>
      </div>
      <div className={styles.strip}>
        {RECOMMENDED_ORDERS.map(order => (
          <OrderCard key={order.id} order={order} {...props} />
        ))}
        <div className={styles.endSpacer} aria-hidden><Plus size={0} /></div>
      </div>
    </section>
  );
}
