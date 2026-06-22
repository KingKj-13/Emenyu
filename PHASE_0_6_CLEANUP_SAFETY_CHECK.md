# Phase 0.6 — Documentation Cleanup Safety Check

**Date:** 2026-06-01 · **Audit only — nothing deleted, moved, or edited.** · **Scope: Trump project.**
Verifies the DELETE / ARCHIVE / MERGE classifications from `PHASE_0_5_DOCUMENTATION_AUDIT.md` against every possible reference source before any cleanup.

> **Count correction:** the Phase-0.5 report header undercounted. Actual tracked totals = **KEEP 8 · MERGE 5 · ARCHIVE 23 (22 Trump + 1 Greek/out-of-scope) · DELETE 31 · = 67**.

---

## 0. Reference scan — what was checked and found

| Reference source | Method | Result |
|---|---|---|
| `CLAUDE.md` | grep `\.md` | **No doc links** (only its own title line) |
| README files | inventory | No root/Trump README exists; JOSH + showcase READMEs link to nothing in the set |
| `package.json` / npm scripts | grep `.md` in all `package.json` | **0 references** |
| Shell / deployment / setup scripts | glob `**/*.sh` (excl. node_modules) | **None exist** in the project |
| CI/CD · GitHub Actions · GitLab · CircleCI | glob `.github`/`.gitlab-ci`/`.circleci` | **None exist** (only inside `node_modules`) |
| PM2 config | read `ecosystem.config.js` | No `.md` reference |
| Nginx config | glob `**/*.conf` | **No nginx conf in repo** (only vosk speech-model `.conf`) |
| Developer tooling (`.js` code) | grep `\.md` in all JS | **0 references** |
| Other config (`.json/.yml/.yaml/.toml/Dockerfile/.txt`) | grep `\.md` | **0 references** |
| Markdown → markdown links | grep across all `*.md` | Found (see §1) — **all originate from DELETE docs or descriptive audit prose** |

**Conclusion:** No script, config, build tool, CI pipeline, PM2/Nginx config, or source file references any markdown document. The only inter-doc references are text mentions inside markdown, and **not one surviving (KEEP/MERGE) document contains a clickable link to a DELETE or ARCHIVE file.**

---

## 1. Complete markdown→markdown reference map (the only references that exist)

| Source doc (class) | References → (class) |
|---|---|
| `FULL_ARCHITECTURE_AUDIT.md` (**D**) | `HYBRID_AUTH_COMPATIBILITY.md` (A), `MENU_MIGRATION_STATUS.md` (D) — *ASCII tree* |
| `FINAL_PRODUCTION_VALIDATION.md` root (**D**) | `SERVER_RUNTIME_AUDIT`(A), `BACKUP_REPORT`(A), `SAFE_CLEANUP_REPORT`(D), `POSTGRES_PRODUCTION_SETUP`(K), `PM2_RUNTIME_VALIDATION`(D), `SOCKET_RUNTIME_VALIDATION`(D), `FINAL_TRUMP_STABILITY_VALIDATION`(D), itself |
| `Sites/Trump/FINAL_CHANGES.md` (**D**) | `UI_POLISH_REPORT`(D), `FEATURE_PARITY_REPORT`(D), `FINAL_VALIDATION`(D), `REMAINING_ISSUES`(D), itself |
| `Sites/Trump/FINAL_VALIDATION.md` (**D**) | `FINAL_PRODUCTION_VALIDATION.md`(D) |
| `Sites/Trump/PRODUCTION_HARDENING_REPORT.md` (**D**) | `DEPLOYMENT_GUIDE`(K), `PM2_SETUP`(M), `NGINX_SETUP`(M), `SECURITY_HARDENING`(K), `BACKUP_RECOVERY`(K), `FINAL_INFRA_VALIDATION`(D) |
| `DEPLOYMENT_QUICK_REFERENCE.md` (**M**) | `dont_upload/README.md`, `dont_upload/UPLOAD_WARNINGS.md`, `dont_upload/SAFE_DEPLOYMENT_GUIDE.md`, `dont_upload/PRIVATE_FILES_REPORT.md` — *gitignored, out-of-scope, survive* |
| `PHASE_0_PRODUCTION_AUDIT.md` (**K**) | Names CLAUDE.md + 6 Groq docs in **prose** (backticks, not links) |
| `PHASE_0_5_DOCUMENTATION_AUDIT.md` (**K**) | Names **every** doc in its inventory table (backticks, not links) |

**Reading the map:**
- Every referrer except the two KEEP audit docs and `DEPLOYMENT_QUICK_REFERENCE` is **itself a DELETE file** → its outgoing links vanish when it's deleted. No cleanup needed.
- The two KEEP audit docs use plain backtick text (e.g. `` `FULL_ARCHITECTURE_AUDIT.md` ``), **not** `](…)` links → deleting the named files produces **no broken hyperlink**; the audit docs remain valid as historical records.
- `DEPLOYMENT_QUICK_REFERENCE` → `dont_upload/*` are the only outbound links to files that survive; preserve them when merging.

