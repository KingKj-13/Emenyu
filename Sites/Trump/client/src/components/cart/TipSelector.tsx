import { useCart } from '../../hooks/useCart';
import type { TipMode } from '../../types/cart';
import styles from './TipSelector.module.css';

const TIP_OPTIONS: { value: TipMode; label: string }[] = [
  { value: 0, label: 'No tip' },
  { value: 0.05, label: '5%' },
  { value: 0.1, label: '10%' },
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
            onChange={e => setCustomTip(Number(e.target.value))}
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
