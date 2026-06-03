# Task 2 — Server-Side Order Validation: Report & Attack Scenarios

**Files:** `server/services/orderValidationService.js` (new), wired into
`server/controllers/orderController.js` (`submitOrder`) and
`server/controllers/waiterController.js` (`addItems`).

## 1. Problem

`submitOrder` stored `req.body` almost verbatim — client-supplied item names,
prices, and totals were trusted. A guest could submit any price, any total, or
items that don't exist.

## 2. Approach — server is authoritative

For every order the server now:

1. **Resolves the table** to a canonical `table<n>` and rejects anything outside
   `1..TRUMP_TABLE_COUNT`.
2. **Loads the live menu** (Postgres-backed, JSON fallback) and builds a
   normalized-name → item index via the existing `flattenMenu()`.
3. **Validates each line:** item must exist, be `available` and `visible`; quantity
   must be an integer in `1..TRUMP_ORDER_MAX_ITEM_QTY`.
4. **Recomputes pricing** from the menu — line price, `subtotal`, `vat`
   (`TRUMP_VAT_RATE`, default 0.15), `service` (`TRUMP_SERVICE_RATE`, default 0.05).
   Rates default to match the client (`client/src/constants/config.ts`).
5. **Bounds the tip** (customer-chosen) to `0 .. subtotal × TRUMP_ORDER_MAX_TIP_MULTIPLE`.
6. **Recomputes the grand total** and discards the client's totals.
7. **Caps order size:** `TRUMP_ORDER_MAX_LINES` distinct lines and
   `TRUMP_ORDER_MAX_TOTAL_QTY` total units.

### Rejection vs. correction policy

- **Structural tampering is REJECTED (HTTP 400):** unknown item, unavailable item,
  bad quantity, invalid table, oversized order.
- **Price/total tampering is NEUTRALIZED:** server prices override client prices,
  and a `order_pricing_corrected` warning is logged (tamper signal). Set
  `TRUMP_ORDER_REJECT_ON_PRICE_MISMATCH=true` to reject these outright instead.
  (Default is correct-and-log to avoid breaking checkout on benign rounding/rate
  drift while still making manipulation ineffective and observable.)

The same validation runs for waiter `add-items` (with `requireTotals:false`).

## 3. Attack scenarios tested (live)

| # | Scenario | Request | Expected | Actual |
|---|---|---|---|---|
| A | Invalid table | `table_number:"table999"` | 400 reject | **400** ✅ |
| B | Unknown / injected item | item `"Free Lunch Hack"` | 400 reject | **400** — `item 1 (Free Lunch Hack) is not on the menu` ✅ |
| C | Price tamper | `CHICKEN TRINCHADO` sent at `price:1` (menu R125), `total:1.2` | 200, server price used, logged | **200**; log: `order_pricing_corrected priceTampered:true totalMismatch:true claimedTotal:1.2 serverTotal:150` ✅ |
| D | Valid order | `CHICKEN TRINCHADO` ×1, table2 | 200 | **200** ✅ |
| E | Quantity abuse | `qty:9999` | 400 reject | **400** — `invalid quantity (allowed 1-50)` ✅ |

Scenario C confirms the core guarantee: a guest claiming a R1.20 total for a R125
dish is charged the **server-computed R150** (`125 + 18.75 VAT + 6.25 service`),
and the attempt is logged.

## 4. Notes / residual

- VAT/service **rates must stay in sync** with the client constants; both default
  to the current client values and are env-overridable. Documented in `.env.example`.
- Table validation is range-based (`1..tableCount`) rather than a DB `Table`
  lookup, so it does not depend on the `Table` rows being seeded. Named/zone tables
  would need a config extension (out of scope).
- Non-pricing per-line fields (notes, modifiers) are preserved; only `name`,
  `price`, `qty`, `lineTotal` are forced to authoritative values.
