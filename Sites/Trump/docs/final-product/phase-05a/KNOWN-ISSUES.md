# KNOWN-ISSUES.md — Trump v1.0 RC1

**Date:** 2026-06-25. None of these are release-blocking for a controlled pilot. Each has a measured/known status and a path. Severity: 🔴 must-fix-before-wide-rollout · 🟡 should-fix · 🟢 nice-to-have.

---

## Open — require environment/hardware outside the build
| # | Issue | Sev | Status / Plan |
|---|---|---|---|
| 1 | **APK not built** | 🔴 (for Android pilot) | No Android SDK/JDK/Expo account in the build env. Config + commands ready (APK-BUILD). Build on a toolchain/EAS. |
| 2 | **3-device testing not run** | 🔴 (for Android pilot) | No physical devices. Matrix ready (PILOT-TEST-PLAN), marked NOT EXECUTED, no fabricated numbers. |
| 3 | **Prod load test not run** | 🟡 | Shared droplet; operator-run off-hours (PRODUCTION-VALIDATION §C). App-level baseline measured in Phase 05. |
| 4 | **Kitchen token-login not verified locally** | 🟢 | Kitchen account exists; its local password ≠ the test value (accounts aren't reset on startup). Role auth is the same code path as the verified roles. Verify with the real cred at deploy. |

## Open — measured, recommendation prepared (deferred by design)
| # | Issue | Sev | Status / Plan |
|---|---|---|---|
| 5 | **Rate limiter keys by IP** (shared Wi-Fi) | 🟡 | RC1 **raised the ceilings** (general 600→3000, public-write 60→300) — fits a per-restaurant IP. **Per-table/session keying** is the fuller fix, designed in RATE-LIMIT-REVIEW, deferred to avoid a keying redesign during freeze. |
| 6 | **Media served from the app server** (1.5 GB video, 51 MB avg) | 🟡 | Bandwidth ceiling at scale. **Spaces+CDN migration prepared** (MEDIA-BANDWIDTH) — execute before scaling customer volume; needs Spaces creds (operator). Also: lazy-load images, generate thumbnails, fix the one 5.5 MB image. |
| 7 | **Order write = 2 transactions/order** | 🟢 | Under artificial 70-simultaneous burst it was pool-bound; **retry/backoff (RC1) cut burst failures 33→1** and idempotency makes retries safe. Collapsing to a single transaction is a further (deferred) optimization. |
| 8 | **Order placement not in the audit trail** | 🟢 | Orders are recorded as `Order` + `OrderStatusHistory` (not `AuditLog`). Add an `order.placed` audit row if order-level audit is desired. |

## Resolved in RC1 (was open in earlier phases)
| Was | Now |
|---|---|
| Menu endpoint ~12 req/s, ~800 ms p50 @10c (no cache) | **Cached + single-flight: ~500 req/s, ~17 ms p50** (Phase 05) |
| Cold-cache **stampede** at high concurrency | **Single-flight rebuild** (at most one loadMenu) |
| Order validator re-loaded the full menu per order → pool exhaustion | **Source-level loadMenu memo** (Phase 05) |
| **Duplicate orders** on double-tap/retry | **Idempotency** (`clientOrderId` + partial unique index) — 10 concurrent identical → 1 order |
| Order **save-succeeded-but-500** (post-save side-effect failure) | **Post-save side-effects best-effort** — never 500 a persisted order |
| Burst order failures (33/91 5xx) | **Retry/backoff** → 1/71 5xx |
| `Cache-Control` missing on `/api/menu` | **`public, max-age=30`** added |

## Notes
- **Rate-limit bypass** is OFF by default and must never be enabled in production (loud startup warning if it is).
- All RC1 migrations are additive/backward-compatible; old code tolerates the new columns (defaults).
