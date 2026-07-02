// Offline read-cache (non-sensitive data only). Backed by AsyncStorage. Each entry
// is stored with a fetched-at timestamp so the UI can show a "last synced" banner
// and decide staleness. NEVER store tokens here — see secureStore.ts.
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface CacheEntry<T> {
  data: T;
  fetchedAt: number; // epoch ms
}

const PREFIX = 'trump_waiter_cache:';

export async function writeCache<T>(key: string, data: T): Promise<void> {
  const entry: CacheEntry<T> = { data, fetchedAt: Date.now() };
  try {
    await AsyncStorage.setItem(PREFIX + key, JSON.stringify(entry));
  } catch {
    /* cache write is best-effort */
  }
}

export async function readCache<T>(key: string): Promise<CacheEntry<T> | null> {
  try {
    const raw = await AsyncStorage.getItem(PREFIX + key);
    if (!raw) return null;
    return JSON.parse(raw) as CacheEntry<T>;
  } catch {
    return null;
  }
}

export async function clearCache(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const ours = keys.filter((k) => k.startsWith(PREFIX));
    if (ours.length) await AsyncStorage.multiRemove(ours);
  } catch {
    /* ignore */
  }
}

// Cache keys used across the app (single source so they don't drift).
export const CacheKeys = {
  menu: 'menu',
  shift: 'shift_me',
  ownership: 'ownership',
  notifications: 'notifications'
} as const;
