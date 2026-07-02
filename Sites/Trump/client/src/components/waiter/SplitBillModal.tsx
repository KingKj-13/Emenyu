import { useMemo, useState } from 'react';
import { X, Plus, Minus } from 'lucide-react';
import { useWaiter } from '../../context/WaiterContext';
import { money } from '../../lib/waiterFormat';

type Mode = 'equal' | 'item' | 'custom';

// S14 — split equally, by item, or with custom amounts. Operates on the full
// table bill (already-sent items + waiter-added lines), supports any party size.
export function SplitBillModal() {
  const { selectedTableId, order, placedItems, closeOverlay, showToast } = useWaiter();
  const lines = useMemo(
    () => [...placedItems.map(p => ({ name: p.name, price: p.price, quantity: p.quantity })), ...order.map(o => ({ name: o.name, price: o.price, quantity: o.quantity }))],
    [placedItems, order]
  );
  const total = useMemo(() => lines.reduce((s, l) => s + l.price * l.quantity, 0), [lines]);
  const num = selectedTableId ? selectedTableId.replace('table', '') : '';

  const [mode, setMode] = useState<Mode>('equal');
  const [guests, setGuests] = useState(4);
  // By-item: lineIndex -> guest index (0-based). Custom: guest index -> amount.
  const [assign, setAssign] = useState<Record<number, number>>({});
  const [custom, setCustom] = useState<Record<number, string>>({});

  const equalPer = guests > 0 ? Math.ceil(total / guests) : 0;

  const itemTotals = useMemo(() => {
    const totals = Array.from({ length: guests }, () => 0);
    lines.forEach((l, i) => {
      const g = Math.min(assign[i] ?? 0, guests - 1);
      totals[g] += l.price * l.quantity;
    });
    return totals;
  }, [lines, assign, guests]);

  const customSum = useMemo(
    () => Object.values(custom).reduce((s, v) => s + (parseFloat(v) || 0), 0),
    [custom]
  );
  const customRemaining = Number((total - customSum).toFixed(2));

  function setGuestCount(next: number) {
    const n = Math.max(1, Math.min(20, next));
    setGuests(n);
  }

  return (
    <div className="w-modal-wrap">
      <div className="w-backdrop" onClick={closeOverlay} />
      <div className="w-modal" style={{ position: 'relative', zIndex: 2, maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="w-modal-head">
          <div>
            <h2 className="w-modal-title">Split the bill</h2>
            <p className="w-modal-sub">Table {num} · Total {money(total)}</p>
          </div>
          <button className="w-modal-close" onClick={closeOverlay}><X size={18} /></button>
        </div>

        <div className="wv-split-modes" role="tablist">
          {(['equal', 'item', 'custom'] as Mode[]).map(m => (
            <button key={m} role="tab" aria-selected={mode === m} className={mode === m ? 'active' : ''} onClick={() => setMode(m)}>
              {m === 'equal' ? 'Equally' : m === 'item' ? 'By item' : 'Custom'}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24, margin: '20px 0' }}>
          <button className="w-pair-add" style={{ width: 48, height: 48 }} onClick={() => setGuestCount(guests - 1)} aria-label="Fewer guests"><Minus size={20} /></button>
          <div style={{ textAlign: 'center' }}>
            <div className="w-display" style={{ fontSize: 48, color: 'var(--w-text)' }}>{guests}</div>
            <div className="w-eyebrow-dim">Guests</div>
          </div>
          <button className="w-pair-add" style={{ width: 48, height: 48 }} onClick={() => setGuestCount(guests + 1)} aria-label="More guests"><Plus size={20} /></button>
        </div>

        {mode === 'equal' && (
          <>
            <div className="w-hero" style={{ padding: '18px' }}>
              <p className="w-eyebrow-dim">{money(total)} ÷ {guests} guests</p>
              <div className="w-hero-num" style={{ fontSize: 50 }}>{money(equalPer)}</div>
              <p className="w-eyebrow-dim">Each</p>
            </div>
            <div style={{ marginTop: 14 }}>
              {Array.from({ length: guests }, (_, i) => (
                <div key={i} className="w-line" style={{ marginBottom: 8 }}>
                  <span className="name" style={{ fontSize: 17 }}>Guest {i + 1}</span>
                  <span className="price">{money(equalPer)}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {mode === 'item' && (
          <>
            {lines.length === 0 ? (
              <p className="wv-empty">No items on this table yet.</p>
            ) : (
              <div style={{ marginTop: 6 }}>
                {lines.map((l, i) => (
                  <div key={`${l.name}-${i}`} className="w-line" style={{ marginBottom: 8, gap: 8 }}>
                    <span className="name" style={{ fontSize: 15, flex: 1 }}>{l.quantity}× {l.name}</span>
                    <select
                      value={Math.min(assign[i] ?? 0, guests - 1)}
                      onChange={e => setAssign(prev => ({ ...prev, [i]: Number(e.target.value) }))}
                      style={{ padding: '6px 8px', borderRadius: 8, background: 'rgba(0,0,0,0.25)', color: 'inherit', border: '1px solid rgba(255,255,255,0.15)' }}
                    >
                      {Array.from({ length: guests }, (_, g) => <option key={g} value={g}>Guest {g + 1}</option>)}
                    </select>
                    <span className="price" style={{ minWidth: 64, textAlign: 'right' }}>{money(l.price * l.quantity)}</span>
                  </div>
                ))}
                <div style={{ marginTop: 14 }}>
                  {itemTotals.map((amt, i) => (
                    <div key={i} className="w-line" style={{ marginBottom: 6 }}>
                      <span className="name" style={{ fontSize: 16 }}>Guest {i + 1}</span>
                      <span className="price">{money(amt)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {mode === 'custom' && (
          <div style={{ marginTop: 6 }}>
            {Array.from({ length: guests }, (_, i) => (
              <div key={i} className="w-line" style={{ marginBottom: 8, gap: 8 }}>
                <span className="name" style={{ fontSize: 16, flex: 1 }}>Guest {i + 1}</span>
                <input
                  inputMode="decimal"
                  value={custom[i] ?? ''}
                  placeholder="0"
                  onChange={e => setCustom(prev => ({ ...prev, [i]: e.target.value.replace(/[^0-9.]/g, '') }))}
                  style={{ width: 110, padding: '8px 10px', borderRadius: 8, background: 'rgba(0,0,0,0.25)', color: 'inherit', border: '1px solid rgba(255,255,255,0.15)', textAlign: 'right', fontSize: 16 }}
                />
              </div>
            ))}
            <div className="w-line" style={{ marginTop: 12, fontWeight: 600 }}>
              <span className="name">{customRemaining === 0 ? 'Balanced' : customRemaining > 0 ? 'Remaining' : 'Over by'}</span>
              <span className="price" style={{ color: customRemaining === 0 ? 'var(--w-gold, #c6a24b)' : customRemaining < 0 ? '#fca5a5' : undefined }}>
                {money(Math.abs(customRemaining))}
              </span>
            </div>
          </div>
        )}

        <button className="w-btn-primary" style={{ marginTop: 16 }} onClick={() => { showToast('Split receipts sent to printer'); closeOverlay(); }}>
          Print split receipts
        </button>
      </div>
    </div>
  );
}
