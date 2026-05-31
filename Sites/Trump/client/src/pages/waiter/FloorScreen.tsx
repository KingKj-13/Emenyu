import { useEffect, useState, useCallback, useMemo } from 'react';
import { Search } from 'lucide-react';
import { useWaiter } from '../../context/WaiterContext';
import { useSocketEvent } from '../../hooks/useSocket';
import { api } from '../../services/api';
import { money } from '../../lib/waiterFormat';
import type { FloorState, FloorTable, TableStatusKind } from '../../types/waiter';

const STATUS_LABEL: Record<TableStatusKind, string> = {
  empty: 'Empty', seated: 'Seated', cooking: 'Cooking', ready: 'Ready', calling: 'Calling'
};

export function FloorScreen() {
  const { shift, selectTable, alerts } = useWaiter();
  const [floor, setFloor] = useState<FloorState | null>(null);
  const [query, setQuery] = useState('');

  const load = useCallback(() => { api.getFloor().then(setFloor).catch(() => setFloor(null)); }, []);
  useEffect(() => { load(); }, [load]);
  useSocketEvent('orderPlaced', load);
  useSocketEvent('orderUpdated', load);
  useSocketEvent('kitchenStatusUpdate', load);

  // Overlay transient "calling" state from live service-bell alerts.
  const callingTables = useMemo(
    () => new Set(alerts.filter(a => a.kind === 'bell' && a.state === 'live' && a.tableId).map(a => a.tableId!)),
    [alerts]
  );

  const tables: FloorTable[] = useMemo(() => {
    const base = floor?.tables || [];
    return base.map(t => (callingTables.has(t.tableId) ? { ...t, status: 'calling' as TableStatusKind } : t));
  }, [floor, callingTables]);

  const counts = useMemo(() => {
    const c = { seated: 0, calling: 0, cooking: 0, ready: 0 };
    for (const t of tables) {
      if (t.status === 'calling') c.calling++;
      else if (t.status === 'seated') c.seated++;
      else if (t.status === 'cooking') c.cooking++;
      else if (t.status === 'ready') c.ready++;
    }
    return c;
  }, [tables]);

  const filtered = query ? tables.filter(t => String(t.number).includes(query.trim())) : tables;
  const myTables = filtered.filter(t => shift.section.includes(t.number));
  const otherTables = filtered.filter(t => !shift.section.includes(t.number));

  return (
    <div className="w-screen">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Search size={18} color="var(--w-text3)" />
        <input className="w-floor-search" placeholder="Jump to table…" value={query} onChange={e => setQuery(e.target.value)} />
        <span className="w-eyebrow" style={{ whiteSpace: 'nowrap' }}>{floor?.tableCount ?? 30} Tables</span>
      </div>

      <div className="w-counter-row">
        <div className="w-counter seated"><b>{counts.seated}</b><span>Seated</span></div>
        <div className="w-counter calling"><b>{counts.calling}</b><span>Calling</span></div>
        <div className="w-counter cooking"><b>{counts.cooking}</b><span>Cooking</span></div>
        <div className="w-counter ready"><b>{counts.ready}</b><span>Ready</span></div>
      </div>

      <div className="w-section-label">
        <span className="w-eyebrow">My Section</span><span className="line" /><span className="w-eyebrow-dim">{myTables.length}</span>
      </div>
      <div className="w-table-grid">
        {myTables.map(t => (
          <button key={t.tableId} className={`w-table-card s-${t.status}`} onClick={() => selectTable(t.tableId)}>
            {t.status === 'calling' && <span className="calldot" />}
            {t.vip && t.status !== 'calling' && <span className="vip">★</span>}
            <div>
              <div className="num">{t.number}</div>
              <div className="seats">{t.guests ? `${t.guests}p` : '—'}</div>
              <span className="pill">{STATUS_LABEL[t.status]}</span>
            </div>
            <div className="foot">
              <span className="spend">{t.spend ? money(t.spend) : '—'}</span>
              {t.orderCount > 0 && <span className="ord">{t.orderCount} ord</span>}
            </div>
          </button>
        ))}
        {myTables.length === 0 && <p className="w-empty" style={{ gridColumn: '1/-1' }}>No tables match.</p>}
      </div>

      <div className="w-section-label">
        <span className="w-eyebrow">All Tables</span><span className="line" /><span className="w-eyebrow-dim">Tap to open</span>
      </div>
      <div className="w-table-grid">
        {otherTables.map(t => (
          <button key={t.tableId} className={`w-table-card view-only s-${t.status}`} style={{ textAlign: 'left' }} onClick={() => selectTable(t.tableId)}>
            {t.status === 'calling' && <span className="calldot" />}
            <div className="num" style={{ fontSize: 24 }}>{t.number}</div>
            <span className="pill">{STATUS_LABEL[t.status]}</span>
            {t.spend > 0 && <div className="spend" style={{ fontSize: 15, marginTop: 4 }}>{money(t.spend)}</div>}
          </button>
        ))}
      </div>
    </div>
  );
}
