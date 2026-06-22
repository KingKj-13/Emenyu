# Trump — Environment Variables

Trump reads config via `createConfig()` in `server/utils/helpers.js`. The repo-root
`.env` holds only `DATABASE_URL` (for Prisma); all `TRUMP_*` vars live in
`Sites/Trump/.env`. `node scripts/bootstrap-env.js` generates a starter file;
`node scripts/validate-env.js` checks it.

In **production** (`NODE_ENV=production`) the server refuses to start unless the
required secrets below are present and no seeded account uses an empty or
known-weak/demo password.

## Required in production
| Var | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection (root `.env`), e.g. `postgresql://user:pass@127.0.0.1:5432/emenyu` |
| `TRUMP_SESSION_SECRET` | ≥32 chars; signs session cookies. Generate: `openssl rand -base64 48` |
| `TRUMP_PUBLIC_ORIGIN` **or** `TRUMP_ALLOWED_ORIGINS` | Allowed CORS/Socket origin(s), https in prod |
| `TRUMP_OWNER_PASS`, `TRUMP_MANAGER_PASS`, `TRUMP_WAITER_PASS`, `TRUMP_KITCHEN_PASS` | Seed passwords for the default accounts (or set `TRUMP_DEFAULT_PASSWORD` for all) |
| `TRUMP_ADMIN_PASS` | Seed password for the `admin` (owner) account (falls back to `TRUMP_OWNER_PASS`) |

> Account passwords are used **only to seed an account the first time it is missing**.
> They are never re-applied on restart; change passwords via the admin UI thereafter.
> To rotate a seeded password on the server, set the env var **and** delete that user
> row (it re-seeds from env on next boot) — see [SECURITY.md](SECURITY.md).

## Runtime / networking
| Var | Default | Notes |
|---|---|---|
| `NODE_ENV` | `development` | set `production` on the server |
| `TRUMP_PORT` / `PORT` | `3012` | listen port |
| `TRUMP_HOST` / `HOST` | `0.0.0.0` | bind address |
| `TRUMP_PUBLIC_BASE_PATH` | `/Trump` | URL namespace |
| `TRUMP_RESTAURANT_ID` | `trump` | tenant id (single-tenant per process) |
| `TRUMP_BRAND_NAME` | `Trump` | display name (set the real restaurant name) |
| `TRUMP_TABLE_COUNT` | `30` | table count for the floor view |
| `TRUMP_APP_NAME` | `emenuy-trump` | log/app label |

## Security controls
| Var | Default | Notes |
|---|---|---|
| `TRUMP_SESSION_COOKIE_NAME` | `trump_session` | |
| `TRUMP_SESSION_TTL_HOURS` | `12` | session lifetime |
| `TRUMP_SESSION_SAMESITE` | `Lax` | `Lax`/`Strict`/`None` (`None` requires secure cookies) |
| `TRUMP_SECURE_COOKIES` | prod: on | forces `Secure` cookie flag |
| `TRUMP_TRUST_PROXY` | prod: on | trust X-Forwarded-* behind Nginx |
| `TRUMP_FORCE_HTTPS` | `false` | 308-redirect http→https |
| `TRUMP_HSTS_ENABLED` | prod: on | HSTS header |
| `TRUMP_RATE_LIMIT_WINDOW_MS` | `900000` | rate-limit window |
| `TRUMP_RATE_LIMIT_MAX` | prod `600` | general request cap/window |
| `TRUMP_AUTH_RATE_LIMIT_MAX` | `20` | login attempts/window |
| `TRUMP_BODY_LIMIT` / `TRUMP_URLENCODED_LIMIT` | `2mb` / `1mb` | request body caps |
| `TRUMP_UPLOAD_MAX_MB` | `25` | upload size cap |
| `TRUMP_UPLOAD_MIME_TYPES` / `TRUMP_UPLOAD_EXTENSIONS` | image/video set | upload allowlists |
| `TRUMP_ALLOW_INSECURE_PRODUCTION_ORIGIN` | `false` | allow http origin in prod (private test only) |

## Optional integrations
| Var | Purpose |
|---|---|
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_EMAIL` | Web-push (waiter/kitchen notifications). Generate: `npx web-push generate-vapid-keys` |
| `PEXELS_API_KEY` / `PIXABAY_API_KEY` | Optional stock-image enrichment for menu items (image search only — **not** AI/LLM) |
| `TRUMP_AUTH_POSTGRES_ENABLED` / `TRUMP_MENU_POSTGRES_ENABLED` / `TRUMP_ORDER_POSTGRES_ENABLED` | Toggle Postgres per subsystem (default on; JSON fallback otherwise) |
| `TRUMP_HEALTHCHECK_URL` | URL used by `scripts/healthcheck.js` |

## Removed in Phase 1 (no longer read)
- `TRUMP_LLM_PROVIDER`, `TRUMP_LLM_API_KEY`, `TRUMP_LLM_MODEL`, `TRUMP_LLM_TIMEOUT_MS` — the external (Anthropic) AI integration was removed; Trump uses local NLG only.
- `TRUMP_DEMO_PASSWORD` — the demo-account backdoor was removed.

## PM2 tuning (optional)
`PM2_MAX_MEMORY_RESTART`, `PM2_KILL_TIMEOUT_MS`, `PM2_LISTEN_TIMEOUT_MS`, `PM2_MIN_UPTIME`, `PM2_MAX_RESTARTS`.
</content>
