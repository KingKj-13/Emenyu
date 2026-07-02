// Secure token storage. Tokens live ONLY in the OS secure enclave
// (Android Keystore / iOS Keychain) via expo-secure-store — NEVER in AsyncStorage,
// which is plain-text and world-readable on a rooted device.
import * as SecureStore from 'expo-secure-store';
import type { StoredSession } from '../types/api';

const SESSION_KEY = 'trump_waiter_session_v1';

export async function saveSession(session: StoredSession): Promise<void> {
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED
  });
}

export async function loadSession(): Promise<StoredSession | null> {
  try {
    const raw = await SecureStore.getItemAsync(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredSession;
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  await SecureStore.deleteItemAsync(SESSION_KEY);
}
