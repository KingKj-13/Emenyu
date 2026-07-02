import { useState, useEffect, useCallback } from 'react';
import type { CSSProperties } from 'react';
import { opsApi } from '../../services/opsApi';
import type { AuditRow } from '../../types/operations';

const ACTIONS = ['', 'shift.started', 'shift.ended', 'table.assign', 'table.transfer', 'table.takeover', 'table.reassign', 'table.release', 'account.created', 'account.suspended', 'account.activated', 'notification.acknowledged'];
const TARGETS = ['', 'shift', 'table', 'account', 'notification', 'order'];

// Phase 03B — read-only audit trail viewer. Immutable log; filters + client search +
// detail drawer. No edit affordances (logs cannot be changed).
export function AuditViewer() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [action, setAction] = useState('');
  const [actor, setActor] = useState('');
  const [targetType, setTargetType] = useState('');
  const [limit, setLimit] = useState(100);
  const [q, setQ] = useState('');
  const [detail, setDetail] = useState<AuditRow | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows(await opsApi.audit({ action: action || undefined, actor: actor || undefined, targetType: targetType || undefined, limit })); setErr(''); }
    catch (e) { setErr((e as Error).message); } finally { setLoading(false); }
  }, [action, actor, targetType, limit]);

  useEffect(() => { load(); }, [load]);

  const filtered = q.trim()
    ? rows.filter(r => `${r.actor} ${r.action} ${r.summary} ${r.reason} ${r.targetId}`.toLowerCase().includes(q.toLowerCase()))
    : rows;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>Audit Trail</h3>
        <span style={{ fontSize: 11, color: '#9b8a66' }}>Immutable · read-only</span>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <Select value={action} onChange={setAction} options={ACTIONS} placeholder="All actions" />
        <Select value={targetType} onChange={setTargetType} options={TARGETS} placeholder="All targets" />
        <input value={actor} onChange={e => setActor(e.target.value)} placeholder="Actor" style={inp} />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search…" style={inp} />
        <select value={limit} onChange={e => setLimit(Number(e.target.value))} style={inp}>
          {[50, 100, 200, 500].map(n => <option key={n} value={n}>{n} rows</option>)}
        </select>
        <button onClick={load} style={{ ...inp, cursor: 'pointer', fontWeight: 600 }}>Refresh</button>
      </div>

      {err && <div style={{ color: '#c0392b', marginBottom: 8 }}>{err}</div>}
      {loading && <div style={{ opacity: .6 }}>Loading…</div>}

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: '#9b8a66', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em' }}>
              <th style={th}>When</th><th style={th}>Actor</th><th style={th}>Action</th><th style={th}>Target</th><th style={th}>Summary</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && !loading && <tr><td colSpan={5} style={{ padding: 12, opacity: .5 }}>No audit entries.</td></tr>}
            {filtered.map(r => (
              <tr key={r.id} onClick={() => setDetail(r)} style={{ borderTop: '1px solid #f0e9d8', cursor: 'pointer' }}>
                <td style={td}>{new Date(r.createdAt).toLocaleString('en-ZA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                <td style={td}><b>{r.actor}</b>{r.actorRole ? <span style={{ opacity: .5 }}> · {r.actorRole}</span> : null}</td>
                <td style={td}><code style={{ color: '#8a6d2f' }}>{r.action}</code></td>
                <td style={td}>{r.targetType}{r.targetId ? `:${r.targetId}` : ''}</td>
                <td style={td}>{r.summary}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {detail && (
        <div onClick={() => setDetail(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 2000, display: 'flex', justifyContent: 'flex-end' }}>
          <div onClick={e => e.stopPropagation()} style={{ width: 380, maxWidth: '90vw', height: '100%', background: '#fff', padding: 20, overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <h3 style={{ margin: 0 }}>Audit entry #{detail.id}</h3>
              <button onClick={() => setDetail(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer' }}>×</button>
            </div>
            <dl style={{ fontSize: 13, lineHeight: 1.7 }}>
              <Row k="When" v={new Date(detail.createdAt).toLocaleString()} />
              <Row k="Actor" v={`${detail.actor}${detail.actorRole ? ` (${detail.actorRole})` : ''}`} />
              <Row k="Action" v={detail.action} />
              <Row k="Target" v={`${detail.targetType}${detail.targetId ? `:${detail.targetId}` : ''}`} />
              <Row k="Summary" v={detail.summary} />
              <Row k="Reason" v={detail.reason || '—'} />
            </dl>
            {detail.metadata != null && (
              <pre style={{ background: '#f6f1e6', padding: 10, borderRadius: 8, fontSize: 11, overflowX: 'auto' }}>{JSON.stringify(detail.metadata, null, 2)}</pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const inp: CSSProperties = { background: '#fff', color: '#1a1206', border: '1px solid #d8ccb0', borderRadius: 8, padding: '6px 10px', fontSize: 13 };
const th: CSSProperties = { padding: '8px 10px' };
const td: CSSProperties = { padding: '8px 10px' };

function Select({ value, onChange, options, placeholder }: { value: string; onChange: (v: string) => void; options: string[]; placeholder: string }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={inp}>
      {options.map(o => <option key={o} value={o}>{o || placeholder}</option>)}
    </select>
  );
}
function Row({ k, v }: { k: string; v: string }) {
  return <div style={{ display: 'flex', gap: 8 }}><dt style={{ width: 80, color: '#9b8a66', flex: '0 0 auto' }}>{k}</dt><dd style={{ margin: 0 }}>{v}</dd></div>;
}
