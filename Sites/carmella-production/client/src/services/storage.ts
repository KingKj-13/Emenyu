import { LOCAL_TABLE_KEY, LOCAL_SESSION_KEY, DEFAULT_TABLE } from '../constants/config';
import { RESTAURANT_ID } from '../constants/api';

// All four tenants (Carmella, Trump, Luxury, Demo) are served from the same
// emenyu.com origin, just under different path prefixes -- localStorage is
// scoped per ORIGIN, not per path, so an unprefixed key from any tenant's
// codebase can collide with another's in the same guest's browser. Every key
// this module touches is namespaced with the tenant's own RESTAURANT_ID
// here, in one place, so no caller of getStoredTable/setStoredTable/
// getSessionId can ever accidentally read or write another tenant's data.
function namespaced(key: string): string {
  return `${RESTAURANT_ID}_${key}`;
}

function safeGet(key: string): string | null {
  try { return localStorage.getItem(namespaced(key)); } catch { return null; }
}

function safeSet(key: string, value: string): void {
  try { localStorage.setItem(namespaced(key), value); } catch {}
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
