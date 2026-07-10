import { useState, useEffect, useCallback, useRef } from 'react';
import { Bell } from 'lucide-react';
import { opsApi } from '../../services/opsApi';
import { getSocket } from '../../services/socket';
import type { NotificationRow } from '../../types/operations';

const PRIORITY_LABEL: Record<number, string> = { 1: 'Urgent', 2: 'High', 3: 'Normal', 4: 'Low', 5: 'Info' };

// Phase 2 (Waiter Experience): group the existing notification list by its
// existing `source` field — no new notification-generation logic, just
// friendlier presentation of what's already there.
const GROUP_LABEL: Record<string, string> = {
  waiter_call: 'Waiter Call',
  reservation: 'Reservation',
  reassignment: 'Manager Call',
  table_transfer: 'Table Transfer',
  ai_warning: 'New Recommendation',
  system: 'System',
};
function groupFor(n: NotificationRow): string {
  const text = `${n.title} ${n.body}`.toLowerCase();
  if (text.includes('birthday')) return 'Birthday';
  if (text.includes('anniversary')) return 'Anniversary';
  if (text.includes('kitchen') || text.includes('ready')) return 'Kitchen Ready';
  if (text.includes('payment') || text.includes('bill')) return 'Payment';
  return GROUP_LABEL[n.source] || (n.source ? n.source.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'Other');
}

// Preserves the existing newest-first order from the API within each group;
// groups are ordered by their most-recent item so an urgent new group surfaces first.
function groupEntries(items: NotificationRow[]): [string, NotificationRow[]][] {
  const groups = new Map<string, NotificationRow[]>();
  items.forEach(n => {
    const key = groupFor(n);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(n);
  });
  return [...groups.entries()].sort((a, b) => {
    const at = new Date(a[1][0]?.createdAt || 0).getTime();
    const bt = new Date(b[1][0]?.createdAt || 0).getTime();
    return bt - at;
  });
}

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// Phase 03B — notification center bell + drawer. `scope='all'` is the owner/manager
// view (every staff notification). The 20s poll is now just a safety-net fallback —
// the server emits a live 'notification' socket event per row (emitNotification),
// so the bell refreshes instantly in the normal case.
export function NotificationBell({ scope }: { scope?: 'all' }) {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  const refreshCount = useCallback(async () => {
    try { const r = await opsApi.unreadCount(scope); setUnread(r.unread); } catch { /* ignore */ }
  }, [scope]);

  const loadList = useCallback(async () => {
    setLoading(true);
    try { setItems(await opsApi.listNotifications({ scope, limit: 50 })); }
    catch { /* ignore */ } finally { setLoading(false); }
  }, [scope]);

  useEffect(() => {
    refreshCount();
    timer.current = window.setInterval(refreshCount, 20000);
    return () => window.clearInterval(timer.current);
  }, [refreshCount]);
  useEffect(() => { if (open) loadList(); }, [open, loadList]);

  useEffect(() => {
    const socket = getSocket();
    const onNotification = () => {
      refreshCount();
      if (open) loadList();
    };
    socket.on('notification', onNotification);
    return () => { socket.off('notification', onNotification); };
  }, [open, refreshCount, loadList]);

  async function ack(id: number) {
    try { await opsApi.ackNotification(id); await Promise.all([loadList(), refreshCount()]); } catch { /* ignore */ }
  }
  async function ackAll() {
    try { await opsApi.ackAllNotifications(scope); await Promise.all([loadList(), refreshCount()]); } catch { /* ignore */ }
  }

  return (
    <div style={{ position: 'relative' }}>
      {/* Same 44x44 boxed-icon treatment as every other icon-only chrome button
          (waiter topbar sign-out, admin refresh) — was a bare unsized icon
          floating next to a boxed sign-out button in the same row. Uses the
          shared --color-* tokens (not --w-*) since this component renders both
          inside and outside the .waiter-app scope. */}
      <button onClick={() => setOpen(o => !o)} aria-label="Notifications"
        style={{ position: 'relative', display: 'grid', placeItems: 'center', width: 44, height: 44, background: 'var(--color-panel, rgba(255,255,255,0.04))', border: '1px solid var(--color-line, rgba(255,255,255,0.1))', borderRadius: 12, cursor: 'pointer', color: 'inherit', lineHeight: 1 }}>
        <Bell size={19} aria-hidden />
        {unread > 0 && (
          <span style={{ position: 'absolute', top: -4, right: -4, background: 'var(--color-burgundy, #a52b2d)', color: '#fff', borderRadius: 9, fontSize: 10, minWidth: 18, height: 18, lineHeight: '18px', textAlign: 'center', padding: '0 4px', fontWeight: 700 }}>
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div role="dialog" aria-label="Notifications"
          style={{ position: 'absolute', right: 0, top: 48, width: 'min(340px, calc(100vw - 24px))', maxHeight: 440, overflowY: 'auto', background: 'var(--color-panel, #14110d)', color: 'var(--color-cream, #eee)', border: '1px solid var(--color-line, #b8893d55)', borderRadius: 12, boxShadow: '0 12px 40px rgba(0,0,0,.5)', zIndex: 1000 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid #ffffff14', position: 'sticky', top: 0, background: 'var(--color-panel, #14110d)' }}>
            <strong style={{ letterSpacing: '.04em' }}>Notifications</strong>
            <button onClick={ackAll} style={{ background: 'transparent', border: 'none', color: 'var(--color-gold, #cda85f)', cursor: 'pointer', fontSize: 12 }}>Mark all read</button>
          </div>
          {loading && <div style={{ padding: 16, opacity: .6 }}>Loading…</div>}
          {!loading && items.length === 0 && <div style={{ padding: 16, opacity: .6 }}>You're all caught up.</div>}
          {!loading && groupEntries(items).map(([group, groupItems]) => (
            <div key={group}>
              <div style={{ padding: '8px 14px 4px', fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', opacity: .5 }}>{group}</div>
              {groupItems.map(n => (
                <div key={n.id} style={{ padding: '10px 14px', borderBottom: '1px solid #ffffff0d', background: n.readAt ? 'transparent' : 'rgba(200,165,85,0.06)', display: 'flex', gap: 8 }}>
                  <span style={{ width: 8, height: 8, marginTop: 6, borderRadius: 8, background: n.priority <= 2 ? 'var(--color-burgundy, #a52b2d)' : 'var(--color-gold, #cda85f)', flex: '0 0 auto', opacity: n.readAt ? .3 : 1 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{n.title}</span>
                      <span style={{ fontSize: 10, opacity: .5, whiteSpace: 'nowrap' }}>{timeAgo(n.createdAt)}</span>
                    </div>
                    {n.body && <div style={{ fontSize: 12, opacity: .75, marginTop: 2 }}>{n.body}</div>}
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, alignItems: 'center' }}>
                      <span style={{ fontSize: 10, opacity: .5, textTransform: 'uppercase', letterSpacing: '.06em' }}>{PRIORITY_LABEL[n.priority] || n.priority}</span>
                      {!n.readAt && <button onClick={() => ack(n.id)} style={{ background: 'transparent', border: 'none', color: 'var(--color-gold, #cda85f)', cursor: 'pointer', fontSize: 11 }}>Mark read</button>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
