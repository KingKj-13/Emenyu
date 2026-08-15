import { X } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { CowMeatSelector } from './CowMeatSelector';
import type { ServerCut } from './useButcheryCuts';
import type { MenuItem } from '../../types/menu';
import styles from './ButcheryModal.module.css';

interface ButcheryModalProps {
  open: boolean;
  onClose: () => void;
  items: MenuItem[];
  serverCuts: Map<string, ServerCut> | null;
  onOpenItem: (item: MenuItem) => void;
  initialCut?: string | null;
}

/**
 * Full-screen host for CowMeatSelector, triggered from the header's cow icon
 * (and from a dish's "From the X" link) rather than embedded inline in the
 * menu — see MenuPage.tsx and GlobalButcheryModal.tsx. Without `mobileEntry`,
 * CowMeatSelector always renders the full chart (no collapsed trigger row),
 * which is what a deliberately-opened modal should show.
 */
export function ButcheryModal({ open, onClose, items, serverCuts, onOpenItem, initialCut }: ButcheryModalProps) {
  return (
    <Modal open={open} onClose={onClose} size="full">
      <div className={styles.wrap}>
        <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>
        <CowMeatSelector
          items={items}
          serverCuts={serverCuts}
          initialCut={initialCut}
          onOpenItem={onOpenItem}
        />
      </div>
    </Modal>
  );
}
