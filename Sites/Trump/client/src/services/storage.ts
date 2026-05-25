import {
  LOCAL_TABLE_KEY,
  LOCAL_DEVICE_KEY,
  LOCAL_FAVORITES_KEY,
  LOCAL_RECENTLY_VIEWED_KEY,
  DEFAULT_TABLE,
  RECENTLY_VIEWED_LIMIT,
} from '../constants/config';
import type { MenuItem } from '../types/menu';

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

export interface DeviceIdentity {
  deviceId: string;
  userAgent: string;
  language: string;
  platform: string;
  timestamp: string;
}

export function getDeviceIdentity(): DeviceIdentity {
  const raw = safeGet(LOCAL_DEVICE_KEY);
  if (raw) {
    try { return JSON.parse(raw) as DeviceIdentity; } catch {}
  }
  const identity: DeviceIdentity = {
    deviceId: `dev_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`,
    userAgent: navigator.userAgent,
    language: navigator.language,
    platform: navigator.platform,
    timestamp: new Date().toISOString(),
  };
  safeSet(LOCAL_DEVICE_KEY, JSON.stringify(identity));
  return identity;
}

export function getFavorites(): string[] {
  const raw = safeGet(LOCAL_FAVORITES_KEY);
  try { return raw ? JSON.parse(raw) : []; } catch { return []; }
}

export function toggleFavorite(itemName: string): string[] {
  const favs = getFavorites();
  const idx = favs.indexOf(itemName);
  if (idx >= 0) favs.splice(idx, 1);
  else favs.push(itemName);
  safeSet(LOCAL_FAVORITES_KEY, JSON.stringify(favs));
  return favs;
}

export function getRecentlyViewed(): MenuItem[] {
  const raw = safeGet(LOCAL_RECENTLY_VIEWED_KEY);
  try { return raw ? JSON.parse(raw) : []; } catch { return []; }
}

export function addRecentlyViewed(item: MenuItem): MenuItem[] {
  const recent = getRecentlyViewed().filter(i => i.name !== item.name);
  recent.unshift(item);
  const trimmed = recent.slice(0, RECENTLY_VIEWED_LIMIT);
  safeSet(LOCAL_RECENTLY_VIEWED_KEY, JSON.stringify(trimmed));
  return trimmed;
}
