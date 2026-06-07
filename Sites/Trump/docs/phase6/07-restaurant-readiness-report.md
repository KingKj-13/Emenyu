# Step 7 — First Restaurant Readiness Report

Readiness for **one paying restaurant** (Trump). Multi-tenant and enterprise scale are explicitly out of
scope. Date: 2026-06-07. Synthesises Steps 0–6.

## Scorecard

| Dimension | Rating | Basis |
|---|:--:|---|
| Reliability | 🟢 **Ready** (single-venue) | Graceful fallbacks everywhere (DB down → JSON/algorithmic, **no crashes**); PM2 auto-restart + zero-downtime reload; stateless sessions; hybrid Postgres+JSON persistence; logic offline-validated (41/17/17). |
| Security | 🟡 **Conditional** | App layer strong (Step 6). **Blocker:** rotate the weak prod DB password + firewall the DB (S1); run prod `auth:rotate`. |
| Operations | 🟡 **Conditional** | PM2 scripts, health checks (`healthcheck`, `reco:health`), `smoke-test`, analytics dashboard, deployment runbook. **Gap:** the live deployment rehearsal + `reco:verify:live` are **not yet executed** (no staging DB). |
| Supportability | 🟢 **Ready** | Extensive docs (phase3–6, ARCHITECTURE/DATABASE/DEPLOYMENT/SECURITY); owner self-service admin (menu/chef-recs/bundles/analytics/accounts); deterministic, reproducible logic; diagnostic scripts. |
| Backup strategy | 🟡 **Conditional** | `BACKUP_AND_DR.md` exists; additive migrations + pre-migrate snapshot = restore point. **Gap:** automated prod backups must be **confirmed configured + tested** before launch. |
| Recovery strategy | 🟢 **Ready (by design)** | Rollback validated (Step 5): app rollback needs no schema change; app boots without the new tables; DB rollback = drop additive tables; backup restore last resort. **Drill** pending on staging. |
| **Overall** | 🟡 **Conditionally ready** | Code-complete, offline-validated, strong security, safe rollback — gated on a staging rehearsal, the DB hardening, and the deploy itself. |

## Strengths for a single restaurant

- **Fails soft, not hard.** Every recommendation/analytics/bundle path degrades to a fallback if Postgres is
  unavailable; the menu, ordering and core flows keep working. A single-DB outage does not take the venue down.
- **No external dependencies.** Fully local + deterministic — no paid AI/LLM, no third-party runtime calls →
  no external outage or cost surprise, and reproducible behaviour for support.
- **Owner self-service.** The admin console lets the restaurant manage menu, chef recommendations, bundles,
  and view analytics without engineering involvement.
- **Operational tooling.** Pre-deploy validation (41/17/17), `reco:health`, `reco:verify:live`, `smoke-test`,
  `reco:bench`, and a documented deployment + rollback runbook.

## Gaps / required before serving guests

1. **Provision a staging Postgres and run the deferred DB rehearsal** (Step 3 §B) — incl. `migrate deploy`,
   seeds, `reco:health`, and `reco:verify:live`. This is the single biggest unproven path.
2. **Harden the production database** — rotate the weak password (S1), restrict network access to the app
   server, and **confirm automated backups run and restore cleanly**.
3. **Run prod `auth:rotate`** (carried from Phase 1) and confirm `TRUMP_FORCE_HTTPS`/HSTS are on in prod.
4. **Deploy:** merge (fast-forward) → build client on the server → `migrate deploy` + `generate` → seed →
   `reco:health` → `smoke-test` against the live URL.
5. **Light operational guardrails (recommended, not blocking):** centralised log retention/alerting beyond
   PM2 logs; a one-page incident runbook (most common: "recommendations not showing" → `reco:health` +
   reseed; "DB down" → fallbacks active, restore DB).

## Not required for this launch (explicitly deferred)

- Multi-restaurant / multi-tenant isolation, horizontal scaling, HA replicas, CI/CD automation, mobile apps,
  and Kitchen-screen polish (Kitchen is deprioritised — verify it merely loads).

## Bottom line

Trump is **functionally and architecturally ready for one paying restaurant** and fails safely under DB
loss. It is **not yet launch-complete**: the deployment has not been rehearsed on a real database, the
production DB needs credential/network hardening, and backups need confirmation. With those closed, this is
a low-risk single-venue go-live. See the GO/NO-GO report for the decision.
