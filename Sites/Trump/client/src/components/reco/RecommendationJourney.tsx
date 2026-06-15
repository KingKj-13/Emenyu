// The course-aware meal-journey rendered inside the item modal. It leads with a
// 3-slot journey (drink / your-choice / main, adapted to the open dish's course)
// driven by planJourney(), and renders every slot as the shared RecommendationCard
// so the journey and any continuation cards look identical.
import { Sparkles } from 'lucide-react';
import { RecommendationCard, type RecommendationItem } from './RecommendationCard';
import { planJourney } from './journey';
import { ASSISTANT_NAME } from '../../constants/config';
import type { MenuItem } from '../../types/menu';
import styles from './RecommendationJourney.module.css';

interface Props {
  item: MenuItem;
  pool: RecommendationItem[];
  onOpenItem: (rec: RecommendationItem) => void;
  assistantName?: string;
}

export function RecommendationJourney({ item, pool, onOpenItem, assistantName = ASSISTANT_NAME }: Props) {
  const { slots, narrative, leftovers } = planJourney(item, pool);

  // Lead with the 3-slot journey, then let any extra recommendations continue in
  // the same row so nothing the engine produced disappears.
  const cards = [...slots, ...leftovers];

  // Nothing meaningful to suggest beyond the dish itself.
  if (!cards.some(c => !c.youChoice)) return null;

  return (
    <section className={styles.journey} aria-label={`${assistantName} recommends`}>
      <div className={styles.header}>
        <Sparkles size={13} className={styles.icon} />
        <span className={styles.heading}>{assistantName.toUpperCase()} RECOMMENDS</span>
      </div>
      {narrative && <p className={styles.narrative}>{narrative}</p>}
      <div className={styles.row} data-noswipe>
        {cards.map((s, i) => (
          <RecommendationCard
            key={`${s.youChoice ? 'you' : 'card'}-${s.rec.name}-${i}`}
            variant="journey"
            playable
            item={s.rec}
            slotLabel={s.slotLabel}
            youChoice={s.youChoice}
            onOpen={s.youChoice ? undefined : () => onOpenItem(s.rec)}
          />
        ))}
      </div>
    </section>
  );
}
