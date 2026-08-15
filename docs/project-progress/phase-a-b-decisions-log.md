# Phase A/B Decisions Log — Auto-Selected, Pending Your Review

Per your instruction (2026-07-10): rather than stopping to ask for every judgment call during Final Touching Phase A/Phase B, I'm defaulting to the recommended option each time and logging it here. Review at your convenience — anything you want reversed, tell me and I'll change it.

Format: **Question** → Recommended option taken → why.

---

## Git housekeeping (pre-existing pending work, "commit all")

1. **Q:** `scripts/temp_failed_images/` (138MB, self-evidently scratch debris from the July 3rd image migration) and `Sites/Trump/scripts/load-tests/powershell.exe` (a stray 0-byte file) were sitting untracked alongside everything else "commit all" was meant to cover.
   **Taken:** Left both OUT of git (not committed, not deleted — still sitting on disk untouched). Rationale: 138MB of temp images would bloat the repo against its own established "no large binaries" policy (the same reason `Video/*.mp4` is gitignored); a 0-byte `powershell.exe` is plainly an accidental artifact, not real work product. Neither is destructive to leave in place — they're just excluded from this commit.

2. **Q:** `Sites/Trump/client/tsconfig.tsbuildinfo` (a TypeScript incremental-build cache file, auto-regenerated, zero source value) was also untracked.
   **Taken:** Left out of the commit (matches the deploy script's own long-standing exclusion of this exact file).

---

## Media performance (Phase A issue 1)

3. **Q:** The diagnostic also flagged that ItemModal/CartDrawer/ChatPanel all statically import the Modal wrapper (→ framer-motion, ~133KB), so that chunk preloads on every menu-page visit instead of only when a guest opens one of those surfaces — proposed fix was to wrap them in `React.lazy()` like AdminPage/OwnerDashboard/WaiterPage/KitchenPage already are.
   **Taken:** Left as-is (not fixed this phase). Rationale: unlike those route-level pages, ItemModal/CartDrawer/ChatPanel are rendered *unconditionally* in MenuPage's JSX (visibility toggled via an `open`/`isOpen` prop, not conditional mounting) so their Modal wrapper likely relies on staying mounted through its own close/exit animation (framer-motion `AnimatePresence`). Simply wrapping them in `lazy()` wouldn't defer the fetch at all (they render on first paint regardless); actually deferring it would need switching to conditional mounting, which risks breaking the exit-animation on close — a bigger, riskier change than this pass's "polish only, no regressions" scope justifies for a Low-severity, one-time-per-session ~590KB chunk (not a per-item recurring cost like the video bug was). Flagged as a known remaining item in the phase report instead.

## Waiter AI wording (Phase A issue 6)

4. **Q:** For the ~110 curated "hero" dish×wine pairings (trump_hero_pairings.json), the authored `reason` narrative is 100% byte-identical across all three tones (heroPairings.reasonFor has no tone parameter at all) — the two options were (a) author real professional/friendly/luxury variants for every pairing, or (b) wrap the single authored narrative in a tone-varied opener/closer.
   **Taken:** Left as-is (not fixed this phase), logged as a known remaining issue. Rationale: (a) is a large hand-authoring task (110+ entries × 2 new variants each) that doesn't fit this pass's time/scope; (b) risks making already-polished, carefully-authored multi-sentence narratives ("Marbled and char-grilled, the ribeye wants a wine with backbone...") read clunky with a generic wrapper bolted on. Fixed the lower-risk, non-hero-tier version of the same bug instead (cookingMethodFor() now genuinely tone-varies its cooking-method clause via knowledge/protein_rules.json, and the frozen `.reason` line was removed from the waiter's tone-tabbed card in WaiterPage.tsx). The hero-tier gap is real and highest-value (Trump's signature dishes) — flagged for a dedicated content-authoring pass, not a mechanical fix.

## Notifications (Phase A issue 7)

5. **Q:** Special-occasion (birthday/anniversary) waiter alerts: `socketService.emitGuestEvent()` is fully wired on the client (WaiterContext listens, WaiterPage renders it) but has zero server-side callers — it never fires. The current, actually-working path for the same scenario is the separate WaiterTask `birthday_approval` system (Phase 2 Service Desk). Options were (a) wire emitGuestEvent from wherever birthday detection lives, or (b) remove the dead client plumbing.
   **Taken:** Left both as-is (not fixed this phase). Rationale: (a) risks producing a second, parallel notification for the same birthday detection alongside the existing WaiterTask approval flow — i.e. exactly the "duplicate notifications" bug this same Phase B prompt asks to fix, not something to introduce. (b) removing the dead code is a bigger, more visible change (deleting a "feature") that wasn't itself named as broken by the user. Flagged as a known gap in the report; recommend a deliberate design call (which system is the intended single path) rather than a mechanical fix.

## Phase B copy/UI cleanup

6. **Q:** Admin/Waiter use native `alert()`/`confirm()` for ~15 destructive/blocking actions (representative: AdminPage.tsx lines 275, 285, 324, 344, 360, 671, 695, 861, 864, 1455, 1464, 1472, 1484; WaiterPage.tsx 196, 549; useHomeBackGuard.ts 30) — unstyled OS dialogs breaking the branded console look.
   **Taken:** Left as-is (not fixed this phase). Rationale: this is a design-system decision (build/adopt a styled confirm-dialog component and migrate every call site) not a copy fix — real effort, real regression surface (each one gates a destructive action), and not worth rushing. Flagged in the report as a good candidate for a dedicated follow-up pass.

## Live synchronization (Phase A issue 8)

7. **Q:** AdminPage's Orders/History/Tables/Menu/Deals/Chef Recs/Bundles/Reco Analytics tabs are all labeled "LIVE"/"Live sync" in the UI but only refetch on mount/manual refresh — no socket-driven refresh for any of them (only Chat and Service Desk tabs actually live-update). Fixing all of them properly means wiring 6+ different socket events across a 2700+ line file.
   **Taken:** Fixed OwnerDashboard's equivalent gap (orderPlaced/kitchenStatusUpdate → debounced reload) since it's a single, self-contained file. Left AdminPage's tabs as-is (not fixed this phase) — the scope (6+ tabs, several socket events, a large file) and regression surface didn't fit safely in this pass. Recommend a dedicated follow-up: either wire each tab's real event or soften the "LIVE" labels to match what's actually live today (mirroring the Reports-subtitle wording fix above).

*(Further entries append below as Phase A/B proceeds.)*
