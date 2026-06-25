// Stable per-install device id. Persisted in the secure store under its own key so
// it SURVIVES logout — re-logging in on the same handset reuses the same Device row
// (so "my devices" doesn't accumulate ghosts). The server still authoritatively
// returns the deviceId on token issue; this is the value we send to claim continuity.
import * as SecureStore from 'expo-secure-store';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

const DEVICE_ID_KEY = 'trump_waiter_device_id_v1';

function uuid(): string {
  // RFC4122-ish v4 without a crypto dep (sufficient as an opaque install id; the
  // server treats it as an opaque key and pairs it with a server-side secret).
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function getOrCreateDeviceId(): Promise<string> {
  try {
    const existing = await SecureStore.getItemAsync(DEVICE_ID_KEY);
    if (existing) return existing;
  } catch {
    /* fall through to create */
  }
  const id = uuid();
  try {
    await SecureStore.setItemAsync(DEVICE_ID_KEY, id);
  } catch {
    /* if persistence fails the id is still usable for this run */
  }
  return id;
}

export function getDeviceName(): string {
  const name = Device.deviceName || Device.modelName || 'Android device';
  return String(name).slice(0, 60);
}

export function getPlatform(): string {
  return Platform.OS; // 'android' | 'ios'
}
