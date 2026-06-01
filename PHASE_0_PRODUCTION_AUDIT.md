# Emenu — Phase 0 Production Readiness Audit

**Date:** 2026-06-01
**Auditor role:** Senior SaaS CTO / Architect / Security / DevOps
**Scope:** Entire `d:\Projects\Emenyu` repo, with primary focus on the **Trump** site (the only production-grade codebase). Greek / Imli / AlPescatore are legacy reference sites.
**Method:** Static code review (read-only). **Not runtime-verified** — there are zero automated tests in the repo and the running DB was not exercised during this audit. "Works today" below means *implemented and wired in code*, not *proven at runtime*.

---

## 0. Headline Findings (read this first)

1. **There is no real "AI" on the customer path.** `server/services/aiService.js` (1,359 LOC) is 100% deterministic keyword/rule matching. It makes **no LLM call**. The only real model integration is `nlg/llmNlgProvider.js` (Anthropic Messages API), which is **opt-in**, **waiter-app-only**, and only *re-words* deterministic output. CLAUDE.md and the root `*.md` docs describing "aiService.js = GROQ API" are **stale and wrong**.
2. **`DEMO_MODE = true` is hardcoded into the production AI path.** `server/config/trumpDemo.js:13` injects **19 fictional dishes** (Tomahawk R1290, King & Queen Platter R1450, Springbok Carpaccio, etc. — none of which are guaranteed to exist on the real menu) as **top-priority** recommendations, pairings, chat replies, and "complimentary" event offers. A real restaurant would see invented menu items recommended to its guests.
3. **A permanent owner-level backdoor ships in every deploy.** The `admin` account (role = `owner`) plus `waiter` and `kitchen` are seeded with password **`123456789`** and **force-reset to that password on every server boot** (`helpers.js:152-236` + `accountService.js:132-145`). Production config validation does **not** cover them. This is a critical, unfixable-without-code-change vulnerability.
4. **Groq is not in the Trump codebase at all.** Every `groq` hit in `Sites/Trump` is a false positive inside base64 `integrity` hashes in `package-lock.json`. Real Groq usage exists **only** in `Sites/Greek/recommend.py` (Python chatbot). The Trump "uses Groq" references live only in stale root audit docs.
5. **It is single-tenant, not multi-tenant.** `restaurantId` is a column default (`"trump"`) on most models, but there is **no `Restaurant` table**, the `User` table has **no `restaurantId`**, and the whole process is pinned to one restaurant via env. "Multi-restaurant SaaS" is aspirational.
6. **Zero tests, single-process, dual-write persistence.** No test suite, PM2 `fork` single instance, in-memory Socket.IO (no Redis), and every order is written to **both** JSON files and Postgres with no reconciliation.

---

## 1. Current State Analysis

### 1.1 Frontend (React 19 + TS, Vite SPA)

**Completed / wired (code-verified):**
- Customer flow: `LandingPage`, `MenuPage` (item modal, pairing modal, filters), cart drawer + recommendations, `ReservationPage`, `LoginPage`.
- Staff flow: `AdminPage`, `KitchenPage`, `WaiterPage` + 9 waiter sub-screens (`StartShift`, `Menu`, `Floor`, `Order`, `CartRec`, `AICoach`, `Today`, `Leaderboard`, `ShiftReport`).
- Real-time cart sync, waiter call, chat panel via Socket.IO.
- Image/video resolution centralized in `lib/imageResolver.ts`.

**Partial / concern:**
- Waiter screens render **real API data**, but most of that data only exists because `seed-waiter-demo.js` fabricated it (4 fake waiters + random history). With a real (empty) DB, leaderboard / shift report / coach are blank until live orders accrue.
- `client/src/config/trumpDemoConfig.ts` + `lib/demoMedia.ts` mirror the server demo system on the client.
- Branding default is `"Aurum & Ember"` (`helpers.js:182`) — a demo brand, not the real restaurant.

**UI/UX issues:** No verified accessibility pass; no error/empty states audit performed; client build (`dist/`) is gitignored so prod correctness depends on a manual build step.

