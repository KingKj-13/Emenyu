# Task 7 — Restaurant Knowledge System (Architecture Proposal)

**Design only. No external AI, no paid APIs.** Goal: let the local chatbot answer
restaurant questions — ingredients, allergens, pairings, specials, opening hours,
policies, chef recommendations — deterministically, from local data.

## 1. What the chatbot can answer today

| Topic | Source today | Status |
|---|---|---|
| Allergens | `MenuItem.allergens` (free text) | partial — `buildDietaryReply` keyword filter only |
| Ingredients | `MenuItem.description` (prose) | none structured |
| Pairings | `recommend()` engine | yes (algorithmic; chef per-item coming in Task 2) |
| Specials | `DealOfDay.json` → `buildDealsReply` | yes |
| Chef recommendations | `Recommendation`/`FeaturedItem` | partial (Task 2 improves) |
| Opening hours | — | **none** |
| Policies (corkage, kids, dress, parking, wifi…) | — | **none** |

So hours and policies are entirely unanswerable, and allergen/ingredient answers rely on
prose. (A dead `data/menu_embeddings.pkl` from the retired Python bot exists but is **not**
used and will **not** be resurrected — we stay local/JS.)

## 2. Design principles

1. **100% local + deterministic** — keyword/slot intent resolution + structured lookups +
   template wording. No LLM, no network.
2. **Structured-first** — answers come from typed fields, not prose parsing, so they're
   correct and auditable.
3. **Reuse the local NLG layer** — compose answers with the existing
   `templateNlgProvider` ([server/services/nlg/templateNlgProvider.js](Sites/Trump/server/services/nlg/templateNlgProvider.js))
   for consistent hospitality tone.
4. **Chef/owner editable** — knowledge lives in DB/config, not code.

## 3. Architecture

```
guest question
   │
   ▼
normalize (Task 6: slang/abbrev/spell)  →  intent classifier (deterministic)
   │
   ├─ HOURS        → RestaurantProfile.hours      → "open now?" calc → NLG
   ├─ POLICY       → RestaurantProfile.policies / KnowledgeEntry → NLG
   ├─ ALLERGEN     → MenuItem.allergens + Ingredient links        → NLG
   ├─ INGREDIENT   → ItemIngredient / MenuItem.metadata           → NLG
   ├─ SPECIAL      → Deal (existing)                              → buildDealsReply
   ├─ PAIRING/RECO → recommend() + Task 2 chef recs + Task 3 safety→ cards + NLG
   └─ (no match)   → existing menu search / popular fallback
```

A new **KnowledgeService** owns intent→source routing and answer templating; `chat()`
gains a **knowledge branch placed before the generic menu-search fallback**.

## 4. Data model (Prisma — PROPOSAL, not migrated)

```prisma
// Singleton-ish profile: hours, contact, structured policies.
model RestaurantProfile {
  id           Int      @id @default(autoincrement())
  restaurantId String   @unique @default("trump")
  hours        Json     // [{day:0..6, open:"11:00", close:"22:00", closed?:bool}]
  timezone     String   @default("Africa/Johannesburg")
  contact      Json?    // phone, email, address, mapUrl
  policies     Json?    // { corkage, children, dress, parking, wifi, smoking, reservations }
  updatedAt    DateTime @updatedAt
}

// Free-form, chef-editable Q&A / facts the classifier can match against.
model KnowledgeEntry {
  id           Int      @id @default(autoincrement())
  restaurantId String   @default("trump")
  topic        String                         // "hours" | "policy" | "faq" | "about" | ...
  question     String                         // canonical question
  aliases      Json                           // ["do you take bookings","reservations?"]
  answer       String                         // chef-authored answer (templated/escaped)
  active       Boolean  @default(true)
  season       String   @default("ALL_YEAR")
  updatedAt    DateTime @updatedAt
  @@index([restaurantId, topic, active])
}

// Structured ingredients/allergens for precise dietary answers.
model Ingredient {
  id           Int      @id @default(autoincrement())
  restaurantId String   @default("trump")
  name         String                         // "almond"
  allergenTags Json                            // ["nuts"]
  @@unique([restaurantId, name])
}
model ItemIngredient {
  id          Int @id @default(autoincrement())
  menuItemId  Int
  ingredientId Int
  @@unique([menuItemId, ingredientId])
}
```

Reused as-is: `MenuItem.allergens/calories/spice`, `Deal` (specials), and the Task 2
`MenuItemRecommendation` (chef pairings).

## 5. Intent classification (deterministic)

A small, ordered rule set over the **normalized** message (Task 6 normalization first):

| Intent | Trigger examples | Resolver |
|---|---|---|
| HOURS | "open", "close", "hours", "what time", "open now" | `RestaurantProfile.hours` + clock |
| POLICY | "corkage", "kids", "dress code", "parking", "wifi", "book", "reservation" | `policies` / `KnowledgeEntry` |
| ALLERGEN | "nut", "gluten", "dairy", "allergic", "contain" + item | `MenuItem.allergens` + `Ingredient` |
| INGREDIENT | "what's in", "ingredients", "made with" + item | `ItemIngredient` / description |
| SPECIAL | "deal", "special", "tonight" | existing `Deal` |
| PAIRING | "pair", "go with", "wine for" | `recommend()` + Task 3 |
| FAQ/ABOUT | fuzzy match to `KnowledgeEntry.aliases` | best-match entry |

Matching is keyword + **word-boundary** (avoid the `here`→`herencia` bug, Task 6) and a
local fuzzy fallback (edit distance ≤2) over `KnowledgeEntry.aliases` and intent terms.
Optional later: a **local** TF-IDF/BM25 index over knowledge entries (pure JS, no API) for
better FAQ matching — still deterministic and offline.

## 6. Answer composition

- Structured resolvers return slots (e.g., `{open:true, closesAt:"22:00"}`) which the
  `templateNlgProvider` renders into on-brand copy ("We're open until 10pm tonight —
  shall I get a table ready?").
- Allergen answers are **conservative**: if data is incomplete, defer to the waiter
  (mirrors the current `buildDietaryReply` safety stance).

## 7. Integration & rollout (planning only)

1. Add `KnowledgeService` + the knowledge branch in `chat()` (before menu-search
   fallback).
2. Seed `RestaurantProfile` (hours/policies) and a starter `KnowledgeEntry` set with the
   owner.
3. Backfill `Ingredient`/`ItemIngredient` from menu descriptions (chef-reviewed).
4. Admin UI for profile/knowledge/ingredients (later phase).
5. Additive migrations + `prisma generate` **when implemented** — not in this phase.

## 8. Explicit constraints honoured
- No external AI providers, no paid APIs, fully offline/deterministic.
- Reuses existing local NLG and menu data; additive schema only.
- No code changed in Phase 2 — architecture/design only.
