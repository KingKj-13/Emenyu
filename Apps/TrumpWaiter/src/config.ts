// App configuration. The API base URL is read from Expo config `extra.apiBaseUrl`
// (app.json) so the same binary can point at production or, for integration
// testing, a local Trump server — without code changes. The server is the source
// of truth; this app only consumes its existing endpoints.
import Constants from 'expo-constants';

type Extra = { apiBaseUrl?: string; restaurantId?: string };

const extra = (Constants.expoConfig?.extra ?? {}) as Extra;

// Production default. Override via app.json `extra.apiBaseUrl` (e.g.
// "http://10.0.2.2:3012/Trump" for an emulator hitting a local server).
export const API_BASE_URL: string = (extra.apiBaseUrl || 'https://emenyu.com/Trump').replace(/\/+$/, '');
export const RESTAURANT_ID: string = extra.restaurantId || 'trump';

// Socket.IO path mirrors the server mount (`/Trump/socket.io`).
export const SOCKET_PATH = `${new URL(API_BASE_URL).pathname.replace(/\/+$/, '')}/socket.io`;
// Origin only (scheme + host[:port]) — socket.io-client connects to the origin and
// uses `path` for the namespace mount.
export const SOCKET_ORIGIN = new URL(API_BASE_URL).origin;

// Timeouts / retry policy for the REST client.
export const REQUEST_TIMEOUT_MS = 15000;
export const REFRESH_TIMEOUT_MS = 12000;

// How often the notification badge polls when push is unavailable (foreground).
export const NOTIFICATION_POLL_MS = 25000;

export const APP_VERSION: string = Constants.expoConfig?.version || '1.0.0';
