import { Skeleton } from '../ui/Skeleton';
import styles from './MenuSkeletonGrid.module.css';

// Mirrors MenuCard's anatomy (image / name / desc / price row) so the loading
// state reads as "the menu is about to appear here", not a generic spinner.
function CardSkeleton() {
  return (
    <div className={styles.card}>
      <Skeleton height="100%" className={styles.image} />
      <div className={styles.body}>
        <Skeleton height={14} width="72%" radius={3} />
        <Skeleton height={12} width="94%" radius={3} style={{ marginTop: 10 }} />
        <Skeleton height={12} width="60%" radius={3} style={{ marginTop: 6 }} />
        <div className={styles.footer}>
          <Skeleton height={18} width={54} radius={3} />
          <Skeleton height={38} width="100%" radius={4} style={{ marginTop: 10 }} />
        </div>
      </div>
    </div>
  );
}

export function MenuSkeletonGrid({ cards = 6 }: { cards?: number }) {
  return (
    <div className={styles.grid} aria-hidden="true">
      {Array.from({ length: cards }, (_, i) => <CardSkeleton key={i} />)}
    </div>
  );
}
