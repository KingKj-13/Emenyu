import { useState, useRef, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { QUICK_ACTIONS } from './conciergeChips';
import styles from './PremiumQuickActionMenu.module.css';

interface Props {
  onSelect: (message: string) => void;
  disabled?: boolean;
}

export function PremiumQuickActionMenu({ onSelect, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  return (
    <div className={styles.wrap} ref={ref}>
      <button type="button" className={styles.trigger} onClick={() => setOpen(v => !v)} aria-label="Quick suggestions" aria-expanded={open} disabled={disabled}>
        <Plus size={15} />
      </button>
      {open && (
        <div className={styles.menu} role="menu">
          {QUICK_ACTIONS.map(action => (
            <button key={action.label} type="button" role="menuitem" className={styles.item} onClick={() => { onSelect(action.message); setOpen(false); }}>
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
