// Notification state: unread count + list, with three delivery paths reconciled
// against the server (which is the source of truth):
//   1. Socket `notification` event (instant, foreground) → optimistic bump + refetch.
//   2. Polling fallback (NOTIFICATION_POLL_MS) for socket-blocked networks.
//   3. Manual refresh / app-foreground.
// The device badge is kept in sync via expo-notifications.
import { useCallback, useEffect, useRef, useState } from 'react';
import { opsApi } from '../api/ops';
import { onNotification } from '../services/socket';
import { setBadgeCount } from '../services/push';
import { readThrough } from '../services/offline';
import { CacheKeys } from '../storage/cache';
import { isOnline } from '../services/connectivity';
import { NOTIFICATION_POLL_MS } from '../config';
import type { NotificationRow } from '../types/operations';

interface NotificationsState {
  items: NotificationRow[];
  unread: number;
  loading: boolean;
  stale: boolean;
  fetchedAt: number | null;
  refresh: () => Promise<void>;
  ack: (id: number) => Promise<void>;
  ackAll: () => Promise<void>;
}

export function useNotifications(): NotificationsState {
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [stale, setStale] = useState(false);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    const res = await readThrough<NotificationRow[]>(CacheKeys.notifications, () =>
      opsApi.listNotifications({ limit: 50 })
    );
    if (!mounted.current) return;
    const list = res.data ?? [];
    setItems(list);
    setStale(res.stale);
    setFetchedAt(res.fetchedAt);
    const count = list.filter((n) => !n.readAt).length;
    setUnread(count);
    void setBadgeCount(count);
    setLoading(false);
  }, []);

  // initial + polling fallback
  useEffect(() => {
    mounted.current = true;
    void refresh();
    const timer = setInterval(() => {
      if (isOnline()) void refresh();
    }, NOTIFICATION_POLL_MS);
    return () => {
      mounted.current = false;
      clearInterval(timer);
    };
  }, [refresh]);

  // socket push → reconcile immediately
  useEffect(() => {
    return onNotification(() => {
      void refresh();
    });
  }, [refresh]);

  const ack = useCallback(
    async (id: number) => {
      await opsApi.ackNotification(id);
      await refresh();
    },
    [refresh]
  );

  const ackAll = useCallback(async () => {
    await opsApi.ackAll();
    await refresh();
  }, [refresh]);

  return { items, unread, loading, stale, fetchedAt, refresh, ack, ackAll };
}
