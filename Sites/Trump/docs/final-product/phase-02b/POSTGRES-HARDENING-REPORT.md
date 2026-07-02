# POSTGRES-HARDENING-REPORT.md — Phase 02B.1 Step 3

**Date:** 2026-06-24. **Finding:** N1 — PostgreSQL 16 was listening on `0.0.0.0:5432` with `pg_hba` permitting `host all all 0.0.0.0/0`, i.e. reachable from the public internet. **Result: 🟢 CLOSED — Postgres now listens on localhost only; external `:5432` is refused; Trump still functions.**

---

## 1. Pre-change access path (read-only recon)

```
$ sudo -u postgres psql -tAc 'show listen_addresses;'   → *
$ pg_hba.conf:  host all all 0.0.0.0/0 scram-sha-256     ← entire internet, password-only
$ ss -tlnp | grep 5432  → 0.0.0.0:5432  (and [::]:5432)
$ pg_stat_activity → 16 app connections from client_addr 134.122.99.78   ← app used the PUBLIC IP
```
**Key constraint discovered:** the Trump app's `DATABASE_URL` pointed at the **public IP** (`@134.122.99.78:5432`), so the app reached its own DB over the public interface. Restricting `listen_addresses` **before** moving the app to localhost would have taken Trump down. Also confirmed: **only the `emenyu` DB has client connections** — the other restaurants (Greek/imli/AlPescatore) do **not** use PostgreSQL — so locking it down is Trump-only and safe for co-tenants.

## 2. Prerequisite — app moved to localhost first

Done in Step 4 (NETWORK-HARDENING-REPORT): `DATABASE_URL` host `134.122.99.78` → `127.0.0.1`, app reloaded, connections confirmed coming from `127.0.0.1` **before** this step.

## 3. Changes applied

**`/etc/postgresql/16/main/postgresql.conf`:**
```
- listen_addresses = '*'
+ listen_addresses = 'localhost'
```
**`/etc/postgresql/16/main/pg_hba.conf`:** the broad rule was commented out (kept localhost rules):
```
  host all all 127.0.0.1/32 scram-sha-256        (kept)
  host all all ::1/128      scram-sha-256        (kept)
- host all all 0.0.0.0/0    scram-sha-256
+ #PHASE02B1-DISABLED host all all 0.0.0.0/0 scram-sha-256
```
Restart (required for `listen_addresses`):
```
$ systemctl restart postgresql@16-main   → active
```

## 4. After — verification

```
$ ss -tlnp | grep 5432
LISTEN 127.0.0.1:5432  postgres(pid 1748865)
LISTEN [::1]:5432      postgres
                                         ← 0.0.0.0 GONE
$ sudo -u postgres psql -tAc 'show listen_addresses;'   → localhost
```
**External (from an off-box machine):**
```
TCP connect 134.122.99.78:5432  → REFUSED (was OPEN)
```
**App still functional (localhost path):**
```
$ curl http://127.0.0.1:3012/readyz → {"status":"ready","menuSections":24}   (readyz performs a real DB-backed menu load)
$ curl https://emenyu.com/Trump/api/menu → HTTP 200
$ pg_stat_activity → connections only from 127.0.0.1 + local socket
```

---

## Verdict

| Check | Before | After |
|---|---|---|
| `listen_addresses` | `*` | `localhost` |
| Listener | `0.0.0.0:5432` | `127.0.0.1` + `[::1]` only |
| `pg_hba 0.0.0.0/0` | present | commented out |
| External `:5432` | reachable | **REFUSED** |
| Trump DB access | via public IP | via `127.0.0.1`, healthy |

**N1 status: 🟢 CLOSED.** Defense-in-depth (`listen_addresses` **and** `pg_hba`) means even if one reverts, the other still restricts to localhost.

**Operational note:** remote DB administration now requires an SSH tunnel, e.g. `ssh -L 5432:localhost:5432 root@134.122.99.78` then connect to `localhost:5432`. (Your workstation's root `.env` `DATABASE_URL=…@134.122.99.78:5432` will no longer connect remotely — by design; local dev uses `.env.local`.) Follow-ups for 02B.2: audit the `postgres`/role passwords themselves, and add a DO cloud firewall on 5432 as an extra layer.
