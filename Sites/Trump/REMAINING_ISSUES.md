# Remaining Issues

Date: 2026-05-19

## Low-Risk Follow-Up

- Legacy Python AI and voice files remain for local-only continuity. The old root waiter duplicate was removed; the active waiter UI uses `frontend/scripts/waiter-app.js`.
- Several wine entries share the same display name across wine categories. Recommendations work, but unique wine labels would make exact pairing attribution clearer.
- Some menu item media fields are still empty, so the UI relies on local inferred image fallbacks. The fallbacks render correctly, but item-specific media would make the experience richer.
- The final validation server is running on the default port `3012`.

## No Current Blockers

- Customer menu renders on desktop and mobile.
- Recommendations appear before and after cart activity.
- Chatbot returns local menu-aware suggestions.
- Cart and order submission flows validate.
- Login, admin, and waiter routes validate.
- No major browser console errors remain.
