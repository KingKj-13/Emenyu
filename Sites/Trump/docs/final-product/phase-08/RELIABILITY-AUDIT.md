# RELIABILITY-AUDIT.md — Phase 08 (SRE1) Step 1

**Date:** 2026-06-25. **Status: ✅ critical path audited; every failure point has a mitigation; one gap (no error boundary) found + fixed.**
Scope: one restaurant (Rule 1). Each step of the customer→owner journey is traced through the **real code**, its failure points listed, and how the system handles each.

---

## Critical path
```
QR scan → menu loads → images/video load → order submitted → waiter receives →
owner sees → notifications delivered → reports updated → backups complete
```

| # | Step | Failure point | Mitigation (verified) |
|---|---|---|---|
| 1 | **QR scan** | bad/old QR; wrong table id | `/` + unknown → redirect to `table1`; ids validated `table1…30`; URLs verified ([../phase-07/QR-DEPLOYMENT.md](../phase-07/QR-DEPLOYMENT.md)) |
| 2 | **Menu loads** | slow/no menu; DB down | **cache** (2 ms cached; 304 in 4 ms); `/readyz` gates on DB; gzip; single-flight prevents stampede ([PERFORMANCE-VALIDATION.md](PERFORMANCE-VALIDATION.md)) |
| 3 | **Images/video** | missing media; heavy video | keyword/category **image fallback** (`imageResolver.ts`) so a menu renders without every photo; video is poster-first tap-to-play (not auto-loaded). Bandwidth risk = video from app server ([../phase-05/MEDIA-BANDWIDTH.md](../phase-05/MEDIA-BANDWIDTH.md), CDN deferred) |
| 4 | **Order submitted** | double-tap dup; lost on retry; pool burst | **idempotency** (`clientOrderId` → 1 order; 5/5); **retry/backoff**; **post-save best-effort** (never 500 a saved order); server-authoritative price/validation ([../phase-05a/ORDER-INTEGRITY.md](../phase-05a/ORDER-INTEGRITY.md)) |
| 5 | **Waiter receives** | app offline; missed event | live socket (Bearer) + **polling fallback** + **push**; offline read-cache; auto-reconnect ([RECOVERY-VALIDATION.md](RECOVERY-VALIDATION.md)) |
| 6 | **Owner sees** | dashboard wrong/stale | reads the same `Order`/`Shift` tables (consistent by construction); analytics 200 for owner, 403 for waiter ([SECURITY-VALIDATION.md](SECURITY-VALIDATION.md)) |
| 7 | **Notifications** | dropped push/socket | **the unread list (REST) is the truth**; push/socket are hints; reconcile on reconnect (proven — lost-notif test) |
| 8 | **Reports updated** | totals don't match | analytics aggregate the live `Order` table; VAT/service recomputed server-side; verified in the service scenario (11/11) |
| 9 | **Backups complete** | backup fails silently | `backup-trump.sh` **fails hard** + monitor alerts; off-box copy; **restore-drilled** ([../operations/BACKUP-VERIFICATION.md](../operations/BACKUP-VERIFICATION.md)) |
| ⊕ | **Any render error** | white-screen mid-service | **NEW: error boundaries** (web + Android) → recoverable fallback ([RECOVERY-VALIDATION.md](RECOVERY-VALIDATION.md)) |

## Cross-cutting reliability properties (verified)
- **No committed-data loss** on restart (Postgres durability; 143→143 across a bounce).
- **No duplicate/lost/partial orders** (idempotency + atomic transaction + best-effort side-effects).
- **Graceful DB-error handling** — server survives transient pool errors without crashing.
- **Server is the single source of truth** (Rule 3) — clients never assert stale state; they reconcile via REST.
- **Auth/role separation enforced server-side** (6/6 admin endpoints deny waiter).

## Failure points that remain (documented, not single-restaurant blockers)
| Risk | Severity (1 restaurant) | Status |
|---|---|---|
| Restaurant internet outage → no cloud reach | 🟡 | fallback to paper (Rule 1); plan a backup uplink ([../operations/DISASTER-RECOVERY.md](../operations/DISASTER-RECOVERY.md) DR-7) |
| Media bandwidth (video from app server) | 🟡 | fine at 1-restaurant volume; CDN offload planned |
| Order burst > ~real peak | 🟢 | graceful + retry-safe; far above one restaurant's real rate |
| Single app instance (no clustering) | 🟢 | matches 1-vCPU box; PM2 autorestart |

## Audit verdict
The full customer→owner→backup chain is **resilient**: every step has a verified mitigation, the one gap found (render-crash white-screen) is **fixed**, and no failure point is a single-restaurant blocker. Remaining risks are scale/infra items already documented in [../operations/KNOWN-LIMITATIONS.md](../operations/KNOWN-LIMITATIONS.md).
