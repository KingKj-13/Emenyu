# CREDENTIAL-AUDIT.md — Phase 02A Step 5

**Date:** 2026-06-24. **Method:** ran the repo's **read-only** credential auditor (`scripts/audit-accounts.js`, which never writes) against the **live production database** over SSH, plus inspected PostgreSQL network/auth exposure. **Answer: 🔴 CRITICAL — 5 of 6 live accounts (including the `admin` owner backdoor) use the password `123456789`, on an internet-facing admin console. Blocker B3 is OPEN and is the single most urgent production issue found in Phase 02A.**

---

## 1. Live credential audit — 5 of 6 accounts are weak

```
$ cd /var/www/mysite/Emenyu/Trump && node scripts/audit-accounts.js --json
{
  "totalAccounts": 6,
  "postgresAvailable": true,
  "weakOrInsecure": 5,
  "backdoorCheck": "WEAK admin account detected — rotate immediately",
  "findings": [
    { "username": "admin",   "role": "owner",   "status": "active", "issues": ["weak/known password (\"123456789\")"] },
    { "username": "kitchen", "role": "kitchen", "status": "active", "issues": ["weak/known password (\"123456789\")"] },
    { "username": "manager", "role": "manager", "status": "active", "issues": ["weak/known password (\"123456789\")"] },
    { "username": "owner",   "role": "owner",   "status": "active", "issues": ["weak/known password (\"123456789\")"] },
    { "username": "waiter",  "role": "waiter",  "status": "active", "issues": ["weak/known password (\"123456789\")"] }
  ]
}
```
**Conclusions:**
- **Every privileged role is compromised by default:** two **owners** (`admin`, `owner`), a **manager**, a **waiter**, and **kitchen** — all with `123456789`. Only 1 of 6 accounts is clean.
- The **`admin` backdoor flagged in Phase 00 is live in production** (`admin` / `123456789`, role **owner**).
- These are **PostgreSQL-backed** accounts (`source: postgres`, `postgresAvailable: true`) — i.e., the authoritative store, not a stale JSON fallback.

## 2. Why this is critical — the console is on the public internet

From TLS-VERIFICATION: `https://emenyu.com/Trump/Admin` is **live and reachable** (returns 302 → login). Anyone on the internet can open the admin login and sign in as **owner** with **`admin` / `123456789`**, gaining full menu/account/order control. There is **no IP allowlist, no MFA**. This is a direct, trivially exploitable takeover path. **Treat as an active incident-class exposure.**

## 3. Password policy & session secrets

- **Policy:** 6-char minimum, PBKDF2 120k iterations (per Phase 00 AUTH audit). `123456789` (9 chars) **passes** the length rule — the policy does not stop weak/known passwords. A denylist (`weakPasswords.js`, 21 entries) exists and the **auditor** catches these, but **enforcement at set-time is the gap** (or the accounts predate it / were re-seeded weak).
- **Session secret:** the app boots in `production` and `validateProductionConfig` refuses to start without a strong `TRUMP_SESSION_SECRET`, so the HMAC session secret is presumed strong (the app is up). Not independently re-verified in this step (would require reading the prod `.env`); recommend confirming it is **not** a known/example value during 02B rotation.
- **Remediation tooling exists but was not run as a fix here (audit-only phase):** `npm run auth:rotate` (`rotate-weak-accounts.js`) + per-account `PATCH /Trump/api/auth/accounts/:username`. Production startup "refuses to seed weak passwords," yet 5 weak accounts persist — meaning they were **set/rotated weak after seeding, or migrated in**, and have **never been rotated on prod**.

## 4. PostgreSQL exposure (compounding finding — N1, CRITICAL)

```
$ sudo -u postgres psql -tAc 'show listen_addresses;'   → *
$ pg_hba.conf (host rules):
host all all 127.0.0.1/32 scram-sha-256
host all all ::1/128      scram-sha-256
host all all 0.0.0.0/0    scram-sha-256      ← accepts the ENTIRE internet
$ ss -tlnp → 0.0.0.0:5432 postgres   (TCP connect from a remote host succeeds)
```
**Conclusion:** PostgreSQL **listens on all interfaces and `pg_hba` permits password auth from `0.0.0.0/0`** — the database is **directly reachable from the public internet**, protected only by the `postgres`/role passwords (scram-sha-256). This dramatically widens the attack surface (offline-free online brute force, no network barrier). **This is a CRITICAL finding independent of B3** and must be closed in 02B (bind to localhost / restrict `pg_hba` to the app host / DO cloud firewall on 5432). The DB role passwords' strength was **not** audited here (only app accounts) and should be checked.

---

## Verdict

| Check | Result | Evidence |
|---|---|---|
| Weak/default app accounts | 🔴 **5 of 6** (`admin`,`owner`,`manager`,`waiter`,`kitchen` = `123456789`) | §1 |
| `admin` backdoor present | 🔴 **YES, role owner, active** | §1 |
| Console internet-reachable | 🔴 **YES** (`https://emenyu.com/Trump/Admin`) | §2 |
| Password policy stops weak | ⚠️ no (6-char min; denylist not enforced at set-time) | §3 |
| Prod creds rotated | 🔴 **NO — never rotated on prod** | §1,§3 |
| Postgres network exposure | 🔴 **internet-facing (`0.0.0.0/0`)** | §4 |

**BLOCKER B3 (credentials) status: 🔴 OPEN — CRITICAL / highest priority.** Recommended **immediate** action ahead of the rest of Phase 02B: rotate all 6 accounts to strong unique secrets (`auth:rotate` + set strong env values, restart), **delete or rename the `admin` backdoor**, and **firewall/limit PostgreSQL to localhost**. Re-run `audit-accounts.js` until `weakOrInsecure: 0`.
