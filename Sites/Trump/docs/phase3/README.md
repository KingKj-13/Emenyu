# Phase 3 — Recommendation Engine, Chatbot & Recommendation UI (Implementation)

Implements the approved [Phase 2 designs](../phase2/README.md). Scope: `Sites/Trump` only.
Everything is **local and deterministic** — no external AI, no paid APIs, no hidden agents.
Branch `feat/phase3-reco-implementation`. Not deployed.

## What shipped

| Task | Deliverable | Where |
|---|---|---|
| 1 | Recommendation schema (priority / active / seasonal / rotation_group / reason) | `prisma/schema.prisma` → `MenuItemRecommendation`; migration `prisma/migrations/*/migration.sql`; seed `scripts/seed-chef-recommendations.js` (`npm run reco:seed`) |
| 2 | Chef-first engine (Chef → Safety → Rotation → Fallback) | `server/services/aiService.js` `recommend()` |
| 3 | Category safety rules R1–R7 + single authoritative classifier | `server/services/recommendationRules.js`, `server/services/categoryClassifier.js` (client consumes `categoryType`/`beverageKind`; no duplicate client logic) |
| 4 | Weighted, seeded, explainable rotation | `server/services/rotationService.js` |
| 5 | Chatbot understanding (typos + synonyms → one intent) | `server/services/chatbotNlu.js` (wired into `aiService.chat()`) |
| 6 | Local restaurant knowledge (hours / policies / allergens / specials) | `server/services/knowledgeService.js` + `data/knowledge.json` |
| 7 | One `RecommendationCard` across every recommendation surface | `client/src/components/reco/RecommendationCard.tsx` |
| 8 | Owner controls for chef recommendations | React console `client/src/pages/AdminPage.tsx` (Chef Recs tab) + vanilla `admin.html`/`frontend/scripts/admin.js`; API `server/controllers/menuController.js` |
| 9 | Validation reports + executable harness | this folder + `scripts/phase3-validate.js` (`npm run reco:validate`) |

## Validation reports

1. [Recommendation Validation Report](01-recommendation-validation-report.md) — safety rules, rotation, chef-first; proves the Phase 2 audit defects are fixed.
2. [Chatbot Validation Report](02-chatbot-validation-report.md) — the 7 required test phrases, with normalized form, intent and routing.
3. [UI Validation Report](03-ui-validation-report.md) — every recommendation surface now renders `RecommendationCard`.

## Reproduce the evidence

```bash
cd Sites/Trump
npm run reco:validate      # 41 deterministic checks across classifier/safety/rotation/NLU
cd client && npm run build && npm run typecheck   # client compiles clean
```

The recommendation/safety/rotation/NLU modules are pure (no DB), so `reco:validate` runs
anywhere and is fully reproducible. The chef-first **end-to-end** path and live chat
transcripts additionally require the running server + PostgreSQL (the menu lives in
Postgres); those were verified live when the backend landed (commit `23027f6`).

## Notable fix found by the harness

Writing `scripts/phase3-validate.js` surfaced two real classifier defects, now fixed in
`categoryClassifier.js`:

- `categoryType("Margarita")` returned `MAIN` while `beverageKind` returned `COCKTAIL` —
  the two classifiers disagreed. `categoryType` now defers to the `beverageKind` lexicon
  for named cocktails/spirits, so they can never disagree.
- Plural category names ("Beers", "Wines") missed the singular keyword because of a
  trailing `\b`. Beverage patterns now accept an optional plural `s` (safe: `port` still
  won't match `porter`).
