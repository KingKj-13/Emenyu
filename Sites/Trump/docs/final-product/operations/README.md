# Trump v1.0 — Operations Package (OR1)

**Start here.** This folder is the **single canonical operational reference** for running Trump in production. It's written so someone who has never seen the project can deploy, operate, recover, and train staff. Detailed engineering history lives in the per-phase folders (`../phase-*/`); this folder is what you use day-to-day.

---

## Index (20 documents)

### Deploy & operate
| Doc | Use it to… |
|---|---|
| [INSTALLATION-GUIDE.md](INSTALLATION-GUIDE.md) | stand up Trump on a fresh server |
| [DEPLOYMENT-RUNBOOK.md](DEPLOYMENT-RUNBOOK.md) | deploy/update (line-by-line; R1-safe) |
| [OPERATOR-RUNBOOK.md](OPERATOR-RUNBOOK.md) | run it day-to-day (start/stop/logs/health/backup) |
| [GO-LIVE-CHECKLIST.md](GO-LIVE-CHECKLIST.md) | launch-day cutover |
| [LAUNCH-CHECKLIST.md](LAUNCH-CHECKLIST.md) | everything required before the first restaurant |

### Recovery & incidents
| Doc | Use it to… |
|---|---|
| [SERVER-RECOVERY.md](SERVER-RECOVERY.md) | bring a down/misbehaving server back |
| [DISASTER-RECOVERY.md](DISASTER-RECOVERY.md) | recover from data loss / lost box / lost device |
| [INCIDENT-RESPONSE.md](INCIDENT-RESPONSE.md) | work a P0–P3 incident |
| [BACKUP-VERIFICATION.md](BACKUP-VERIFICATION.md) | prove backups are restorable |

### Hygiene
| Doc | Use it to… |
|---|---|
| [MONITORING-RUNBOOK.md](MONITORING-RUNBOOK.md) | watch health + alerts |
| [LOGGING-RUNBOOK.md](LOGGING-RUNBOOK.md) | read the logs |
| [PASSWORD-ROTATION.md](PASSWORD-ROTATION.md) | manage credentials & secrets |
| [MAINTENANCE.md](MAINTENANCE.md) | daily/weekly/monthly/quarterly upkeep |

### Training (non-technical)
| Doc | For… |
|---|---|
| [OWNER-TRAINING.md](OWNER-TRAINING.md) | the owner |
| [MANAGER-TRAINING.md](MANAGER-TRAINING.md) | managers |
| [WAITER-TRAINING.md](WAITER-TRAINING.md) | waiters |
| [PILOT-CHECKLIST.md](PILOT-CHECKLIST.md) | the operator running the pilot |

### Reference
| Doc | What |
|---|---|
| [CHANGELOG-RC1.md](CHANGELOG-RC1.md) | what's in RC1 (Phases 00–06 + OR1) |
| [KNOWN-LIMITATIONS.md](KNOWN-LIMITATIONS.md) | accepted gaps + paths |
| [OPERATIONS-COMPLETION-REPORT.md](OPERATIONS-COMPLETION-REPORT.md) | OR1 final audit |

---

## Step 1 — Documentation audit (Phases 00–06)
**Scope:** ~106 markdown docs across `audit/` + `phase-01 … phase-06`. They are **historical engineering records** and are **kept as-is** (not deleted) — but they are not the operational reference. This `operations/` folder supersedes them for day-to-day use.

**Findings & resolution:**
| Finding | Resolution |
|---|---|
| Many per-phase **COMPLETION-REPORT** files (one per phase) — overlapping summaries | Canonical "what's live" = [CHANGELOG-RC1.md](CHANGELOG-RC1.md). Phase reports remain as history. |
| **Deploy steps** were spread across phase-03c, phase-05a (DEPLOYMENT-CHECKLIST), and the deploy script | Canonical deploy = [DEPLOYMENT-RUNBOOK.md](DEPLOYMENT-RUNBOOK.md) (consolidates them; line-by-line). |
| **R1 prisma gotcha** documented in prose in 03C/05A but **not enforced in the deploy script** (a real defect) | **Fixed in `scripts/deploy-trump.sh`** (R1-safe generate + verify); documented here. |
| **Backup/monitoring** described in phase-02b/02b2 | Canonical = [BACKUP-VERIFICATION.md](BACKUP-VERIFICATION.md) + [MONITORING-RUNBOOK.md](MONITORING-RUNBOOK.md). |
| **Rate limits / known issues** evolved (Phase 05 → 05A raised them) | Current values + gaps consolidated in [CHANGELOG-RC1.md](CHANGELOG-RC1.md) + [KNOWN-LIMITATIONS.md](KNOWN-LIMITATIONS.md). Earlier numbers are superseded. |
| **Pilot procedure** lived in phase-06 (kit) | Operator wrapper = [PILOT-CHECKLIST.md](PILOT-CHECKLIST.md); detailed forms stay in `../phase-06/`. |

**Outdated info corrected here:** rate-limit values (now 3000/300), the deploy prisma step (now R1-safe), and the consolidation of scattered deploy/backup/monitoring notes into single canonical runbooks. Cross-references throughout point to the phase docs for deep detail.

## Conventions
- Host: `134.122.99.78` · app `/var/www/mysite/Emenyu/Trump` · PM2 `emenuy-trump-api` · port `127.0.0.1:3012` · DB `emenyu` · public `https://emenyu.com/Trump`.
- **Rule 1 everywhere:** the restaurant comes first — if Trump interferes with service, fall back, then fix.
