# AUDIT-API.md — Phase 00 API Audit

**Scope:** all HTTP routes mounted by `server/server.js` + `server/routes/*`. **Date:** 2026-06-24.

> **Path aliases:** every route below is registered three times — `/<path>`, `/Trump/<path>`, `/trump/<path>`. Only the canonical form is shown.
> **Auth legend:** `Public` = no auth; `Admin` = `requireRoles(['owner','manager'])`; `Waiter+` = `['owner','manager','waiter']`; `Kitchen+` = `['owner','manager','kitchen']`; `Staff+` = `['owner','manager','waiter','kitchen']`; `Page` = `requirePage` (redirects to login instead of 401).

---

## 1. Auth model recap

Authorization is centralised in `createRoleAuth` (`utils/helpers.js`). Two middlewares:
- `requireRoles(roles)` → 401 (no user) / 403 (wrong role) JSON.
- `requirePage(roles)` → redirect to `/Trump/login` (no user) or role-home (wrong role).

User identity resolved from the **signed session cookie** OR **HTTP Basic** header (`getRequestUser`). Customer (guest) endpoints have **no** guard.

---

## 2. Endpoint matrix

### Auth & accounts (`server/server.js`)
| Method | Path | Auth | Owner | Mgr | Waiter | Kitchen | Customer |
|---|---|---|---|---|---|---|---|
| POST | `/api/auth/login` | Public | ✓ | ✓ | ✓ | ✓ | ✓ |
| POST | `/api/auth/logout` | Public | ✓ | ✓ | ✓ | ✓ | ✓ |
| GET | `/api/auth/me` | Public | ✓ | ✓ | ✓ | ✓ | ✓ |
| GET | `/api/auth/accounts` | Admin | ✓ | ✓ | – | – | – |
| POST | `/api/auth/accounts` | Admin | ✓ | ✓ | – | – | – |
| PATCH | `/api/auth/accounts/:username` | Admin | ✓ | ✓ | – | – | – |

> Note: manager can create/manage **waiter/kitchen** only (enforced in `accountService.canManageRole`); owners are never listed/editable via this route.

### Pages (HTML/SPA, `requirePage`)
| Method | Path | Auth | Serves |
|---|---|---|---|
| GET | `/admin.html` | Page Admin | **vanilla admin.html** (live duplicate) |
| GET | `/waiter.html` | Page Waiter+ | SPA index (waiter.html fallback) |
| GET | `/owner.html` | Page Owner | 302 → `/Trump/Owner` |
| GET | `/admin` | Page Admin | admin page |
| GET | `/waiter` | Page Waiter+ | waiter page |
| GET | `/kitchen` | Page Kitchen+ | kitchen page |

### Menu (`menuRoutes.js`)
| Method | Path | Auth |
|---|---|---|
| GET | `/api/menu` | **Public** |
| POST | `/api/menu` | Admin |
| GET | `/api/admin/items` | Admin |
| POST | `/api/admin/items` | Admin |
| GET | `/api/admin/categories` | Admin |
| POST | `/api/admin/items/bulk` | Admin |
| PATCH | `/api/admin/items/:id/availability` | Admin |
| PATCH | `/api/admin/items/:id/media` | Admin |
| DELETE | `/api/admin/items/:id` | Admin |
| GET/POST | `/api/recommendations` | Admin |
| GET | `/api/admin/media-status` | Admin |
| POST | `/api/admin/media-enrich`, `/media-retry` | Admin |
| GET/POST | `/api/admin/chef-recommendations` | Admin |
| PATCH/DELETE | `/api/admin/chef-recommendations/:id` | Admin |

### Orders & AI (`orderRoutes.js`)
| Method | Path | Auth |
|---|---|---|
| GET | `/api/config` | **Public** |
| POST | `/api/chat` | **Public** (chat rate-limit) |
| POST | `/api/ai-pairing` | **Public** |
| POST | `/api/recommend` | **Public** |
| POST | `/api/waiter/cart-recommendations` | Waiter+ |
| POST | `/api/waiter/ordered-together` | Waiter+ |
| GET | `/api/chat-history` | Admin |
| POST | `/submit_order` | **Public** (public-write rate-limit) |
| POST | `/api/waiter/add-items` | Waiter+ |
| POST | `/api/waiter/...` (order actions) | Waiter+ |
| GET | `/orders`, `/history` | Admin |
| POST | `/complete`, `/incomplete` | Admin |
| DELETE | `/delete/:type/:file` | Admin |
| GET | `/`, `/Trump`, `/:tableId` | **Public** (landing/menu SPA) |

### Kitchen (`kitchenRoutes.js`)
| Method | Path | Auth |
|---|---|---|
| GET | `/api/kitchen/orders` | Kitchen+ |
| POST | `/api/kitchen/orders/:id/status` | Kitchen+ |

