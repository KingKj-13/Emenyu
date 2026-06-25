# SYSTEM-DIAGNOSTICS.md — Phase 09 (FRP1) Step 6

**Tool:** `scripts/diagnostics.js` · **alias:** `npm run diagnostics` · **Status: ✅ built + validated.**
**Purpose:** one read-only command that reports the facts needed to troubleshoot a Trump install — version, environment, DB, connected services. Reduces time-to-diagnose (Rule 3). Safe to run anytime.

---

## Usage
```bash
npm run diagnostics              # human report
node scripts/diagnostics.js --json   # machine-readable (for support tickets / CI)
```

## What it reports
| Group | Fields |
|---|---|
| **build** | app name, app version, **git SHA + branch + tag**, client build date, environment |
| **runtime** | **Node version**, platform, **@prisma/client**, socket.io, express versions |
| **config** | base path, restaurantId, port, host, **rate-limit bypass state** (must be off) |
| **database** | reachable, **PostgreSQL version**, **client-models-present (R1 canary)**, masked URL |
| **services** | live `/healthz`, `/readyz`, **menu cache headers**, pm2 presence |

## Validation done this phase (real local run)
```
=== Trump System Diagnostics ===
-- build --   version 1.0.0 · git 12a3940 (feat/chatbot-reco-rework, tag trump-v1.0-rc1)
              client build 2026-06-25T05:41Z · environment development
-- runtime -- node v22.17.1 · @prisma/client 6.19.3 · socket.io 4.8.3 · express 5.1.0
-- config --  publicBasePath /Trump · restaurantId trump · port 3099 · rateLimitBypass off
-- database -- reachable true · PostgreSQL 18.4 · client models OK true
-- services -- health 200 · ready 200 · menuCache 200 cache-control=public, max-age=30 gzip
```

## When to run it
- **First line of any support ticket** — capture `--json` output so support sees versions/SHA/env at a glance.
- **After a deploy** — confirm the git SHA/tag is what you intended and the **R1 canary** ("client models OK") is `true`.
- **Troubleshooting "it behaves oddly"** — check the bypass state (must be off), DB version, build date.

## Why these fields
- **git SHA + tag** pin exactly what's running (vs. what you think is running).
- **client-models-present** is the R1 canary — `false` means the Prisma client is in the wrong `node_modules` (the deploy gotcha) → regenerate ([../operations/DEPLOYMENT-RUNBOOK.md](../operations/DEPLOYMENT-RUNBOOK.md)).
- **rate-limit bypass state** — a fast way to confirm the load-test bypass isn't accidentally on in prod.

## Safety
Read-only; no writes; masks DB credentials in output. Safe in production.
