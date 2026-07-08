import { useState, useRef, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { QUICK_ACTIONS } from './conciergeChips';
import styles from './QuickActionMenu.module.css';

interface QuickActionMenuProps {
  onSelect: (message: string) => void;
  disabled?: boolean;
}

// Phase 5 (AI Concierge) — a small button beside the message box that opens
// a compact menu of canned questions. Selecting one sends it exactly like the
// guest typed it themselves; the engine answers it the normal way.
export function QuickActionMenu({ onSelect, disabled }: QuickActionMenuProps) {
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
      <button
        type="button"
        className={styles.trigger}
        onClick={() => setOpen(v => !v)}
        aria-label="Quick suggestions"
        aria-expanded={open}
        disabled={disabled}
      >
        <Plus size={16} />
      </button>
      {open && (
        <div className={styles.menu} role="menu">
          {QUICK_ACTIONS.map(action => (
            <button
              key={action.label}
              type="button"
              role="menuitem"
              className={styles.item}
              onClick={() => { onSelect(action.message); setOpen(false); }}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
