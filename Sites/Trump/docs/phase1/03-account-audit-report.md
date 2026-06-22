# Task 3 — Credential Hardening: Account Audit Report

**Files:** `server/utils/weakPasswords.js` (new), `scripts/audit-accounts.js` (new),
`server/utils/helpers.js` (uses shared denylist), `server/services/accountService.js`
(exports `verifyPasswordHash`). npm script: `npm run auth:audit`.

## 1. What was added

- **Centralized denylist** (`weakPasswords.js`, 21 entries) covering retired demo
  seeds (`123456789`, `local-only-change-me`, …) and the most common defaults.
  `isWeakPassword(plain)` and `findWeakMatch(hash, verify)` are shared by both the
  production config guard and the audit script (single source of truth).
- **Read-only audit script** (`scripts/audit-accounts.js`): scans **all** accounts
  (PostgreSQL + JSON fallback), tests each stored PBKDF2 hash against the denylist,
  and reports weak / missing-hash / backdoor accounts. Exits non-zero when any are
  found (CI-gating). It does **not** mutate accounts (no seed/merge/migration).

## 2. Denylist protection — verified

- **Production startup guard** ([helpers.js](../../server/utils/helpers.js), `validateProductionConfig`) refuses
  to start if any *env-seeded* account password is empty or in the denylist. This
  prevents new weak seeds. (Verified: `validate-env` builds cleanly with strong
  values; the guard rejects denylisted ones.)
- **No code-level backdoor.** Source review confirms no hardcoded credential and no
  bypass; the previously documented `admin/123456789` constant is gone and
  `123456789` is denylisted.

## 3. Live audit result (local environment)

Running `node scripts/audit-accounts.js` against the local deployment found the
**pre-existing weak accounts** flagged in the Phase 0 audit ("old weak hashes still
on server"):

```
Accounts audited : 6 (postgres reachable)
Denylist entries : 21
Backdoor check   : WEAK admin account detected — rotate immediately
Result           : 5 account(s) require rotation:
  - admin   [owner,   active, postgres] → weak/known password ("123456789")
  - kitchen [kitchen, active, postgres] → weak/known password ("123456789")
  - manager [manager, active, postgres] → weak/known password ("123456789")
  - owner   [owner,   active, postgres] → weak/known password ("123456789")
  - waiter  [waiter,  active, postgres] → weak/known password ("123456789")
```

This is exactly the residual risk the tool is meant to surface: the startup guard
only governs *seeding*, while these accounts were persisted earlier with weak
passwords and are never reset on boot (by design — owner password changes must
survive restarts).

## 4. Required rotation (operator action — not performed here)

This task hardens detection and prevention; it intentionally does **not**
auto-rotate or auto-suspend, because force-mutating credentials on startup risks
locking out the owner. To remediate the flagged accounts:

1. Log in as owner and rotate each account via the admin console
   (`PATCH /Trump/api/auth/accounts/:username` with a strong password), **or**
   set strong `TRUMP_*_PASS` values and re-seed a clean environment.
2. Re-run `npm run auth:audit` until it reports `OK` (exit 0).
3. Wire `npm run auth:audit` into the deploy pipeline as a gate.

> ⚠️ The live deployment currently has 5 weak accounts. Rotating them is a required
> pre-production step (tracked as a remaining item in the completion report).

## 5. Notes

- The audit reads Postgres first (authoritative), then the JSON fallback, and
  de-duplicates by username.
- Hash scanning cost is bounded (21 candidates × few accounts × PBKDF2); fine for
  an on-demand/CI run.
