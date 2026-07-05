import { useState, useEffect, useCallback } from 'react';
import { opsApi } from '../../services/opsApi';
import type { ShiftStatus, ShiftRow } from '../../types/operations';
import { formatCurrency } from '../../lib/currency';
import { useWaiter } from '../../context/WaiterContext';

function fmtDuration(fromIso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(fromIso).getTime()) / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return `${h}h ${String(m).padStart(2, '0')}m`;
}
const money = (n: number) => formatCurrency(n);

// Phase 03B — waiter shift control: start / live timer / end + end-of-shift summary.
// Consumes /api/shift/me, /shift/start, /shift/end only.
export function ShiftPanel() {
  const { shift: waiterShift } = useWaiter();
  const [status, setStatus] = useState<ShiftStatus | null>(null);
  const [summary, setSummary] = useState<ShiftRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [, tick] = useState(0);

  const load = useCallback(async () => {
    try { setStatus(await opsApi.getMyShift()); setErr(''); }
    catch (e) { setErr((e as Error).message); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = window.setInterval(() => tick(x => x + 1), 30000); return () => window.clearInterval(t); }, []);

  async function start() {
    setBusy(true); setErr('');
    try { await opsApi.startShift(); setSummary(null); await load(); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  async function end() {
    setBusy(true); setErr('');
    try { const s = await opsApi.endShift(); setSummary(s); await load(); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  const active = status?.active;
  const shift = status?.shift;

  return (
    <div className="w-card" style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="w-eyebrow-dim">My shift</span>
        <span className="w-eyebrow" style={{ color: active ? '#7ed68a' : '#cda85f' }}>{active ? 'ON DUTY' : 'OFF'}</span>
      </div>

      {active && shift ? (
        <>
          <div style={{ display: 'flex', gap: 18, marginTop: 12, flexWrap: 'wrap' }}>
            <Metric label="On duty" value={fmtDuration(shift.startedAt)} />
            <Metric label="Orders" value={String(status?.ordersHandled ?? shift.ordersHandled ?? 0)} />
            <Metric label="Revenue" value={money(status?.revenueHandled ?? shift.revenueHandled ?? 0)} />
            <Metric label="Tips" value={money(status?.tipsHandled ?? status?.responseMetrics?.tipsHandled ?? 0)} />
            <Metric label="Tasks" value={String(status?.responseMetrics?.tasksResolved ?? 0)} />
          </div>
          {waiterShift.section.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <span className="w-eyebrow-dim">Current tables</span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                {waiterShift.section.map(n => (
                  <span key={n} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 999, background: '#ffffff0d', border: '1px solid #ffffff1a' }}>{n}</span>
                ))}
              </div>
            </div>
          )}
          <button className="w-btn-primary" style={{ marginTop: 18 }} disabled={busy} onClick={end}>
            {busy ? 'Ending…' : 'End shift'}
          </button>
        </>
      ) : (
        <>
          <p style={{ fontSize: 13, opacity: .7, marginTop: 8 }}>Start your shift to begin tracking tables, orders and response times.</p>
          <button className="w-btn-primary" style={{ marginTop: 14 }} disabled={busy} onClick={start}>
            {busy ? 'Starting…' : 'Start shift'}
          </button>
        </>
      )}

      {summary && !active && (
        <div style={{ marginTop: 16, padding: 14, borderRadius: 12, background: '#cda85f12', border: '1px solid #cda85f33' }}>
          <div className="w-eyebrow" style={{ color: '#cda85f' }}>Shift summary</div>
          <div style={{ display: 'flex', gap: 18, marginTop: 10, flexWrap: 'wrap' }}>
            <Metric label="Orders handled" value={String(summary.ordersHandled)} />
            <Metric label="Revenue handled" value={money(summary.revenueHandled)} />
            <Metric label="Tips handled" value={money(summary.responseMetrics?.tipsHandled ?? 0)} />
            <Metric label="Tasks resolved" value={String(summary.responseMetrics?.tasksResolved ?? 0)} />
          </div>
        </div>
      )}

      {err && <div style={{ marginTop: 10, color: '#e8918f', fontSize: 12 }}>{err}</div>}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 22, fontWeight: 700, color: '#f3e9d6' }}>{value}</div>
      <div style={{ fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', opacity: .55 }}>{label}</div>
    </div>
  );
}
