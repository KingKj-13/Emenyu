# PHASE-02A-COMPLETION-REPORT.md

**Phase:** 02A — Infrastructure Validation. **Date:** 2026-06-24. **Status: ✅ COMPLETE (audit/validation only — nothing on production was changed).**

Phase 02A verified the **real** Trump production environment with live, read-only evidence (root SSH + external probes) and accurately classified every blocker. No "looks correct" conclusions — each one has a command, output, and verdict in its step doc.

> **Access reality:** the prior "no SSH to the box" assumption was **wrong** — `root@134.122.99.78` is reachable by key-based SSH, which is how the real environment was validated. All commands were **read-only**; production state was not modified, and the `emenyu_restore_test` DB found on the box predates this audit.

---

## 1. Biggest surprise: prod is a shared, drifted, partly-exposed box

The repo implies a clean single-app deployment. Reality (PRODUCTION-STATE.md):
- **One 1 GB DigitalOcean droplet** hosts **all four restaurants + `Josh-Greek` + a Python `Recommend-Trump` + `trump-staging`** — 7 PM2 apps + Postgres + nginx, **87% disk, swap in use**, high restart counts.
- Trump runs at **`/var/www/mysite/Emenyu/Trump`** (not the documented path), deployed by **rsync (no git)**, and the **live code predates Phase 01** (vanilla `frontend/` + `recommend.py` still running).
- **Two internet exposures the original audit missed:** PostgreSQL on `0.0.0.0:5432` (`pg_hba 0.0.0.0/0`) and the Trump app on `0.0.0.0:3012` (plaintext).

---

## 2. Blocker status (Step 8) — evidence-backed

| Blocker | Status | Evidence |
|---|---|---|
| **Backup** | 🔴 **OPEN** | No cron/timer; only manual pre-deploy dumps, **on the same disk, no off-box copy**, latest 2026-06-22. → [BACKUP-VERIFICATION.md](BACKUP-VERIFICATION.md) |
| **Restore** | 🟠 **PARTIAL** | Restore **proven** (`emenyu_restore_test`, 851 items; dump valid via `pg_restore --list`) but **no documented runbook, no RPO/RTO, backups not off-box**. → [RESTORE-READINESS.md](RESTORE-READINESS.md) |
| **TLS** | 🟢 **CLOSED** | Real Let's Encrypt cert for `emenyu.com` (exp 2026-09-09), `certbot.timer` auto-renew, HSTS, `/Trump/*` over HTTP/2. Caveats: repo↔prod config drift, duplicate server blocks, :3012 plaintext bypass. → [TLS-VERIFICATION.md](TLS-VERIFICATION.md) |
| **Credentials** | 🔴 **OPEN — CRITICAL** | Live audit: **5 of 6 accounts (`admin`,`owner`,`manager`,`waiter`,`kitchen`) use `123456789`**; `admin` owner backdoor active; console internet-reachable. → [CREDENTIAL-AUDIT.md](CREDENTIAL-AUDIT.md) |
| **Monitoring** | 🔴 **OPEN** | Only DO host agent; **no uptime/health polling, no alerting, no log rotation** (472 MB PM2 logs on an 87%-full disk). → [MONITORING-AUDIT.md](MONITORING-AUDIT.md) |
| **Deployment** | 🔴 **OPEN** | Manual rsync, **no SHA provenance, no script, no automated rollback**; prod is pre-Phase-01. → [DEPLOYMENT-AUDIT.md](DEPLOYMENT-AUDIT.md) |

### Newly discovered (not in the Phase 00 blocker list — must be tracked)

