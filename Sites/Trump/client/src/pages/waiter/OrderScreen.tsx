import { useEffect, useState, useCallback } from 'react';
import { Plus, Minus, Flag, Sparkles, Send, Trash2 } from 'lucide-react';
import { useWaiter } from '../../context/WaiterContext';
import { useSocketEvent } from '../../hooks/useSocket';
import { api } from '../../services/api';
import { money } from '../../lib/waiterFormat';
import type { TableIntel } from '../../types/waiter';

export function OrderScreen() {
  const {
    selectedTableId, order, seedGuestLines, addToOrder, changeQty, removeLine, orderTotal,
    sendToKitchen, sending, notes, openOverlay, setTab, showToast, shift
  } = useWaiter();

  const addSuggestion = useCallback((item: { name: string; price: number; categoryType?: string }) => {
    addToOrder(item);
    showToast(`Added ${item.name}`);
    if (selectedTableId) {
      api.recordUpsell({ waiterName: shift.name, tableId: selectedTableId, suggestedItem: item.name, accepted: true, source: 'opportunity', value: item.price }).catch(() => {});
    }
  }, [addToOrder, showToast, selectedTableId, shift.name]);
  const [intel, setIntel] = useState<TableIntel | null>(null);

  const loadIntel = useCallback(() => {
    if (!selectedTableId) return;
    api.getTableIntel(selectedTableId).then(setIntel).catch(() => setIntel(null));
  }, [selectedTableId]);

  useEffect(() => { setIntel(null); loadIntel(); }, [loadIntel]);
  useSocketEvent('orderPlaced', loadIntel);

  // Pull the guest's live cart into the order builder as GUEST-tagged lines.
  useSocketEvent<{ tableId?: string; cart?: { name?: string; price?: number; qty?: number; quantity?: number }[] }>('syncCart', p => {
    if (selectedTableId && p?.tableId === selectedTableId && Array.isArray(p.cart)) {
      seedGuestLines(selectedTableId, p.cart);
    }
  });

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
    </div>
  );
}
