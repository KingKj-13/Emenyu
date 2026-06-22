import { useEffect, useState, useCallback } from 'react';
import { Plus, Minus, Flag, Sparkles, Send, Trash2, CheckCircle } from 'lucide-react';
import { useWaiter } from '../../context/WaiterContext';
import { useSocketEvent } from '../../hooks/useSocket';
import { api } from '../../services/api';
import { money } from '../../lib/waiterFormat';
import type { TableIntel } from '../../types/waiter';

export function OrderScreen() {
  const {
    selectedTableId, order, addToOrder, changeQty, removeLine, orderTotal,
    sendToKitchen, sending, notes, openOverlay, setTab, showToast, shift, clearOrder,
    placedItems, events
  } = useWaiter();
  const [closing, setClosing] = useState(false);

  async function completeAndResetTable() {
    if (!selectedTableId) return;
    if (!confirm('Complete all orders and reset this table for the next guests?')) return;
    setClosing(true);
    try {
      await api.waiterArchiveTable({ tableId: selectedTableId });
      clearOrder();
      showToast('Table completed & reset');
      setTab('floor');
    } catch {
      showToast('Could not reset table — try again');
    } finally {
      setClosing(false);
    }
  }

  const addSuggestion = useCallback((item: { name: string; price: number; categoryType?: string }) => {
    addToOrder(item);
    showToast(`Added ${item.name}`);
    if (selectedTableId) {
      api.recordUpsell({ waiterName: shift.name, tableId: selectedTableId, suggestedItem: item.name, accepted: true, source: 'opportunity', value: item.price }).catch(() => {});
    }
  }, [addToOrder, showToast, selectedTableId, shift.name]);
  const [intel, setIntel] = useState<TableIntel | null>(null);
  const [covers, setCovers] = useState(0);

  const loadIntel = useCallback(() => {
    if (!selectedTableId) return;
    api.getTableIntel(selectedTableId).then(setIntel).catch(() => setIntel(null));
  }, [selectedTableId]);

  useEffect(() => { setIntel(null); loadIntel(); }, [loadIntel]);
  useEffect(() => { setCovers(Number(intel?.tableInfo?.guests) || 0); }, [intel?.tableInfo?.guests]);
  useSocketEvent('orderPlaced', loadIntel);
  // Guest live-cart sync is handled globally in WaiterContext (works on any tab).

  async function changeCovers(next: number) {
    if (!selectedTableId) return;
    const v = Math.max(0, Math.min(50, next));
    setCovers(v);
    try { await api.setTableCovers(selectedTableId, v); } catch { /* covers is best-effort */ }
  }

  if (!selectedTableId) {
    return (
      <div className="w-screen">
        <div className="w-empty">
          <p className="w-display" style={{ fontSize: 28 }}>Select a table</p>
          <p style={{ marginTop: 8 }}>Tap a table on the floor to start an order.</p>
          <button className="w-btn-ghost" style={{ marginTop: 18 }} onClick={() => setTab('floor')}>Go to floor</button>
        </div>
      </div>
    );
  }

  const num = selectedTableId.replace('table', '');
  const info = intel?.tableInfo;
  const note = notes[selectedTableId];
  const guest = intel?.guestIntel;
  const opp = intel?.opportunity;
  const event = events[selectedTableId];

  return (
    <div className="w-screen">
      <div className="w-order-head">
        <div className="w-order-tile"><small>TBL</small><b>{num}</b></div>
        <div style={{ flex: 1 }}>
          <p className="w-eyebrow-dim">{info?.guests ? `${info.guests} guests · ` : ''}{(info?.waiter || shift.name || '').toUpperCase()}</p>
          <h1 className="w-display" style={{ fontSize: 30, marginTop: 2 }}>Table {num}</h1>
        </div>
        <span className="w-status-tag">{(info?.status || 'seated').toUpperCase()}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '2px 0 12px' }}>
        <span className="w-eyebrow">Party size</span>
        <button
          type="button"
          aria-label="Fewer guests"
          onClick={() => changeCovers(covers - 1)}
          style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--w-border, rgba(200,165,85,0.3))', background: 'rgba(255,255,255,0.04)', color: 'var(--w-gold, #c8a555)', fontSize: 18, lineHeight: 1, cursor: 'pointer' }}
        >−</button>
        <b style={{ minWidth: 24, textAlign: 'center', fontSize: 16, color: 'var(--w-text, #f3ead6)' }}>{covers || '—'}</b>
        <button
          type="button"
          aria-label="More guests"
          onClick={() => changeCovers(covers + 1)}
          style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--w-border, rgba(200,165,85,0.3))', background: 'rgba(255,255,255,0.04)', color: 'var(--w-gold, #c8a555)', fontSize: 18, lineHeight: 1, cursor: 'pointer' }}
        >+</button>
      </div>

      {event && (
        <div className="w-notes-banner" style={{ borderColor: 'rgba(200,165,85,0.55)' }}>
          <span style={{ fontSize: 18 }}>{event.emoji}</span>
          <span><b>{event.label}</b> — {event.action || 'Offer a complimentary Chocolate Lava Cake'}</span>
        </div>
      )}

      {(note?.text || guest?.allergies || guest?.notes) && (
        <div className="w-notes-banner">
          <Flag size={15} className="flag" />
          <span>
            {note?.text
              ? note.text
              : <>{guest?.preferredSeating ? `${guest.preferredSeating} · ` : ''}{guest?.allergies ? <span className="allergy">{guest.allergies} allergy</span> : guest?.notes}</>}
          </span>
          <button className="edit" onClick={() => openOverlay('notes')}>Edit</button>
        </div>
      )}

      <button className="w-quickadd" onClick={() => setTab('menu')}>
        <Plus size={18} color="var(--w-gold)" /> Quick add an item…
      </button>

      {placedItems.length > 0 && (
        <>
          <div className="w-section-label">
            <span className="w-eyebrow">Already Ordered</span><span className="line" /><span className="w-eyebrow-dim">{placedItems.length} items</span>
          </div>
          {placedItems.map((line, i) => (
            <div key={`placed-${line.name}-${i}`} className="w-line" style={{ opacity: 0.9 }}>
              <div style={{ minWidth: 0 }}>
                <div className="name">{line.name}<span className="w-guest-tag" style={{ marginLeft: 8, background: 'rgba(95,207,138,0.15)', color: '#5fcf8a' }}>SENT</span></div>
                <div className="each">{money(line.price)} each</div>
              </div>
              <b style={{ color: 'var(--w-text2)', minWidth: 28, textAlign: 'center' }}>×{line.quantity}</b>
              <span className="price">{money(line.price * line.quantity)}</span>
            </div>
          ))}
        </>
      )}

      <div className="w-section-label">
        <span className="w-eyebrow">Current Order</span><span className="line" /><span className="w-eyebrow-dim">{order.length} items</span>
      </div>

      {order.length === 0 && <p className="w-empty">No items yet — add from the menu.</p>}
      {order.map((line, i) => (
        <div key={`${line.name}-${i}`} className={`w-line ${line.source === 'guest' ? 'guest' : ''}`}>
          <div style={{ minWidth: 0 }}>
            <div className="name">{line.name}{line.source === 'guest' && <span className="w-guest-tag" style={{ marginLeft: 8 }}>GUEST</span>}</div>
            <div className="each">{money(line.price)} each</div>
          </div>
          <div className="w-stepper">
            <button onClick={() => changeQty(i, -1)}><Minus size={15} /></button>
            <b>{line.quantity}</b>
            <button onClick={() => changeQty(i, 1)}><Plus size={15} /></button>
          </div>
          <span className="price">{money(line.price * line.quantity)}</span>
          <button onClick={() => removeLine(i)} style={{ color: 'var(--w-text3)' }} aria-label="Remove"><Trash2 size={15} /></button>
        </div>
      ))}

      {/* SABLE · table pitch */}
      {intel?.pitch && (
        <div className="w-sable">
          <div className="w-sable-head">
            <span className="w-sable-mark"><Sparkles size={17} /></span>
            <span className="w-sable-title">Sable · Table Pitch</span>
            <span className="w-sable-badge">AI</span>
          </div>
          <p className="w-sable-body">{intel.pitch}</p>
          {opp?.hasOpportunity && opp.suggestedItem && (
            <div className="w-pair-row">
              <div>
                <div className="pn">{opp.suggestedItem.name}</div>
                <div className="pr">{opp.bestAction} · {Math.round((opp.probability || 0) * 100)}% likely</div>
              </div>
              <button className="w-pair-add" onClick={() => opp.suggestedItem && addSuggestion(opp.suggestedItem)}>
                <Plus size={17} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Guest intelligence */}
      {guest?.present && (
        <div className="w-card w-card-gold" style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="w-eyebrow">Guest Intelligence</span>
            {guest.vip && <span className="w-tag vip">VIP</span>}
          </div>
          <p className="w-display" style={{ fontSize: 24, marginTop: 8 }}>{guest.name}</p>
          <div className="w-intel-row">
            <div><div className="k">Visits</div><div className="v">{guest.visitCount}</div></div>
            <div><div className="k">Avg spend</div><div className="v">{money(guest.avgSpend)}</div></div>
            <div><div className="k">Lifetime</div><div className="v">{money(guest.lifetimeSpend)}</div></div>
          </div>
          <div className="w-tagline">
            {guest.favorites?.wine && <span className="w-tag">♥ {guest.favorites.wine}</span>}
            {guest.favorites?.main && <span className="w-tag">♥ {guest.favorites.main}</span>}
            {guest.allergies && <span className="w-tag allergy">⚠ {guest.allergies}</span>}
            {(guest.avoids || []).map(a => <span key={a} className="w-tag">Avoids {a}</span>)}
          </div>
        </div>
      )}

      <div className="w-total-bar">
        <span className="tl">Order total</span>
        <span className="tv">{money(orderTotal)}</span>
      </div>
      <button className="w-btn-primary" disabled={order.length === 0 || sending} onClick={sendToKitchen}>
        <Send size={16} /> {sending ? 'Sending…' : 'Send to Kitchen'}
      </button>
      <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
        <button className="w-btn-ghost" style={{ flex: 1 }} onClick={() => openOverlay('split')}>Split bill</button>
        <button className="w-btn-ghost" style={{ flex: 1 }} onClick={() => openOverlay('recovery')}>Service recovery</button>
      </div>
      <button
        className="w-btn-ghost"
        style={{ marginTop: 10, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, borderColor: 'rgba(95,207,138,0.5)', color: '#5fcf8a' }}
        onClick={completeAndResetTable}
        disabled={closing}
      >
        <CheckCircle size={16} /> {closing ? 'Closing table…' : 'Complete & reset table'}
      </button>
    </div>
  );
}
