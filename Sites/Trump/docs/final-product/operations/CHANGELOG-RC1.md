# CHANGELOG-RC1.md — Trump v1.0 Release Candidate 1

**Tag:** `trump-v1.0-rc1` · **Branch:** `feat/chatbot-reco-rework` · **Date:** 2026-06-25.
Cumulative summary of what shipped across Phases 00–06 + OR1, for operators and reviewers. Authoritative per-phase detail lives in `docs/final-product/phase-*/`.

---

## Platform (Phases 01–03C) — deployed + validated
- **React-only SPA** is the sole UI; legacy vanilla admin/waiter/owner pages retired. `/Trump/Admin` serves the SPA; old `*.html` → 302.
- **Staff operations (Phase 03):** shifts, table ownership (assign/transfer/takeover/reassign), notification center, owner-ops snapshot, immutable **audit log**. New models: `Shift`, `AuditLog`, `Notification` + `WaiterAssignment` ownership fields.
- **Operations UI (03B):** notification bell, shift/ownership panels, owner dashboard, audit viewer, table timeline.
- **Deployed (03C):** Phases 01–03B live at `https://emenyu.com`, validated 15/15. **R1 deploy gotcha** identified (prisma client must generate into `Trump/node_modules`).

## Native (Phase 04 / 04B)
- **Token auth (04):** Bearer access token (15 min, same HMAC as the web cookie) + rotating single-use refresh token (30 d) + `Device` registry; multi-device; **web cookie auth unchanged**.
- **Android waiter app (04B):** `Apps/TrumpWaiter` (Expo/RN/TS, 8 screens). Backend additions: **Socket.IO Bearer handshake** + per-user notification rooms; **`Device.pushToken`** + push dispatcher (Expo→FCM/APNs). 27/27 local integration.

## Performance (Phase 05)
- **Menu response cache** (JSON + precomputed gzip + ETag + `Cache-Control: max-age=30`) + **single-flight** rebuild + **source-level `loadMenu` memo**. Measured: 12→500 req/s @10c; ~150→2 ms p50.
- **Rate-limit review:** documented shared-IP behaviour; added a **removable, default-OFF** load-test bypass (`TRUMP_LOAD_TEST_BYPASS`).
- Order integrity verified 6/6; DB certified (sub-ms queries); media/bandwidth measured (video dominates).

## RC hardening (Phase 05A)
- **Order idempotency:** `Order.clientOrderId` + partial unique index → repeat submit returns the existing order (no duplicate). 5/5.
- **Retry/backoff** on transient transaction-pool errors; **post-save side-effects best-effort** (a persisted order never 500s). Burst 5xx 33→1.
- **Validated production rate limits:** general 600→**3000**/15 min, public-write 60→**300**/15 min.

## Pilot kit (Phase 06)
- Operator-run pilot instruments (log, interview protocols, measurement plan, bug/UX templates, decision gate). **No code change** (RC1 frozen).

## Operations package (OR1, this phase)
- 20 operations docs under `docs/final-product/operations/` (deploy/recovery/monitoring/logging/backup/incident/maintenance/training/checklists).
- **Operational defect fixed:** `scripts/deploy-trump.sh` now performs the **R1-safe** Prisma generate (into `Trump/node_modules`) + a client-verify step.

## Migrations in RC1 (all additive, backward-compatible, reversible)
| Migration | Adds |
|---|---|
| `…phase03_staff_ops` | Shift, AuditLog, Notification + WaiterAssignment ownership fields |
| `20260625070500_phase04_device_tokens` | Device |
| `20260625120000_phase04b_push_token` | Device.pushToken / pushProvider |
| `20260625160000_phase05a_order_idempotency` | Order.clientOrderId + partial unique index |

## Behaviour guarantees
- Web cookie login + browser sockets **unchanged**. Menu JSON **byte-identical** (just cached). Order semantics unchanged (idempotency is opt-in via `clientOrderId`). Rate-limit bypass **OFF by default**.

## Not in RC1 (Phase 06+ backlog)
Multi-restaurant architecture, customer app, kitchen display, advanced AI, more native clients; per-table rate-limit keying; media→Spaces/CDN; single-transaction order write. See [KNOWN-LIMITATIONS.md](KNOWN-LIMITATIONS.md).
