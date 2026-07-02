// Read-through cache helper implementing the documented offline strategy
// (read-resilient, write-online). For a GET: try the network; on success persist to
// cache and return fresh; on failure (offline / transient) fall back to the last
// cached snapshot tagged with its fetched-at time so the UI can show "last synced".
// Writes are NOT cached/queued here — server-authoritative actions are disabled
// offline by the apiClient + screens (see OFFLINE-IMPLEMENTATION.md).
import { writeCache, readCache } from '../storage/cache';
import { isOnline } from './connectivity';

export interface CachedResult<T> {
  data: T | null;
  fetchedAt: number | null;
  stale: boolean; // true = served from cache, not a fresh network read
  fromCache: boolean;
}

export async function readThrough<T>(cacheKey: string, fetcher: () => Promise<T>): Promise<CachedResult<T>> {
  if (isOnline()) {
    try {
      const data = await fetcher();
      await writeCache(cacheKey, data);
      return { data, fetchedAt: Date.now(), stale: false, fromCache: false };
    } catch {
      // fall through to cache on any network/API error
    }
  }
  const cached = await readCache<T>(cacheKey);
  if (cached) {
    return { data: cached.data, fetchedAt: cached.fetchedAt, stale: true, fromCache: true };
  }
  return { data: null, fetchedAt: null, stale: true, fromCache: false };
}
