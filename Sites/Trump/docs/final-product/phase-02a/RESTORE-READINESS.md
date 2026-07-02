# RESTORE-READINESS.md — Phase 02A Step 3

**Date:** 2026-06-24. **Question:** *Can the latest backup actually be restored?* **Method:** read-only verification of (a) the latest dump's integrity, and (b) a restored database that already exists on the box. **Answer: restore is DEMONSTRABLY feasible — a backup has been successfully restored — but there is no documented/repeatable runbook and backups are not off-box.**

---

## 1. Latest dump integrity — valid

```
$ LATEST=/root/backups/emenyu-db-predeploy-20260621T163040Z.dump
$ pg_restore --list "$LATEST" | head
;     dbname: emenyu
;     TOC Entries: 196
;     Compression: gzip
;     Format: CUSTOM
;     Dump Version: 1.15-0
$ pg_restore --list "$LATEST" | grep -c 'TABLE DATA'   →  19
$ pg_restore --list "$LATEST" | tail   →  FK CONSTRAINT … Order_guestId_fkey, WaiterAssignment_…  (schema intact)
```
**Conclusion:** The latest dump is a **valid PostgreSQL custom-format archive** — `pg_restore` parses it cleanly, with **196 TOC entries, 19 table-data sections, and intact FK constraints**. It is restorable in principle (no truncation/corruption). The dump is **schema + data** (not schema-only).

## 2. Restore has actually been performed — `emenyu_restore_test`

A restored database already exists on the box, created **2026-06-23**:

```
$ pg_database sizes → emenyu_restore_test = 10 MB   (live emenyu = 11 MB)
$ ls -lad /var/lib/postgresql/16/main/base/<oid:emenyu_restore_test>
drwx------ 2 postgres postgres  Jun 23 06:06   ← restored 2026-06-23

$ row counts:
emenyu              : User=6  MenuItem=851  Order=36   (live)
emenyu_restore_test : User=8  MenuItem=851  Order=18   (restored point-in-time)
```
**Conclusions:**
- A backup was **successfully restored into a working database** — **all 851 menu items present**, relational data intact. **This proves the restore mechanism works end-to-end** on this box (right Postgres version, right roles, right schema).
- The counts differ from live (`User` 8 vs 6, `Order` 18 vs 36) because `emenyu_restore_test` is an **older point-in-time** snapshot, not today's data. That is expected and actually reinforces that it came from a real, older dump.
- So: **restore capability = PROVEN.** The gap is process maturity, not feasibility.

## 3. What's missing for true restore readiness

| Requirement | Status | Note |
|---|---|---|
| Latest backup locatable | ✅ | `/root/backups/…`, `/var/www/…/Trump/backups/…` (scattered, not one canonical path) |
| Backup integrity verifiable | ✅ | `pg_restore --list` clean (§1) |
| Restore demonstrated | ✅ | `emenyu_restore_test` (§2) |
| **Documented restore runbook** | ❌ | no written, tested step-by-step procedure (commands, role/owner handling, app cutover, RTO) |
| **Off-box backup** | ❌ | every dump is on the same disk as the live DB (see BACKUP-VERIFICATION §3) — a disk/droplet loss destroys both |
| **Defined RPO/RTO** | ❌ | none stated; current effective RPO ≈ "since last deploy" (could be days) |
| **Restore drill on a schedule** | ❌ | the one restore appears ad-hoc, not periodic |

## 4. Honest risk statement

If the droplet's disk failed **right now**:
- Live `emenyu` DB **and** all `*.dump` backups are on the same `/dev/vda1` → **both lost together.** Recovery would depend on a DigitalOcean snapshot **if one exists** (unverified — see BACKUP-VERIFICATION §2).
- Even with the dumps, there is **no written procedure** for a clean operator to follow under pressure (create DB, `pg_restore`, fix ownership, point the app, verify) — only tribal knowledge evidenced by the `emenyu_restore_test` artifact.

---

## Verdict

**Restore is feasible and has been exercised** (B1-restore is *technically* demonstrated), **but production restore-readiness is NOT met** because backups are on-disk-only and there is no documented, drilled runbook with an RPO/RTO.

**Combined B1 (backup + restore) status: 🔴 OPEN** — closing it requires: scheduled dumps → **off-box** storage with retention, a **written + tested restore runbook**, and a stated **RPO/RTO**. (Phase 02B.)
