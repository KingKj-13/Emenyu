import { useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import { opsApi } from '../../services/opsApi';
import { useAuth } from '../../hooks/useAuth';
import type { OwnershipRow } from '../../types/operations';

function timeStr(iso: string) { return new Date(iso).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' }); }

// Phase 03B — per-table ownership: current owner + history + role-aware actions.
// Waiter: transfer (own table only) / take over. Manager/Owner: reassign (reason required).
export function OwnershipPanel({ tableId, onChanged }: { tableId: string; onChanged?: () => void }) {
  const { user, isOwnerOrManager, isWaiter } = useAuth();
  const me = (user?.username || '').toLowerCase();
  const [owner, setOwner] = useState<OwnershipRow | null>(null);
  const [history, setHistory] = useState<OwnershipRow[]>([]);
  const [waiters, setWaiters] = useState<string[]>([]);
  const [target, setTarget] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    try {
      const [o, h] = await Promise.all([opsApi.tableOwner(tableId), opsApi.ownershipHistory(tableId)]);
      setOwner(o); setHistory(h); setErr('');
    } catch (e) { setErr((e as Error).message); }
  }, [tableId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    // populate transfer/reassign targets from active waiter shifts (best-effort)
    opsApi.listShifts().then(s => setWaiters(s.filter(x => x.role === 'waiter').map(x => x.username)))
      .catch(() => setWaiters([]));
  }, []);

  const iAmOwner = owner && owner.waiterName.toLowerCase() === me;

  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setErr('');
    try { await fn(); setReason(''); await load(); onChanged?.(); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <div style={{ background: '#14110d', color: '#eee', border: '1px solid #b8893d44', borderRadius: 12, padding: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong style={{ letterSpacing: '.04em' }}>Table {tableId}</strong>
        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 8, background: owner ? '#7ed68a22' : '#ffffff14', color: owner ? '#7ed68a' : '#bbb' }}>
          {owner ? `Owner: ${owner.waiterName}` : 'Unassigned'}
        </span>
      </div>

      {/* target picker (for transfer / reassign) */}
      {(isWaiter || isOwnerOrManager) && (
        <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select value={target} onChange={e => setTarget(e.target.value)}
            style={{ flex: 1, minWidth: 120, background: '#0d0b08', color: '#eee', border: '1px solid #ffffff22', borderRadius: 8, padding: '6px 8px' }}>
            <option value="">Select waiter…</option>
            {waiters.map(w => <option key={w} value={w}>{w}</option>)}
          </select>
          <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason"
            style={{ flex: 1, minWidth: 120, background: '#0d0b08', color: '#eee', border: '1px solid #ffffff22', borderRadius: 8, padding: '6px 8px' }} />
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        {isWaiter && iAmOwner && (
          <ActBtn disabled={busy || !target} onClick={() => run(() => opsApi.transferTable(tableId, target, reason))}>Transfer</ActBtn>
        )}
        {isWaiter && !iAmOwner && (
          <ActBtn disabled={busy} onClick={() => run(() => opsApi.takeoverTable(tableId, reason))}>Take over</ActBtn>
        )}
        {isOwnerOrManager && (
          <>
            <ActBtn disabled={busy || !target || !reason.trim()} onClick={() => run(() => opsApi.reassignTable(tableId, target, reason))}>Reassign</ActBtn>
            <ActBtn disabled={busy || !target} kind="ghost" onClick={() => run(() => opsApi.assignTable(tableId, target, reason))}>Assign</ActBtn>
          </>
        )}
      </div>
      {isOwnerOrManager && <p style={{ fontSize: 10, opacity: .45, marginTop: 6 }}>Reassign requires a reason (accountability).</p>}

      {/* ownership history */}
      <div style={{ marginTop: 14 }}>
        <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', opacity: .5, marginBottom: 6 }}>Ownership history</div>
        {history.length === 0 && <div style={{ fontSize: 12, opacity: .5 }}>No history.</div>}
        {history.map(h => (
          <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0', borderBottom: '1px solid #ffffff0a' }}>
            <span><b style={{ color: '#cda85f' }}>{h.changeType}</b> → {h.waiterName}{h.previousWaiter ? ` (from ${h.previousWaiter})` : ''}{h.reason ? ` · ${h.reason}` : ''}</span>
            <span style={{ opacity: .5, whiteSpace: 'nowrap' }}>{timeStr(h.assignedAt)}{h.status === 'released' ? ' ·released' : ''}</span>
          </div>
        ))}
      </div>

      {err && <div style={{ marginTop: 10, color: '#e8918f', fontSize: 12 }}>{err}</div>}
    </div>
  );
}

function ActBtn({ children, onClick, disabled, kind }: { children: ReactNode; onClick: () => void; disabled?: boolean; kind?: 'ghost' }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ padding: '7px 14px', borderRadius: 8, cursor: disabled ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600,
        background: kind === 'ghost' ? 'transparent' : '#cda85f', color: kind === 'ghost' ? '#cda85f' : '#1a1206',
        border: kind === 'ghost' ? '1px solid #cda85f55' : 'none', opacity: disabled ? .45 : 1 }}>
      {children}
    </button>
  );
}
