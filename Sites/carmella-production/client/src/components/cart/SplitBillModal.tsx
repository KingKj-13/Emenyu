import { X } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { useCart } from '../../hooks/useCart';
import { formatPrice } from '../../lib/menuUtils';
import type { DeviceCartGroup } from '../../types/cart';
import styles from './SplitBillModal.module.css';

interface SplitBillModalProps {
  open: boolean;
  onClose: () => void;
}

// View-only reference split -- there is no payment integration (the whole
// cart is an estimate; guests still pay their host), so this simply shows
// each device's own subtotal plus its proportional share of VAT/service,
// the same way a waiter splitting a printed bill by seat would.
export function SplitBillModal({ open, onClose }: SplitBillModalProps) {
  const { getTotals, mine, others } = useCart();
  const totals = getTotals();
  const groups: DeviceCartGroup[] = [mine, ...others].filter(g => g.items.length > 0);

  function shareOf(group: DeviceCartGroup) {
    const share = totals.subtotal > 0 ? group.subtotal / totals.subtotal : 0;
    const vat = Math.round(totals.vat * share);
    const service = Math.round(totals.service * share);
    return { vat, service, total: group.subtotal + vat + service };
  }

  return (
    <Modal open={open} onClose={onClose} size="md">
      <div className={styles.modal}>
        <div className={styles.header}>
          <h3>Split Bill</h3>
          <button type="button" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>

        {groups.length === 0 ? (
          <p className={styles.emptyHint}>No items to split yet.</p>
        ) : (
          <div className={styles.groups}>
            {groups.map(group => {
              const share = shareOf(group);
              return (
                <div key={group.deviceId ?? 'mine'} className={styles.groupRow}>
                  <div className={styles.groupHeader}>
                    <span className={styles.groupLabel}>{group.label}</span>
                    <span className={styles.groupTotal}>{formatPrice(share.total)}</span>
                  </div>
                  <div className={styles.groupBreakdown}>
                    <span>Items {formatPrice(group.subtotal)}</span>
                    <span>VAT {formatPrice(share.vat)}</span>
                    <span>Service {formatPrice(share.service)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className={styles.grandRow}>
          <span>Table Grand Total</span>
          <span>{formatPrice(totals.total)}</span>
        </div>

        <p className={styles.note}>
          VAT and service are split proportionally by each person's share of the table's items. This is a
          reference only — please settle with your host.
        </p>
      </div>
    </Modal>
  );
}
