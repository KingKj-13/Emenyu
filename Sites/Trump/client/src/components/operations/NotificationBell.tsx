import { useState, useEffect, useCallback, useRef } from 'react';
import { opsApi } from '../../services/opsApi';
import type { NotificationRow } from '../../types/operations';

const PRIORITY_LABEL: Record<number, string> = { 1: 'Urgent', 2: 'High', 3: 'Normal', 4: 'Low', 5: 'Info' };

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// Phase 03B — notification center bell + drawer. `scope='all'` is the owner/manager
// view (every staff notification). Unread count polls every 20s (no socket push for
// notifications yet); the drawer fetches the list on open.
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

  async function ack(id: number) {
    try { await opsApi.ackNotification(id); await Promise.all([loadList(), refreshCount()]); } catch { /* ignore */ }
  }
  async function ackAll() {
    try { await opsApi.ackAllNotifications(scope); await Promise.all([loadList(), refreshCount()]); } catch { /* ignore */ }
  }

  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} aria-label="Notifications"
        style={{ position: 'relative', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 20, color: 'inherit', lineHeight: 1 }}>
        <span aria-hidden>🔔</span>
        {unread > 0 && (
          <span style={{ position: 'absolute', top: -4, right: -6, background: '#d4373a', color: '#fff', borderRadius: 10, fontSize: 10, minWidth: 16, height: 16, lineHeight: '16px', textAlign: 'center', padding: '0 4px', fontWeight: 700 }}>
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div role="dialog" aria-label="Notifications"
          style={{ position: 'absolute', right: 0, top: 32, width: 340, maxHeight: 440, overflowY: 'auto', background: '#14110d', color: '#eee', border: '1px solid #b8893d55', borderRadius: 12, boxShadow: '0 12px 40px rgba(0,0,0,.5)', zIndex: 1000 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid #ffffff14', position: 'sticky', top: 0, background: '#14110d' }}>
            <strong style={{ letterSpacing: '.04em' }}>Notifications</strong>
            <button onClick={ackAll} style={{ background: 'transparent', border: 'none', color: '#cda85f', cursor: 'pointer', fontSize: 12 }}>Mark all read</button>
          </div>
          {loading && <div style={{ padding: 16, opacity: .6 }}>Loading…</div>}
          {!loading && items.length === 0 && <div style={{ padding: 16, opacity: .6 }}>You're all caught up.</div>}
          {items.map(n => (
            <div key={n.id} style={{ padding: '10px 14px', borderBottom: '1px solid #ffffff0d', background: n.readAt ? 'transparent' : '#cda85f10', display: 'flex', gap: 8 }}>
              <span style={{ width: 8, height: 8, marginTop: 6, borderRadius: 8, background: n.priority <= 2 ? '#d4373a' : '#cda85f', flex: '0 0 auto', opacity: n.readAt ? .3 : 1 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{n.title}</span>
                  <span style={{ fontSize: 10, opacity: .5, whiteSpace: 'nowrap' }}>{timeAgo(n.createdAt)}</span>
                </div>
                {n.body && <div style={{ fontSize: 12, opacity: .75, marginTop: 2 }}>{n.body}</div>}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, alignItems: 'center' }}>
                  <span style={{ fontSize: 10, opacity: .5, textTransform: 'uppercase', letterSpacing: '.06em' }}>{n.source} · {PRIORITY_LABEL[n.priority] || n.priority}</span>
                  {!n.readAt && <button onClick={() => ack(n.id)} style={{ background: 'transparent', border: 'none', color: '#cda85f', cursor: 'pointer', fontSize: 11 }}>Mark read</button>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
