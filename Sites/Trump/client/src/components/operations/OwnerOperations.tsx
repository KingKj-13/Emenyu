import { useState, useEffect, useCallback } from 'react';
import { opsApi } from '../../services/opsApi';
import type { OpsSnapshot } from '../../types/operations';

const money = (n: number) => 'R' + (Math.round((n || 0) * 100) / 100).toLocaleString('en-ZA');

// Phase 03B — Owner Operations dashboard. Renders the single operationsService
// snapshot; no calculations are duplicated in React. Auto-refreshes every 30s.
export function OwnerOperations() {
  const [snap, setSnap] = useState<OpsSnapshot | null>(null);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    try { setSnap(await opsApi.operations()); setErr(''); }
    catch (e) { setErr((e as Error).message); }
  }, []);

  useEffect(() => { load(); const t = window.setInterval(load, 30000); return () => window.clearInterval(t); }, [load]);

  if (err) return <div style={{ padding: 16, color: '#c0392b' }}>Failed to load operations: {err}</div>;
  if (!snap) return <div style={{ padding: 16, opacity: .6 }}>Loading operations…</div>;

  const tiles: [string, string | number][] = [
    ['Active Waiters', snap.activeWaiterCount],
    ['Active Managers', snap.activeManagerCount],
    ['Open Tables', snap.openTables],
    ['Tables Owned', snap.tablesOwned],
    ['Orders Today', snap.ordersToday],
    ['Revenue Today', money(snap.revenueToday)],
    ['Reservations Today', snap.reservationsToday],
    ['Unread Alerts', snap.notifications.unread],
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h3 style={{ margin: 0 }}>Operations</h3>
        <span style={{ fontSize: 12, opacity: .6 }}>
          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 8, background: snap.systemHealth.ok ? '#2e9e4f' : '#c0392b', marginRight: 6 }} />
          System {snap.systemHealth.ok ? 'healthy' : 'degraded'} · updated {new Date(snap.generatedAt).toLocaleTimeString()}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
        {tiles.map(([label, value]) => (
          <div key={label} style={{ background: '#fff', border: '1px solid #e7ddc8', borderRadius: 12, padding: 14, boxShadow: '0 1px 3px rgba(0,0,0,.05)' }}>
            <div style={{ fontSize: 26, fontWeight: 800, color: '#1a1206' }}>{value}</div>
            <div style={{ fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase', color: '#9b8a66', marginTop: 4 }}>{label}</div>
          </div>
        ))}
      </div>

      <h4 style={{ marginTop: 22, marginBottom: 8 }}>Waiter Performance (today)</h4>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: '#9b8a66', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em' }}>
              <th style={{ padding: '8px 10px' }}>Waiter</th>
              <th style={{ padding: '8px 10px' }}>Tables</th>
              <th style={{ padding: '8px 10px' }}>Orders</th>
              <th style={{ padding: '8px 10px' }}>Revenue</th>
            </tr>
          </thead>
          <tbody>
            {snap.waiterPerformance.length === 0 && (
              <tr><td colSpan={4} style={{ padding: 12, opacity: .5 }}>No activity yet today.</td></tr>
            )}
            {snap.waiterPerformance.map(w => (
              <tr key={w.waiter} style={{ borderTop: '1px solid #f0e9d8' }}>
                <td style={{ padding: '8px 10px', fontWeight: 600 }}>{w.waiter}</td>
                <td style={{ padding: '8px 10px' }}>{w.tables}</td>
                <td style={{ padding: '8px 10px' }}>{w.orders}</td>
                <td style={{ padding: '8px 10px' }}>{money(w.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 18, display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: 13 }}>
        <ActiveList title="On the floor — waiters" items={snap.activeWaiters} />
        <ActiveList title="On duty — managers" items={snap.activeManagers} />
      </div>
    </div>
  );
}

function ActiveList({ title, items }: { title: string; items: { username: string; startedAt: string }[] }) {
  return (
    <div>
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: '#9b8a66', marginBottom: 6 }}>{title}</div>
      {items.length === 0 && <div style={{ opacity: .5 }}>None active.</div>}
      {items.map(i => (
        <div key={i.username} style={{ padding: '2px 0' }}>
          {i.username} <span style={{ opacity: .5, fontSize: 12 }}>· since {new Date(i.startedAt).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
      ))}
    </div>
  );
}
