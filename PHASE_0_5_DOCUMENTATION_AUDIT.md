# Phase 0.5 — Documentation & Repository Hygiene Audit

**Date:** 2026-06-01 · **Audit only — no markdown file was created\*, deleted, moved, or modified.**
(\* this report file is the only addition.) **Production recommendations are scoped to the Trump project.**

**Total markdown files (excluding `node_modules`): 67.**
- 41 at repo root, 23 under `Sites/Trump/`, 1 under `Sites/Trump/client/...`, 2 JOSH READMEs (`Sites/Trump`, `Sites/Greek`).
- Dating: 4 current (2026-06-01, this session's audits); ~3 mid-cycle (2026-05-28→31); **~60 are point-in-time snapshots from 2026-05-19→22** (deployment/migration sprint).

### ⚠️ Files containing INCORRECT statements (flagged)
| File | Incorrect claim | Reality |
|---|---|---|
| `FULL_ARCHITECTURE_AUDIT.md` | "aiService.js = GROQ API + recommendation engine"; ".env: GROQ_API_KEY" | Trump has **no Groq**; aiService is deterministic |
| `SYSTEM_FLOW_MAP.md` | "Trump Chatbot (GROQ API)… POST to GROQ API (cloud LLM)" | No external call on guest path |
| `FRONTEND_BACKEND_RELATIONS.md` | "`/api/ai/chat` → GROQ LLM chat response" | Deterministic; endpoint is `/api/chat` |
| `FUTURE_MULTI_TENANT_PLAN.md` | "Trump: GROQ API"; recommends Groq for all sites | False premise |
| `TRUMP_GREEK_COMPARISON.md` | "Trump = GROQ cloud API" | Greek uses Groq, **Trump does not** |
| `CLAUDE.md` | "aiService.js wraps external LLM calls"; "express-session backed by an in-memory map" | aiService is deterministic; sessions are HMAC cookie tokens validated against Postgres |
| `Sites/Trump/SECURITY_HARDENING.md` | Implies password rotation is sufficient; sessions "backed by data/accounts.json" | Omits the `123456789` demo backdoor (reset every boot); accounts are Postgres-primary |
| `Sites/Trump/josh_enterprise/README.md` | "Trump Prime Grillhouse AI Assistant" (implies a live Trump AI) | JOSH is **not wired** into Trump's Node runtime (dormant) |
| Most `FINAL_*`/`*_VALIDATION`/`*PRODUCTION_VALIDATION` docs | "production ready / all checks passed" | Contradicted by Phase-0: backdoor accounts + DEMO_MODE + no tests/payments/backups |

---

# Report A — Full Documentation Inventory

Legend — Acc(urate): Y/N/P(artial). T=Trump, G=Groq, An=Anthropic, D=DemoMode (Y/N). Ref=referenced by devs/tooling. Action: K/M/A/D (Keep/Merge/Archive/Delete).

| # | File | Purpose | Acc | T | G | An | D | Ref | Action |
|--:|---|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| 1 | `CLAUDE.md` | Claude Code project instructions | **P** | Y | N | N | N | **Y** (tooling) | **K**＊ |
| 2 | `PHASE_0_PRODUCTION_AUDIT.md` | Current prod-readiness audit (A–H) | Y | Y | Y | Y | Y | Y (memory) | **K** |
| 3 | `PHASE_0_INVENTORY.md` | Current demo/Groq/AI inventory | Y | Y | Y | Y | Y | Y | **K** |
| 4 | `TRUMP_AI_DEPENDENCY_AUDIT.md` | Current AI/Anthropic audit | Y | Y | N | Y | Y | Y | **K** |
| 5 | `POSTGRES_PRODUCTION_SETUP.md` | PG16 install + 6 migrations + pg_dump backup | Y | Y | N | N | N | N | **K** (→ move to Trump) |
| 6 | `Sites/Trump/DEPLOYMENT_GUIDE.md` | Deploy/redeploy/smoke-test runbook | P | Y | N | N | N | N | **K** |
| 7 | `Sites/Trump/BACKUP_RECOVERY.md` | Backup/restore/rollback (JSON+.env) | P | Y | N | N | N | N | **K** (add DB backup) |
| 8 | `Sites/Trump/SECURITY_HARDENING.md` | Security posture summary | **P/misleading** | Y | N | N | N | N | **K** (must correct) |
| 9 | `Sites/Trump/NGINX_SETUP.md` | Nginx TLS/proxy config | Y | Y | N | N | N | N | **M**→Deploy |
| 10 | `Sites/Trump/PM2_SETUP.md` | PM2 process config | Y | Y | N | N | N | N | **M**→Deploy |
| 11 | `DEPLOYMENT_QUICK_REFERENCE.md` | Deploy safety cheatsheet | P | Y | N | N | N | N | **M**→Deploy |
| 12 | `Sites/Trump/ENV_SETUP_REPORT.md` | env:check tooling change-note | P | Y | N | N | N | N | **M**→Env ref |
| 13 | `Sites/Trump/PRISMA_SETUP_REPORT.md` | Prisma env setup note | P | Y | N | N | N | N | **M**→PG setup |
| 14 | `FUTURE_MULTI_TENANT_PLAN.md` | Multi-tenant roadmap (Groq premise) | **N** | Y | Y | N | N | N | **A** (flag) |
| 15 | `SCALABILITY_RISK_REPORT.md` | Scaling risk analysis | P | Y | N | N | N | N | **A** |
| 16 | `TRUMP_GREEK_COMPARISON.md` | Site comparison (Trump=Groq wrong) | P/N | Y | Y | N | N | N | **A** (flag) |
| 17 | `SERVER_RUNTIME_AUDIT.md` | Live server runtime audit (Greek Groq ok) | P | Y | Y | N | N | N | **A** |
| 18 | `PRISMA_RUNTIME_ANALYSIS.md` | Prisma runtime analysis | P | Y | N | N | N | N | **A** |
| 19 | `OPERATIONAL_PERSISTENCE_REPORT.md` | JSON↔PG persistence audit | P | Y | N | N | N | N | **A** |
| 20 | `REALTIME_STABILITY_REPORT.md` | Socket stability audit | P | Y | N | N | N | N | **A** |
| 21 | `SOCKET_FLOW_ANALYSIS.md` | Socket.IO flow map | P | Y | N | N | N | N | **A** |
| 22 | `SOCKET_RECOVERY_REPORT.md` | Socket recovery design | P | Y | N | N | N | N | **A** |
| 23 | `REORGANIZATION_FINAL_REPORT.md` | Repo reorg record | Y | Y | N | N | N | N | **A** |
| 24 | `TRUMP_OPERATIONAL_HARDENING.md` | Ops hardening audit | P | Y | N | N | N | N | **A** |
| 25 | `BACKUP_REPORT.md` | One-time backup run record | Y | Y | N | N | N | N | **A** |
| 26 | `AUTH_SQL_MIGRATION.md` | Auth→PG migration record | Y | Y | N | N | N | N | **A** |
| 27 | `MENU_SQL_MIGRATION.md` | Menu→PG migration record | Y | Y | N | N | N | N | **A** |
| 28 | `ORDER_SQL_MIGRATION.md` | Order→PG migration record | Y | Y | N | N | N | N | **A** |
| 29 | `HYBRID_AUTH_COMPATIBILITY.md` | Auth hybrid-store note | Y | Y | N | N | N | N | **A** |
| 30 | `HYBRID_MENU_COMPATIBILITY.md` | Menu hybrid-store note | Y | Y | N | N | N | N | **A** |
| 31 | `HYBRID_ORDER_COMPATIBILITY.md` | Order hybrid-store note | Y | Y | N | N | N | N | **A** |
| 32 | `PRISMA_AUTH_REPORT.md` | Prisma auth service report | Y | Y | N | N | N | N | **A** |
| 33 | `PRISMA_MENU_REPORT.md` | Prisma menu service report | Y | Y | N | N | N | N | **A** |
| 34 | `PRISMA_ORDER_REPORT.md` | Prisma order service report | Y | Y | N | N | N | N | **A** |
| 35 | `Sites/Trump/client/public/media/trump/README.md` | Demo showcase media spec | Y | Y | N | N | **Y** | N | **A** (demo) |
| 36 | `Sites/Greek/josh_enterprise/README.md` | Greek JOSH chatbot docs (live dep) | Y | N | N | N | N | N | **A** (Greek, out of scope) |
| 37 | `FULL_ARCHITECTURE_AUDIT.md` | Architecture audit (Groq/AI wrong) | **N** | Y | Y | N | N | N | **D** (flag) |
| 38 | `SYSTEM_FLOW_MAP.md` | System flow (Groq/AI wrong) | **N** | Y | Y | N | N | N | **D** (flag) |
| 39 | `FRONTEND_BACKEND_RELATIONS.md` | API map (Groq/AI wrong) | **N** | Y | Y | N | N | N | **D** (flag) |
| 40 | `SAFE_CLEANUP_REPORT.md` | One-off cleanup tracker | Y | Y | N | N | N | N | **D** |
| 41 | `USER_MIGRATION_STATUS.md` | Migration status snapshot | Y(hist) | Y | N | N | N | N | **D** |
| 42 | `ORDER_MIGRATION_STATUS.md` | Migration status snapshot | Y(hist) | Y | N | N | N | N | **D** |
| 43 | `MENU_MIGRATION_STATUS.md` | Migration status snapshot | Y(hist) | Y | N | N | N | N | **D** |
| 44 | `LOGIN_VALIDATION.md` | Pass/fail validation snapshot | Y(hist) | Y | N | N | N | N | **D** |
| 45 | `MENU_RENDER_VALIDATION.md` | Pass/fail validation snapshot | Y(hist) | Y | N | N | N | N | **D** |
| 46 | `REALTIME_VALIDATION.md` | Pass/fail validation snapshot | Y(hist) | Y | N | N | N | N | **D** |
| 47 | `SOCKET_RUNTIME_VALIDATION.md` | Pass/fail validation snapshot | Y(hist) | Y | N | N | N | N | **D** |
| 48 | `PM2_RUNTIME_VALIDATION.md` | Pass/fail validation snapshot | Y(hist) | Y | N | N | N | N | **D** |
| 49 | `FINAL_PRODUCTION_VALIDATION.md` (root) | "Production validated" snapshot | **N** | Y | N | N | N | N | **D** (misleading) |
| 50 | `FINAL_TRUMP_STABILITY_VALIDATION.md` | Stability snapshot | P | Y | N | N | N | N | **D** |
| 51 | `Sites/Trump/FINAL_PRODUCTION_VALIDATION.md` | Dup of #49 (older) | **N** | Y | N | N | N | N | **D** (duplicate) |
| 52 | `Sites/Trump/FINAL_VALIDATION.md` | Validation snapshot | P | Y | N | N | N | N | **D** |
| 53 | `Sites/Trump/FINAL_INFRA_VALIDATION.md` | Infra validation snapshot | P | Y | N | N | N | N | **D** |
| 54 | `Sites/Trump/FINAL_SECURITY_VALIDATION.md` | "Security validated" snapshot | **N** | Y | N | N | N | N | **D** (misleading) |
| 55 | `Sites/Trump/FINAL_SYSTEM_STATUS.md` | Status snapshot | P | Y | N | N | N | N | **D** |
| 56 | `Sites/Trump/FINAL_CHANGES.md` | Ad-hoc changelog | Y(hist) | Y | N | N | N | N | **D** |
| 57 | `Sites/Trump/FINAL_CLEANUP_REPORT.md` | Cleanup tracker | Y(hist) | Y | N | N | N | N | **D** |
| 58 | `Sites/Trump/SAFE_TO_DELETE_FINAL.md` | Deletion-candidate tracker | Y(hist) | Y | N | N | N | N | **D** |
| 59 | `Sites/Trump/REMAINING_ISSUES.md` | Stale TODO snapshot | P | Y | N | N | N | N | **D** |
| 60 | `Sites/Trump/FEATURE_PARITY_REPORT.md` | Parity snapshot vs legacy | P | Y | N | N | N | N | **D** |
| 61 | `Sites/Trump/UI_POLISH_REPORT.md` | UI polish snapshot | Y(hist) | Y | N | N | N | N | **D** |
| 62 | `Sites/Trump/SYSTEM_CONNECTION_REPORT.md` | Connection test snapshot | Y(hist) | Y | N | N | N | N | **D** |
| 63 | `Sites/Trump/SYSTEM_RECONNECTION_REPORT.md` | Reconnection test snapshot | Y(hist) | Y | N | N | N | N | **D** |
| 64 | `Sites/Trump/AUTH_FINALIZATION_REPORT.md` | Auth finalization snapshot | P | Y | N | N | N | N | **D** |
| 65 | `Sites/Trump/PRODUCTION_HARDENING_REPORT.md` | Hardening snapshot | P | Y | N | N | N | N | **D** |
| 66 | `Sites/Trump/MENU_RESTRUCTURE_REPORT.md` | Menu restructure snapshot | Y(hist) | Y | N | N | N | N | **D** |
| 67 | `Sites/Trump/josh_enterprise/README.md` | Dormant JOSH AI (not wired) | **N** | Y | N | N | N | N | **D** (flag) |

＊`CLAUDE.md` is KEEP because tooling depends on it, **but it must be corrected** (AI + session claims).

---

# Report B — KEEP List (production-required, Trump-scoped)

| File | Why kept | Required fix before trusting |
|---|---|---|
| `CLAUDE.md` | Tooling/agent instructions | Correct AI ("deterministic, not LLM") + session ("HMAC cookie + Postgres, not in-memory") |
| `Sites/Trump/DEPLOYMENT_GUIDE.md` | Deploy/redeploy/smoke runbook | Drop "until SQL migration" (migration done); add Postgres step |
| `Sites/Trump/BACKUP_RECOVERY.md` | Backup/restore/rollback | **Add PostgreSQL `pg_dump`/restore** (currently JSON-only) |
| `Sites/Trump/SECURITY_HARDENING.md` | Security posture reference | Add the `123456789` demo-account backdoor + CSP-off as open risks; fix session-store description |
| `POSTGRES_PRODUCTION_SETUP.md` | DB install + migrations + DB backup | Move under `Sites/Trump/docs/`; redact server IP |
| `PHASE_0_PRODUCTION_AUDIT.md` | Current decision source of truth | — (current) |
| `PHASE_0_INVENTORY.md` | Current demo/Groq/AI inventory | — (current) |
| `TRUMP_AI_DEPENDENCY_AUDIT.md` | Current AI/Anthropic audit | — (current) |

> Note: the three `PHASE_0*`/AI audits are KEEP **now** (active Phase-0 work). Once Phase 0 remediation is executed, move them to `/docs/archive`.

---

# Report C — MERGE List

| File | Merge into | Rationale |
|---|---|---|
| `Sites/Trump/NGINX_SETUP.md` | `DEPLOYMENT_GUIDE.md` (→ single OPERATIONS guide) | Infra fragment |
| `Sites/Trump/PM2_SETUP.md` | `DEPLOYMENT_GUIDE.md` | Infra fragment |
| `DEPLOYMENT_QUICK_REFERENCE.md` | `DEPLOYMENT_GUIDE.md` | Overlapping cheatsheet |
| `Sites/Trump/ENV_SETUP_REPORT.md` | new `ENVIRONMENT.md` (built from `.env.example`) | env content scattered/undocumented |
| `Sites/Trump/PRISMA_SETUP_REPORT.md` | `POSTGRES_PRODUCTION_SETUP.md` | Same topic |

---

# Report D — ARCHIVE List → `/docs/archive/`

Historical record worth keeping (accurate as of 2026-05-21/22), not needed daily. **22 files.**

Migration & persistence records: `AUTH_SQL_MIGRATION`, `MENU_SQL_MIGRATION`, `ORDER_SQL_MIGRATION`, `HYBRID_AUTH_COMPATIBILITY`, `HYBRID_MENU_COMPATIBILITY`, `HYBRID_ORDER_COMPATIBILITY`, `PRISMA_AUTH_REPORT`, `PRISMA_MENU_REPORT`, `PRISMA_ORDER_REPORT`, `OPERATIONAL_PERSISTENCE_REPORT`, `PRISMA_RUNTIME_ANALYSIS`, `BACKUP_REPORT`.
Audits & analyses: `SERVER_RUNTIME_AUDIT`, `SCALABILITY_RISK_REPORT`, `REALTIME_STABILITY_REPORT`, `SOCKET_FLOW_ANALYSIS`, `SOCKET_RECOVERY_REPORT`, `TRUMP_OPERATIONAL_HARDENING`, `REORGANIZATION_FINAL_REPORT`.
Planning/comparison (⚠️ flag Groq errors in-file): `FUTURE_MULTI_TENANT_PLAN`, `TRUMP_GREEK_COMPARISON`.
Demo/legacy reference: `Sites/Trump/client/public/media/trump/README.md` (demo media), `Sites/Greek/josh_enterprise/README.md` (Greek dep — out of Trump scope; leave in place or archive under Greek).

> Recommend consolidating the 12 migration/persistence records into one `docs/archive/POSTGRES_MIGRATION_HISTORY.md`.

---

# Report E — DELETE List (outdated / misleading / duplicated / abandoned / temporary)

**28 files.** No future value; superseded by current Phase-0 audits or contradicted by code.

Misleading AI/architecture (superseded, contain Groq/AI errors): `FULL_ARCHITECTURE_AUDIT`, `SYSTEM_FLOW_MAP`, `FRONTEND_BACKEND_RELATIONS`, `Sites/Trump/josh_enterprise/README.md` (dormant "Trump AI").
Misleading production/security "validated" snapshots: `FINAL_PRODUCTION_VALIDATION` (root), `Sites/Trump/FINAL_PRODUCTION_VALIDATION` (dup), `Sites/Trump/FINAL_SECURITY_VALIDATION`, `FINAL_TRUMP_STABILITY_VALIDATION`, `Sites/Trump/FINAL_INFRA_VALIDATION`, `Sites/Trump/FINAL_VALIDATION`, `Sites/Trump/FINAL_SYSTEM_STATUS`, `Sites/Trump/PRODUCTION_HARDENING_REPORT`, `Sites/Trump/AUTH_FINALIZATION_REPORT`.
Pass/fail point-in-time snapshots: `LOGIN_VALIDATION`, `MENU_RENDER_VALIDATION`, `REALTIME_VALIDATION`, `SOCKET_RUNTIME_VALIDATION`, `PM2_RUNTIME_VALIDATION`, `USER_MIGRATION_STATUS`, `ORDER_MIGRATION_STATUS`, `MENU_MIGRATION_STATUS`, `Sites/Trump/SYSTEM_CONNECTION_REPORT`, `Sites/Trump/SYSTEM_RECONNECTION_REPORT`, `Sites/Trump/FEATURE_PARITY_REPORT`, `Sites/Trump/MENU_RESTRUCTURE_REPORT`, `Sites/Trump/UI_POLISH_REPORT`.
Temporary trackers / scratch: `SAFE_CLEANUP_REPORT`, `Sites/Trump/FINAL_CLEANUP_REPORT`, `Sites/Trump/SAFE_TO_DELETE_FINAL`, `Sites/Trump/FINAL_CHANGES`, `Sites/Trump/REMAINING_ISSUES`.

> All are recoverable via git history if ever needed — deletion here is about a clean working tree, not erasing the record.

---

# Report F — Proposed Final Documentation Structure

A real product needs ~8 living docs, not 67. Target:

```
/
├── README.md                      ← MISSING — create (what Emenyu is, sites, quickstart)
├── CLAUDE.md                      ← KEEP (corrected)
├── docs/
│   ├── DEPLOYMENT.md              ← DEPLOYMENT_GUIDE + PM2_SETUP + NGINX_SETUP + QUICK_REFERENCE
│   ├── ENVIRONMENT.md             ← MISSING ref built from .env.example (+ undocumented TRUMP_LLM_*, TRUMP_DEMO_PASSWORD, *_POSTGRES_ENABLED) + ENV_SETUP_REPORT
│   ├── DATABASE.md                ← POSTGRES_PRODUCTION_SETUP + PRISMA_SETUP_REPORT (migrations + pg backup)
│   ├── BACKUP_AND_DR.md           ← BACKUP_RECOVERY + Postgres pg_dump/restore + retention/DR runbook
│   ├── SECURITY.md                ← SECURITY_HARDENING (corrected: backdoor, CSP, secrets)
│   ├── ARCHITECTURE.md            ← NEW, accurate (replaces the 3 deleted Groq-wrong maps)
│   └── AI.md                      ← TRUMP_AI_DEPENDENCY_AUDIT (how AI works: deterministic + optional Anthropic NLG)
└── docs/archive/                  ← all 22 ARCHIVE docs + consolidated POSTGRES_MIGRATION_HISTORY.md
                                      (+ PHASE_0_* audits after remediation)
```

**Gaps to fill (currently no doc exists):** root `README.md`, an `ENVIRONMENT.md` env-var reference, and an **accurate** `ARCHITECTURE.md`.

**Net effect:** 67 → ~8 living docs + an archive folder. Removes every Groq/AI misstatement from active docs and eliminates duplicate/abandoned validation snapshots.

---

*Audit only. Nothing was deleted, moved, or modified. Recommendations above are reversible and await your go-ahead.*
</content>
