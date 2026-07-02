// Push notifications via Expo (which routes Android → FCM, iOS → APNs). The flow:
//   1. configure a foreground handler + an Android channel,
//   2. request OS permission, obtain the Expo push token,
//   3. register that token against THIS device row (PATCH /auth/devices/:id/push-token),
//   4. expose listeners for foreground receipt + tap routing + badge updates.
// The Notification table is the source of truth — a push is only a hint; the app
// always reconciles unread state via REST on foreground/reconnect.
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { authApi } from '../api/auth';

export function configureNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true
    })
  });
}

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Service alerts',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#c9a24a'
  });
}

// Returns the Expo push token, or null if denied / not a physical device.
export async function registerForPush(deviceId: string): Promise<string | null> {
  if (!Device.isDevice) return null; // push tokens are not issued on simulators
  await ensureAndroidChannel();

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== 'granted') {
    status = (await Notifications.requestPermissionsAsync()).status;
  }
  if (status !== 'granted') return null;

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  const tokenResponse = await Notifications.getExpoPushTokenAsync(
    projectId ? { projectId } : undefined
  );
  const pushToken = tokenResponse.data;

  // Register against the server so notify() can fan out to this device.
  try {
    await authApi.setPushToken(deviceId, pushToken, 'expo');
  } catch {
    // Non-fatal: foreground/polling still deliver; we retry on next app open.
  }
  return pushToken;
}

// Clear the server-side token for this device (called on logout).
export async function unregisterPush(deviceId: string): Promise<void> {
  try {
    await authApi.setPushToken(deviceId, '', 'expo');
  } catch {
    /* best-effort */
  }
}

export async function setBadgeCount(count: number): Promise<void> {
  try {
    await Notifications.setBadgeCountAsync(Math.max(0, count));
  } catch {
    /* unsupported on some launchers — non-fatal */
  }
}

export function addForegroundListener(
  cb: (n: Notifications.Notification) => void
): () => void {
  const sub = Notifications.addNotificationReceivedListener(cb);
  return () => sub.remove();
}

// Tap handling: payload.data carries { notificationId, source, tableId } from the
// server (pushDispatcher) so the app can route to the right screen.
export function addResponseListener(
  cb: (data: Record<string, unknown>) => void
): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    cb(response.notification.request.content.data ?? {});
  });
  return () => sub.remove();
}
