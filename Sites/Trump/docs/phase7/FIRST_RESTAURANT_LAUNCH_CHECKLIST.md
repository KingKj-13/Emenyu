# FIRST RESTAURANT LAUNCH CHECKLIST

Operational checklist to take Trump live for its first paying restaurant. Pair with
`docs/phase5/deployment-checklist.md` (canonical runbook) and the Phase 7 guides. Date: 2026-06-07.

---

## PRE-LAUNCH (T‑minus, before the cutover day)

### Database & security (blockers)
- [ ] **Harden prod DB** (`PRODUCTION_DB_HARDENING_PLAN.md`): rotate the weak password, use a non-superuser
      app role, restrict 5432 to the app server / private network.
- [ ] **Postgres backups:** scheduled `pg_dump` + offsite copy + a **tested `pg_restore`**.
- [ ] Run **`auth:rotate`** on the prod host; confirm `TRUMP_FORCE_HTTPS` + HSTS are on.
- [ ] Remove the prod `DATABASE_URL` from all developer workstations.

### Staging dress-rehearsal (must be green)
- [ ] Stand up staging (`STAGING_SETUP_GUIDE.md`); apply migrations + seeds on a **fresh** DB.
- [ ] `npm run reco:health` → exit 0.
- [ ] `npm run reco:verify:live -- --confirm` → all PASS (`sink: postgres`).
- [ ] `npm run smoke:test` (staging URL, owner login) → all PASS.
- [ ] Rollback drill on staging (drop reco tables → app still boots → re-apply).

### Release & content
- [ ] PR reviewed; merge plan confirmed (branch is **fast-forward** to `master`).
- [ ] Production menu data loaded and correct (categories, prices, images/videos).
- [ ] Chef recommendations + persona bundles reviewed by the restaurant (the content guests will see).
- [ ] Owner/manager/waiter accounts created with strong passwords; credentials handed over securely.

### Physical / network
- [ ] Table QR codes printed and mapped to the correct table IDs.
- [ ] Venue Wi‑Fi tested on a guest phone; waiter device(s) provisioned and logged in.
- [ ] TLS certificate valid for the production domain.

---

## LAUNCH DAY (cutover — maintenance window)

1. - [ ] **Snapshot first:** `pg_dump` of prod (the restore point) + a file backup (`BACKUP_AND_DR.md`).
2. - [ ] Merge to `master` (fast-forward) **or** deploy the reviewed branch build.
3. - [ ] On the server: pull, `cd Sites/Trump/client && npm run build`.
4. - [ ] `npx prisma migrate deploy --schema prisma/schema.prisma` then `npx prisma generate`.
5. - [ ] Seed: `npm run reco:seed -- --apply` + `npm run bundles:seed -- --apply` (and `menu:migrate` if the
        menu isn't already in Postgres).
6. - [ ] `npm run pm2:restart` (or `pm2:start`) → `npm run health` → **`npm run reco:health` (exit 0)**.
7. - [ ] **`npm run smoke:test`** against the live URL (owner login) → all PASS.
8. - [ ] Per-role manual verification (below) → sign-off.
9. - [ ] If anything fails → **rollback** (`docs/phase6/05`): `pm2 reload` previous build / restore snapshot.

### Per-role verification (do this live before opening to guests)

**Customer (scan a real table QR):**
- [ ] QR opens the menu for the right table; categories browse; an item opens (image/video, allergens).
- [ ] Item pairings render as the premium recommendation card.
- [ ] Cart "You might also like" shows and adds to cart.
- [ ] Chatbot answers "whats good here" sensibly.
- [ ] "Not sure what to order?" bundle strip shows and "Add order" works.
- [ ] Place one **test order**; (optional) a reservation and a rating. Then clear the test order.

**Waiter (`/Trump/Waiter`, waiter login):**
- [ ] Floor loads; select a table.
- [ ] Cart recommendations + AI coach + sommelier render; "Add to order" works.
- [ ] Guest information panel loads.

**Owner (`/Trump/Admin`, owner login):**
- [ ] Menu management loads; toggle an item's availability.
- [ ] **Chef Recs:** create one, toggle active, delete it.
- [ ] **Bundles:** create one, edit courses, delete it.
- [ ] **Reco Analytics:** KPIs + Action items render (data will be sparse on day one).

**Admin:**
- [ ] Accounts: create/list a staff account; system controls (deals, availability) respond.

**Kitchen (deprioritized):**
- [ ] The kitchen screen loads without error (no functional sign-off required this launch).

---

## POST-LAUNCH (first service → first week)

- [ ] Watch **PM2 logs** (`npm run pm2:logs`) and the **Reco Analytics** dashboard during the first service.
- [ ] Confirm orders flow end-to-end (guest → waiter/kitchen → history) and totals are correct.
- [ ] Confirm the **nightly `pg_dump` backup ran** and a copy is offsite.
- [ ] Note any "recommendations not showing" → run `reco:health`, re-seed if needed (data integrity).
- [ ] Collect owner/staff feedback; keep a hotfix path ready (the branch is small and fast-forward).
- [ ] After 1 week stable: prune stale local branches; tag the release.

---

## Abort / rollback triggers (call it early)

- App fails to boot after migrate → **fallbacks keep the menu/orders working**; restore the snapshot if data
  looks wrong, redeploy previous build.
- Recommendations error or look wrong → they **degrade to algorithmic** automatically; fix data via Admin /
  `reco:seed`, no outage.
- DB unreachable → app serves from fallbacks; fix DB/network, no rollback needed.
