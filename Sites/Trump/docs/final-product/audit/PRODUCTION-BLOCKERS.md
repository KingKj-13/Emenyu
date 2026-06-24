# PRODUCTION-BLOCKERS.md — Phase 00 Final Report

**Scope:** `Sites/Trump`. **Date:** 2026-06-24. **Phase 00 = audit only; nothing fixed or deleted.**

Trump may move to **Phase 01 only after every BLOCKER below has been reviewed.**

---

## Overall assessment

Trump is a **well-architected, security-conscious single-venue system** that is close to production-ready for **one restaurant**. The code core (React SPA + modular Node server + Postgres) is sound; the deterministic AI removes a whole class of LLM risk; auth and security are above average. The blockers are **operational** (backups, real TLS config) and the highest-value cleanup is **retiring the live legacy admin panel**. The brief's stated *future* goals — multiple owners, multi-restaurant, Android/desktop staff apps — require **schema and architecture changes** (multi-tenant `User.restaurantId`, shared socket state) that are **not yet in place** and should be scoped as their own phases.

---

## 🔴 BLOCKER (must be reviewed before Phase 01)

| # | Blocker | Source audit | Why it blocks production |
|---|---|---|---|
| B1 | **No automated database backup or tested restore.** No `pg_dump` cron, no off-box copy, no restore runbook. Persistent JSON dirs also unbacked. | DEPLOYMENT §7 | A droplet/DB failure = unrecoverable data loss for a live restaurant. Single instance makes this worse. |
| B2 | **Production nginx config is a template** (`server_name your-domain.example`, placeholder certs). | DEPLOYMENT §3, SECURITY §9 | If the deployed edge isn't verified to have the real domain + valid auto-renewing Let's Encrypt certs, TLS/HSTS guarantees don't hold. **Verify the live config** — may already be correct on the box; the repo copy is not. |
| B3 | **Prod credential rotation still pending** (project memory: prod host needs `npm run auth:rotate`; old weak hashes historically on server). Default `admin`/role accounts seeded from env. | AUTH §5, SECURITY | Weak/known staff passwords on a public URL is a direct compromise path. Confirm `auth:audit` = 0 weak on prod before go-live. |

---

## 🟠 HIGH (fix before or immediately after launch)

| # | Item | Source |
|---|---|---|
| H1 | **Live legacy `admin.html` vanilla panel** duplicates React `/Admin` — divergent validation + larger XSS surface. Retire after parity. | REPOSITORY §3, FRONTEND §5, DELETE A1 |
| H2 | **No monitoring/alerting** on a single-instance SPOF; `/readyz` exists but nothing polls it. | DEPLOYMENT §9 |
| H3 | **Weak password policy** (6-char min) + modest PBKDF2 (120k iterations). | AUTH §4, SECURITY |
| H4 | **AI dietary/allergen output is keyword-heuristic over an often-empty `allergens` field** — must carry an unconditional "confirm with staff" disclaimer; do not market as allergen-safe. | AI §4 |
| H5 | **Manual SSH deploy with a build-on-box step**; `client/dist/` gitignored → easy to ship a broken UI. | DEPLOYMENT §5, FRONTEND §6 |

---

## 🟡 MEDIUM (hardening / debt)

| # | Item | Source |
|---|---|---|
| M1 | **HTTP Basic auth accepted on every route** as a cookie alternative — decide/disable for browser routes. | AUTH §7, SECURITY §8 |
| M2 | **Uploads validated by MIME/extension, not content bytes** — add magic-byte sniffing. | SECURITY §6 |
| M3 | **No CSRF token** (mitigated by SameSite=Lax) — consider SameSite=Strict or token if admin actions grow. | SECURITY §5 |
| M4 | **Dual Postgres + JSON persistence** — duplicate logic, divergence risk; decide the authoritative store. | BACKEND §6, DATABASE §7 |
| M5 | **Oversized god modules:** `aiService.js` (65 KB), `helpers.js` (22 KB, mixes config+auth+utils), `AdminPage.tsx` (109 KB). | BACKEND §5, FRONTEND §4 |
| M6 | **No PM2 log rotation** — disk fill risk over time. | DEPLOYMENT §8 |
| M7 | **Public reservation/rating/`reco/events` writes** unauthenticated (by design) — add abuse monitoring; consider signing analytics. | API §3, SECURITY §9 |
| M8 | **Analytics aggregation in-memory** — fine now, won't scale with event volume. | PERFORMANCE §4 |

---

## 🟢 LOW (cleanup / nice-to-have)

| # | Item | Source |
|---|---|---|
| L1 | Remove dead code: `trump frontend/`, orphaned Python (`*.py`, `josh_enterprise/`, `venv/`, `data/*.pkl|*.db|*.mp3`), root HTML stubs, `validation-*.png`. | REPOSITORY §4, DELETE B–E |
| L2 | Reconcile PM2 memory-restart `768M` vs `512M`. | DEPLOYMENT §2 |
| L3 | Remove unused `createAdminAuth`. | BACKEND §8, AUTH §7 |
| L4 | Consolidate loose root `*.md` into `docs/`. | REPOSITORY §4f |
| L5 | CSP `style-src 'unsafe-inline'`; no client error monitoring. | SECURITY §9, FRONTEND §6 |
| L6 | Migration rollback runbook for destructive migrations. | DEPLOYMENT §6 |

---

## 🔵 FUTURE-GOAL GAPS (not launch blockers, but block the brief's roadmap)

These block the *stated future scope* (multiple owners, multi-restaurant, staff apps), not the single-venue launch:

| # | Gap | Source |
|---|---|---|
| F1 | **No multi-tenant model.** `User` has no `restaurantId`; `username` globally unique; no `Restaurant` entity. Required before a second venue or per-restaurant owners. | DATABASE §5–6, AUTH §7 |
| F2 | **No horizontal-scale path.** In-process Socket.IO rooms, rate-limit store, and reco cache prevent running >1 instance. Need Redis adapter + shared stores before clustering/HA. | PERFORMANCE §1, §7–8 |
| F3 | **Role is free-text, no DB enum/`Role` table; `assignedTables` is JSON-only** (not in Prisma `User`). | DATABASE §5 |
| F4 | **Android waiter / desktop staff apps** will need a stable, documented, ideally token-based API (the current cookie+Basic scheme works but isn't app-oriented). | AUTH §2–3, API |

---

## Recommended Phase 01 entry criteria

1. **B1–B3 resolved or formally accepted** (backups live, TLS verified, prod creds rotated & audited clean).
2. H1 scheduled (admin retirement plan) and H4 shipped (allergen disclaimer).
3. H2/H5 at least minimally addressed (an uptime monitor + a single deploy script).
4. Multi-tenant (F1) and scale (F2) scoped as **dedicated future phases** before any second restaurant or staff-app work.

---

## Audit index

`AUDIT-REPOSITORY.md` · `AUDIT-FRONTEND.md` · `AUDIT-BACKEND.md` · `AUDIT-DATABASE.md` · `AUDIT-API.md` · `AUDIT-AUTH.md` · `AUDIT-SECURITY.md` · `AUDIT-PERFORMANCE.md` · `AUDIT-AI.md` · `AUDIT-DEPLOYMENT.md` · `DELETE-CANDIDATES.md` · `PRODUCTION-BLOCKERS.md`
