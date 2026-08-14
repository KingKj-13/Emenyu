import { useState } from 'react';
import { X, Printer, Users, Minus, Plus } from 'lucide-react';
import { formatPrice } from '../../lib/menuUtils';
import { LANDING_BRAND_NAME, BRAND_TAGLINE } from '../../constants/api';
import { VAT_RATE, SERVICE_RATE } from '../../constants/config';
import styles from './PremiumReceiptView.module.css';

interface ReceiptItem {
  name: string;
  price: number;
  qty: number;
}

interface Props {
  tableId: string;
  items: ReceiptItem[];
  onClose: () => void;
}

export function PremiumReceiptView({ tableId, items, onClose }: Props) {
  const [splitCount, setSplitCount] = useState(1);

  const subtotal = items.reduce((sum, i) => sum + i.price * i.qty, 0);
  const vat = subtotal * VAT_RATE;
  const service = subtotal * SERVICE_RATE;
  const total = subtotal + vat + service;
  const perPerson = splitCount > 1 ? total / splitCount : null;

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.receipt} onClick={e => e.stopPropagation()} role="dialog" aria-label="Bill">
        <div className={styles.inner} id="premium-receipt-print-area">
          <div className={styles.header}>
            <div className={styles.brand}>{LANDING_BRAND_NAME}</div>
            <div className={styles.tagline}>{BRAND_TAGLINE}</div>
          </div>
          <div className={styles.divider} />
          <div className={styles.meta}>
            <span>{tableId.replace(/^table/i, 'Table ')}</span>
            <span>{dateStr} · {timeStr}</span>
          </div>
          <div className={styles.divider} />

          {items.map((item, i) => (
            <div key={i} className={styles.itemRow}>
              <span className={styles.itemQty}>{item.qty}×</span>
              <span className={styles.itemName}>{item.name}</span>
              <span className={styles.itemTotal}>{formatPrice(item.price * item.qty)}</span>
            </div>
          ))}

          <div className={styles.divider} />

          <div className={styles.totals}>
            <div className={styles.totalRow}><span>Subtotal</span><span>{formatPrice(subtotal)}</span></div>
            <div className={styles.totalRow}><span>VAT ({Math.round(VAT_RATE * 100)}%)</span><span>{formatPrice(vat)}</span></div>
            <div className={styles.totalRow}><span>Service ({Math.round(SERVICE_RATE * 100)}%)</span><span>{formatPrice(service)}</span></div>
            <div className={`${styles.totalRow} ${styles.grandTotal}`}><span>Total</span><span>{formatPrice(total)}</span></div>
          </div>

          {perPerson && (
            <div className={styles.perPerson}>
              <span className={styles.perPersonLabel}>Per Person ({splitCount})</span>
              <span className={styles.perPersonAmount}>{formatPrice(perPerson)}</span>
            </div>
          )}

          <p className={styles.footerNote}>Thank you for dining with us.</p>
        </div>

        <div className={styles.actions}>
          <div className={styles.splitRow}>
            <Users size={13} />
            <span className={styles.splitLabel}>Split between</span>
            <button type="button" className={styles.splitBtn} onClick={() => setSplitCount(c => Math.max(1, c - 1))} aria-label="Fewer guests"><Minus size={13} /></button>
            <span className={styles.splitCount}>{splitCount}</span>
            <button type="button" className={styles.splitBtn} onClick={() => setSplitCount(c => Math.min(20, c + 1))} aria-label="More guests"><Plus size={13} /></button>
          </div>
          <div className={styles.actionBtns}>
            <button type="button" className={styles.closeBtn} onClick={onClose}><X size={13} /> Close</button>
            <button type="button" className={styles.printBtn} onClick={() => window.print()}><Printer size={13} /> Print</button>
          </div>
        </div>
      </div>
    </div>
  );
}