### 1.2 Backend (Node 18+, Express 5, modular MVC)

**Implemented APIs (code-verified):** auth (login/logout/me/accounts CRUD), menu, deals, kitchen, orders, ratings, reservations, uploads (multer), push (web-push/VAPID), analytics (4 endpoints), waiter API (performance/leaderboard/shift/floor/opportunity), AI (chat/recommend/pairing), demo-media manifest, health (`/healthz`, `/readyz`).
- **Architecture quality: genuinely good** for a single service — DI via `createConfig`, thin controllers, service layer, structured JSON logging with request IDs (`requestLogger.js`), graceful shutdown, helmet + CORS allowlist + dual rate-limiters (`middleware/security.js`), production config validation that refuses to boot without secrets (`helpers.js:54-138`).

**Missing / broken:**
- `node-cron` is `require`d (`server.js:340`) but **not declared in `package.json`** → nightly media-enrichment cron silently never runs (swallowed by `try/catch`).
- No Restaurant/tenant management API. No customer accounts. No payments. No order-confirmation/receipt pipeline beyond status moves.

**Scalability concerns:** single PM2 fork instance; in-memory Socket.IO (no `@socket.io/redis-adapter`); a 60s `setInterval` deal-window checker runs in-process (`server.js:356`) — duplicates/breaks under multiple instances.

### 1.3 Database (PostgreSQL + Prisma)

- **Schema quality: solid.** 18 well-indexed models, FK cascades, composite uniques, status-history + ratings + guest CRM + upsell-event tables.
- **Missing tables:** `Restaurant` (tenant), payments/transactions, audit log, customer/user-of-restaurant accounts.
- **Data-integrity risk:** **dual-write** — `fileService` writes orders/carts to JSON **and** Postgres (`fileService.js:242-248`, `177-183`). A partial failure diverges the two stores; reads prefer Postgres and silently fall back to JSON. No transaction spans both.
- **Multi-tenant readiness: low.** `restaurantId` default only; `User` has no `restaurantId`; no tenant isolation, no row-level security, no tenant in auth tokens.

### 1.4 Authentication & Authorization

- **Good:** PBKDF2-SHA256 (120k iterations) password hashing (`accountService.js:26-46`); HMAC-SHA256 signed stateless session cookies with `timingSafeEqual` (`helpers.js:367-399`); `HttpOnly`, `SameSite`, `Secure` (in prod) cookie flags; server-side session invalidation via `sessionInvalidBefore`; role hierarchy owner>manager>waiter>kitchen enforced in `requireRoles`/`requirePage`; auth-specific rate limit.
- **Critical:** the `admin`/`waiter`/`kitchen` demo accounts with password `123456789` reset every boot (see §0.3). Legacy plaintext fallback path remains (`postgresUser.password === password`, `accountService.js:221`).
- **Production readiness: blocked** purely by the demo-account backdoor. The crypto/session design itself is sound.
- Note: CLAUDE.md says sessions are "express-session backed by an in-memory map" — **incorrect**; they are HMAC cookie tokens validated against the DB.

### 1.5 AI Features

- **Customer chat / recommend / pairing:** fully deterministic (`aiService.js`). Reliable and offline, but it is **not** AI and it is **contaminated by DEMO_MODE** showcase injection.
- **Waiter NLG (`nlg/`):** real Anthropic API, but only rephrases template lines; circuit-breaker after 3 failures; **off unless** `TRUMP_LLM_PROVIDER=anthropic` + `TRUMP_LLM_API_KEY` are set (and these vars are **undocumented** in `.env.example`).
- **Reliability concerns:** showcase items may not map to the live menu; "complimentary Chocolate Lava Cake" is promised to guests by the event flow regardless of whether the restaurant offers it.

### 1.6 DevOps

- **Have:** PM2 ecosystem config, bootstrap/validate-env/healthcheck scripts, `/healthz` + `/readyz`, structured stdout logs + PM2 file logs, graceful shutdown, prod config gate.
- **Missing:** any CI/CD; any tests; centralized log aggregation; metrics/APM (Prometheus/Grafana); error tracking (Sentry); automated DB backups / PITR; disaster-recovery runbook; container/IaC; horizontal scaling story; secret manager (secrets are plain `.env`).

