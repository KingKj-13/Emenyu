# ACCOUNT-ROTATION-REPORT.md — Phase 02B.1 Step 2

**Date:** 2026-06-24. **Finding:** B3 — 5 of 6 production accounts used the password `123456789`, including the `admin` owner backdoor, on an internet-reachable console. **Result: 🟢 CLOSED — `weakOrInsecure: 0`, all weak passwords rotated, `admin` backdoor disabled, old credentials proven dead.**

---

## 1. Before — live audit (read-only)

```
$ node scripts/audit-accounts.js --json     # (against live emenyu DB)
{ "totalAccounts": 6, "weakOrInsecure": 5,
  "backdoorCheck": "WEAK admin account detected — rotate immediately",
  "findings": [ admin(owner), kitchen, manager, owner, waiter  — all "123456789" ] }
```

## 2. Rotation

Tool: `scripts/rotate-weak-accounts.js` (operator tool — rotates BOTH Postgres and the JSON fallback in lockstep, generates 18-byte base64url secrets, invalidates sessions, writes secrets to a `0600` file under `backups/`).

```
$ node scripts/rotate-weak-accounts.js                  # dry run
Weak accounts detected: 5  (admin, kitchen, manager, owner, waiter — all "123456789")

$ node scripts/rotate-weak-accounts.js --apply --show
Rotated 5 account(s) in postgres + json. Sessions invalidated.
Secrets written to (gitignored):
  /var/www/mysite/Emenyu/Trump/backups/phase1.1-rotated-credentials-2026-06-24T14-42-49-450Z.txt
```

- **New secrets are NOT stored in this report** (it is committed to git). They live in the `0600` file on the box and were handed to the operator out-of-band for distribution. Each is a unique strong random string; none reused; none on the 21-entry weak denylist (the generator rejects denylisted candidates).
- All existing sessions invalidated (`sessionInvalidBefore` bumped) — anyone logged in with the old passwords is forced out.

## 3. `admin` backdoor — disabled

The `admin` account is a redundant default **owner** (the real `owner` account exists). Per the brief ("if not required: disable or remove"), it was **disabled**. The management API intentionally refuses to manage owner accounts (`canManageRole(owner, 'owner') === false`), so it was suspended via a low-level **lockstep** update (Postgres `User.suspended=true` + JSON `status='suspended'`, password hash preserved, sessions invalidated):

```
admin BEFORE: role=owner status=active hasHash=true
admin AFTER:  status=suspended suspendedAt=2026-06-24T14:44:11Z hashPreserved=true
```
Suspended accounts are rejected at authentication (`accountService` rejects `status === 'suspended'`).

## 4. After — verification

```
$ node scripts/audit-accounts.js --json
{ "totalAccounts": 6, "weakOrInsecure": 0,
  "backdoorCheck": "no weak admin/backdoor account detected", "findings": [] }
```
Login matrix (POST `/Trump/api/auth/login`):

| Account | Credential tried | HTTP | Expected |
|---|---|---|---|
| owner | new rotated pw | **200** | ✅ works |
| manager | new rotated pw | **200** | ✅ works |
| waiter | new rotated pw | **200** | ✅ works |
| kitchen | new rotated pw | **200** | ✅ works |
| **admin** | new rotated pw | **403** | ✅ blocked (suspended) |
| owner | **old** `123456789` | **401** | ✅ old creds dead |

---

## Verdict

| Criterion | Result |
|---|---|
| `weakOrInsecure = 0` | ✅ |
| admin backdoor resolved | ✅ disabled (suspended) + rotated; login 403 |
| Strong, unique, non-reused passwords | ✅ (generator + denylist) |
| Old credentials invalidated | ✅ old pw → 401; sessions invalidated |
| Staff can still log in | ✅ owner/manager/waiter/kitchen → 200 |

**B3 status: 🟢 CLOSED.** Follow-ups for 02B.2: distribute the new secrets via a password manager, consider per-user chosen passwords, and **enforce the weak-password denylist + a longer minimum at set-time** (today the 6-char rule alone would not have blocked `123456789`).
