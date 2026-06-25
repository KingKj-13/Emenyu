# RELEASE-NOTES.md — Trump v1.0 RC1

**Date:** 2026-06-25. **Tag:** `trump-v1.0-rc1`. **Branch:** `feat/chatbot-reco-rework`.
**Scope:** consolidation of Phases 00–05A. No new customer features, no architecture/UI redesign — bug fixes, robustness, and deployment readiness only.

---

## What's in RC1 (cumulative)
| Area | Capability |
|---|---|
| **Web platform (01–03)** | React-only SPA; staff operations (shifts, table ownership, notifications, owner ops, audit); deployed + validated (Phase 03C) |
| **Native token auth (04)** | Bearer access (cookie-HMAC) + rotating refresh + `Device` registry; web cookie auth unchanged |
| **Android waiter app (04B)** | `Apps/TrumpWaiter` (Expo/RN/TS, 8 screens) + socket Bearer handshake + `Device.pushToken`/pushDispatcher; 27/27 local integration |
| **Performance (05)** | Menu response cache (+gzip buffer +ETag +`Cache-Control`) + single-flight + source memo; rate-limit review + removable bypass |
| **RC hardening (05A)** | Order idempotency, retry/backoff, non-fatal post-save, validated production rate limits |

## New in 05A (this release)
- **Order idempotency** — `clientOrderId` + a **partial unique index**; a repeat submit (double-tap / retry) returns the existing order instead of duplicating. *Validated: 10 concurrent identical submits → 1 order (5/5).*
- **Order write robustness** — **retry/backoff** on the transient transaction-pool error; **post-save side-effects are now best-effort** (a socket-emit failure no longer 500s an order that's already saved). *Validated: 70-concurrent burst 5xx dropped 33→1.*
- **Validated production rate limits** — general **600→3000 / 15 min** (≈200/min/restaurant), public-write **60→300 / 15 min** (≈20 orders/min), so a busy restaurant on one shared Wi-Fi IP isn't throttled. Env-overridable.

## Migrations in RC1 (additive, backward-compatible)
| Migration | Adds |
|---|---|
| `20260625070500_phase04_device_tokens` | `Device` table |
| `20260625120000_phase04b_push_token` | `Device.pushToken` / `pushProvider` |
| `20260625160000_phase05a_order_idempotency` | `Order.clientOrderId` + partial unique index |

All are `ADD COLUMN … DEFAULT` / new table / index — no rewrites, no data loss, reversible.

## Behaviour guarantees
- **Web cookie login + browser sockets: unchanged** (re-verified each phase).
- **Rate-limit bypass: OFF by default** (`TRUMP_LOAD_TEST_BYPASS` unset) — never enabled in production.
- **Menu JSON: byte-identical** — only cached/served faster.
- **Orders: same semantics**; idempotency is opt-in via `clientOrderId` (legacy no-key behaviour unchanged).

## Not in RC1 (deferred to Phase 06)
Multi-restaurant architecture, customer app, kitchen display, advanced AI, additional native clients. Per-table rate-limit keying and the media→Spaces/CDN migration are **prepared/recommended** (see KNOWN-ISSUES) but not executed in RC1.

## Known issues
See [KNOWN-ISSUES.md](KNOWN-ISSUES.md). None are release-blocking; the notable open items are the **APK build + 3-device test** and the **off-hours prod load test** (require hardware/window outside this build).