### Waiter API (`waiterApiRoutes.js`) — all Waiter+ unless noted
| Method | Path | Auth |
|---|---|---|
| GET | `/api/floor` | Waiter+ |
| GET | `/api/waiter/table/:tableId/intel` | Waiter+ |
| POST | `/api/waiter/coach`, `/api/sommelier`, `/api/ask`, `/api/waiter/recovery`, `/api/upsell-event` | Waiter+ |
| GET/POST | `/api/waiter/tasks` | Waiter+ |
| POST | `/api/waiter/tasks/:id/ack`, `/resolve` | Waiter+ |
| GET | `/api/waiter/chat-center` | Waiter+ |
| POST | `/api/waiter/chat-analysis` | Waiter+ |
| POST | `/api/waiter/birthday-request` | Waiter+ |
| POST | `/api/waiter/birthday-approval/:id` | **Admin** (owner/manager) |
| GET | `/api/waiter/me/performance`, `/me/shift-report`, `/leaderboard` | Waiter+ |
| GET/POST | `/api/guests`, GET `/api/guests/:id` | Waiter+ |
| POST | `/api/waiter/table/:tableId/seat-guest`, `/covers` | Waiter+ |
| GET | `/api/waiter/nlg-status` | Waiter+ |

### Analytics (`analyticsRoutes.js`) — all Admin
`GET /api/analytics/{summary,items,tables,hours,trend,day-of-week}`.

### Recommendation analytics (`recommendationAnalyticsRoutes.js`)
| Method | Path | Auth |
|---|---|---|
| POST | `/api/reco/events` | **Public** (chat rate-limit) |
| GET | `/api/reco/insights`, `/api/reco/analytics` | Admin |

### Recommendation bundles (`recommendationBundleRoutes.js`)
| Method | Path | Auth |
|---|---|---|
| GET | `/api/bundles` | **Public** |
| GET | `/api/admin/bundles` | Admin |
| POST | `/api/bundles` | Admin |
| PATCH/DELETE | `/api/bundles/:id` | Admin |

### Deals, ratings, reservations, push, uploads
| Method | Path | Auth |
|---|---|---|
| GET | `/api/deals` | **Public** |
| POST | `/api/deals` | Admin |
| POST | `/api/ratings` | **Public** (public-write rate-limit) |
| GET | `/api/ratings` | Admin |
| POST | `/api/reservations` | **Public** (public-write rate-limit) |
| GET | `/api/reservations` | Admin |
| PATCH/DELETE | `/api/reservations/:id` | Admin |
| GET | `/api/push/vapid-key` | **Public** |
| POST/DELETE | `/api/push/subscribe` | Staff+ |
| POST | `/api/admin/upload` | Admin |

### Health
`GET /healthz`, `GET /readyz` — Public (also aliased under base path; nginx proxies the bare forms).

---

## 3. Findings

**Public (unauthenticated) endpoints — by design for QR guests, but note the attack surface:**
`/api/menu`, `/api/config`, `/api/chat`, `/api/ai-pairing`, `/api/recommend`, `/submit_order`, `/api/ratings` (POST), `/api/reservations` (POST), `/api/deals` (GET), `/api/bundles` (GET), `/api/reco/events` (POST), `/api/push/vapid-key`, landing/menu pages. All public **writes** are rate-limited (general + public-write/chat buckets). `submit_order` is server-validated for pricing (`orderValidationService`).

- **Missing auth: none found.** Every admin/staff/kitchen mutation is guarded. The public set is intentional and rate-limited.
- **Role leaks: none obvious.** Birthday approval correctly steps up to Admin even within the waiter router. Manager cannot touch owner accounts (service-level).
- **Reservation spam risk:** `POST /api/reservations` is public; only IP rate-limited, no CAPTCHA/verification. Acceptable for launch, flag for abuse monitoring.
- **`/api/reco/events` is public** and shares the generous chat bucket — low-value spoofable analytics data (someone could inflate impression/accept counts). Low severity; analytics-only.
- **Duplicate endpoints:** the triple path-alias (`/x`, `/Trump/x`, `/trump/x`) is intentional, not a defect. No genuinely redundant handlers found.
- **Legacy endpoints:** `/submit_order`, `/orders`, `/history`, `/complete`, `/incomplete`, `/delete/:type/:file` are bare (non-`/api`) legacy paths still in use by older clients/vanilla admin. They are auth-guarded. Candidates for consolidation under `/api` once the vanilla admin is retired.
- **HTTP Basic accepted everywhere** as an alternate to the session cookie (`getRequestUser`) — works over HTTPS but is a second auth path worth consciously keeping or dropping (see AUDIT-AUTH/SECURITY).

---

## 4. Recommendations

1. Keep the public set but add **abuse monitoring** on `/api/reservations` and `/submit_order`.
2. After retiring vanilla admin, **migrate legacy bare paths** (`/submit_order`, `/orders`, …) under `/api`.
3. Consider authenticating or signing `/api/reco/events` to prevent analytics pollution.
4. Document the HTTP Basic path decision explicitly.
