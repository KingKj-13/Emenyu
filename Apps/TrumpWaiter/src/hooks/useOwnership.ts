// Table-ownership state. The full ownership list is cache-resilient; transfer /
// take-over are server-authoritative (online-only, validated + audited server-side).
// The app derives "my tables" by matching the signed-in username — the server is
// still the authority on every mutation.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { opsApi } from '../api/ops';
import { readThrough } from '../services/offline';
import { CacheKeys } from '../storage/cache';
import type { OwnershipRow } from '../types/operations';

function norm(v: string): string {
  return String(v || '').trim().toLowerCase();
}

interface OwnershipState {
  all: OwnershipRow[];
  mine: OwnershipRow[];
  others: OwnershipRow[];
  loading: boolean;
  stale: boolean;
  fetchedAt: number | null;
  busy: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  transfer: (tableId: string, toWaiter: string, reason?: string) => Promise<void>;
  takeover: (tableId: string, reason?: string) => Promise<void>;
}

export function useOwnership(username: string): OwnershipState {
  const [all, setAll] = useState<OwnershipRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [stale, setStale] = useState(false);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await readThrough<OwnershipRow[]>(CacheKeys.ownership, () => opsApi.listOwnership());
    setAll(res.data ?? []);
    setStale(res.stale);
    setFetchedAt(res.fetchedAt);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const me = norm(username);
  const active = useMemo(() => all.filter((r) => (r.status ?? 'active') === 'active'), [all]);
  const mine = useMemo(() => active.filter((r) => norm(r.waiterName) === me), [active, me]);
  const others = useMemo(() => active.filter((r) => norm(r.waiterName) !== me), [active, me]);

  const run = useCallback(
    async (fn: () => Promise<unknown>) => {
      setBusy(true);
      setError(null);
      try {
        await fn();
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Action failed');
        throw e;
      } finally {
        setBusy(false);
      }
    },
    [refresh]
  );

  const transfer = useCallback(
    (tableId: string, toWaiter: string, reason?: string) => run(() => opsApi.transferTable(tableId, toWaiter, reason ?? '')),
    [run]
  );
  const takeover = useCallback(
    (tableId: string, reason?: string) => run(() => opsApi.takeoverTable(tableId, reason ?? '')),
    [run]
  );

  return { all, mine, others, loading, stale, fetchedAt, busy, error, refresh, transfer, takeover };
}
