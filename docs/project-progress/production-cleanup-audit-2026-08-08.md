# Production cleanup audit — 2026-08-08

**Nothing has been deleted.** This is a read-only audit. Every candidate below
is awaiting explicit confirmation.

Host `134.122.99.78`, disk `/dev/vda1` — **24 GB total, 18 GB used, 5.2 GB free (78%)**.

---

## 0. Backup status (prerequisite — VERIFIED)

| Item | Status |
|---|---|
| Production DB dump | `backups/production/database/20260808T085154Z/` — 3.78 MB `pg_dump -Fc`, 379 TOC entries |
| Restore tested | Restored into local `emenyu_restore_verify` (PostgreSQL 18.4) — **exit 0, no errors** |
| Row-count parity | **37/37 tables, every count identical to production** (diffed programmatically) |
| Integrity | 11 FKs, 99 PKs, 51 uniques, 132 indexes; **0 orphaned rows** |
| Admin data | 17 users preserved — 6 owner, 3 manager, 5 waiter, 3 kitchen |
| Menu data | trump 439 items / 175 categories; real app query returns 439 — matches live API exactly |
| Media archive | `backups/production/media/trump-media-…tar.gz` — 96 MB, 1779 entries, listed cleanly |
| Working copy | `emenyu_dev` local database restored from the same dump |
| Feature archive | `backups/removed-features/…/waiter-kitchen-code-…tar.gz` — 42 files, 85 KB |

Secrets were **not** downloaded: production `.env` files were never copied, and
`data/accounts.json` (PBKDF2 hashes) was explicitly excluded from the media
archive. Account data lives in the DB dump, which is the authoritative store.

---

## 1. What is actually live (do not touch)

| Port | Process | Public URL | Notes |
|---|---|---|---|
| 3012 | `emenuy-trump-api` | `emenyu.com/Trump/` | **Production Trump** |
| 3013 | `trump-staging` | *(not exposed via nginx)* | Staging — deploy target |
| 3014 | `emenuy-demo-api` | `emenyu.com/demo/` | Public sales demo |
| 3016 | `carmella-production-api` | `emenyu.com/Carmella/` | Second tenant |
| 8010 | `emenyu-luxury-api` (uvicorn) | `emenyu.com/Trump_Lux/` | Luxury edition |
| — | nginx static | `emenyu.com/` | company-website |
| 5432 | PostgreSQL 16.14 | — | `emenyu` (85 MB) + demo/carmella DBs |
| 6379 | redis-server | — | in use |

Cron: `trump-backup.sh` daily 03:10 (14-day retention), `trump-monitor.sh` every 5 min.
No Docker installed. No unexpected systemd services.

---

## 2. SERVER cleanup candidates

| # | Path / item | Size | Purpose | Used? | Dependencies | Backed up? | Action | Risk |
|---|---|---|---|---|---|---|---|---|
| S1 | `/root/trump-deploy-snapshots/` — 6 oldest of 7 | **2.4 GB** | Pre-deploy app tarballs, 2026-07-10 → 08-03 | No | None | Superseded by daily auto-backups + new local backup | **DELETE, keep newest** | Low |
| S2 | `/var/log/journal` | **975 MB** | systemd journal | Yes (active) | journald | n/a | `journalctl --vacuum-size=200M` → frees ~775 MB | Low |
| S3 | `/var/log/btmp`, `btmp.1` | **164 MB** | Failed-login records (brute-force noise) | No | n/a | n/a | Truncate | Low |
| S4 | `/var/log/auth.log{,.1,.*.gz}` | **~67 MB** | Rotated auth logs | No | logrotate | n/a | Delete rotations > 7 days | Low |
| S5 | `/root/backups/auto/` retention 14d → 7d | **5.3 GB → ~2.5 GB** | Daily DB + data backups (15 sets × 364 MB) | **Yes — this IS the backup** | `trump-backup.sh` | self | Set `TRUMP_BACKUP_RETAIN_DAYS=7` | Low-Med |
| S6 | `/var/www/mysite/Emenyu/deploy-backups/` | **15 MB** | Old deploy backups | No | None | Yes | DELETE | Low |
| S7 | `/root/trump-deploy.tar.gz`, `pre-parity-snapshot-*`, `phase-02b1-snapshot-*`, `carmella-production-pre-p8-backup.tar.gz`, `AlPescatore_backup_*.tar.gz` | **~12 MB** | One-off historical snapshots | No | None | Partly | DELETE (AlPescatore already archived in git history) | Low |
| S8 | `/root/venv` + `/root/nltk_data` | **464 MB** | Python venv + NLTK corpora | **UNKNOWN** | May belong to `luxury-backend` (uvicorn, LIVE) | No | **INVESTIGATE — do not delete yet** | Med |
| S9 | `Trump/uploads/Demo/` | **346 MB** | Demo-tenant media stored inside Trump's directory | **Yes — served to `/demo/`** | `emenuy-demo-api` | Yes | **MOVE to `Emenyu/Demo/`, do not delete.** Also shrinks every future daily backup by ~346 MB | Med |

