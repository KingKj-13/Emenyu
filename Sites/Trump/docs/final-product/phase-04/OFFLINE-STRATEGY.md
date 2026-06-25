# OFFLINE-STRATEGY.md — Phase 04 Step 6

**Date:** 2026-06-25. **Status: design.** Principle: **read-resilient, write-online.** The server stays the source of truth; the app caches reads for continuity and never silently diverges on writes.

---

## What is cached (on-device, encrypted where sensitive)

| Data | Store | Purpose | TTL / refresh |
|---|---|---|---|
| **Auth tokens** | OS secure store (Keystore/Keychain) | stay logged in offline; refresh on reconnect | access 15 m, refresh 30 d (rotating) |
| **My shift** | encrypted KV | show on-duty state offline | refresh on `GET /shift/me` |
| **My assignments** (owned tables) | KV | floor view offline | refresh on `GET /ownership` |
| **Notifications** (recent) | KV | read history offline | refresh on `GET /notifications` |
| **Menu** (items/prices) | KV (larger) | browse/quote offline | refresh on `GET /menu` (ETag/updatedAt) |

## Cached authentication
- Tokens persist in secure storage; the app opens **offline** showing cached state.
- On reconnect: if access expired → `POST /auth/token/refresh`; if refresh invalid (revoked/expired) → forced re-login. No credentials cached — only tokens.

## Cached assignments / notifications
- Last successful `GET /ownership`, `/shift/me`, `/notifications` snapshots are persisted with a fetched-at timestamp; UI shows a **"last synced HH:MM · offline"** banner so staff know it's stale.

## Reconnect sync
1. Refresh access token if needed.
2. Re-fetch the small read set (`/shift/me`, `/ownership`, `/notifications/unread-count`) — these are tiny + indexed (≤ 30 ms on prod).
3. Replay any **queued mutations** (below), oldest first.
4. Reconcile UI to server truth (server wins).

## Write strategy — online-first with a bounded queue
- **v1 (recommended): writes require connectivity.** Shift start/end, transfer/takeover/reassign, ack are **disabled while offline** (greyed with "reconnect to act"). This avoids conflict complexity for safety-relevant ops (you don't want a stale offline reassignment fighting a live one).
- **Optional later:** a small **outbox** for low-risk idempotent actions (e.g., `ack notification`) that replays on reconnect; server `Notification.readAt` is idempotent (already), so replay is safe.

## Conflict handling
- **Server authoritative.** Every mutation is server-validated + **audited** (Phase 03). If a queued action conflicts (e.g., the table was reassigned elsewhere), the server response (409/200-with-new-owner) is surfaced and the cache is reconciled — the app never asserts its stale view.
- Ownership transfer already rejects non-owners (403) and records `previousWaiter`/`reason`, so a late offline transfer simply fails cleanly and the operator sees the current owner.

## Why not full offline-first
Restaurant floor ops are **real-time and shared** (one active owner per table, live shifts). Offline writes invite split-brain (two waiters "owning" a table). Read-cache + online-writes gives resilience (the app keeps working through brief drops) **without** correctness risk. This matches the brief's "no duplicated workflows / server is source of truth."
