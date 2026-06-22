import { useState } from 'react';
import { X, Plus, Minus } from 'lucide-react';
import { useWaiter } from '../../context/WaiterContext';
import { money } from '../../lib/waiterFormat';

export function SplitBillModal() {
  const { selectedTableId, orderTotal, closeOverlay, showToast } = useWaiter();
  const [guests, setGuests] = useState(4);
  const total = orderTotal || 0;
  const per = guests > 0 ? Math.ceil(total / guests) : 0;
  const num = selectedTableId ? selectedTableId.replace('table', '') : '';

  return (
    <div className="w-modal-wrap">
      <div className="w-backdrop" onClick={closeOverlay} />
      <div className="w-modal" style={{ position: 'relative', zIndex: 2 }}>
        <div className="w-modal-head">
          <div>
            <h2 className="w-modal-title">Split the bill</h2>
            <p className="w-modal-sub">Table {num} · Total {money(total)}</p>
          </div>
          <button className="w-modal-close" onClick={closeOverlay}><X size={18} /></button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24, margin: '24px 0' }}>
          <button className="w-pair-add" style={{ width: 48, height: 48 }} onClick={() => setGuests(g => Math.max(1, g - 1))}><Minus size={20} /></button>
          <div style={{ textAlign: 'center' }}>
            <div className="w-display" style={{ fontSize: 52, color: 'var(--w-text)' }}>{guests}</div>
            <div className="w-eyebrow-dim">Guests</div>
          </div>
          <button className="w-pair-add" style={{ width: 48, height: 48 }} onClick={() => setGuests(g => Math.min(20, g + 1))}><Plus size={20} /></button>
        </div>

        <div className="w-hero" style={{ padding: '18px' }}>
          <p className="w-eyebrow-dim">{money(total)} ÷ {guests} guests</p>
          <div className="w-hero-num" style={{ fontSize: 50 }}>{money(per)}</div>
          <p className="w-eyebrow-dim">Each</p>
        </div>

        <div style={{ marginTop: 14 }}>
          {Array.from({ length: guests }, (_, i) => (
            <div key={i} className="w-line" style={{ marginBottom: 8 }}>
              <span className="name" style={{ fontSize: 17 }}>Guest {i + 1}</span>
              <span className="price">{money(per)}</span>
            </div>
          ))}
        </div>

        <button className="w-btn-primary" style={{ marginTop: 14 }} onClick={() => { showToast('Split receipts sent to printer'); closeOverlay(); }}>
          Print split receipts
        </button>
      </div>
    </div>
  );
}
