import { useState, useEffect, useMemo, type ComponentType } from 'react';
import { Fish, Beef, Leaf, Soup, ChefHat } from 'lucide-react';
import { RECOMMENDED_ORDERS, type PersonaOrder } from '../../constants/recommendedOrders';
import { formatPrice } from '../../lib/menuUtils';
import { RecommendationCard } from '../reco/RecommendationCard';
import { api } from '../../services/api';
import { useApp } from '../../context/AppContext';
import { trackImpressions, trackClick, type RecoContext, type RecoItemLike } from '../../lib/recoAnalytics';
import type { MenuItem } from '../../types/menu';
import { useT } from '../../i18n';
import styles from './RecommendedOrders.module.css';

interface Props {
  resolveItem: (name: string) => MenuItem | null;
  /** Tapping a course opens that dish — there is no cart to add it to. */
  onOpenItem: (name: string) => void;
}

// Icon for the curated persona bundles — a gold lucide glyph in place of the
// emoji the bundle data used to carry. Falls back to ChefHat for any
// live/admin-sourced bundle whose id isn't one of the five curated personas.
const PERSONA_ICON: Record<string, ComponentType<{ size?: number }>> = {
  sushi: Fish, steak: Beef, fish: Fish, veg: Leaf, pasta: Soup,
};

function OrderCard({ order, resolveItem, onOpenItem }: Props & { order: PersonaOrder }) {
  const t = useT();
  const total = order.courses.reduce((s, c) => s + c.price, 0);
  const ctx: RecoContext = { mode: 'customer', source: 'bundle', originatingName: order.persona };
  // Analytics items carry no source_title, so the event source resolves to "bundle".
  const analyticsItems: RecoItemLike[] = order.courses.map(c => ({ name: c.name, price: c.price }));

  // One impression per bundle card when it mounts (deduped per session in recoAnalytics).
  useEffect(() => {
    trackImpressions(analyticsItems, ctx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.id]);

  const PersonaIcon = PERSONA_ICON[order.id] ?? ChefHat;

  return (
    <div className={styles.card} style={{ ['--accent' as string]: order.accent }}>
      <div className={styles.cardHead}>
        <span className={styles.icon}><PersonaIcon size={20} /></span>
        <div className={styles.headText}>
          <span className={styles.persona}>{order.persona}</span>
          <span className={styles.blurb}>{order.blurb}</span>
        </div>
      </div>

      {/* Each course reuses the shared RecommendationCard (detailed variant) so the
          bundle shares the one card visual language; the bundle keeps its own
          persona header and its total. The course label rides in as the card's
          source tag. Tapping a course opens that dish. */}
      <div className={styles.courses}>
        {order.courses.map((course, i) => {
          const item = resolveItem(course.name);
          return (
            <RecommendationCard
              key={`${course.course}-${course.name}-${i}`}
              variant="detailed"
              item={{
                name: item?.name || course.name,
                price: course.price,
                img: item?.img,
                description: item?.description,
                categoryType: item?.categoryType,
                source_title: course.course
              }}
              onOpen={() => { trackClick({ name: course.name, price: course.price }, ctx); onOpenItem(course.name); }}
            />
          );
        })}
      </div>

      {/* The "Add order" button lived here. With no cart, the honest footer is
          what the three courses come to, and a reminder of who takes the order. */}
      <div className={styles.cardFoot}>
        <div className={styles.totalWrap}>
          <span className={styles.totalLabel}>{t('reco.fullOrder')}</span>
          <span className={styles.total}>{formatPrice(total)}</span>
        </div>
        <span className={styles.waiterHint}>{t('reco.askWaiter')}</span>
      </div>
    </div>
  );
}

export function RecommendedOrders(props: Props) {
  const t = useT();
  const { activeDayPartSlugs } = useApp();
  // DB-backed bundles (Phase 5). Start from the bundled constant so the strip paints
  // immediately and still works offline; override with live bundles when the API responds.
  const [rawOrders, setRawOrders] = useState<PersonaOrder[]>(RECOMMENDED_ORDERS);

  useEffect(() => {
    let cancelled = false;
    api.getBundles()
      .then(data => { if (!cancelled && Array.isArray(data) && data.length > 0) setRawOrders(data as PersonaOrder[]); })
      .catch(() => { /* keep the fallback */ });
    return () => { cancelled = true; };
  }, []);

  // Day/Night toggle: only surface bundles tagged for the active day-part.
  // Filtered client-side (not re-fetched) so flipping the toggle is instant.
  // Falls back to the unfiltered list if the filter would empty the strip
  // entirely -- a demo with a blank "not sure what to order?" strip reads as
  // broken, and every bundle we have is still a reasonable suggestion.
  const orders = useMemo(() => {
    if (!activeDayPartSlugs) return rawOrders;
    const filtered = rawOrders.filter(o => !o.daypart || activeDayPartSlugs.has(o.daypart));
    return filtered.length > 0 ? filtered : rawOrders;
  }, [rawOrders, activeDayPartSlugs]);

  if (orders.length === 0) return null;

  return (
    <section className={styles.wrap} aria-label={t('reco.title')}>
      <div className={styles.header}>
        <h2 className={styles.title}>{t('reco.title')}</h2>
        <p className={styles.sub}>One-tap chef pairings — a drink, starter, main &amp; dessert</p>
      </div>
      <div className={styles.strip}>
        {orders.map(order => (
          <OrderCard key={order.id} order={order} {...props} />
        ))}
        <div className={styles.endSpacer} aria-hidden />
      </div>
    </section>
  );
}
