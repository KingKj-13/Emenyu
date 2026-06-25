# OFFLINE-IMPLEMENTATION.md — Phase 04B Step 7

**Date:** 2026-06-25. **Status: ✅ implemented (read-resilient / write-online), per the Phase 04 OFFLINE-STRATEGY.**

No strategy redesign (Rule 1). The principle: **the server stays authoritative; the app caches reads for continuity and never silently diverges on writes.**

---

## What is cached (`src/storage/cache.ts`, AsyncStorage)
| Data | Key | Used by |
|---|---|---|
| Menu (items/prices) | `menu` | offline browse/quote |
| My shift | `shift_me` | offline on-duty state |
| My assignments (ownership) | `ownership` | offline floor view |
| Notifications (recent) | `notifications` | offline read history |

Each entry stores `{ data, fetchedAt }`. **Tokens are never cached here** — only in secure store.

## Read-through (`src/services/offline.ts`)
`readThrough(key, fetcher)`:
1. **Online** → fetch → persist to cache → return **fresh** (`stale:false`).
2. **Offline or fetch error** → return the last cached snapshot with its `fetchedAt` (`stale:true`).
3. No cache yet → empty result.

Used by `useShift`, `useOwnership`, `useNotifications`, and `TableDetail`. The UI keeps working through brief drops.

## Write strategy — online-first (v1)
Server-authoritative actions are **disabled while offline** to avoid split-brain on the shared floor (two waiters "owning" one table):
- **Two-layer guard:** `apiClient` throws `OfflineError` for any mutation when offline; **and** every action `Button` is `disabled` with a "Reconnect to act" hint when `!online` (`Shift`, `TableDetail` transfer/takeover, notification ack-all).
- Reads still render from cache; only writes are gated.

This matches OFFLINE-STRATEGY's "v1 (recommended): writes require connectivity."

## Sync status (Step 7 requirement — "display sync status clearly")
`src/components/SyncBanner.tsx` shows:
- **Offline** (red) — `Offline · last synced HH:MM` when serving cache.
- **Cached** (gold) — `Showing cached data · HH:MM` when stale but online.
- Hidden when live + fresh.
Rendered at the top of every data screen. `Home`/`Profile` also show a realtime chip (`connected` / `polling` / `offline`).

## Reconnect behaviour
- Connectivity is observed via NetInfo (`src/services/connectivity.ts`); going online re-enables actions and the next pull/poll refreshes the small read set.
- The socket auto-reconnects (refreshing its Bearer token) and `useNotifications` reconciles unread state against REST.

## Conflict handling
Server-authoritative + audited (Phase 03). A late action simply fails cleanly: transfer rejects non-owners (403), takeover/transfer require a real table (FK) — the app surfaces the server response and re-reads; it never asserts a stale view.

## Not implemented (by design)
A write **outbox** for idempotent acks is deferred (OFFLINE-STRATEGY "optional later"). v1 disables offline writes — simplest correct behaviour for shared floor ops.
