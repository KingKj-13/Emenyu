import { type ReactNode } from 'react';
import styles from './Badge.module.css';

interface BadgeProps {
  children: ReactNode;
  variant?: 'gold' | 'red' | 'purple' | 'muted';
}

export function Badge({ children, variant = 'gold' }: BadgeProps) {
  return <span className={`${styles.badge} ${styles[variant]}`}>{children}</span>;
}
