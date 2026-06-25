// Auth context — the app's session gate. Owns login / logout and exposes the
// current user. On login it persists the rotating refresh token (secure store),
// registers for push, and opens the realtime socket; on logout (or refresh hard-
// failure) it tears all of that down and returns the UI to Login. Web cookie auth
// is a separate path on the server and is unaffected.
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { AuthUser, StoredSession } from '../types/api';
import { authApi } from '../api/auth';
import {
  hydrateSession,
  setSession,
  clear as clearTokens,
  getSession,
  onSessionExpired
} from './tokenStore';
import { getOrCreateDeviceId, getDeviceName, getPlatform } from './deviceId';
import { registerForPush, unregisterPush } from '../services/push';
import { connectSocket, disconnectSocket } from '../services/socket';

type Status = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthState {
  status: Status;
  user: AuthUser | null;
  deviceId: string | null;
  error: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthCtx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const deviceIdRef = useRef<string | null>(null);

  // Bring up the post-login machinery (push + socket). Best-effort, never blocks.
  const startSession = React.useCallback(async (id: string) => {
    void registerForPush(id);
    void connectSocket();
  }, []);

  const tearDown = React.useCallback(async (id: string | null) => {
    disconnectSocket();
    if (id) await unregisterPush(id);
  }, []);

  // Restore a persisted session on cold start.
  useEffect(() => {
    let mounted = true;
    (async () => {
      const id = await getOrCreateDeviceId();
      if (!mounted) return;
      deviceIdRef.current = id;
      setDeviceId(id);
      const restored = await hydrateSession();
      if (!mounted) return;
      if (restored) {
        setUser(restored.user);
        setStatus('authenticated');
        void startSession(id);
      } else {
        setStatus('unauthenticated');
      }
    })();
    return () => {
      mounted = false;
    };
  }, [startSession]);

  // Refresh hard-failure (rotated/revoked) → force back to Login.
  useEffect(() => {
    return onSessionExpired(() => {
      void tearDown(deviceIdRef.current);
      setUser(null);
      setStatus('unauthenticated');
      setError('Your session ended. Please sign in again.');
    });
  }, [tearDown]);

  const login = React.useCallback(
    async (username: string, password: string) => {
      setError(null);
      const id = deviceIdRef.current ?? (await getOrCreateDeviceId());
      deviceIdRef.current = id;
      const res = await authApi.issueToken({
        username: username.trim(),
        password,
        deviceId: id,
        deviceName: getDeviceName(),
        platform: getPlatform()
      });
      const session: StoredSession = {
        accessToken: res.accessToken,
        refreshToken: res.refreshToken,
        accessExpiresAt: Date.now() + res.expiresIn * 1000,
        deviceId: res.device.deviceId,
        user: res.user
      };
      await setSession(session);
      deviceIdRef.current = res.device.deviceId;
      setDeviceId(res.device.deviceId);
      setUser(res.user);
      setStatus('authenticated');
      void startSession(res.device.deviceId);
    },
    [startSession]
  );

  const logout = React.useCallback(async () => {
    const current = getSession();
    const id = deviceIdRef.current;
    await tearDown(id);
    if (current?.refreshToken) {
      await authApi.revokeToken(current.refreshToken).catch(() => undefined);
    }
    await clearTokens();
    setUser(null);
    setStatus('unauthenticated');
  }, [tearDown]);

  const value = useMemo<AuthState>(
    () => ({ status, user, deviceId, error, login, logout }),
    [status, user, deviceId, error, login, logout]
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