### 1.7 Security (summary — full findings in Report E)

- Strong middleware baseline; **but** hardcoded backdoor accounts (Critical), no CSP (`contentSecurityPolicy: false`, `security.js:71`), public unauthenticated `/api/demo-media` and public menu (by design), and dual-write/JSON files on disk holding order data.

---

# Report A — What Works Today (code-verified, not runtime-tested)

| Area | Working capability |
|---|---|
| Auth | Login/logout/session via signed cookie; PBKDF2 hashing; role-gated pages & APIs; account CRUD with role hierarchy; session invalidation; suspension |
| Menu | Postgres-backed menu load/save; categories/items/visibility; image/video resolution; admin editing |
| Orders | Create/list/move-to-history/delete; per-table active orders; dual JSON+Postgres write; status history |
| Cart | Real-time guest↔waiter cart sync over Socket.IO; admin overrides; table cart persistence |
| Kitchen | Kitchen board with order status transitions |
| Waiter app | Start shift, floor view, order screen, cart recs, AI coach (pairings), **real** per-waiter analytics/leaderboard/shift-report derived from history + UpsellEvent |
| Analytics | **Real** Prisma aggregates: summary, top items, per-table revenue, 24h distribution (manager/owner only) |
| Recommendations | Deterministic multi-signal engine (admin pairings, people-also-ordered, course completion, popularity) — works, but DEMO_MODE-biased |
| Reservations | Create/list reservations |
| Ratings | Order rating capture + analytics |
| Push | Web-push/VAPID subscription + send (if VAPID keys set) |
| Security | helmet, CORS allowlist, general + auth rate limits, compression, request-ID logging, prod config validation, graceful shutdown |
| Health | `/healthz` (liveness) + `/readyz` (storage + menu readiness) |
| AI wording | Optional Anthropic NLG enhancement for waiter lines, with template fallback + circuit breaker |

---

# Report B — Demo & Groq Components (to remove / recommended for deletion)

### B.1 Groq (status: effectively absent from Trump)

| Location | What | Action |
|---|---|---|
| `Sites/Trump/package-lock.json` (lines 663/1190/1709) | **False positives** — `groq` substring inside base64 `integrity` hashes | **No action** (do not edit hashes) |
| `FUTURE_MULTI_TENANT_PLAN.md`, `FULL_ARCHITECTURE_AUDIT.md`, `SYSTEM_FLOW_MAP.md`, `FRONTEND_BACKEND_RELATIONS.md`, `TRUMP_GREEK_COMPARISON.md`, `SERVER_RUNTIME_AUDIT.md` | Stale docs claiming "Trump uses GROQ API" | **Correct or delete** these claims — Trump uses deterministic logic + optional Anthropic NLG |
| `Sites/Greek/recommend.py` (`from groq import Groq`, `GROQ_API_KEY`, `call_groq`) | **Real** Groq dependency for the Greek site chatbot | **Decision required:** removing it disables Greek's chatbot. Recommend: remove only if Greek is being retired; otherwise document it |

> **Conclusion:** "Remove Groq completely" is, for the production (Trump) system, a documentation cleanup. The only functional Groq is the legacy Greek Python chatbot.

### B.2 Demo artifacts (Trump) — recommended for removal/gating

