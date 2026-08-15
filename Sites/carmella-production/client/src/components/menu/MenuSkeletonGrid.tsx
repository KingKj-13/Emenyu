import { Skeleton } from '../ui/Skeleton';
import styles from './MenuSkeletonGrid.module.css';

// Mirrors MenuCard's anatomy (image / name / desc / price row) so the loading
// state reads as "the menu is about to appear here", not a generic spinner.
function CardSkeleton() {
  return (
    <div className={styles.card}>
      <Skeleton height="100%" className={styles.image} />
      <div className={styles.body}>
        <Skeleton height={16} width="70%" radius="var(--radius-xs)" />
        <Skeleton height={12} width="94%" radius="var(--radius-xs)" style={{ marginTop: 10 }} />
        <Skeleton height={12} width="55%" radius="var(--radius-xs)" style={{ marginTop: 6 }} />
        <div className={styles.footer}>
          <div className={styles.priceSkeleton}>
            <Skeleton height={20} radius="var(--radius-xs)" />
          </div>
          <div className={styles.btnSkeleton}>
            <Skeleton height={38} radius="var(--radius-pill)" />
          </div>
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
