# Bug Fix — Chat notification appeared with no recommendation message

## Root cause

`ChatPanel.tsx`'s background "notification badge" effect (added in the Phase 3
Dining Concierge work) called `/api/recommend` when the cart changed and, if
a new top suggestion was found, only did **`setHasUnseenSuggestion(true)`** —
it never touched the `messages` state. The conversation array the chat panel
renders was never updated. So the badge (a real, correctly-computed signal
that the Recommendation Brain had something new to say) fired independently
of the conversation — the guest saw the notification, opened the chat, and
found the same empty "Hello! I'm Donald..." welcome screen as before, because
nothing had ever been added to `messages`.

The Recommendation Brain itself was never broken — every step up to and
including "recommendation returned" worked correctly (confirmed with
diagnostic logging below). The break was specifically at **step 4,
"conversation message created"**: that step didn't exist.

## Evidence — the pipeline traced with diagnostic logging (before the fix)

Reproduced locally (own dev server + Playwright, not production) by adding
Corona to an empty cart and opening the chat panel:

```
[DIAG] cart updated [] chatOpen= false
[DIAG] cart updated [COSMOPOLITAN, ...] chatOpen= false
[DIAG] recommendation generated [Object, Object]
[DIAG] notification created for KLEIN CONSTANTIA -- NOTE: no chat message is created here, only the badge flag
[DIAG] cart updated [..., CORONA] chatOpen= false
[DIAG] recommendation generated [Object, Object]
[DIAG] no new notification (top unchanged or empty): KLEIN CONSTANTIA
[DIAG] cart updated [..., CORONA] chatOpen= true
[DIAG] chat opened -- notification marked read (badge cleared)
```

Notice: **no `"chat UI messages array changed"` log fires after the initial
page load, ever** — the badge fires, the chat opens, and the message array
is untouched throughout. This is the exact chain break, proven from a live
run, not assumed.

## The fix

`client/src/components/chat/ChatPanel.tsx` — the same effect that computes
the badge now also builds and appends the actual assistant message the
moment a new top suggestion is found: `content` is the suggestion's own
`reason` (the Hospitality Intelligence WHY text, already computed by the
unmodified Recommendation Brain), `suggestions` carries up to 3 recommendation
cards (rendered by the existing `RecommendationCard` component, unchanged),
and `trackImpressions` fires for analytics consistency with the rest of the
chat flow. The badge (`hasUnseenSuggestion`) is still set exactly as before.

No recommendation logic was touched. No new engine. No UI redesign — this
reuses the exact same message-rendering path `sendMessage()` already uses for
a normal typed question.

## Evidence — the pipeline after the fix (same repro, same logging)

```
[DIAG] cart updated [CORONA] chatOpen= false
[DIAG] recommendation generated [Object, Object, Object]
[DIAG] conversation message created for PRAWN & CALAMARI with 3 suggestion card(s), reason: One of the plates guests come back for.
[DIAG] notification created for PRAWN & CALAMARI
[DIAG] chat UI messages array changed, length= 1 [Object]
[DIAG] cart updated [CORONA] chatOpen= true
[DIAG] chat opened -- notification marked read (badge cleared)
```

`messages array changed, length= 1` now fires, and a screenshot of the opened
panel confirms the assistant message + 3 recommendation cards (with reason,
price, and Add buttons) render correctly.

## Scenario testing (all via local Playwright, own dev server)

| Scenario | Cart | Badge | Chat message | Cards | Explanation shown |
|---|---|---|---|---|---|
| Beer only | Corona | ✓ | ✓ | 3 | "One of the plates guests come back for." |
| Burger only | Cheese Burger | ✓ | ✓ | 3 | "If you'd rather wine, Merlot's soft plum and easy tannin suit the juicy beef and melted cheddar." |
| Beer + Burger | Corona, Cheese Burger | ✓ | ✓ | 3 | (as above) |
| Wine only | Nederburg Wine Masters | ✓ | ✓ | 3 | "One of the plates guests come back for." |
| Wine + Steak | Nederburg Wine Masters, Ribeye 380g | ✓ | ✓ | 3 | Full hero narrative + Wagyu upgrade nudge |
| Complete meal | + Cape Malva Pudding, Cappuccino | ✓ | ✓ | 3 | Same upgrade nudge (see note below) |

Every scenario produces a notification, a chat message, recommendation
card(s), and an explanation — the four things the bug report required.

**One nuance surfaced, not fixed, out of scope for this bug**: the "Beer
only" / "Wine only" explanations are the Hospitality Intelligence engine's
generic never-blank fallback line, not a specific food pairing — expected,
since there is no dish in the cart yet to explain a pairing against (the
engine has nothing to compare the drink to). Also: this proactive check
calls `/api/recommend` without `excludeNames`/chat history, so the premium-
upgrade nudge can resurface on every cart change rather than being
remembered as "already offered" the way it would be inside an actual typed
conversation (which does carry history through `chatSession.js`'s
already-fixed whole-conversation memory). Neither of these is the reported
bug ("no recommendation exists") — both are pre-existing/adjacent scoring
behavior, and per the explicit instruction not to redesign anything, left
untouched.

## Files changed

- `client/src/components/chat/ChatPanel.tsx` — the fix (message creation) +
  temporary diagnostic logging (added, used to prove the root cause and the
  fix, then fully removed before commit — confirmed via `grep '\[DIAG\]'`
  returning zero matches).
- `client/package.json` / `package-lock.json` — added `playwright` as a
  dev-only dependency (used to drive a real headless browser against the
  local dev server for this diagnosis; excluded from production by
  `npm ci --omit=dev`, unaffected by this fix).

## Testing

`npm run reco:validate` 77/77, `npm run chat:validate` 56/56 (unaffected —
this bug and fix are entirely client-side, no server logic touched). Client
`tsc --noEmit` clean, `vite build` clean. All 6 required scenarios re-verified
against the final, logging-free build (results table above) — same pass
results as with diagnostic logging in place, confirming the fix itself (not
the extra logging) is what closes the gap.

No new features added. No redesign. Phase 4 not started.
