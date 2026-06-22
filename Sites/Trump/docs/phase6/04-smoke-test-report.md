# Step 4 — Smoke Test Report

**Deliverable: `scripts/smoke-test.js` (`npm run smoke:test`)** — a dependency-free, self-contained
production smoke test to run **immediately after deployment** against the live URL. **Execution against a
live server is deferred** (document-only mode: no running app/DB in this environment); the script is
syntax-verified and dry-run-verified (handles an absent server gracefully — all customer checks FAIL,
authed checks SKIP, clean exit 1, no crash). Date: 2026-06-07.

## How to run (post-deploy)

```bash
cd Sites/Trump
SMOKE_BASE_URL="https://<your-host>" \
SMOKE_LOGIN_USER="<owner-username>" SMOKE_LOGIN_PASS="<owner-password>" \   # or SMOKE_COOKIE="trump_session=..."
SMOKE_TABLE="table1" \
npm run smoke:test
# add SMOKE_WRITE=1 to also test reservation + order placement (creates real rows — use a test table, then clean up)
```

The script **auto-logs-in** with the owner/manager credentials (to exercise the waiter + owner endpoints),
or accepts a session cookie directly. It is **read-only by default**; write tests are opt-in.

## Coverage matrix (maps to the Step 4 requirements)

| Surface | Check | Endpoint | Default |
|---|---|---|---|
| **Customer** — QR menu / browsing | menu loads | `GET /api/menu` | ✅ read |
| Customer — recommendations | per-cart recs | `POST /api/recommend` | ✅ read |
| Customer — item pairings | food/drink pairings | `POST /api/ai-pairing` | ✅ read |
| Customer — chatbot | reply returned | `POST /api/chat` | ✅ read |
| Customer — bundle recommendations | active bundles | `GET /api/menu/bundles` | ✅ read |
| Customer — analytics ingestion | event accepted (202) | `POST /api/reco/events` | ✅ |
| Customer — reservations | booking created | `POST /api/reservations` | ⚙️ `SMOKE_WRITE=1` |
| Customer — ratings/orders | order placed | `POST /submit_order` | ⚙️ `SMOKE_WRITE=1` |
| **Waiter** — table management | floor state | `GET /api/floor` | 🔐 auth |
| Waiter — recommendations | cart upsells | `POST /api/waiter/cart-recommendations` | 🔐 auth |
| Waiter — AI coach | table pitch | `POST /api/waiter/coach` | 🔐 auth |
| Waiter — sommelier | wine pairing | `POST /api/sommelier` | 🔐 auth |
| Waiter — guest information | table intel | `GET /api/waiter/table/:id/intel` | 🔐 auth |
| **Owner** — menu management | admin items | `GET /api/menu/items` | 🔐 auth |
| Owner — recommendation management | chef recs | `GET /api/menu/chef-recs` | 🔐 auth |
| Owner — bundle management | admin bundles | `GET /api/menu/bundles/admin` | 🔐 auth |
| Owner — analytics dashboard | totals | `GET /api/analytics/recommendations` | 🔐 auth |
| Owner — optimization insights | action items | `GET /api/analytics/recommendations/insights` | 🔐 auth |
| Owner — sales analytics | revenue summary | `GET /api/analytics/summary` | 🔐 auth |
| **Admin** — user management | accounts list | `GET /api/auth/accounts` | 🔐 auth |

Each check asserts both HTTP success **and** a response-shape predicate (e.g. `recommend` returns an
array; `chat` returns a `reply`; analytics returns `totals`). The script exits non-zero if any *run* check
fails (skips do not fail the run).

## Manual UI checklist (not HTTP-testable — verify in a browser post-deploy)

- [ ] **Customer:** scan a table QR → lands on the menu; browse categories; open an item (image/video, pairings render as `RecommendationCard`); cart "You might also like" shows; chatbot replies; "Not sure what to order?" bundle strip shows; place a test order.
- [ ] **Waiter app** (`/Trump/Waiter`): floor loads; select a table; cart recommendations + AI coach + sommelier render the shared card; "Add to order" works.
- [ ] **Owner/Admin** (`/Trump/Admin`): Menu, **Chef Recs** (create/toggle/delete), **Bundles** (create/edit/delete), **Reco Analytics** (KPIs + Action items render), Reports, Accounts.
- [ ] **Kitchen** (deprioritized): confirm it loads without error (no functional sign-off required this launch).

## Status

✅ Script built, syntax-verified, dry-run-verified. ⏳ **Live execution pending** a deployed server +
staging/production URL (run it as the final post-deploy gate). This is folded into the Step 8 conditions.
