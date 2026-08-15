# Emenyu

Digital-menu & ordering platform. **Trump** is the only active restaurant — a
production-grade site (React 19 SPA + modular Node/Express + PostgreSQL/Prisma +
Socket.IO). Three legacy reference sites (Greek, Imli, AlPescatore — monolithic
Express + vanilla JS) were retired 2026-07-05; see `docs/project-progress/` for
the retirement report.

> Trump runs with **zero external AI providers** — recommendations and chat are
> fully local and deterministic. See [docs/AI.md](docs/AI.md).

## Repository layout

```
Sites/Trump/        Production site (only active restaurant)
  server/           Express app (controllers / routes / services / middleware)
  client/           React + TypeScript SPA (Vite)  → build output in client/dist (gitignored)
  Images/ Video/    Static menu media
prisma/             Shared Prisma schema + migrations (Postgres)
docs/               Living documentation (this set)
docs/archive/       Historical point-in-time reports (not maintained)
```

## Quick start (Trump, local dev)

```bash
# 1. Database (Postgres) — set DATABASE_URL in the repo-root .env, then:
npx prisma migrate deploy --schema prisma/schema.prisma
npx prisma generate        --schema prisma/schema.prisma

# 2. Server env (first run generates secrets)
cd Sites/Trump && node scripts/bootstrap-env.js   # writes Sites/Trump/.env

# 3. Backend
cd Sites/Trump && node server.js                  # http://localhost:3012/Trump

# 4. Frontend (separate terminal, dev server with HMR)
cd Sites/Trump/client && npm run dev
# production build:  npm run build   → client/dist/  (required before deploy)
```

## Documentation

| Doc | What |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | How Trump is built (request flow, services, persistence, realtime, auth) |
| [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md) | Every environment variable |
| [docs/SECURITY.md](docs/SECURITY.md) | Security posture, controls, and open risks |
| [docs/AI.md](docs/AI.md) | The local, deterministic recommendation/chat engine |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Deploy / redeploy runbook (PM2 + Nginx) |
| [docs/DATABASE.md](docs/DATABASE.md) | PostgreSQL + Prisma setup and migrations |
| [docs/BACKUP_AND_DR.md](docs/BACKUP_AND_DR.md) | Backup, restore, rollback |
| [CLAUDE.md](CLAUDE.md) | Guidance for AI coding agents working in this repo |

Production-readiness audits live at the repo root (`PHASE_0_*`, `TRUMP_AI_DEPENDENCY_AUDIT.md`).
</content>
