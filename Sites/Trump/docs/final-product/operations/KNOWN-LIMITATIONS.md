# KNOWN-LIMITATIONS.md — Accepted Gaps at RC1

Honest list of what Trump v1.0 RC1 does **not** do, or does with a known constraint. None block a controlled first pilot; each has a status and a path. This is the operator's "no surprises" sheet. Severity for rollout: 🔴 blocker-for-wide-rollout · 🟡 manage/plan · 🟢 minor.

---

## Infrastructure / scale
| # | Limitation | Sev | Notes / path |
|---|---|---|---|
| 1 | **Single 1 vCPU / 1 GB droplet, shared** with the other restaurants | 🟡 | Fine for one pilot restaurant at ~1,000 customers/day (Phase 05 capacity). Scaling beyond → bigger box / separate instance. |
| 2 | **Single app process** (PM2 fork, 1 instance) — no clustering | 🟡 | 1 core for JS; matches a 1-vCPU box. Vertical scale first; clustering is a future option. |
| 3 | **Media served from the app server** (1.5 GB video, 51 MB avg) | 🟡 | Bandwidth ceiling at scale. **Spaces+CDN migration prepared** ([../phase-05/MEDIA-BANDWIDTH.md](../phase-05/MEDIA-BANDWIDTH.md)); needs Spaces creds. Also: lazy-load + thumbnails. |
| 4 | **Rate limiter keys by IP** — a restaurant on one Wi-Fi shares a bucket | 🟡 | RC1 **raised the ceilings** (3000/300 per 15 min) to fit a per-restaurant IP. **Per-table keying** is the fuller fix (deferred, [../phase-05/RATE-LIMIT-REVIEW.md](../phase-05/RATE-LIMIT-REVIEW.md)). Watch `rate_limit_*` logs. |

## Validation gates still open (operator-run)
| # | Limitation | Sev | Path |
|---|---|---|---|
| 5 | **Release APK not built** (no Android toolchain in dev env) | 🔴 (for Android pilot) | Build on EAS/toolchain ([../phase-04b/APK-BUILD.md](../phase-04b/APK-BUILD.md)). |
| 6 | **Physical-device matrix not run** (no phones in dev env) | 🔴 (for Android pilot) | Run on ≥3 devices ([../phase-06/PERFORMANCE-OBSERVATIONS.md](../phase-06/PERFORMANCE-OBSERVATIONS.md)). |
| 7 | **Prod load test not run** (shared box) | 🟡 | Off-hours, operator-run ([../phase-05a/PRODUCTION-VALIDATION.md](../phase-05a/PRODUCTION-VALIDATION.md) §C). App baseline measured in Phase 05. |
| 8 | **Live restaurant pilot not run** | 🔴 (for certification) | Operator-run ([PILOT-CHECKLIST.md](PILOT-CHECKLIST.md)). API dry-run proven 11/11. |

## Product / behaviour
| # | Limitation | Sev | Notes |
|---|---|---|---|
| 9 | **Order write = 2 transactions/order** | 🟢 | Pool-bound only under artificial simultaneous bursts; **retry/backoff cut burst failures 33→1** and idempotency makes retries safe. Single-transaction consolidation deferred. |
| 10 | **Order placement not in the audit trail** | 🟢 | Recorded as `Order` + `OrderStatusHistory` (not `AuditLog`). Add `order.placed` audit if desired. |
| 11 | **Offline = read-only** (waiter app) | 🟢 | By design — server-authoritative actions disabled offline to avoid split-brain ([../phase-04b/OFFLINE-IMPLEMENTATION.md](../phase-04b/OFFLINE-IMPLEMENTATION.md)). |
| 12 | **No payments** | 🟢 | Trump does not process payments; billing totals are informational (owner reconciles against till). |
| 13 | **Single restaurant scope** | 🟡 | Schema has `restaurantId` but RC1 is operated for one (Trump). Multi-restaurant = Phase 06+. |

## Operations
| # | Limitation | Sev | Notes |
|---|---|---|---|
| 14 | **Monitoring is point-in-time** (on-box checks + webhook) | 🟢 | No historical graphs/APM. Thresholds: `/readyz`, disk ≥90%, mem <80 MB ([MONITORING-RUNBOOK.md](MONITORING-RUNBOOK.md)). |
| 15 | **RPO ≤ 24 h** (daily backups) | 🟡 | Up to one day of data at risk between backups. Tighten dump frequency if needed ([DISASTER-RECOVERY.md](DISASTER-RECOVERY.md)). |
| 16 | **Restaurant internet failure = fallback to paper** | 🟡 | Cloud-hosted; no on-prem mode. Plan a backup uplink with the owner ([DISASTER-RECOVERY.md](DISASTER-RECOVERY.md) DR-7). |

## What is explicitly NOT a limitation (verified)
- No data loss on restart (Postgres durability). No duplicate orders (idempotency). Web auth unchanged. Menu fast (cached). DB not a bottleneck (sub-ms). Bypass off by default.

**Bottom line:** RC1 is sound for a **controlled single-restaurant pilot** once the operator-run gates (5–8) are met. Items 1–4 are scale considerations to plan, not pilot blockers.
