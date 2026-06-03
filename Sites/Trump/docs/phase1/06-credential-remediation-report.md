# Phase 1.1 — Credential Remediation Report

**Date:** 2026-06-03 · **Branch:** `feat/phase1-security-hardening` · **Scope:**
`Sites/Trump` only · **Tooling:** `scripts/rotate-weak-accounts.js`
(`npm run auth:rotate`).

Resolves the one operational blocker left open by Phase 1 (`B4-action`): live
accounts persisted with the weak password `123456789`.

> **Secrets are NOT in this report or in git.** The generated passwords were written
> only to a gitignored file under `Sites/Trump/backups/` (path printed by the tool).

---

## Task 1 — Accounts failing `auth:audit`

`npm run auth:audit` and the rotation tool's dry run both identified **5** weak
accounts, each weak in **both** stores (PostgreSQL + JSON fallback):

| Username | Role | Status | Stores | Matched |
|---|---|---|---|---|
| admin | owner | active | postgres + json | `123456789` |
| owner | owner | active | postgres + json | `123456789` |
| manager | manager | active | postgres + json | `123456789` |
| waiter | waiter | active | postgres + json | `123456789` |
| kitchen | kitchen | active | postgres + json | `123456789` |

The suspended `demo_waiter_tmp` account was scanned and **not** flagged (its hash is
not in the denylist) — left untouched.

## Task 2 — Secure replacement credentials

- Generated with Node `crypto.randomBytes(18)` → base64url (~24 chars, ~108 bits of
  entropy), one unique password per account.
- Each candidate is re-checked against the shared denylist (`isWeakPassword`) before
  use, so a generated value can never itself be weak.

## Task 3 — Safe rotation

`node scripts/rotate-weak-accounts.js --apply` performed, for each weak account:

- **PostgreSQL** (authoritative): `passwordHash` replaced; `sessionInvalidBefore`
  set to the rotation timestamp (existing sessions invalidated).
- **JSON fallback**: same new hash + `updatedAt` + `sessionInvalidBefore`, written
  atomically — kept in lockstep so a Postgres outage cannot resurrect weak
  fallback credentials.
- The tool is an operator utility and bypasses the role-based management checks, so
  it can rotate `owner`/`admin` accounts (which the normal admin API cannot manage).
- Dry-run is the default; `--apply` is required to mutate; secrets are written to a
  gitignored file (and only echoed to stdout with `--show`).

## Task 4 — Login verification (live server)

| Account | Old `123456789` | New password |
|---|---|---|
| owner | **401** ✅ | **200** ✅ |
| manager | **401** ✅ | **200** ✅ |
| waiter | — | **200** ✅ |
| kitchen | — | **200** ✅ |
| admin | — | **200** ✅ |

Old credentials are rejected; all five new credentials authenticate. The
server's startup account migration (JSON↔Postgres) did not revert the rotation
(verified by the post-boot logins succeeding).

## Task 5 & 6 — Updated audit results

`npm run auth:audit` after rotation:

```
Accounts audited : 6 (postgres reachable)
Denylist entries : 21
Backdoor check   : no weak admin/backdoor account detected
Result           : OK — no weak or missing credentials found.
```
```json
{ "totalAccounts": 6, "weakOrInsecure": 0, "backdoorCheck": "no weak admin/backdoor account detected" }
```

Exit code **0** — **zero weak accounts remain.** ✅

---

## ⚠️ Production applicability

This remediation ran against the environment reachable from this workspace (the
local/dev PostgreSQL). The **production** deployment (`emenuy-trump-api`) must have
the same procedure applied on its own host, against its own database:

```bash
cd Sites/Trump
npm run auth:audit                       # confirm the weak accounts are present
node scripts/rotate-weak-accounts.js --apply --show   # rotate; capture secrets securely
npm run auth:audit                       # must report OK (exit 0)
```

Distribute the new secrets to staff over a secure channel and delete the generated
credentials file once distributed. Staff may then set their own passwords via the
admin console if preferred.

## Remaining security blockers (unchanged by this task)

| ID | Item | Severity | Phase |
|---|---|---|---|
| — | Run `auth:rotate` on the **production** host (above) | High (ops) | now |
| B3 | No automated test suite | High | 4 |
| B5 | Single-instance only (in-memory socket/cart/limiter state) | High (scale) | 4 |
| B6 | Media-enrichment deps (`sharp`, `node-cron`) undeclared/inert | Medium | 4 |
| B9 | Manual build / no CI gate (add `auth:audit` to the pipeline) | Medium | 4 |
| B11 | Uploads not magic-byte verified | Low | 4 |

No recommendation logic or UI was changed. **Phase 2 was not started.**
