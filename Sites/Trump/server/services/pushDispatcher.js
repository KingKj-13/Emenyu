'use strict';
// Phase 04B — push fan-out. A SIDE-EFFECT of notificationService.notify(): the
// Notification row is the source of truth, the push is only a hint. This resolves
// a notification's recipients to their registered devices and sends a data push.
//
// Transport: Expo Push (https://exp.host/--/api/v2/push/send) — Expo routes Android
// through FCM and iOS through APNs, so the app needs no raw FCM server key. Tokens
// that are not Expo tokens are logged and skipped (a real FCM/APNs HTTP-v1 sender
// can be slotted in here later). Every failure is swallowed: a dropped push must
// never break notify(), because the client reconciles via GET /notifications.
const STAFF_ROLES = ['owner', 'manager', 'waiter', 'kitchen'];
const EXPO_ENDPOINT = 'https://exp.host/--/api/v2/push/send';
const isExpoToken = (t) => /^ExponentPushToken\[/.test(String(t || '')) || /^ExpoPushToken\[/.test(String(t || ''));

class PushDispatcher {
  constructor({ accountService, tokenService, config, logger = null } = {}) {
    this.accountService = accountService;
    this.tokenService = tokenService;
    this.config = config;
    this.logger = logger;
    // fetch exists natively on Node 18+; guard so the service is inert if absent.
    this.canSend = typeof fetch === 'function';
  }

  // Resolve a notification's audience to a concrete username list.
  //  recipientUser set            -> that user
  //  recipientRole set (no user)  -> all active accounts with that role
  //  both empty (broadcast)       -> all active staff
  async _recipients({ recipientUser = '', recipientRole = '' }) {
    const u = String(recipientUser || '').trim().toLowerCase();
    if (u) return [u];
    let accounts = [];
    try { accounts = await this.accountService.getAccounts(); } catch { accounts = []; }
    const active = accounts.filter(a => (a.status || 'active') !== 'suspended');
    if (recipientRole) {
      return active.filter(a => a.role === recipientRole).map(a => a.username);
    }
    return active.filter(a => STAFF_ROLES.includes(a.role)).map(a => a.username);
  }

  // Non-blocking entry point. Callers should NOT await this in a hot path.
  async dispatch(notification) {
    if (!notification || !this.tokenService) return { sent: 0 };
    try {
      const usernames = await this._recipients(notification);
      const devices = await this.tokenService.pushTargetsForUsernames(usernames);
      if (!devices.length) return { sent: 0 };

      const expoMessages = [];
      for (const d of devices) {
        if (isExpoToken(d.pushToken)) {
          expoMessages.push({
            to: d.pushToken,
            title: notification.title,
            body: notification.body || '',
            sound: notification.priority <= 2 ? 'default' : null,
            priority: notification.priority <= 2 ? 'high' : 'normal',
            data: {
              notificationId: notification.id,
              source: notification.source,
              priority: notification.priority,
              tableId: notification.tableId || ''
            }
          });
        } else {
          this.logger?.debug?.('push_skip_non_expo', { deviceId: d.deviceId, provider: d.pushProvider });
        }
      }

      const sent = await this._sendExpo(expoMessages);
      this.logger?.debug?.('push_dispatched', { notificationId: notification.id, devices: devices.length, sent });
      return { sent };
    } catch (error) {
      this.logger?.warn?.('push_dispatch_failed', { error: error?.message });
      return { sent: 0, error: error?.message };
    }
  }

  async _sendExpo(messages) {
    if (!messages.length || !this.canSend) return 0;
    let sent = 0;
    // Expo accepts up to 100 messages per request.
    for (let i = 0; i < messages.length; i += 100) {
      const chunk = messages.slice(i, i + 100);
      try {
        const res = await fetch(EXPO_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(chunk)
        });
        if (res.ok) sent += chunk.length;
        else this.logger?.warn?.('push_expo_http', { status: res.status });
      } catch (error) {
        this.logger?.warn?.('push_expo_send_failed', { error: error?.message });
      }
    }
    return sent;
  }
}

module.exports = { PushDispatcher };
