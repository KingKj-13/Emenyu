import { useState } from 'react';
import { X, Printer, Users } from 'lucide-react';
import { formatPrice } from '../../lib/menuUtils';
import styles from './ReceiptView.module.css';

interface ReceiptItem {
  name: string;
  price: number;
  qty: number;
}

interface ReceiptViewProps {
  tableId: string;
  items: ReceiptItem[];
  onClose: () => void;
}

export function ReceiptView({ tableId, items, onClose }: ReceiptViewProps) {
  const [splitCount, setSplitCount] = useState(1);

  const subtotal = items.reduce((sum, i) => sum + i.price * i.qty, 0);
  const vat = subtotal * 0.15;
  const service = subtotal * 0.05;
  const total = subtotal + vat + service;
  const perPerson = splitCount > 1 ? total / splitCount : null;

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.receipt} onClick={e => e.stopPropagation()}>
        <div className={styles.receiptInner} id="receipt-print-area">
          <div className={styles.header}>
            <h1 className={styles.restaurantName}>TRUMPS</h1>
            <p className={styles.restaurantSub}>Premium Restaurant & Bar</p>
            <div className={styles.divider} />
            <div className={styles.meta}>
              <span>{tableId.replace(/^table/, 'Table ')}</span>
              <span>{dateStr} · {timeStr}</span>
            </div>
          </div>

          <div className={styles.divider} />

          <div className={styles.itemsList}>
            {items.map((item, i) => (
              <div key={i} className={styles.itemRow}>
                <span className={styles.itemQty}>{item.qty}×</span>
                <span className={styles.itemName}>{item.name}</span>
                <span className={styles.itemTotal}>{formatPrice(item.price * item.qty)}</span>
              </div>
            ))}
          </div>

          <div className={styles.divider} />

          <div className={styles.totals}>
            <div className={styles.totalRow}>
              <span>Subtotal</span>
              <span>{formatPrice(subtotal)}</span>
            </div>
            <div className={styles.totalRow}>
              <span>VAT (15%)</span>
              <span>{formatPrice(vat)}</span>
            </div>
            <div className={styles.totalRow}>
              <span>Service (5%)</span>
              <span>{formatPrice(service)}</span>
            </div>
            <div className={`${styles.totalRow} ${styles.grandTotal}`}>
              <span>Total</span>
              <span>{formatPrice(total)}</span>
            </div>
          </div>

          {perPerson && (
            <div className={styles.perPerson}>
              <span className={styles.perPersonLabel}>Per Person ({splitCount})</span>
              <span className={styles.perPersonAmount}>{formatPrice(perPerson)}</span>
            </div>
          )}

          <div className={styles.divider} />
          <p className={styles.footer}>Thank you for dining with us!</p>
        </div>

        <div className={styles.actions}>
          <div className={styles.splitRow}>
            <Users size={14} />
            <span className={styles.splitLabel}>Split between</span>
            <button className={styles.splitBtn} onClick={() => setSplitCount(c => Math.max(1, c - 1))}>−</button>
            <span className={styles.splitCount}>{splitCount}</span>
            <button className={styles.splitBtn} onClick={() => setSplitCount(c => Math.min(20, c + 1))}>+</button>
          </div>
          <div className={styles.actionBtns}>
            <button className={styles.closeBtn} onClick={onClose}>
              <X size={14} /> Close
            </button>
            <button className={styles.printBtn} onClick={() => window.print()}>
              <Printer size={14} /> Print
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
