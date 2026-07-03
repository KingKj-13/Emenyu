// Auth / device / menu types — matched to the Phase 04 token endpoints and the
// existing menu API. These mirror server responses; the server owns the shapes.

export type Role = 'owner' | 'manager' | 'waiter' | 'kitchen';

export interface AuthUser {
  username: string;
  role: Role;
  label?: string;
  status?: string;
}

export interface DeviceInfo {
  deviceId: string;
  deviceName: string;
  platform: string;
}

// POST /api/auth/token response
export interface TokenIssueResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number; // seconds
  user: AuthUser;
  device: DeviceInfo;
}

// POST /api/auth/token/refresh response
export interface TokenRefreshResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
}

// GET /api/auth/devices row
export interface DeviceRow {
  deviceId: string;
  deviceName: string;
  platform: string;
  lastSeenAt: string;
  createdAt: string;
}

// Persisted session (secure store)
export interface StoredSession {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: number; // epoch ms
  deviceId: string;
  user: AuthUser;
}

// Menu item shape (the app reads to browse/quote/add-to-cart, never mutates —
// the owner edits the menu on the web). Category fields power the Add-Item browser.
export interface MenuItem {
  id: string | number;
  name: string;
  price?: number;
  category?: string;
  subcategory?: string;
  categoryType?: string;
  description?: string;
  img?: string;
  available?: boolean;
}
