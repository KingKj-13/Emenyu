# Feature Parity Report

Date: 2026-05-19

## Greek Features Confirmed In Trump

- Customer table menu route with live socket cart sync.
- Admin menu editor with category/subcategory editing, visibility toggles, item ordering, media upload, deals, recommendations, current orders, history, live chat monitor, and chat history.
- Waiter Pro table grid, table search, menu search, category chips, service notes, manager call, order submission, table archive, analytics, and recommendation strip.
- Local recommendation endpoint, AI pairing endpoint, chat endpoint, order history, waiter-call notifications, and protected owner/manager/waiter routes.
- File-backed local data storage for menu, deals, recommendations, popular items, orders, history, tables, and chat logs.

## Trump Improvements Over Greek

- Modular server architecture under `server/` instead of the older monolithic `server.js`.
- Session-based auth for owner, manager, and waiter roles.
- Trump route prefix support through `/Trump/...` and `/trump/...`.
- Local-first AI service integrated directly into the Node server instead of relying on a Python recommendation service process.
- Premium customer component structure under `frontend/components`, `frontend/scripts`, and `frontend/styles`.

## Parity Work Completed In This Pass

- Matched the Greek waiter operational feel while preserving Trump's protected waiter route.
- Preserved waiter recommendation strip behavior and connected it to the local `/api/recommend` endpoint.
- Preserved admin deals/recommendations/chat/order flows and improved their visual consistency.
- Replaced stale configured recommendation/popular item names with real Trump menu names so recommendation logic has usable anchors.
- Kept legacy files untouched where deletion risk was higher than benefit; no active route now depends on the older Greek-style monolith.

## Notable Difference

- Greek used external Google font/icon links inside the old waiter page. Trump remains local-first and does not add those external dependencies.