| File / symbol | What it does | Recommendation |
|---|---|---|
| `server/config/trumpDemo.js` (`DEMO_MODE=true`) | Injects 19 fictional showcase dishes + curated "journeys" + event freebies into AI recs/pairings/chat | **Remove** or hard-gate behind an env flag **defaulting to off**; strip all `demo.*` calls from `aiService.js` |
| `client/src/config/trumpDemoConfig.ts` | Client mirror of the above | Remove with the server side |
| `server/services/demoMediaService.js` + `GET /api/demo-media` (`server.js:263`) | Public manifest of demo media | Remove if demo media removed |
| `client/src/lib/demoMedia.ts` + `client/public/media/trump/` | Client demo media resolver + assets | Remove if not real restaurant media |
| `scripts/seed-waiter-demo.js` | Seeds 4 fake waiters (Demetri/Sophia/Marcus/Lena) + random order history into Postgres | **Remove from prod**, or keep strictly as a dev-only fixture; ensure never run against a live tenant DB |
| `scripts/apply-demo-polish.js` | One-time menu mutation (reclassify drinks, assign stock images) | Keep as dev tooling; never auto-run |
| Demo accounts: `admin`/`waiter`/`kitchen` = `123456789` (`helpers.js:152-236`), `TRUMP_DEMO_PASSWORD`, `demo:true` users, `LOCAL_ONLY_DEFAULT_PASSWORD` | Backdoor accounts re-seeded every boot | **Remove the force-refresh demo path** (also a Critical security item, Report E) |
| `brandName` default `"Aurum & Ember"` (`helpers.js:182`) | Demo brand | Replace with real restaurant brand via env, no demo default |

> ⚠️ **Removing DEMO_MODE changes runtime behavior** (recommendations/pairings/chat output). It is reversible via git but affects a deployed system. Execution should be a deliberate, confirmed step — see the closing question.

### B.3 Dead / unused

- `node-cron` usage with no dependency declared → dead cron (remove the block **or** add the dep + a real schedule).
- Legacy plaintext password comparison fallback in `accountService.js:221,235` (dead once all hashes set; remove to reduce risk).

---

# Report C — Production Blockers (must fix before a real restaurant)

| # | Blocker | Evidence | Why it blocks |
|---|---|---|---|
| C1 | Owner-level backdoor `admin`/`123456789`, reset every boot; `waiter`/`kitchen` too | `helpers.js:152-236`, `accountService.js:132-145` | Anyone can log in as owner; password change doesn't persist |
| C2 | DEMO_MODE injects fictional menu items into guest-facing recs/chat | `trumpDemo.js:13`, `aiService.js:339-435,452,1019` | Restaurant would advertise dishes it doesn't sell; promises free desserts |
| C3 | No automated tests at all | repo-wide (only `node_modules` match) | No regression safety for a payments-adjacent system |
| C4 | No payment capture / settlement | no payment model or route | Restaurant cannot actually charge guests |
| C5 | Dual-write JSON+Postgres with no reconciliation | `fileService.js:242-355` | Order/revenue data can silently diverge |
| C6 | No automated DB backup / PITR / DR runbook | absent | Order & revenue loss risk |
| C7 | Branding & menu showcase are demo defaults | `helpers.js:182`, `trumpDemo.js` | Wrong restaurant identity out of the box |
| C8 | LLM env vars undocumented; cron dep missing | `.env.example` (no `TRUMP_LLM_*`), `server.js:340` | Misconfiguration & dead features |
| C9 | Client `dist/` gitignored, built manually | CLAUDE.md, `.gitignore` | Easy to deploy stale UI |

---

# Report D — Technical Debt

- **Documentation drift:** CLAUDE.md and 6 root `*.md` audits describe an architecture (Groq AI, express-session, in-memory map) that no longer matches code. High risk of wrong decisions.
- **Dual persistence model:** JSON-file fallback shadows Postgres everywhere; doubles write paths, complicates reasoning, risks divergence. Should be Postgres-only with a one-time import.
- **Monolithic deterministic AI:** `aiService.js` is 1,359 LOC mixing menu parsing, scoring, demo curation, and reply formatting. Hard to test/extend; demo logic is interleaved with core logic.
- **Single-tenant assumptions baked in:** `RESTAURANT_ID` global, hardcoded `'trump'` defaults across services and analytics; no tenant context object.
- **No shared types between client/server** for API payloads (TS client, JS server) → drift risk.
- **Legacy sites** (Greek/Imli/AlPescatore) are separate monoliths with their own stacks (Python chatbots, JSON/Mongo) — maintenance burden; not on the Prisma/Postgres path.
- **Silent catch-all error handling** in analytics/waiter services returns zeros/empty on any DB error (`analyticsController.js:47` etc.) — masks outages as "no data."
- **No CSP**, no shared-secret rotation strategy, secrets in plain `.env`.

