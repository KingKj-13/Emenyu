import { LOCAL_TABLE_KEY, LOCAL_SESSION_KEY, DEFAULT_TABLE } from '../constants/config';

function safeGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

function safeSet(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch {}
}

export function getStoredTable(): string {
  return safeGet(LOCAL_TABLE_KEY) || DEFAULT_TABLE;
}

export function setStoredTable(tableId: string): void {
  safeSet(LOCAL_TABLE_KEY, tableId);
}

// STEP 10 — a stable per-browser id so the analytics dashboard can count
// distinct daily/weekly/monthly visitors. Not tied to any account (there are
// none) — purely a local, anonymous session marker.
export function getSessionId(): string {
  const existing = safeGet(LOCAL_SESSION_KEY);
  if (existing) return existing;
  const id = `s_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
  safeSet(LOCAL_SESSION_KEY, id);
  return id;
}
