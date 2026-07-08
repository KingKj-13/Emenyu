// Phase 5 (AI Concierge) — native browser notifications for proactive
// recommendations. Client-local only (no VAPID/server push): the page itself
// already knows the moment a new suggestion is ready (useConciergeTiming),
// so this just displays it via the standard Notification API. Distinct from
// the existing owner/manager Web Push subscription flow in AdminPage.tsx,
// which is a different transport for a different audience (staff alerts).

const ASKED_KEY = 'trump_concierge_notif_asked';

export function hasAskedNotificationPermission(): boolean {
  try { return localStorage.getItem(ASKED_KEY) === '1'; } catch { return false; }
}

// Ask permission exactly once per device — subsequent calls are a no-op even
// if the guest denied or dismissed the first prompt, per the "ask only once"
// requirement.
export async function requestNotificationPermissionOnce(): Promise<NotificationPermission | null> {
  if (!('Notification' in window)) return null;
  if (hasAskedNotificationPermission()) return Notification.permission;
  try { localStorage.setItem(ASKED_KEY, '1'); } catch { /* private-browsing storage may throw; proceed anyway */ }
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export function canShowNotification(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted';
}

// Show a single native notification for a proactive recommendation. Never
// call this while the chat panel is already open/focused — the caller (the
// concierge trigger handler) is responsible for that gate, matching "never
// notify while the chat window is already open."
export function showConciergeNotification(body: string, onOpen?: () => void): void {
  if (!canShowNotification()) return;
  try {
    const n = new Notification('🍷 Your Sommelier', {
      body,
      tag: 'trump-concierge-recommendation',
    });
    n.onclick = () => {
      window.focus();
      onOpen?.();
      n.close();
    };
  } catch {
    // Some mobile browsers (notably iOS Safari) throw on `new Notification()`
    // even when permission is granted — a missed nudge is not worth surfacing
    // an error for.
  }
}
