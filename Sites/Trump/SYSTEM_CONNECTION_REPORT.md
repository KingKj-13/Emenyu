# System Connection Report

Generated: 2026-05-19

## Runtime Map

- Customer UI: `/Trump/:tableId` serves `frontend/pages/menu.html`, loads menu/deals/recommendations/chat through `/Trump/api/*`, and syncs carts through `/Trump/socket.io`.
- Admin UI: `/Trump/Admin` serves `admin.html`, protected for `owner` and `manager`.
- Waiter UI: `/Trump/Waiter` serves `waiter.html`, protected for `owner`, `manager`, and `waiter`.
- Backend: `server/server.js` wires controllers, services, Socket.IO, account auth, uploads, menu, deals, orders, waiter tools, chatbot, and recommendations.
- Local AI: `server/services/aiService.js` reads the menu through `FileService`, so it now receives the split-built menu object without API shape changes.

## Verified Connections

| Connection | Result |
| --- | --- |
| Frontend to backend menu API | Passed: `/Trump/api/menu` returned 24 categories and 439 items. |
| Chatbot to menu | Passed: `/Trump/api/chat` returned a menu-aware reply with 4 suggestions. |
| Recommendations to cart/menu | Passed: `/Trump/api/recommend` returned 4 cart-based recommendations. |
| Customer order to admin orders | Passed: test order appeared in `/Trump/orders`, then was deleted. |
| Waiter order to kitchen/admin | Passed: waiter add-items route created an active order visible to admin. |
| Waiter table status | Passed: `/Trump/api/waiter/table/qa2/status` reflected active quantity. |
| Admin protected operations | Passed for owner/manager; waiter receives 403 for admin order APIs. |
| Static assets | Passed for frontend JS and image assets under `/Trump`. |

## Fixed During This Pass

- Auth now uses local persistent accounts and signed sessions instead of static in-memory-only users.
- Logout now invalidates replayed signed tokens by account, not only the browser cookie.
- Menu data is split into maintainable category files while preserving the existing combined menu contract.
- Waiter dashboard gained a protected logout action and can hydrate the waiter name from the authenticated account.
- Removed the unused root `waiter.js` duplicate and stale generated artifacts.
