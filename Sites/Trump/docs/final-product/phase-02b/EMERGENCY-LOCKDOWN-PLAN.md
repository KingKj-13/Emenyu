# EMERGENCY-LOCKDOWN-PLAN.md — Phase 02B.1

**Date:** 2026-06-24. **Scope:** eliminate the three **active** production compromise paths identified in Phase 02A — nothing else. **Executed live** against the production droplet (`134.122.99.78`) over root SSH. Every change was snapshotted first and verified after.

> **Principle for this phase:** speed over elegance; no infrastructure redesign, no features, no unrelated cleanup. Each change is **reversible** from the snapshot in §2.

---

## 1. Findings remediated

| ID | Finding (from Phase 02A) | Active risk |
|---|---|---|
| **B3** | 5 of 6 accounts use `123456789`; `admin` owner backdoor; console internet-reachable | Trivial full takeover of `https://emenyu.com/Trump/Admin` |
| **N1** | PostgreSQL bound to `0.0.0.0:5432`, `pg_hba 0.0.0.0/0` | DB reachable from the entire internet |
| **N2** | App bound to `0.0.0.0:3012` (plaintext) | Direct app access bypassing nginx TLS/HSTS/rate-limit |

## 2. Snapshot (Step 1) — taken BEFORE any change

Directory: **`/root/phase-02b1-snapshot-20260624T144208Z/`**

| Artifact | File | Note |
|---|---|---|
| DB dump (custom fmt) | `emenyu-20260624T144208Z.dump` | 279 KB, integrity verified (`pg_restore --list` → 23 TABLE DATA) |
| Postgres conf | `postgresql.conf.bak` | for `listen_addresses` revert |
| Postgres HBA | `pg_hba.conf.bak` | for the `0.0.0.0/0` revert |
| nginx (effective) | `nginx-T-full.conf` (669 lines) + `nginx-sites-available/` | reference |
| App env | `trump.env.bak` (0600) | DATABASE_URL + TRUMP_HOST revert |
| PM2 ecosystem | `ecosystem.config.js.bak` | bind revert |
| Pre-change state | `pm2-jlist-pre.json`, `listeners-pre.txt` | proves `0.0.0.0:3012` + `0.0.0.0:5432` before |

## 3. Execution order (chosen for zero data-loss risk)

The ordering matters: the app connected to Postgres via the **public IP**, so the DB endpoint had to move to localhost **before** Postgres was restricted, or the app would lose its database.

1. **Snapshot** (everything above).
2. **Rotate** the 5 weak accounts → `weakOrInsecure=0` (ACCOUNT-ROTATION-REPORT).
3. **Disable** the `admin` backdoor (suspend, lockstep) → login 403 (ACCOUNT-ROTATION-REPORT §3).
4. **Repoint app → `127.0.0.1`** for both DB (`DATABASE_URL`) and bind (`TRUMP_HOST`), reload, verify app+domain healthy and `:3012` externally refused (NETWORK-HARDENING-REPORT).
5. **Lock Postgres** to `localhost` + comment `0.0.0.0/0`, restart, verify app healthy and `:5432` externally refused (POSTGRES-HARDENING-REPORT).
6. **Validate** no regression (audit=0, health/ready/menu 200, all staff logins 200) (PHASE-02B1-COMPLETION-REPORT §3).

## 4. Rollback (if needed)

- **Creds:** new secrets are in `…/Trump/backups/phase1.1-rotated-credentials-*.txt` (0600). Re-suspend/activate via the owner console; old weak passwords are intentionally unrecoverable.
- **App endpoint/bind:** restore `trump.env.bak` + `ecosystem.config.js.bak`, `pm2 reload … --update-env`.
- **Postgres:** restore `postgresql.conf.bak` + `pg_hba.conf.bak`, `systemctl restart postgresql@16-main`.
- **Data:** `pg_restore` the snapshot dump into `emenyu` (last resort).

## 5. Durability note

The box is **rsync-deployed (no git)**, and `ecosystem.config.js` is part of the repo tree — so the repo default was also changed (`TRUMP_HOST` default `0.0.0.0` → `127.0.0.1`) to prevent a future deploy from silently re-exposing `:3012`. The box `.env` (`DATABASE_URL`→`127.0.0.1`, `TRUMP_HOST`→`127.0.0.1`) is persistent and not part of the repo; see PHASE-02B1-COMPLETION-REPORT §5 for redeploy guidance.
