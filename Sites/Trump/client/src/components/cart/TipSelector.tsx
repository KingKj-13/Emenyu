import { useCart } from '../../hooks/useCart';
import type { TipMode } from '../../types/cart';
import styles from './TipSelector.module.css';

// 10% anchored as the middle percentage (5/10/15/Custom) rather than 5% — a
// 5% anchor under-tips relative to full-service norms and costs staff real money.
const TIP_OPTIONS: { value: TipMode; label: string }[] = [
  { value: 0, label: 'No tip' },
  { value: 0.05, label: '5%' },
  { value: 0.1, label: '10%' },
  { value: 0.15, label: '15%' },
  { value: 'custom', label: 'Custom' },
];

export function TipSelector() {
  const { tipMode, customTip, setTipMode, setCustomTip } = useCart();

  return (
    <div className={styles.wrap} role="group" aria-label="Tip selection">
      <p className={styles.label}>Add a tip?</p>
      <div className={styles.options}>
        {TIP_OPTIONS.map(opt => (
          <button
            key={String(opt.value)}
            className={`${styles.option} ${tipMode === opt.value ? styles.optionActive : ''}`}
            onClick={() => setTipMode(opt.value)}
            aria-pressed={tipMode === opt.value}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {tipMode === 'custom' && (
        <div className={styles.customRow}>
          <input
            type="number"
            className={styles.customInput}
            value={customTip || ''}
            onChange={e => setCustomTip(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
            placeholder="0"
            min={0}
            max={100}
            aria-label="Custom tip percentage"
          />
          <span className={styles.customPct}>%</span>
        </div>
      )}
    </div>
  );
}
