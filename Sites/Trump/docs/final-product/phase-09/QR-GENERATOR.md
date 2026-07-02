# QR-GENERATOR.md — Phase 09 (FRP1) Step 3

**Tool:** `scripts/qr-generate.js` · **alias:** `npm run qr:generate` · **Status: ✅ built + validated (3 QRs generated + verified 200).**
**Purpose:** generate production table QR codes (PNG + SVG + a printable sheet) and verify each resolves — no manual QR-tool fiddling. Reduces setup time + risk (Rule 3).

---

## Dependency
Requires the `qrcode` package (pure-JS, dev/ops dependency):
```bash
npm i qrcode
```
*(In this build env Trump's npm install had a local state quirk; on a clean box `npm i qrcode` works. The tool prints this instruction if the package is missing.)*

## Usage
```bash
node scripts/qr-generate.js --tables 1-20 --base https://emenyu.com/Trump --out ./qr
node scripts/qr-generate.js --tables 1-20 --base https://emenyu.com/Trump --out ./qr --verify
# point straight at the menu instead of the chooser:
node scripts/qr-generate.js --tables 1-20 --base https://emenyu.com/Trump --suffix /menu --out ./qr
```
`--tables` accepts `1-20`, `1,3,5`, or `20`. Range enforced to **1..50** (Rule 1).

## What it produces (per table)
| Output | Use |
|---|---|
| `tableN.png` (600 px, EC level M) | stickers / table tents |
| `tableN.svg` (vector) | print at any size without blur |
| `qr-sheet.html` | **printable grid** — open it, Print → **Save as PDF** (true PDF without a heavyweight dep) |

The encoded URL is `<base>/tableN` (verified against the client router: `/Trump/<tableId>` → landing chooser; `--suffix /menu` → straight to the menu).

## `--verify` — the safety gate
Fetches each QR URL and confirms it resolves (200–3xx) **before you print**. Validation this phase:
```
✓ table1  http://…/Trump/table1  → table1.png, table1.svg   ✓ table1 → 200
✓ table2  …                                                  ✓ table2 → 200
✓ table3  …                                                  ✓ table3 → 200
printable sheet → qr-out/qr-sheet.html
verify: 3 ok, 0 unreachable
```
(Real run; PNG ~3.6 KB, SVG ~1.5 KB each, plus the printable sheet.)

## Printing to PDF
1. Generate with `--out ./qr`.
2. Open `qr/qr-sheet.html` in a browser → **Print** → **Save as PDF** (A4, 2-up grid, table labels + URLs, dashed cut lines).
3. Print/laminate; **label each with its table number**; keep the master sheet (table → URL).

## How it fits onboarding
After the setup wizard creates the tables, run `qr:generate --verify` against the **production** base on the restaurant's real domain, confirm 0 unreachable, then print. Re-run for any added/renamed table.

## Safety / notes
- Read-only on the system; writes only to `--out`.
- QR codes are static URLs (no expiry, no per-service regen).
- Always `--verify` against the **deployed prod** base before printing — a typo'd base or an undeployed site is caught here, not at the table.