---

# Report E — Security Audit

### Critical
- **E-C1 Hardcoded backdoor accounts.** `admin` (owner), `waiter`, `kitchen` seeded with `123456789` and force-reset every boot; not covered by prod validation. → Remove demo-refresh path; require env-provided hashes; add prod check that rejects known-weak/demo passwords.

### High
- **E-H1 Plaintext password fallback** still present (`accountService.js:221,235`). → Remove once migration complete.
- **E-H2 Demo/fabricated data reachable in prod** (`/api/demo-media` public; DEMO_MODE on). → Gate/remove.
- **E-H3 No automated tests** → unverified auth/permission behavior; high blast radius. → Add auth/RBAC test suite.

### Medium
- **E-M1 No Content-Security-Policy** (`security.js:71` `contentSecurityPolicy:false`). → Add a strict CSP.
- **E-M2 Order/financial data stored as world-readable JSON files** on disk in addition to DB. → Drop JSON store or restrict perms.
- **E-M3 `sessionSecret` falls back to shared/`STAGING_PASS`** when not in production; long-lived 12h tokens with no rotation. → Enforce strong secret in all envs.
- **E-M4 Secrets in plain `.env`**, no secret manager. → Use a vault/secret store in prod.
- **E-M5 CORS allows credentials with an allowlist that includes `publicOrigin`**; misconfig risk if origin set loosely. → Validate origins at deploy.

### Low
- **E-L1 Verbose stack traces** logged (acceptable) but ensure logs are access-controlled.
- **E-L2 No account lockout** beyond rate limiting (20/window).
- **E-L3 `helmet` frameguard sameorigin only**; confirm no clickjacking surface for admin pages.

---

# Report F — Production Readiness Score (0–10)

| Area | Score | Rationale |
|---|---:|---|
| Frontend | 6 | Broad, wired SPA; but demo branding/data, no tests, manual build, no a11y/empty-state pass |
| Backend | 6 | Clean modular service; solid middleware; but dead cron, single-tenant, dual-write |
| Database | 6 | Strong schema/indexes; but no tenant/payment/audit tables, dual-write integrity risk |
| Security | 3 | Good crypto/session/middleware **undone by** a hardcoded owner backdoor + no CSP/tests |
| DevOps | 3 | PM2 + health + structured logs; but no CI/tests/backups/monitoring/DR/IaC |
| Scalability | 2 | Single fork process, in-memory sockets, per-restaurant process model |
| Multi-tenancy | 1 | Column default only; no tenant model/isolation/auth scoping |
| AI | 4 | Reliable deterministic logic + real optional NLG; but "AI" is mostly rules + demo injection |
| **Overall** | **3.5** | A well-built single-restaurant demo, **not** a deployable multi-tenant SaaS yet |

---

# Report G — Missing Features (before first paying restaurant)

**Must-have**
1. Remove demo/backdoor accounts; real account provisioning + forced password change.
2. Turn off / remove DEMO_MODE; recommendations from real menu only.
3. Payments (card/terminal integration) + receipts + settlement reconciliation.
4. Real restaurant branding/menu onboarding (no demo defaults).
5. Automated DB backups + restore runbook.
6. Test suite (auth/RBAC, orders, analytics) + CI gate.
7. Single source of truth for orders (drop dual-write or make it transactional/reconciled).
8. Monitoring + error tracking + alerting.

**Should-have**
9. Audit log of staff actions (account changes, comps, deletions).
10. Documented LLM config (`TRUMP_LLM_*`) + cost controls if NLG enabled.
11. Empty/error states across waiter & admin screens for a fresh DB.
12. Data export (orders/analytics) for the owner.

**Nice-to-have**
13. Reservation availability/table-map logic; SMS/email confirmations.
14. Loyalty/CRM activation (Guest model exists but underused).

