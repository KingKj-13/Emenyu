import { useEffect, useState } from 'react';
import { X, Plus, Star, Sparkles, Minus } from 'lucide-react';
import { useWaiter } from '../../context/WaiterContext';
import { api } from '../../services/api';
import { resolveImage } from '../../lib/imageResolver';
import { money } from '../../lib/waiterFormat';
import type { CoachResponse } from '../../types/waiter';

export function ItemDetailSheet() {
  const { openItem, setOpenItem, addToOrder, showToast, selectedTableId, shift } = useWaiter();
  const [qty, setQty] = useState(1);
  const [coach, setCoach] = useState<CoachResponse | null>(null);

  useEffect(() => {
    if (!openItem) return;
    setQty(1);
    setCoach(null);
    api.coach({ dishName: openItem.name, cart: [{ name: openItem.name, price: openItem.price }], tone: 'luxury' })
      .then(setCoach)
      .catch(() => setCoach(null));
  }, [openItem]);

  if (!openItem) return null;
  const item = openItem;
  const pairings = coach ? [coach.suggestion, ...(coach.alternatives || [])].filter(Boolean) : [];

  const addMain = () => {
    addToOrder(item, qty);
    showToast(`Added ${qty}× ${item.name}`);
    setOpenItem(null);
  };

  const addPairing = (p: { name: string; price: number }) => {
    addToOrder(p);
    showToast(`Added ${p.name}`);
    if (selectedTableId) {
      api.recordUpsell({ waiterName: shift.name, tableId: selectedTableId, suggestedItem: p.name, accepted: true, source: 'pairing', value: p.price }).catch(() => {});
    }
  };

  return (
    <>
      <div className="w-backdrop" onClick={() => setOpenItem(null)} />
      <div className="w-sheet">
        <div className="w-sheet-handle" />
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className="w-sheet-close" onClick={() => setOpenItem(null)}><X size={18} /></button>
        </div>

        <div className="w-item-hero">
          {item.img && <img src={resolveImage(item)} alt={item.name} />}
          {item.chefPick && <span className="chef"><Star size={13} style={{ verticalAlign: '-2px' }} /> Chef's Pick</span>}
        </div>

        <div className="w-item-title">
          <h2>{item.name}</h2>
          <span className="price">{money(item.price)}</span>
        </div>
        {item.description && <p className="w-item-desc">{item.description}</p>}

        {coach && coach.sayToTable && (
          <div className="w-sable" style={{ marginTop: 18 }}>
            <div className="w-sable-head">
              <span className="w-sable-mark"><Sparkles size={17} /></span>
              <span className="w-sable-title">Chef Recommends</span>
              <span className="w-sable-badge">AI</span>
            </div>
            {coach.whyItWorks && <p className="w-sable-body">{coach.whyItWorks}</p>}
            <div className="w-saytable">
              <div className="lbl">Say to the table</div>
              <p className="quote">“{coach.sayToTable}”</p>
            </div>
            {pairings.map((p, i) => p && (
              <div key={`${p.name}-${i}`} className="w-pair-row">
                <div style={{ minWidth: 0 }}>
                  <div className="pn">{p.name}</div>
                  {p.reason && <div className="pr">{p.reason}</div>}
                </div>
                <span className="price" style={{ fontFamily: 'var(--w-font-display)', color: 'var(--w-gold-bright)' }}>{money(p.price)}</span>
                <button className="w-pair-add" onClick={() => addPairing(p)}><Plus size={16} /></button>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button className="w-btn-primary" style={{ flex: 1 }} onClick={addMain}>
            <Plus size={16} /> Add to order
          </button>
          <div className="w-stepper" style={{ padding: 6 }}>
            <button onClick={() => setQty(q => Math.max(1, q - 1))}><Minus size={16} /></button>
            <b>×{qty}</b>
            <button onClick={() => setQty(q => q + 1)}><Plus size={16} /></button>
          </div>
        </div>
      </div>
    </>
  );
}