| # | Finding | Severity | Source |
|---|---|---|---|
| **N1** | **PostgreSQL internet-exposed** (`listen_addresses=*`, `pg_hba host all all 0.0.0.0/0`, :5432 reachable remotely) | 🔴 CRITICAL | CREDENTIAL-AUDIT §4 / PRODUCTION-STATE §10 |
| **N2** | **Trump app port 3012 internet-exposed in plaintext** (bypasses nginx TLS/HSTS/rate-limit) | 🟠 HIGH | PRODUCTION-STATE §9–10 / TLS §7 |
| **N3** | **Disk 87% full + no log rotation** (`imli-out.log` 348 MB) → disk-full outage trajectory | 🟠 HIGH | PRODUCTION-STATE §5 / MONITORING §4 |
| **N4** | **1 GB box oversubscribed** (7 apps + PG, swap active, OOM-driven restarts) | 🟡 MEDIUM | PRODUCTION-STATE §4,§6 |
| **N5** | **nginx duplicate `emenyu.com` server blocks** (conflicting-server-name warnings) | 🟡 MEDIUM | TLS §6 |
| **N6** | **Repo `emenuy-trump.conf` ≠ deployed nginx** (template vs live multi-app router) | 🔵 LOW/INFO | TLS §5 |

---

## 3. Completion criteria (per the Phase 02A brief)

| Criterion | Met? |
|---|---|
| Real infrastructure audited (not the repo) | ✅ live SSH + probes |
| Evidence collected (cmd → output → conclusion) | ✅ every step doc |
| Blockers accurately classified | ✅ table above |
| Open blockers documented | ✅ 4 OPEN (1 critical), 1 PARTIAL, 1 CLOSED + 6 new findings |
| No assumptions remain | ✅ each verdict is evidence-backed; the few un-collectable items (DO backup service, DO alert policies) are explicitly flagged "verify in DO console" |

**Items that genuinely cannot be verified from the box** (and are marked as such, not assumed): DigitalOcean managed **Droplet Backups/snapshots** and DigitalOcean **Monitoring alert policies** — both are control-panel/API settings. *Action: confirm in the DO console.*

---

## 4. Recommended Phase 02B order of work (implement fixes)

Ranked by risk. **The first item is incident-class and should not wait for the rest of the phase:**

1. **🔴 NOW — Credentials & DB exposure (B3 + N1):** rotate all 6 accounts to strong unique secrets (`auth:rotate` + strong env, restart), **remove/rename the `admin` backdoor**, and **firewall PostgreSQL to localhost** (or DO cloud firewall + `pg_hba` to the app host). Re-run `audit-accounts.js` until `weakOrInsecure: 0`. Also firewall app **:3012** (N2).
2. **🔴 Backups (B1):** scheduled `pg_dump` (e.g. hourly/daily) → **off-box** (DO Spaces/S3) with retention; capture `data/`,`uploads/`; add a **success/failure alert**.
3. **🟠 Restore runbook (B1):** write + **drill** a documented restore (create DB → `pg_restore` → fix ownership → app cutover → verify); state **RPO/RTO**.
4. **🟠 Disk + logs (N3):** install **`pm2-logrotate`** (cheap immediate win), prune `/root` backups (move off-box), set a DO **disk>85% alert**.
5. **🟠 Monitoring (H2):** external uptime + **`/readyz`** monitor with alerting; verify/enable DO alert policies.
6. **🟠 Deployment (H5):** single idempotent deploy script (build-fail-hard + `/readyz` smoke gate + pre-deploy snapshot + rollback); then **deploy the Phase 01 branch** so prod matches the repo.
7. **🟡 nginx hygiene (N5/N6/B2-caveats):** consolidate the duplicate `emenyu.com` blocks, drop the moot `/frontend/` route post-deploy, reconcile the repo template with the live config.
8. **🟡 Capacity (N4):** right-size the droplet or split tenants before onboarding a second venue (ties into the Phase 00 multi-tenant/scale future-gaps F1–F2).

---

## 5. Verdict

Phase 02A is complete: **TLS is genuinely production-grade; restore is proven feasible; but backups, monitoring, and deployment remain open, and credential + database internet-exposure are CRITICAL and live right now.** Trump should **not** be considered launch-hardened until at least items 1–3 above are done. Proceed to **Phase 02B — Infrastructure Hardening**, starting with the credential/DB-exposure remediation.
