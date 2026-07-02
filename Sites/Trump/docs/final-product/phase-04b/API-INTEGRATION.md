# API-INTEGRATION.md — Phase 04B Step 3

**Date:** 2026-06-25. **Status: ✅ implemented + validated (all consumed endpoints green live).**

The app consumes **only the existing production API** (Rule 2). No new REST endpoints were added for it — every authed endpoint already accepts Bearer (Phase 04 resolver change).

---

## API client (`src/api/apiClient.ts`)
A single `apiRequest<T>()` with:
| Feature | Behaviour |
|---|---|
| **Bearer interceptor** | attaches a valid access token via `getValidAccessToken()` (refresh-aware) |
| **Refresh interceptor** | a server `401` → force-refresh once → retry the request once |
| **Retry-once** | one retry on transient network error / abort / HTTP ≥ 500 |
| **Timeout** | per-request `AbortController` (15 s default, configurable) |
| **Connectivity guard** | mutations fail fast offline (`OfflineError`) to prevent split-brain; GETs may still attempt then fall back to cache |
| **Typed errors** | `ApiError{status, body}` / `OfflineError` |

Convenience: `api.get/post/patch/del`. The token endpoints use `anonymous: true` (they carry their own credentials and must not loop through the Bearer/refresh path).

## Endpoints consumed (`src/api/endpoints.ts`)
Paths are **relative to `API_BASE_URL`** (which already includes `/Trump`); the server's `/api/...` alias resolves to `/Trump/api/...`.

| Domain | Endpoints |
|---|---|
| Token (Phase 04) | `POST auth/token`, `POST auth/token/refresh`, `POST auth/token/revoke`, `GET/DELETE auth/devices`, **`PATCH auth/devices/:id/push-token`** (04B) |
| Shifts | `GET shift/me`, `POST shift/start`, `POST shift/end` |
| Ownership | `GET ownership`, `GET ownership/:t`, `GET ownership/:t/history`, `POST ownership/:t/transfer`, `POST ownership/:t/takeover` |
| Notifications | `GET notifications`, `GET notifications/unread-count`, `POST notifications/:id/ack`, `POST notifications/ack-all` |
| Menu (read) | `GET menu` (defensively normalized to `MenuItem[]`) |

## Configurable target
`app.json → extra.apiBaseUrl` (default `https://emenyu.com/Trump`). For integration testing it points at a local server (the validation below ran against `http://127.0.0.1:3099/Trump`). One binary, any environment.

## Typed wrappers
`src/api/ops.ts` mirrors the web client's `opsApi.ts` (same calls, same `types/operations.ts`). `src/api/auth.ts` wraps the token + device endpoints. `src/api/menu.ts` is read-only.

## Live validation
22/22 REST checks green (`scratchpad/probe-04b-rest.js`), including the **takeover → transfer → notification → ack** workflow and the push-token registration (persistence + dispatcher-targeting asserted via Prisma). No endpoint required modification; the **only backend additions** were the socket Bearer handshake and `Device.pushToken` (REALTIME-INTEGRATION.md) — exactly the two anticipated in Phase 04.
