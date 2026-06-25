// Shift state for the signed-in waiter. Read is cache-resilient (offline shows the
// last known on-duty state); start/end are server-authoritative (online-only).
import { useCallback, useEffect, useState } from 'react';
import { opsApi } from '../api/ops';
import { readThrough } from '../services/offline';
import { CacheKeys } from '../storage/cache';
import type { ShiftStatus } from '../types/operations';

interface ShiftState {
  status: ShiftStatus | null;
  loading: boolean;
  stale: boolean;
  fetchedAt: number | null;
  busy: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  startShift: (tables?: string[]) => Promise<void>;
  endShift: (reason?: string) => Promise<void>;
}

export function useShift(): ShiftState {
  const [status, setStatus] = useState<ShiftStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [stale, setStale] = useState(false);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await readThrough<ShiftStatus>(CacheKeys.shift, () => opsApi.getMyShift());
    setStatus(res.data);
    setStale(res.stale);
    setFetchedAt(res.fetchedAt);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = useCallback(
    async (fn: () => Promise<unknown>) => {
      setBusy(true);
      setError(null);
      try {
        await fn();
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Action failed');
      } finally {
        setBusy(false);
      }
    },
    [refresh]
  );

  const startShift = useCallback((tables?: string[]) => run(() => opsApi.startShift(tables ?? [])), [run]);
  const endShift = useCallback((reason?: string) => run(() => opsApi.endShift(reason ?? '')), [run]);

  return { status, loading, stale, fetchedAt, busy, error, refresh, startShift, endShift };
}
