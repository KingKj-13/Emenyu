import styles from './Spinner.module.css';

export function Spinner({ size = 24 }: { size?: number }) {
  return (
    <div className={styles.spinner} style={{ width: size, height: size }} role="status" aria-label="Loading">
      <div className={styles.ring} />
    </div>
  );
}