---

# Report A — Safe To Delete Immediately (zero inbound references)

**19 files.** Nothing references these (no code/config/tooling, and no markdown link — only, at most, descriptive mentions inside the KEEP audit docs, which are non-breaking records).

Root:
- `FULL_ARCHITECTURE_AUDIT.md`
- `SYSTEM_FLOW_MAP.md`
- `FRONTEND_BACKEND_RELATIONS.md`
- `LOGIN_VALIDATION.md`
- `MENU_RENDER_VALIDATION.md`
- `REALTIME_VALIDATION.md`
- `USER_MIGRATION_STATUS.md`
- `ORDER_MIGRATION_STATUS.md`

`Sites/Trump/`:
- `josh_enterprise/README.md`
- `FINAL_SECURITY_VALIDATION.md`
- `FINAL_SYSTEM_STATUS.md`
- `PRODUCTION_HARDENING_REPORT.md` *(referrer only — links out, nothing links in)*
- `AUTH_FINALIZATION_REPORT.md`
- `SYSTEM_CONNECTION_REPORT.md`
- `SYSTEM_RECONNECTION_REPORT.md`
- `MENU_RESTRUCTURE_REPORT.md`
- `FINAL_CLEANUP_REPORT.md`
- `SAFE_TO_DELETE_FINAL.md`
- `FINAL_CHANGES.md` *(referrer only — links out, nothing links in)*

---

# Report B — Delete After Reference Cleanup

**12 files.** Each is referenced **only by another DELETE document** (never by a surviving doc, script, or config). **No link update is required in any surviving file.** The only "cleanup" is to delete the referrer too — so these are safe **as long as the full DELETE set is removed together** (or referrer-first).

| File (DELETE) | Referenced only by (also DELETE) | Action |
|---|---|---|
| `MENU_MIGRATION_STATUS.md` | `FULL_ARCHITECTURE_AUDIT.md` | delete as batch |
| `SAFE_CLEANUP_REPORT.md` | `FINAL_PRODUCTION_VALIDATION.md` (root) | delete as batch |
| `PM2_RUNTIME_VALIDATION.md` | `FINAL_PRODUCTION_VALIDATION.md` (root) | delete as batch |
| `SOCKET_RUNTIME_VALIDATION.md` | `FINAL_PRODUCTION_VALIDATION.md` (root) | delete as batch |
| `FINAL_TRUMP_STABILITY_VALIDATION.md` | `FINAL_PRODUCTION_VALIDATION.md` (root) | delete as batch |
| `FINAL_PRODUCTION_VALIDATION.md` (root) | self + `Sites/Trump/FINAL_VALIDATION.md` | delete as batch |
| `Sites/Trump/FINAL_PRODUCTION_VALIDATION.md` | `Sites/Trump/FINAL_VALIDATION.md` | delete as batch |
| `Sites/Trump/FINAL_VALIDATION.md` | `Sites/Trump/FINAL_CHANGES.md` | delete as batch |
| `Sites/Trump/FINAL_INFRA_VALIDATION.md` | `Sites/Trump/PRODUCTION_HARDENING_REPORT.md` | delete as batch |
| `Sites/Trump/UI_POLISH_REPORT.md` | `Sites/Trump/FINAL_CHANGES.md` | delete as batch |
| `Sites/Trump/FEATURE_PARITY_REPORT.md` | `Sites/Trump/FINAL_CHANGES.md` | delete as batch |
| `Sites/Trump/REMAINING_ISSUES.md` | `Sites/Trump/FINAL_CHANGES.md` | delete as batch |

> Optional polish (non-blocking): after deletion, the KEEP audit docs `PHASE_0_PRODUCTION_AUDIT.md` and `PHASE_0_5_DOCUMENTATION_AUDIT.md` still *name* deleted files in prose. They read fine as records; update only if you want them to say "(deleted)".

---

# Report C — Safe To Archive (move without breaking anything)

**22 Trump-scoped files** → `/docs/archive/`. No surviving doc, script, or config references any of them by path; the only inbound references come from DELETE docs (which are removed). Moving them changes paths harmlessly.