**Recoverable now (low risk, S1–S4, S6, S7): ≈ 3.4 GB**
**Plus retention change (S5): ≈ 2.8 GB more**
**Total realistic recovery: ≈ 6.2 GB** — taking the disk from 78% to roughly 52%.

S8 and S9 need investigation/relocation rather than deletion.

---

## 3. DATABASE cleanup candidates

The whole `emenyu` database is only **85 MB**. There is very little to gain here
and correspondingly little reason to take risk. Classification:

| # | Table / data | Rows | Purpose | Used after redesign? | Historical value | Backed up? | Action | Risk |
|---|---|---|---|---|---|---|---|---|
| D1 | `MenuItem`/`MenuCategory` for `greek`, `imli`, `al_pescatore` | 412 items | Tenants retired 2026-07-05 | No | Low | Yes | **ARCHIVE → safe to delete on approval** | Low |
| D2 | `ActiveCartState` | 8 | Live cart snapshots | No (cart removed) | None — transient | Yes | **SAFE TO DELETE** after cart removal ships | Low |
| D3 | `RecommendationEvent` | 71,392 (18 MB) | Chatbot/recommendation analytics | No (chatbot removed) | Medium | Yes | **ARCHIVE — keep for now** | Low |
| D4 | `Order`, `OrderItem`, `OrderStatusHistory`, `OrderRating` | 15.5k / 125.6k / 46.5k / 5.4k | Historical orders | No new writes | **High** | Yes | **KEEP** | — |
| D5 | `WaiterAssignment`, `WaiterTask`, `Shift` | 15,645 / 13 / 2,236 | Waiter operations | No | Medium | Yes | **KEEP (disable only)** | — |
| D6 | `Guest`, `Device`, `UpsellEvent`, `AiEvent`, `Notification` | 952 / 21 / 14 / 2 / 15 | Guest CRM + ops | No | Medium | Yes | **KEEP** | — |
| D7 | `alembic_version`, `BrainOutput`, `LuxuryItemContent`, `DiningSession`, `ContentVersion`, `AppRelease`, `PushSubscription`, `RewardCode`, `DayPart`, `MenuItemVariant` | 0–1 | Empty/legacy | No | None | Yes | **SAFE TO DELETE** — but recovers ~0 bytes; recommend leaving | Low |
| D8 | `_prisma_migrations` | 23 | Prisma migration ledger | **Yes — required** | Critical | Yes | **KEEP — never touch** | — |
| D9 | `User` (all 17) | 17 | Admin + staff accounts | **Yes** | Critical | Yes | **KEEP — never touch** | — |

**Database recovery if D1+D2+D3 are all approved: ≈ 19 MB.**

My recommendation: approve **D1 and D2 only**, keep everything else. The
database is not where the space problem is, and orders/waiter history are
genuinely useful for the analytics the new admin panel will show.

---

## 4. Explicitly NOT proposed for deletion

- Any admin account or `User` row
- Any menu, category, media or media metadata
- Production `.env` or any configuration
- `Order*` history, `Guest`, `Shift`, `WaiterAssignment` data
- `luxury`, `luxury-backend`, `carmella-production`, `Demo` applications — all live
- Any production database (no `DROP DATABASE`, no `TRUNCATE` anywhere)
- `node_modules` of any running application

---

## 5. Awaiting confirmation

Reply with which items to proceed on, e.g. *"do S1–S7 and D1, D2"*.
Nothing will be removed before that.
