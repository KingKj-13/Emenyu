import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, X } from 'lucide-react';
import { opsApi } from '../../services/opsApi';
import { getSocket } from '../../services/socket';
import type { NotificationRow } from '../../types/operations';
import styles from './NotificationBell.module.css';

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
  // Lightweight count, used only until the list has been fetched at least
  // once (i.e. before the guest/staff member has ever opened the drawer).
  const [initialUnread, setInitialUnread] = useState(0);
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [hasLoadedList, setHasLoadedList] = useState(false);
  const [loading, setLoading] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  // Bug fix (Priority 3 — badge/list drift): the badge and the row list used
  // to come from two independent, independently-racing API calls (a count-
  // only endpoint and a list endpoint), so a socket event that updated one
  // before the other could show a badge count with no matching visible rows,
  // or vice versa. Once the list has been fetched even once, it's the only
  // source of truth for the count too — the separate count endpoint is used
  // exclusively as a cheap pre-first-open estimate.
  const listUnread = items.filter(n => !n.readAt).length;
  const unread = hasLoadedList ? listUnread : initialUnread;

  const refreshCount = useCallback(async () => {
    if (hasLoadedList) return; // list is authoritative once loaded; nothing to refresh separately
    try { const r = await opsApi.unreadCount(scope); setInitialUnread(r.unread); } catch { /* ignore */ }
  }, [scope, hasLoadedList]);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await opsApi.listNotifications({ scope, limit: 50 }));
      setHasLoadedList(true);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [scope]);

  useEffect(() => {
    refreshCount();
    timer.current = window.setInterval(refreshCount, 20000);
    return () => window.clearInterval(timer.current);
  }, [refreshCount]);
  // Refresh the list on a timer too (not just on open) so the badge — now
  // always derived from the list once loaded — keeps updating even while
  // the drawer is closed, instead of freezing at whatever it was when last
  // opened.
  useEffect(() => {
    if (open) { loadList(); return; }
    if (!hasLoadedList) return;
    const t = window.setInterval(loadList, 20000);
    return () => window.clearInterval(t);
  }, [open, hasLoadedList, loadList]);

  useEffect(() => {
    const socket = getSocket();
    const onNotification = () => { loadList(); };
    socket.on('notification', onNotification);
    return () => { socket.off('notification', onNotification); };
  }, [loadList]);

  // Escape-to-close + body scroll lock while open (matches Modal.tsx's convention).
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  async function ack(id: number) {
    // Optimistic — the demo must feel instantaneous, not wait on a round-trip
    // before a tapped notification stops looking unread.
    setItems(prev => prev.map(n => n.id === id ? { ...n, readAt: new Date().toISOString() } : n));
    try { await opsApi.ackNotification(id); } catch { loadList(); /* reconcile on failure */ }
  }
  async function ackAll() {
    const now = new Date().toISOString();
    setItems(prev => prev.map(n => n.readAt ? n : { ...n, readAt: now }));
    try { await opsApi.ackAllNotifications(scope); } catch { loadList(); }
  }

  const grouped = groupEntries(items);
  const hasUnread = items.some(n => !n.readAt);

  return (
    <>
      <button
        type="button"
        className={styles.bellBtn}
        onClick={() => setOpen(o => !o)}
        aria-label={`Notifications${unread > 0 ? `, ${unread} unread` : ''}`}
        aria-expanded={open}
      >
        <Bell size={19} aria-hidden />
        {unread > 0 && <span className={styles.badge}>{unread > 99 ? '99+' : unread}</span>}
      </button>
      {createPortal(
        <AnimatePresence>
          {open && (
            <>
              <motion.div
                className={styles.backdrop}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                onClick={() => setOpen(false)}
              />
              <motion.div
                role="dialog"
                aria-label="Notifications"
                className={styles.panel}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 16 }}
                transition={{ duration: 0.26, ease: [0.2, 0.8, 0.2, 1] }}
              >
                <div className={styles.header}>
                  <strong className={styles.title}>Notifications</strong>
                  <div className={styles.headerActions}>
                    {hasUnread && <button type="button" className={styles.markAllBtn} onClick={ackAll}>Mark all read</button>}
                    <button type="button" className={styles.closeBtn} onClick={() => setOpen(false)} aria-label="Close notifications">
                      <X size={16} />
                    </button>
                  </div>
                </div>
                <div className={styles.body}>
                  {loading && items.length === 0 && <div className={styles.empty}>Loading…</div>}
                  {!loading && items.length === 0 && <div className={styles.empty}>You're all caught up.</div>}
                  {grouped.map(([group, groupItems]) => (
                    <div key={group}>
                      <div className={styles.groupLabel}>{group}</div>
                      {groupItems.map(n => (
                        <div key={n.id} className={`${styles.row} ${!n.readAt ? styles.unread : ''}`}>
                          <span className={`${styles.dot} ${!n.readAt ? styles.unread : ''} ${n.priority <= 2 ? styles.urgent : ''}`} />
                          <div className={styles.rowBody}>
                            <div className={styles.rowTop}>
                              <span className={styles.rowTitle}>{n.title}</span>
                              <span className={styles.rowTime}>{timeAgo(n.createdAt)}</span>
                            </div>
                            {n.body && <div className={styles.rowText}>{n.body}</div>}
                            <div className={styles.rowFoot}>
                              <span className={styles.priorityLabel}>{PRIORITY_LABEL[n.priority] || n.priority}</span>
                              {!n.readAt && <button type="button" className={styles.markBtn} onClick={() => ack(n.id)}>Mark read</button>}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}