---

# Report H — Recommended Development Roadmap

> Effort estimates assume 1–2 senior engineers. Phases are gated by the codebase's real state, not feature wishlists.

### Phase 1 — First Pilot Restaurant (single tenant)
- **Features:** remove backdoor accounts + DEMO_MODE; real onboarding (brand, menu, staff); payments MVP; receipts; backups; basic monitoring/error tracking; auth/RBAC/order test suite + CI; fix `node-cron` dep; document `.env` fully.
- **Infra:** managed Postgres + automated backups/PITR; PM2 on a hardened VM or a container; HTTPS/HSTS; secret manager.
- **Security:** close E-C1/E-H1/E-H2/E-M1; pen-test the auth surface.
- **Effort:** 4–6 weeks. **Risks:** dual-write divergence during pilot; payment integration scope.

### Phase 2 — 10 Restaurants
- **Features:** real multi-tenancy — `Restaurant` model, `restaurantId` on `User`, tenant context in auth tokens, tenant-scoped queries everywhere, tenant onboarding/admin; per-tenant config (brand/menu/LLM).
- **Infra:** one shared service (not one process per restaurant); Socket.IO Redis adapter; container orchestration; staging env; CI/CD pipeline.
- **Security:** tenant isolation tests (no cross-tenant data leakage); row-level checks; audit log.
- **Effort:** 6–10 weeks. **Risks:** retrofitting tenancy onto single-tenant assumptions is invasive; data migration.

### Phase 3 — 50 Restaurants
- **Features:** self-serve onboarding/billing (Stripe Billing), plan limits, usage metering; tenant-level analytics; role/permission refinements.
- **Infra:** horizontal scaling (stateless app + Redis sessions/sockets), connection pooling (PgBouncer), CDN for media, read replicas; centralized logging + dashboards + alerting; load testing.
- **Security:** SOC2-track controls, secret rotation, dependency scanning, WAF.
- **Effort:** 8–12 weeks. **Risks:** Postgres write contention; media storage costs.

### Phase 4 — 100 Restaurants
- **Features:** tenant SLAs, advanced reporting/exports, support tooling, feature flags per tenant.
- **Infra:** autoscaling, multi-AZ HA Postgres + failover, blue/green deploys, queue for async work (order events, push, enrichment); DR drills.
- **Security:** formal incident response, periodic pen-tests, RBAC audit.
- **Effort:** 8–12 weeks. **Risks:** noisy-neighbor isolation; on-call maturity.

### Phase 5 — 1,000 Restaurants
- **Features:** regionalization, marketplace/integrations (POS, delivery), data warehouse + BI, self-serve everything.
- **Infra:** sharding or per-region clusters; event-driven architecture; data platform (CDC → warehouse); cost/perf optimization; multi-region.
- **Security:** compliance certifications (SOC2/ISO/PCI scope for payments), continuous security testing.
- **Effort:** ongoing (quarters). **Risks:** the current single-process, dual-write, single-tenant core **will not reach this scale without the Phase 2–3 re-architecture** — attempting to scale process-per-restaurant fails well before 1,000.

---

## Appendix — Evidence index (key files)
- AI engine (deterministic, demo-injected): `server/services/aiService.js`
- Demo config: `server/config/trumpDemo.js`, `client/src/config/trumpDemoConfig.ts`
- Auth/config/backdoor: `server/utils/helpers.js`, `server/services/accountService.js`
- Real NLG (Anthropic): `server/services/nlg/llmNlgProvider.js`, `nlgService.js`
- Persistence (dual-write): `server/services/fileService.js`, `prismaOrderService.js`, `prismaMenuService.js`
- Analytics (real): `server/controllers/analyticsController.js`, `server/services/waiterAnalyticsService.js`
- Security middleware: `server/middleware/security.js`, `requestLogger.js`
- Schema: `prisma/schema.prisma`
- DevOps: `ecosystem.config.js`, `.env.example`, `scripts/`
- Real Groq (legacy): `Sites/Greek/recommend.py`
</content>
</invoke>
