// Token store — single source of truth for the live session in memory, mirrored to
// the secure store. Owns the refresh lifecycle:
//   - getValidAccessToken() returns a non-expired access token, transparently
//     refreshing (single-flight) when it is within the skew window or expired.
//   - The refresh call is a RAW fetch (never via apiClient) so it does not recurse
//     through the Bearer interceptor.
//   - On hard refresh failure (rotated/revoked/expired refresh token) the session is
//     cleared and onSessionExpired listeners fire → the UI returns to Login.
import { API_BASE_URL, REFRESH_TIMEOUT_MS } from '../config';
import type { StoredSession, TokenRefreshResponse } from '../types/api';
import { saveSession, loadSession, clearSession } from '../storage/secureStore';

// Refresh this many ms BEFORE the access token actually expires (clock skew + RTT).
const REFRESH_SKEW_MS = 60_000;

let session: StoredSession | null = null;
let refreshPromise: Promise<string | null> | null = null;
const expiryListeners = new Set<() => void>();

export function onSessionExpired(listener: () => void): () => void {
  expiryListeners.add(listener);
  return () => expiryListeners.delete(listener);
}

function notifyExpired() {
  expiryListeners.forEach((l) => {
    try {
      l();
    } catch {
      /* ignore */
    }
  });
}

export function getSession(): StoredSession | null {
  return session;
}

export async function hydrateSession(): Promise<StoredSession | null> {
  session = await loadSession();
  return session;
}

export async function setSession(next: StoredSession): Promise<void> {
  session = next;
  await saveSession(next);
}

export async function clear(): Promise<void> {
  session = null;
  refreshPromise = null;
  await clearSession();
}

function isAccessFresh(s: StoredSession): boolean {
  return s.accessExpiresAt - REFRESH_SKEW_MS > Date.now();
}

async function rawRefresh(refreshToken: string): Promise<TokenRefreshResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REFRESH_TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE_URL}/api/auth/token/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
      signal: controller.signal
    });
    if (!res.ok) {
      const err = new Error(`refresh_failed_${res.status}`) as Error & { status?: number };
      err.status = res.status;
      throw err;
    }
    return (await res.json()) as TokenRefreshResponse;
  } finally {
    clearTimeout(timer);
  }
}

// Returns a valid access token, refreshing if needed. Concurrent callers share one
// in-flight refresh. Returns null if there is no session or refresh hard-failed.
export async function getValidAccessToken(): Promise<string | null> {
  const s = session;
  if (!s) return null;
  if (isAccessFresh(s)) return s.accessToken;

  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const r = await rawRefresh(s.refreshToken);
        const next: StoredSession = {
          ...s,
          accessToken: r.accessToken,
          refreshToken: r.refreshToken, // rotation: store the NEW refresh token
          accessExpiresAt: Date.now() + r.expiresIn * 1000
        };
        await setSession(next);
        return next.accessToken;
      } catch (e) {
        const status = (e as { status?: number }).status;
        // 401/403 = refresh token rotated/revoked/expired → unrecoverable, log out.
        // Network errors (no status) are transient → keep the session, fail this call.
        if (status === 401 || status === 403) {
          await clear();
          notifyExpired();
        }
        return null;
      } finally {
        refreshPromise = null;
      }
    })();
  }
  return refreshPromise;
}
