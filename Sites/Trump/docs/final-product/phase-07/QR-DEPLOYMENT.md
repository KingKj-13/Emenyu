# QR-DEPLOYMENT.md — Table QR Codes

**Audience:** operator deploying the per-table QR codes customers scan to order. The URL scheme below is **verified against the client router**.

---

## The URL each QR encodes
The React SPA is served under base path **`/Trump`**; the customer routes are:
| Route | Lands on |
|---|---|
| `https://emenyu.com/Trump/<tableId>` | **Landing/chooser** page (recommended QR target) |
| `https://emenyu.com/Trump/<tableId>/menu` | full **menu** directly |
| `https://emenyu.com/Trump/<tableId>/drinks` | drinks-filtered menu |
| `https://emenyu.com/Trump/<tableId>/setmenu` | set-menu view |

- `<tableId>` is the table's id, e.g. `table5`. Valid ids are `table1 … table30` (the order validator enforces this range).
- `/` and unknown paths redirect to `/table1` — so a malformed QR still lands somewhere usable.
- **Recommend** encoding the **landing** URL (`…/Trump/<tableId>`) so the guest sees the chooser; or go straight to `…/menu` if you prefer fewer taps.

## Generate the QR codes
Any QR generator works (the content is just the URL). Example with `qrencode` on the box:
```bash
sudo apt install -y qrencode
mkdir -p /root/qr
for n in $(seq 1 <NUMBER_OF_TABLES>); do
  url="https://emenyu.com/Trump/table${n}"
  qrencode -o "/root/qr/table${n}.png" -s 10 -m 2 "$url"
  echo "table${n} -> $url"
done
ls /root/qr/
```
(Or use any online/offline QR tool — encode exactly the URLs above.)

## Verify EVERY QR before printing
For each table:
```bash
# the URL must resolve (200) and the SPA must load:
curl -s -o /dev/null -w "%{http_code}\n" "https://emenyu.com/Trump/table5"
```
- [ ] Scan each generated QR with a real phone → it opens the **correct table's** page.
- [ ] The table id in the URL matches the physical table the code will sit on.
- [ ] Menu loads over the **restaurant's real Wi-Fi** (not just office network) — Phase 05 cache makes this fast, but test on-site.
- [ ] On a fresh phone (no app), the customer flow works end-to-end: scan → menu → add items → order reaches staff.

## Print & place
- Print at a size that scans easily from a seated position (≥ 3 cm; test from ~40 cm). High contrast, quiet margin.
- Laminate / table-tent / sticker per the restaurant's preference.
- **Label each QR with its table number** (human-readable) so staff can match them.
- Place one per table; keep a few spares + a master sheet mapping table → URL.

## Operational notes
- QR codes are **static** (just a URL) — they don't expire and need no per-service regeneration.
- If a table is renamed/added, generate a new QR for the new id and verify it resolves.
- No customer login is needed to scan + browse + order (guests are anonymous; staff actions require auth).
- Customer data: scanning stores nothing sensitive; ordering is tied to the table id, not the person.

## QR deployment record (fill on the day)
| Table | URL | QR printed | Scanned-OK | Placed |
|---|---|---|---|---|
| table1 | https://emenyu.com/Trump/table1 | ☐ | ☐ | ☐ |
| … | … | ☐ | ☐ | ☐ |

**Record the table count + that all QRs were verified in [CUSTOMER-ONBOARDING.md](CUSTOMER-ONBOARDING.md) / [GO-LIVE-LOG.md](GO-LIVE-LOG.md).**
