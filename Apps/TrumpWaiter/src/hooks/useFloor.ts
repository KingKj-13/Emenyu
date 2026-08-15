// Loads the live floor snapshot (/api/floor) + open workflow tasks and keeps them
// fresh: refetched on mount, on pull-to-refresh, and whenever a floor-changing
// socket event fires (orderPlaced / kitchenStatusUpdate / guestEvent / task
// changes). Read-through cache so the last floor still renders offline.
import { useCallback, useEffect, useState } from 'react';
import { waiterApi } from '../api/waiter';
import { onSocketEvent } from '../services/socket';
import { readThrough } from '../services/offline';
import type { FloorState, WaiterTask } from '../types/waiter';

export function useFloor() {
  const [floor, setFloor] = useState<FloorState | null>(null);
  const [tasks, setTasks] = useState<WaiterTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [stale, setStale] = useState(false);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);

  const load = useCallback(async () => {
    const res = await readThrough<FloorState>('floor_state', () => waiterApi.getFloor());
    setFloor(res.data);
    setStale(res.stale);
    setFetchedAt(res.fetchedAt);
    try {
      setTasks(await waiterApi.listTasks({ status: 'all' }));
    } catch {
      /* tasks are best-effort — floor still renders */
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    const events = ['orderPlaced', 'orderUpdated', 'kitchenStatusUpdate', 'guestEvent', 'waiterTaskCreated', 'waiterTaskUpdated', 'incomingWaiterCall'];
    const offs = events.map((e) => onSocketEvent(e, () => void load()));
    return () => offs.forEach((off) => off());
  }, [load]);

  return { floor, tasks, loading, stale, fetchedAt, reload: load };
}
