// Typed wrappers for the Phase 04 token endpoints + device management. token issue
// is anonymous (carries username/password); the rest ride the Bearer access token.
import { api, apiRequest } from './apiClient';
import { EP } from './endpoints';
import type { TokenIssueResponse, DeviceRow } from '../types/api';

export interface IssueParams {
  username: string;
  password: string;
  deviceId: string;
  deviceName: string;
  platform: string;
}

export const authApi = {
  issueToken: (p: IssueParams) =>
    apiRequest<TokenIssueResponse>(EP.tokenIssue, { method: 'POST', body: p, anonymous: true }),

  // Best-effort logout for this device (revokes the refresh token server-side).
  revokeToken: (refreshToken: string) =>
    apiRequest<{ ok: boolean }>(EP.tokenRevoke, { method: 'POST', body: { refreshToken }, anonymous: true, allowOffline: true }),

  listDevices: () => api.get<DeviceRow[]>(EP.devices),

  revokeDevice: (deviceId: string) => api.del<{ revoked: boolean }>(EP.device(deviceId)),

  setPushToken: (deviceId: string, pushToken: string, pushProvider = 'expo') =>
    api.patch<{ ok: boolean }>(EP.devicePushToken(deviceId), { pushToken, pushProvider })
};
