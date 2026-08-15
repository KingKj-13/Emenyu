# Integrating Trump EMenu with an existing restaurant system

Requested in the redesign brief (§10). **No integration has been built**, and
nothing external has been contacted or modified.

---

## 1. What is actually configured today

I searched the codebase, the environment files and the running processes for
any sign of an external system — a POS, a booking platform, an accounting or
stock package, a webhook, an outbound API key.

**There is none.** Specifically:

| Looked for | Found |
|---|---|
| POS / till integration (Pilot, GAAP, Micros, Lightspeed, SoftPOS, Yoco…) | nothing |
| Booking platform (Dineplan, Quandoo, OpenTable, ResDiary) | nothing — reservations are stored in Trump's own `Reservation` table |
| Payment gateway | nothing — the cart never took payment |
| Accounting / stock | nothing |
| Outbound API keys in `.env` | none. Every `TRUMP_*` variable is local config |
| External LLM / AI service | none — the recommendation engine is fully local |
| Webhooks in or out | none |

So there is nothing to connect to yet. The rest of this document is what the
architecture already supports, so the conversation with a vendor can start from
facts rather than guesses.

---

## 2. What the system could export today

Everything below is already queryable and id-stable.

| Data | Source | Shape | Notes |
|---|---|---|---|
| Menu (categories, items, prices, availability) | `GET /Trump/api/menu` | JSON tree, every node carries `dbId` | Public, cacheable, ETagged, `?locale=` aware |
| Item media | `GET /Trump/api/menu/items/:id/gallery` | ordered list, one featured | |
| Butchery cuts + cut→dish links | `GET /Trump/api/butchery/cuts` | | |
| Translations | `MenuItem`/`Translation` | one row per (entity, locale, field) | 14 locales |
| Guest engagement | `ViewEvent` | anonymous, session-scoped | Item/cut/category views, dwell, video, language |
| Historical orders | `Order`, `OrderItem`, `OrderStatusHistory`, `OrderRating` | 15.5k orders / 125.6k lines | Frozen — the QR menu no longer writes here |
| Historical service data | `WaiterAssignment`, `Shift`, `Guest` | | Frozen, retained |
| Reservations | `Reservation` | 2,448 rows | Still live |

**The likely first ask from a POS vendor** is the engagement data: "which dishes
are guests looking at that they are not ordering?" That question needs
`ViewEvent` (ours) joined against their sales — which is exactly the join a POS
integration makes possible and neither system can answer alone.

---

## 3. What the system could import

| Data | Target | Difficulty | Notes |
|---|---|---|---|
| Menu items + prices | `MenuItem` | **Low** | `saveMenu` already accepts a whole menu tree; `normalizedName` gives a natural matching key |
| Availability / 86'd items | `MenuItem.availability` | **Low** | Three-state field already exists (`available` \| `ask` \| `unavailable`); a poll or webhook could drive it live |
| Categories | `MenuCategory` | Low | Hierarchical, `path` is unique |
| Item media | `MediaAsset` | Low | Accepts absolute URLs, so a vendor CDN needs no file transfer |
| Translations | `Translation` | Low | Per (entity, locale, field) |
| Stock levels | — | **Medium** | No stock model exists. Simplest useful version is mapping "out of stock" onto `availability` rather than modelling stock properly |
| Sales history | — | **Medium** | Would need a new table; do **not** back-fill into `Order`, which is our own historical record |

**Highest value for least work: live availability.** A guest reading a menu that
knows the ribeye is finished is a materially better experience, and it is one
field this schema already has.

---

## 4. What an integration would need from the vendor

Before any build:

1. **API documentation** and a **sandbox/test endpoint** — production must never
   be the place an integration is first tried.
2. **Credentials** issued to us, scoped read-only unless writes are genuinely
   required, and stored the way every other secret is (server `.env`, never in
   the repository, never in the client bundle).
3. **A stable item identifier** on their side. Matching on item *name* is fragile
   — "RIBEYE 380g" versus "Ribeye 380 g" would silently split into two items. A
   vendor SKU stored on `MenuItem.metadata` is the correct join key.
4. **Direction and authority.** Which system owns price? Which owns availability?
   Two-way sync without a declared owner per field produces flapping data.
5. **Rate limits and update frequency** — a menu poll every 30s is very different
   work from a webhook on change.

---

## 5. How it would slot into this architecture

The redesign left the seams in the right places, so no restructuring is needed:

- **A new service** under `server/services/` (e.g. `posIntegrationService.js`),
  constructed in `server.js` and injected like every other service. No global
  singleton, matching the existing `createConfig(basePath)` pattern.
- **Configuration by env var** (`TRUMP_POS_*`), validated in
  `validateProductionConfig` so a half-configured integration refuses to start
  rather than failing silently at 7pm on a Friday.
- **A sync job** rather than request-path coupling: the guest menu must never
  block on a third party's uptime. Poll or receive a webhook, write to our
  database, and let `emitMenuUpdated()` invalidate the per-locale menu cache —
  which already pushes the change to every open guest device over the socket.
- **`MenuItem.metadata`** (a `Json` column that already exists) holds the vendor's
  id and last-sync timestamp with no migration.
- **An `IntegrationLog` table** would be worth adding when the work starts: what
  synced, when, what changed, what failed. Integrations are debugged from their
  logs or not at all.

---

## 6. Recommended sequence, when there is a counterparty

1. Get sandbox credentials and documentation. Confirm a stable item id exists.
2. Agree field ownership: who owns price, name, availability, media.
3. Build **read-only availability sync** first — smallest surface, immediate
   guest benefit, and it exercises auth, mapping and scheduling end to end.
4. Add an item-mapping screen to the admin panel (their SKU ↔ our dish) rather
   than guessing by name.
5. Only then consider menu/price import, and only with a dry-run mode that
   reports what *would* change before anything is written.

**This work is not a blocker for anything currently outstanding.** The QR menu,
the butchery, the analytics and the admin panel are complete and independent of
it.
