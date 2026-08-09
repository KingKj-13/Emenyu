import { API_PREFIX, RESTAURANT_ID } from '../constants/api';

/**
 * Anonymous engagement capture.
 *
 * What leaves the device: an event name, a random per-sitting session id, the
 * active locale, and which dish/category/cut was involved. What does not: any
 * name, contact detail, account, persistent device id or location. The session
 * id lives in sessionStorage, so closing the tab ends the identity — there is
 * deliberately no way to join two visits together.
 *
 * Events are batched and flushed on an idle timer, and again with `sendBeacon`
 * when the page is hidden. Beacon is what makes the last events of a sitting
 * survive: a guest closing the tab or locking the tablet would otherwise lose
 * exactly the dwell figures that matter most.
 */

export type EngagementEventType =
  | 'MENU_VIEW'
  | 'CATEGORY_VIEW'
  | 'ITEM_VIEW'
  | 'CUT_VIEW'
  | 'VIDEO_PLAY'
  | 'VIDEO_PROGRESS'
  | 'VIDEO_COMPLETE'
  | 'PHOTO_VIEW'
  | 'LANGUAGE_SELECT'
  | 'SEARCH';

export interface EngagementEvent {
  eventType: EngagementEventType;
  menuItemId?: number | null;
  categoryId?: number | null;
  cutSlug?: string | null;
  label?: string;
  categoryName?: string;
  dwellMs?: number;
  positionSec?: number;
  locale?: string;
  /** Small structured extras (asset id, media kind). Never personal data. */
  meta?: Record<string, string | number | boolean>;
}

const SESSION_KEY = 'emenyu.session';
const ENDPOINT = `${API_PREFIX}/api/engagement`;
const FLUSH_MS = 4000;
const MAX_QUEUE = 30;

let queue: Array<EngagementEvent & { sessionId: string; tableId: string; deviceType: string }> = [];
let timer: number | null = null;
/** Set by the app so every event carries the language actually on screen. */
let currentLocale = 'en';
let currentTableId = '';

function sessionId(): string {
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = (crypto.randomUUID?.() ?? `s-${Math.random().toString(36).slice(2)}-${Date.now()}`);
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    // Storage blocked: fall back to a per-page-load id. Analytics degrade to
    // "one session per page load" rather than failing.
    return `nostore-${Math.random().toString(36).slice(2)}`;
  }
}

/** Coarse form factor only — never a fingerprint. */
function deviceType(): 'phone' | 'tablet' | 'desktop' {
  const w = window.innerWidth;
  if (w < 600) return 'phone';
  if (w < 1280) return 'tablet';
  return 'desktop';
}

export function setEngagementContext(opts: { locale?: string; tableId?: string }) {
  if (opts.locale) currentLocale = opts.locale;
  if (opts.tableId !== undefined) currentTableId = opts.tableId;
}

function schedule() {
  if (timer != null) return;
  timer = window.setTimeout(() => { timer = null; flush(); }, FLUSH_MS);
}

export function flush(useBeacon = false) {
  if (timer != null) { window.clearTimeout(timer); timer = null; }
  if (queue.length === 0) return;
  const body = JSON.stringify({ restaurantId: RESTAURANT_ID, locale: currentLocale, events: queue });
  queue = [];
  try {
    if (useBeacon && navigator.sendBeacon) {
      // MUST be a Blob with an explicit JSON type. Passing the string directly
      // makes the browser send text/plain, express.json() skips it, and the
      // server receives an empty body — a silent, total data loss.
      const ok = navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }));
      if (ok) return;
      // Queue full or blocked: fall through to keepalive fetch rather than drop.
    }
    // keepalive lets the request outlive the page in browsers without beacon.
    void fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => { /* analytics must never surface an error to a guest */ });
  } catch {
    /* ignore */
  }
}

export function track(event: EngagementEvent) {
  queue.push({
    ...event,
    locale: event.locale ?? currentLocale,
    sessionId: sessionId(),
    tableId: currentTableId,
    deviceType: deviceType(),
  });
  // Flush early rather than drop: a guest browsing fast can outrun the timer.
  if (queue.length >= MAX_QUEUE) flush();
  else schedule();
}

let listenersBound = false;
export function bindEngagementLifecycle() {
  if (listenersBound) return;
  listenersBound = true;
  // visibilitychange is the only event reliably delivered on mobile Safari when
  // a tab is backgrounded or the device is locked; `unload` is not.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush(true);
  });
  window.addEventListener('pagehide', () => flush(true));
  // Belt and braces for a full-page navigation (a QR rescan, a typed URL, the
  // tablet being reset between sittings): pagehide is the modern event but is
  // not fired in every teardown path, and losing the queue there loses exactly
  // the dwell figures the report is built on.
  window.addEventListener('beforeunload', () => flush(true));
}

/**
 * Measures how long a detail view stayed open.
 * Returns a stop function that emits the ITEM_VIEW with its dwell time.
 */
export function startDwell(event: EngagementEvent): () => void {
  const openedAt = Date.now();
  let done = false;
  return () => {
    if (done) return;
    done = true;
    track({ ...event, dwellMs: Date.now() - openedAt });
  };
}
