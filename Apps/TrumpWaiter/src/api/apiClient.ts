// REST client for the Trump API. Responsibilities:
//   - Bearer interceptor: attach a valid access token (refreshing if needed).
//   - Refresh interceptor: on a 401 from the server, force-refresh once and retry.
//   - Retry-once: a single retry for transient network failures / 502 / 503.
//   - Timeout: per-request AbortController.
//   - Connectivity: fail fast when offline (callers fall back to cache / disable).
// The server is authoritative; this client never invents data.
import { API_BASE_URL, REQUEST_TIMEOUT_MS } from '../config';
import { getValidAccessToken } from '../auth/tokenStore';
import { isOnline } from '../services/connectivity';

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

export class OfflineError extends Error {
  constructor(message = 'You are offline.') {
    super(message);
    this.name = 'OfflineError';
  }
}

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

interface RequestOptions {
  method?: Method;
  body?: unknown;
  // Skip the offline guard (used by GETs that want to attempt-then-fall-back).
  allowOffline?: boolean;
  // Skip the Bearer header (only the token endpoints, which carry their own creds).
  anonymous?: boolean;
  timeoutMs?: number;
}

function isMutation(method: Method): boolean {
  return method !== 'GET';
}

async function parseBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function doFetch(path: string, opts: RequestOptions, accessToken: string | null): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? REQUEST_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    if (accessToken && !opts.anonymous) headers.Authorization = `Bearer ${accessToken}`;
    return await fetch(`${API_BASE_URL}${path}`, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function apiRequest<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const method: Method = opts.method ?? 'GET';

  // Connectivity guard: never attempt a mutation offline (avoids split-brain — see
  // OFFLINE-IMPLEMENTATION.md). GETs may still try so the caller can fall back to cache.
  if (!isOnline() && isMutation(method) && !opts.allowOffline) {
    throw new OfflineError('Reconnect to perform this action.');
  }

  let accessToken = opts.anonymous ? null : await getValidAccessToken();
  let attempt = 0;
  let refreshedOnce = false;

  // up to 2 attempts (initial + one retry)
  while (true) {
    attempt += 1;
    try {
      const res = await doFetch(path, opts, accessToken);

      if (res.status === 401 && !opts.anonymous && !refreshedOnce) {
        // Access token rejected mid-flight — force a refresh and retry once.
        refreshedOnce = true;
        accessToken = await getValidAccessToken();
        if (!accessToken) {
          throw new ApiError(401, 'Session expired. Please sign in again.', await parseBody(res));
        }
        continue;
      }

      if (res.status >= 500 && attempt < 2) {
        // transient server error — one retry
        continue;
      }

      const body = await parseBody(res);
      if (!res.ok) {
        const message =
          (body && typeof body === 'object' && 'error' in body && typeof (body as { error: unknown }).error === 'string'
            ? (body as { error: string }).error
            : `HTTP ${res.status}`);
        throw new ApiError(res.status, message, body);
      }
      return body as T;
    } catch (err) {
      if (err instanceof ApiError) throw err;
      // network/abort error — one retry, then give up
      if (attempt < 2) {
        continue;
      }
      throw new ApiError(0, err instanceof Error ? err.message : 'Network error', null);
    }
  }
}

export const api = {
  get: <T>(path: string, allowOffline = true) => apiRequest<T>(path, { method: 'GET', allowOffline }),
  post: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: 'PATCH', body }),
  del: <T>(path: string) => apiRequest<T>(path, { method: 'DELETE' })
};
