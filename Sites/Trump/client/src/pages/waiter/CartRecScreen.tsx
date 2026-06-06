import { useEffect, useState, useCallback, useMemo } from 'react';
import { Gift } from 'lucide-react';
import { useWaiter } from '../../context/WaiterContext';
import { api } from '../../services/api';
import { money } from '../../lib/waiterFormat';
import { RecommendationCard, type RecommendationItem } from '../../components/reco/RecommendationCard';
import type { CartRecResponse } from '../../types/waiter';

export function CartRecScreen() {
  const { selectedTableId, order, events, addToOrder, showToast, setTab, shift } = useWaiter();
  const [data, setData] = useState<CartRecResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const event = selectedTableId ? events[selectedTableId] : undefined;
  // Stable signature so we only refetch when the cart actually changes.
  const cartSig = useMemo(() => order.map(l => `${l.name}x${l.quantity}`).join('|'), [order]);

  const load = useCallback(() => {
    if (!selectedTableId) return;
    setLoading(true);
    api.cartRecommendations({
      cart: order.map(l => ({ name: l.name, price: l.price, qty: l.quantity })),
      event: event?.type ?? null
    })
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTableId, cartSig, event?.type]);

  useEffect(() => { load(); }, [load]);

  if (!selectedTableId) {
    return (
      <div className="w-screen">
        <div className="w-empty">
          <p className="w-display" style={{ fontSize: 28 }}>Cart Recommendations</p>
          <p style={{ marginTop: 8 }}>Select a table to see AI upsell suggestions for its cart.</p>
          <button className="w-btn-ghost" style={{ marginTop: 18 }} onClick={() => setTab('floor')}>Go to floor</button>
        </div>
      </div>
    );
  }

  const num = selectedTableId.replace('table', '');
  const recs = data?.recommendations || [];

  function add(name: string, price: number, categoryType?: string) {
    addToOrder({ name, price, categoryType });
    showToast(`Added ${name}`);
    if (selectedTableId) {
      api.recordUpsell({ waiterName: shift.name, tableId: selectedTableId, suggestedItem: name, accepted: true, source: 'cart-rec', value: price }).catch(() => {});
    }
  }

  return (
    <div className="w-screen">
      <div className="w-order-head">
        <div className="w-order-tile"><small>TBL</small><b>{num}</b></div>
        <div style={{ flex: 1 }}>
          <p className="w-eyebrow-dim">CART RECOMMENDATIONS</p>
          <h1 className="w-display" style={{ fontSize: 28, marginTop: 2 }}>Grow this check</h1>
        </div>
        {data && data.potentialUplift > 0 && (
          <span className="w-status-tag" style={{ background: 'var(--w-gold-grad)', color: '#1a1407' }}>
            +{money(data.potentialUplift)}
          </span>
        )}
      </div>

      {event && (
        <div className="w-notes-banner" style={{ borderColor: 'rgba(200,165,85,0.5)' }}>
          <span style={{ fontSize: 18 }}>{event.emoji}</span>
          <span><b>{event.label}</b> — {event.action}</span>
        </div>
      )}

      <div className="w-section-label">
        <span className="w-eyebrow">Suggested upsells</span><span className="line" />
        <span className="w-eyebrow-dim">{order.length} in cart</span>
      </div>

      {loading && recs.length === 0 && <p className="w-empty">Analysing the cart…</p>}
      {!loading && recs.length === 0 && <p className="w-empty">Add items to the cart to get tailored suggestions.</p>}

      {/* Complimentary event gesture first */}
      {data?.eventRec && (
        <div className="w-card w-card-gold" style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Gift size={16} color="var(--w-gold)" />
            <span className="w-eyebrow">Complimentary gesture</span>
          </div>
          <p className="w-display" style={{ fontSize: 22, marginTop: 6 }}>{data.eventRec.name}</p>
          <p style={{ color: 'var(--w-text2)', fontSize: 13, marginTop: 2 }}>{data.eventRec.reason}</p>
          <p style={{ fontStyle: 'italic', color: 'var(--w-gold)', marginTop: 8, fontSize: 13 }}>“{data.eventRec.script}”</p>
        </div>
      )}

      {recs.map((r, i) => (
        <div key={`${r.name}-${i}`} style={{ marginBottom: 12 }}>
          <RecommendationCard
            variant="waiter"
            showReason
            item={r as RecommendationItem}
            note={r.script}
            uplift={r.upsell}
            addLabel={`Add to order · ${money(r.price)}`}
            onAdd={() => add(r.name, r.price, r.categoryType)}
          />
        </div>
      ))}
    </div>
  );
}
