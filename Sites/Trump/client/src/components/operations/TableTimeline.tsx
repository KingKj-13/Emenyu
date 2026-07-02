import { useState, useEffect, useCallback } from 'react';
import { opsApi } from '../../services/opsApi';
import { ENDPOINTS } from '../../constants/api';
import type { OwnershipRow } from '../../types/operations';

interface TimelineEvent { at: string; stage: string; detail: string; kind: 'ownership' | 'request'; }

// Ownership change types → service-timeline stages.
const STAGE_FOR_CHANGE: Record<string, string> = {
  assign: 'Assigned', transfer: 'Reassigned', takeover: 'Reassigned', reassign: 'Reassigned', release: 'Closed'
};
const STAGE_COLOR: Record<string, string> = {
  Seated: '#6c8cd5', Assigned: '#cda85f', Reassigned: '#d59b3a', Order: '#7ed68a', Request: '#d4737a', Upsell: '#b07ed6', Bill: '#5fb0cd', Closed: '#8a8a8a'
};

// Phase 03B — service timeline for a table, ASSEMBLED from existing APIs (ownership
// history + waiter tasks). No new backend endpoint (assembly is possible from current
// data); order/seated/bill/upsell stages can be layered from the order/guest/upsell
// endpoints in a follow-up without backend changes.
export function TableTimeline({ tableId }: { tableId: string }) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const hist: OwnershipRow[] = await opsApi.ownershipHistory(tableId);
      const ownEvents: TimelineEvent[] = hist.map(h => ({
        at: h.assignedAt, kind: 'ownership',
        stage: STAGE_FOR_CHANGE[h.changeType] || 'Assigned',
        detail: `${h.waiterName}${h.previousWaiter ? ` (from ${h.previousWaiter})` : ''}${h.reason ? ` · ${h.reason}` : ''}`
      }));

      let taskEvents: TimelineEvent[] = [];
      try {
        const res = await fetch(ENDPOINTS.waiterTasks);
        if (res.ok) {
          const data = await res.json();
          const tasks: Array<{ tableId?: string; title?: string; type?: string; createdAt?: string }> =
            Array.isArray(data) ? data : (data?.tasks || []);
          taskEvents = tasks
            .filter(t => (t.tableId || '') === tableId && t.createdAt)
            .map(t => ({ at: t.createdAt as string, kind: 'request' as const, stage: 'Request', detail: t.title || t.type || 'Guest request' }));
        }
      } catch { /* tasks optional */ }

      setEvents([...ownEvents, ...taskEvents].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime()));
      setErr('');
    } catch (e) { setErr((e as Error).message); } finally { setLoading(false); }
  }, [tableId]);

  useEffect(() => { load(); }, [load]);

  return (
    <div style={{ background: '#14110d', color: '#eee', border: '1px solid #b8893d44', borderRadius: 12, padding: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <strong style={{ letterSpacing: '.04em' }}>Service timeline · Table {tableId}</strong>
        <button onClick={load} style={{ background: 'transparent', border: 'none', color: '#cda85f', cursor: 'pointer', fontSize: 12 }}>Refresh</button>
      </div>

      {loading && <div style={{ opacity: .6 }}>Loading…</div>}
      {err && <div style={{ color: '#e8918f', fontSize: 12 }}>{err}</div>}
      {!loading && events.length === 0 && <div style={{ opacity: .5, fontSize: 13 }}>No timeline events yet.</div>}

      <div style={{ position: 'relative', paddingLeft: 18 }}>
        {events.map((e, i) => (
          <div key={i} style={{ position: 'relative', paddingBottom: 14 }}>
            {i < events.length - 1 && <span style={{ position: 'absolute', left: -13, top: 14, bottom: -2, width: 2, background: '#ffffff14' }} />}
            <span style={{ position: 'absolute', left: -18, top: 3, width: 12, height: 12, borderRadius: 12, background: STAGE_COLOR[e.stage] || '#cda85f', border: '2px solid #14110d' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ fontWeight: 600, fontSize: 13, color: STAGE_COLOR[e.stage] || '#cda85f' }}>{e.stage}</span>
              <span style={{ fontSize: 11, opacity: .5, whiteSpace: 'nowrap' }}>
                {new Date(e.at).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <div style={{ fontSize: 12, opacity: .8 }}>{e.detail}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