`AUTH_SQL_MIGRATION`, `MENU_SQL_MIGRATION`, `ORDER_SQL_MIGRATION`, `HYBRID_AUTH_COMPATIBILITY`, `HYBRID_MENU_COMPATIBILITY`, `HYBRID_ORDER_COMPATIBILITY`, `PRISMA_AUTH_REPORT`, `PRISMA_MENU_REPORT`, `PRISMA_ORDER_REPORT`, `OPERATIONAL_PERSISTENCE_REPORT`, `PRISMA_RUNTIME_ANALYSIS`, `BACKUP_REPORT`, `SERVER_RUNTIME_AUDIT`, `SCALABILITY_RISK_REPORT`, `REALTIME_STABILITY_REPORT`, `SOCKET_FLOW_ANALYSIS`, `SOCKET_RECOVERY_REPORT`, `TRUMP_OPERATIONAL_HARDENING`, `REORGANIZATION_FINAL_REPORT`, `FUTURE_MULTI_TENANT_PLAN` ⚠️, `TRUMP_GREEK_COMPARISON` ⚠️, `Sites/Trump/client/public/media/trump/README.md`.

⚠️ = contains Groq/AI misstatements; add a one-line "superseded/contains errors — see PHASE_0 audits" banner when archiving.
*Out of scope:* `Sites/Greek/josh_enterprise/README.md` (Greek live dependency — leave in place).

---

# Report D — Safe To Merge (content to fold in before deletion)

**5 files.** Merge content into the target, then delete the source. Only `DEPLOYMENT_QUICK_REFERENCE` carries outbound links (to `dont_upload/*`) that must be preserved.

| Source (MERGE) | → Target | Links to carry over |
|---|---|---|
| `Sites/Trump/NGINX_SETUP.md` | `docs/DEPLOYMENT.md` | none |
| `Sites/Trump/PM2_SETUP.md` | `docs/DEPLOYMENT.md` | none |
| `DEPLOYMENT_QUICK_REFERENCE.md` | `docs/DEPLOYMENT.md` | **`dont_upload/README.md`, `UPLOAD_WARNINGS.md`, `SAFE_DEPLOYMENT_GUIDE.md`, `PRIVATE_FILES_REPORT.md`** |
| `Sites/Trump/ENV_SETUP_REPORT.md` | `docs/ENVIRONMENT.md` (new) | none |
| `Sites/Trump/PRISMA_SETUP_REPORT.md` | `docs/DATABASE.md` (from POSTGRES_PRODUCTION_SETUP) | none |

---

# Report E — Documentation Cleanup Plan (safe execution order)

**Nothing below has external dependencies, so order is about not losing content, not avoiding breakage.**

### 1. Fix incorrect docs (do first — these are read by tooling/operators)
- `CLAUDE.md`: correct "aiService.js wraps external LLM calls" → *deterministic engine, no LLM*; correct "express-session backed by an in-memory map" → *HMAC-signed cookie tokens validated against Postgres*.
- `Sites/Trump/SECURITY_HARDENING.md`: add the `123456789` demo-account backdoor (reset every boot) + CSP-disabled as open risks; fix "sessions backed by `data/accounts.json`" → *Postgres-primary*.

### 2. Create missing docs
- Root `README.md` (what Emenyu is, the 4 sites, quickstart).
- `docs/ENVIRONMENT.md` from `.env.example` **+ the undocumented vars** (`TRUMP_LLM_*`, `TRUMP_DEMO_PASSWORD`, `TRUMP_*_POSTGRES_ENABLED`, `STAGING_PASS`, `TRUMP_DEFAULT_PASSWORD`).
- `docs/ARCHITECTURE.md` — accurate, to replace the 3 Groq-wrong maps being deleted.
- `docs/AI.md` ← adopt `TRUMP_AI_DEPENDENCY_AUDIT.md` (deterministic + optional Anthropic NLG).

### 3. Merge docs (Report D)
- Build `docs/DEPLOYMENT.md` = `DEPLOYMENT_GUIDE` + `PM2_SETUP` + `NGINX_SETUP` + `DEPLOYMENT_QUICK_REFERENCE` (carry the 4 `dont_upload/*` links).
- Build `docs/DATABASE.md` = `POSTGRES_PRODUCTION_SETUP` + `PRISMA_SETUP_REPORT` (redact server IP).
- Fold `ENV_SETUP_REPORT` into `docs/ENVIRONMENT.md`; fold pg_dump from POSTGRES setup into `docs/BACKUP_AND_DR.md` (from `BACKUP_RECOVERY`).

### 4. Archive docs (Report C)
- Move the 22 files to `docs/archive/` (optionally consolidate the 12 migration/persistence records into `docs/archive/POSTGRES_MIGRATION_HISTORY.md`); add the ⚠️ banner to the 2 Groq-flawed planning docs.

### 5. Delete docs (Reports A + B)
- Delete the **31** DELETE files **as one batch** (Report A first, Report B with them). All recoverable via git history.
- (Optional) update the 2 KEEP audit docs' prose to mark deleted files.

**End state:** 67 → ~8 living docs + `docs/archive/`. Zero broken links, zero tooling impact (verified: nothing outside markdown ever referenced these files).

---

*Audit only. No file was created\* , deleted, moved, or modified (\*except this report). All actions await your explicit go-ahead.*
</content>
