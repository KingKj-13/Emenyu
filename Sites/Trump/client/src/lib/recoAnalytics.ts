// Client-side recommendation analytics (Phase 4, Task 1). Fire-and-forget: it
// batches impressions, flushes funnel events promptly, dedupes impressions per
// page-load, and never throws — analytics must never affect the guest experience.
//
// Surfaces call: trackImpressions (on render), trackClick (on open), trackAccepted
// (on add), trackOrdered (at checkout), and markShown/flushDismissed (to record
// "shown but never acted on" as a dismissal when a surface closes).
import { ENDPOINTS } from '../constants/api';

export type RecoEventType = 'impression' | 'click' | 'accepted' | 'dismissed' | 'ordered';
export type RecoMode = 'customer' | 'waiter';

export interface RecoItemLike {
  name: string;
  price?: number;
  dbId?: number;
  categoryType?: string;
  source_title?: string;
  rotationGroup?: string;
  chef?: boolean;
}

export interface RecoContext {
  mode: RecoMode;
  source?: string;          // surface key, e.g. 'cart' | 'chat' | 'pairing' | 'cart-rec'
  originatingName?: string; // the item / cart that triggered the recommendation
  originatingItemId?: number;
}

interface RecoEvent {
  eventType: RecoEventType;
  source: string;
  recType?: string;
  recommendedItemId?: number;
  recommendedName: string;
  originatingItemId?: number;
  originatingName?: string;
  rotationGroup?: string;
  sessionId: string;
  mode: RecoMode;
  chef?: boolean;
  value?: number;
}

const SID_KEY = 'reco_sid';
const ACCEPTED_KEY = 'reco_accepted';
const FLUSH_DELAY = 1200;

function sessionId(): string {
  try {
    let id = localStorage.getItem(SID_KEY);
    if (!id) {
      id = `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(SID_KEY, id);
    }
    return id;
  } catch {
    return 'anon';
  }
}

const queue: RecoEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const seenImpressions = new Set<string>();

function flush(): void {
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
  if (queue.length === 0) return;
  const batch = queue.splice(0, queue.length);
  const body = JSON.stringify({ events: batch });
  try {
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      navigator.sendBeacon(ENDPOINTS.recoEvents, new Blob([body], { type: 'application/json' }));
      return;
    }
  } catch {
    /* fall through to fetch */
  }
  fetch(ENDPOINTS.recoEvents, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true
  }).catch(() => {});
}

function enqueue(ev: RecoEvent): void {
  queue.push(ev);
  if (ev.eventType === 'impression') {
    if (!flushTimer) flushTimer = setTimeout(flush, FLUSH_DELAY);
  } else {
    flush(); // clicks / accepts / orders / dismissals go out promptly
  }
}

function baseEvent(type: RecoEventType, item: RecoItemLike, ctx: RecoContext): RecoEvent {
  return {
    eventType: type,
    source: item.source_title || ctx.source || '',
    recType: item.categoryType,
    recommendedItemId: item.dbId,
    recommendedName: item.name,
    originatingItemId: ctx.originatingItemId,
    originatingName: ctx.originatingName,
    rotationGroup: item.rotationGroup,
    sessionId: sessionId(),
    mode: ctx.mode,
    chef: item.chef === true,
    value: Number(item.price) || 0
  };
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
}

export function trackImpressions(items: RecoItemLike[], ctx: RecoContext): void {
  const sid = sessionId();
  for (const item of items || []) {
    if (!item?.name) continue;
    const key = `${ctx.source || item.source_title || ''}|${item.name}|${sid}`;
    if (seenImpressions.has(key)) continue;
    seenImpressions.add(key);
    enqueue(baseEvent('impression', item, ctx));
  }
}

export function trackClick(item: RecoItemLike, ctx: RecoContext): void {
  if (!item?.name) return;
  markClicked(ctx.source || item.source_title || '', item.name);
  enqueue(baseEvent('click', item, ctx));
}

export function trackAccepted(item: RecoItemLike, ctx: RecoContext): void {
  if (!item?.name) return;
  rememberAccepted(item, ctx);
  enqueue(baseEvent('accepted', item, ctx));
}

// ── "shown but unclicked" → dismissal, recorded when a surface closes ──
const shownBySurface = new Map<string, Map<string, { item: RecoItemLike; ctx: RecoContext }>>();

export function markShown(surfaceKey: string, items: RecoItemLike[], ctx: RecoContext): void {
  const map = new Map<string, { item: RecoItemLike; ctx: RecoContext }>();
  for (const item of items || []) if (item?.name) map.set(item.name, { item, ctx });
  shownBySurface.set(surfaceKey, map);
}

function markClicked(surfaceKey: string, name: string): void {
  shownBySurface.get(surfaceKey)?.delete(name);
}

export function flushDismissed(surfaceKey: string): void {
  const map = shownBySurface.get(surfaceKey);
  if (!map) return;
  for (const { item, ctx } of map.values()) enqueue(baseEvent('dismissed', item, ctx));
  shownBySurface.delete(surfaceKey);
}

// ── ordered attribution: remember accepted recs, emit "ordered" at checkout ──
interface AcceptedRec {
  name: string;
  value: number;
  source: string;
  recType?: string;
  rotationGroup?: string;
  mode: RecoMode;
  chef?: boolean;
}

function rememberAccepted(item: RecoItemLike, ctx: RecoContext): void {
  try {
    const raw = sessionStorage.getItem(ACCEPTED_KEY);
    const list: AcceptedRec[] = raw ? JSON.parse(raw) : [];
    list.push({
      name: item.name,
      value: Number(item.price) || 0,
      source: item.source_title || ctx.source || '',
      recType: item.categoryType,
      rotationGroup: item.rotationGroup,
      mode: ctx.mode,
      chef: item.chef
    });
    sessionStorage.setItem(ACCEPTED_KEY, JSON.stringify(list.slice(-50)));
  } catch {
    /* ignore */
  }
}

export function trackOrdered(cartItemNames: string[]): void {
  let accepted: AcceptedRec[] = [];
  try {
    accepted = JSON.parse(sessionStorage.getItem(ACCEPTED_KEY) || '[]');
  } catch {
    accepted = [];
  }
  if (accepted.length === 0) return;
  const ordered = new Set((cartItemNames || []).map(n => String(n).toLowerCase()));
  const sid = sessionId();
  for (const rec of accepted) {
    if (!ordered.has(rec.name.toLowerCase())) continue;
    enqueue({
      eventType: 'ordered',
      source: rec.source,
      recType: rec.recType,
      recommendedName: rec.name,
      rotationGroup: rec.rotationGroup,
      sessionId: sid,
      mode: rec.mode,
      chef: rec.chef,
      value: rec.value
    });
  }
  try {
    sessionStorage.removeItem(ACCEPTED_KEY);
  } catch {
    /* ignore */
  }
}
