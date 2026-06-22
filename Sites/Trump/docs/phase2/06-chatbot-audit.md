# Task 6 — Chatbot Understanding Audit

**Audit only.** Method: live `POST /Trump/api/chat` against the running server
(2026-06-03) plus code trace of `AiService.chat()`
([aiService.js:319](Sites/Trump/server/services/aiService.js#L319)). The chatbot is fully
local/deterministic — no external AI (confirmed; unchanged this phase).

## 1. How routing works (trace)

`chat()` is an ordered if/else of **literal substring** tests on the lowercased message:
deals → category → pair → combo → `isRecommendationQuestion` → wine → dietary →
mentioned-item → `scoreSearch` → popular fallback. Two mechanics dominate the failures:

- **Tokenizer drops the intent words.** `tokenize()`
  ([aiService.js:111](Sites/Trump/server/services/aiService.js#L111)) removes tokens ≤2
  chars and a STOP_WORDS set that includes **`good`, `best`, `popular`, `recommend`,
  `suggest`** ([aiService.js:26](Sites/Trump/server/services/aiService.js#L26)). So by the
  time `scoreSearch` runs, the positive-intent words are gone.
- **`scoreSearch` matches any token as a substring** of an item's `searchText`
  ([aiService.js:263](Sites/Trump/server/services/aiService.js#L263)), which produces
  false positives (see "whats good here" below).
- **No spell-correction, no synonym/abbreviation expansion, no fuzzy token matching.**
  Item-name lookup (`fuzzyFindItem`) only does substring containment on *names*.

## 2. Test results (live)

| Input | Route taken | Reply / suggestions (actual) | Verdict |
|---|---|---|---|
| `whats good here` | not a "recommendation" Q (list has `what is good`, not `whats good`; `good` is a stopword) → `scoreSearch` | "closest matches… **GARLIC SNAILS, HERENCIA REPOSADO, HERENCIA ANEJO**" | ❌ Fail |
| `wats gud here` | same path (misspelling irrelevant — never matched intent) | identical: GARLIC SNAILS + 2 tequilas | ❌ Fail |
| `best steak` | `best` → `isRecommendationQuestion` → `recommend("best steak")` (steak intent) | "PRIME STEAK & LAMB CHOPS, … RUMP STEAK, …" | ✅ Success |
| `stake` | no intent; no name match → generic fallback reply | reply = "I can help with the menu…"; suggestions = popular (Tomahawk/Wagyu/Fillet by luck) | ❌ Fail (no spell-correct) |
| `something spicy pls` | `scoreSearch` (+spicy bonus) | "BOEREWORS & CHAKALAKA, TEMPURA CHICKEN, TEMPURA PRAWN" | ⚠️ Partial |
| `veg options` | `scoreSearch` (`veg` substring) — **not** the dietary branch | "FRIED HALLOUMI FINGERS, GREEK SALAD, …" | ⚠️ Partial |
| `im hungry lol` | no intent → generic fallback + popular | reply = "I can help…"; popular Tomahawk/Wagyu/Fillet | ⚠️ Partial |

### Root-cause spotlight — the #1 question fails
"whats good here" is the single most natural question and it returns **two tequila shots
and a plate of snails**. Why:
1. `isRecommendationQuestion` ([aiService.js:498](Sites/Trump/server/services/aiService.js#L498))
   matches `"what is good"` but **not** `"whats good"`/`"what's good"`/bare `"good"`.
2. The tokenizer then **drops `good`** (stopword), leaving tokens `whats`, `here`.
3. `scoreSearch` matches `here` as a **substring of "herencia"** → the Herencia tequilas
   score, and `snails`/`garlic` match other tokens. Off-target, category-mixed
   (STARTER + 2×DRINK), no beverage primacy.

## 3. Successes

- Explicit, correctly-spelled intents work well: **"best steak"**, and (from prior
  probes) wine/cellar queries, deals/specials, and category questions route correctly.
- The **exclusion** layer ("no seafood", "without cheese") functions
  ([aiService.js:392](Sites/Trump/server/services/aiService.js#L392)).
- **Spicy** has a dedicated scoring bonus, so "spicy" surfaces chilli/peri items.
- Graceful, non-empty fallback (popular items) for unrecognised input — never a dead end.

## 4. Failures

- **Misspellings** (`stake`→steak, `gud`→good, `wats`→what's): unsupported — no spell
  correction or fuzzy token match.
- **Casual/positive-vague** (`whats good here`, `im hungry lol`): misrouted or generic;
  the most common phrasing of "what's good" is not recognised as a recommendation intent.
- **Substring false-positives** in `scoreSearch` (`here`→`herencia`) surface irrelevant
  items and undercut quality.
- **Abbreviations** (`veg`) bypass the dedicated dietary branch (which only triggers on
  `vegetarian`/`vegan`), landing in generic search instead of allergen-aware handling.
- **Category mixing** in answers (no beverage-primacy/stage rules in chat replies — same
  root issue as recommendation findings F1/F4).

## 5. Intent coverage gaps

| Intent the guest expresses | Today | Gap |
|---|---|---|
| "what's good / what do you recommend" (vague positive) | partial/misrouted | needs robust recommendation routing incl. `whats good`, `good`, `recommend`, `nice`, `popular` |
| Misspelled dish/category (`stake`, `chiken`, `desert`) | fail | needs fuzzy/edit-distance match to menu terms + intent keywords |
| Slang / fillers (`gud`, `pls`, `lol`, `yo`) | noise, unhandled | needs a normalization/slang map + filler stripping |
| Abbreviations (`veg`, `app`, `cab`) | partial | needs synonym/abbreviation expansion → canonical intents |
| Incomplete sentences (`steak?`, `something light`) | mixed | "light" works; one-word fragments often fail |
| Restaurant questions (hours, allergens detail, ingredients, policies) | not covered | see [Task 7](Sites/Trump/docs/phase2/07-restaurant-knowledge-architecture.md) |

## 6. Design implications (for a later phase — no code changes now)

1. **Normalize before routing:** lowercase → slang/abbreviation map (`gud→good`,
   `veg→vegetarian`, `pls/lol→∅`) → light spell-correction against a **menu+intent
   lexicon** (edit distance ≤1–2; deterministic, no external AI).
2. **Fix intent gates:** treat `good`/`nice`/`recommend`/`what's good`/`popular` as a
   recommendation intent that routes to chef-curated → popular (Tasks 2–4), not raw
   `scoreSearch`.
3. **Stop substring false-positives:** require word-boundary matches (the client already
   has `hasTerm()` with boundaries in [imageResolver.ts:248](Sites/Trump/client/src/lib/imageResolver.ts#L248))
   and stop stripping intent words before scoring.
4. **Apply category-safety (Task 3) to chat suggestions** so replies don't mix two
   beverages / wrong-stage items.
5. **Add a knowledge layer (Task 7)** for non-menu questions (hours, allergens, policies).

All deterministic and local — **no external AI / paid APIs**, consistent with the brief.
