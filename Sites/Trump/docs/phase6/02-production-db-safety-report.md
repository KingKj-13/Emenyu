# Step 2 — Production Database Safety Report

**Audit only — production was not connected to or modified.** Date: 2026-06-07. Scope: `Sites/Trump`
(+ root `.env`/`prisma`, which the Trump server depends on). Credential **values are not printed**; only
their location and strength are characterised.

## Finding summary

| # | Finding | Severity |
|---|---|---|
| F1 | `DATABASE_URL` points at a **production** Postgres on a **public IP** (`134.122.99.78:5432/emenyu`) | 🔴 High |
| F2 | The production DB password is **weak** (9 chars, dictionary+numeric pattern) | 🔴 High |
| F3 | **No guard** on `prisma migrate deploy`, `reco:seed --apply`, `bundles:seed --apply` → a workstation run hits **production** | 🔴 High |
| F4 | Staff account passwords + session secret are **strong** (32 / 64 chars) | 🟢 OK |
| F5 | `reco:verify:live` is correctly **guarded** (`--confirm`, isolated `verify-suite` id, auto-cleanup) | 🟢 OK |

## Where the production DB is referenced

| Location | Reference | Effect |
|---|---|---|
| root `/.env` | `DATABASE_URL=postgresql://<user>:<weak-pass>@134.122.99.78:5432/emenyu` | the single source of the connection string |
| `prisma/schema.prisma` | `datasource db { url = env("DATABASE_URL") }` | Prisma CLI (`migrate`, `generate`, `db`) uses it |
| `prisma.config.ts` | present | Prisma config loader |
| `scripts/seed-chef-recommendations.js` | `dotenv.config(root/.env)` then `Sites/Trump/.env` | `--apply` writes via `DATABASE_URL` |
| `scripts/seed-bundles.js` | same env precedence | `--apply` writes via `DATABASE_URL` |
| `server/services/*` (prisma clients) | `new PrismaClient()` → `DATABASE_URL` | the running server connects to it |

**Env precedence:** scripts load `root/.env` first, then `Sites/Trump/.env`. `dotenv` does not override
already-set keys, so **`DATABASE_URL` from `root/.env` wins** — i.e. the production string.

## Credential strength (characterised, not shown)

| Secret | Strength |
|---|---|
| `DATABASE_URL` password | **len=9, WEAK pattern** 🔴 |
| `TRUMP_OWNER_PASS` / `ADMIN` / `MANAGER` / `WAITER` | len=32, strong 🟢 |
| `TRUMP_SESSION_SECRET` | len=64, strong 🟢 |

(The strong account/session secrets confirm Phase 1's local rotation. The **DB password** is the
outstanding weak credential.)

## Can local development accidentally modify production?

**Yes — today it can.** From this workstation:

- `npx prisma migrate deploy` → **applies migrations to production**.
- `npm run reco:seed -- --apply` / `npm run bundles:seed -- --apply` → **writes seed rows to production**.
- Starting the server (`node server.js`) → **connects to production** and reads/writes live data.

Only `reco:verify:live` is safe (it refuses without `--confirm`, writes only an isolated `verify-suite`
restaurantId, and deletes its rows).

## Staging / Dev database plan (recommended)

> Documentation/plan only — **no changes made to production or scripts.**

1. **Provision a dedicated non-production PostgreSQL** for rehearsals/dev:
   - Not on a public IP; firewalled to the developer/CI only; strong credentials; a distinct DB name
     (e.g. `emenyu_staging`).
2. **Never run write commands against the prod URL from a workstation.** Run migrations/seeds with an
   explicit dev connection string, e.g.:
   ```bash
   DATABASE_URL="postgresql://dev:<strong>@<dev-host>:5432/emenyu_staging" npx prisma migrate deploy --schema prisma/schema.prisma
   ```
   or keep the dev string in a git-ignored `.env.staging` used only for rehearsals.
3. **Add a write-guard (recommended pre-launch hardening, not yet implemented):** a small wrapper for the
   seed scripts / a `predeploy` check that refuses to run when `DATABASE_URL` host matches the known prod
   host unless `--prod-confirm` is passed (mirrors the `reco:verify:live` guard).
4. **Production hardening (separate from this workstation):**
   - **Rotate the prod DB password** to a strong value (F2).
   - **Restrict network access** to the production DB (remove public-internet exposure; allow only the app
     server) (F1).
   - Verify automated backups exist before any `migrate deploy` (see `docs/BACKUP_AND_DR.md`).

## Impact on Step 3–5

Steps 3 (deployment rehearsal), 4 (smoke test), and 5 (rollback) require a **running app + a real
PostgreSQL**. There is **no local PostgreSQL** on this machine, Docker has been removed (Step 1), and the
only configured database is **production (off-limits)**. These steps therefore need a **separately
provisioned non-production database** before they can be *executed*; the parts that need no DB are executed
in Step 3 regardless. See the Step 3 report for exactly what ran vs. what is blocked pending a dev DB.
