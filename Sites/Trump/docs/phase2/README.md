# Phase 2 — Recommendation Engine, Menu Intelligence & Chatbot (Audit & Design)

**Audit and design only — no recommendation code, UI, or schema was modified.**
Branch `feat/phase2-recommendation-design`. Findings are evidence-based: code trace plus
live read-only probes against the running server (2026-06-03). No external AI / paid APIs
are proposed anywhere.

## Deliverables

1. [Recommendation Audit](01-recommendation-audit.md) — flow, data sources, pairing/category/drink/cart/chat logic, and 8 findings (F1–F8) with live proof.
2. [Recommendation Database Design](02-recommendation-database-design.md) — per-item, chef-controlled schema (priority / active / seasonal / rotation group). Proposal only.
3. [Category Safety Rules](03-category-safety-rules.md) — R1–R8 constraints (one primary beverage, no wine+cocktail, no dessert→starter, no drink→drink, compatibility matrix).
4. [Recommendation Rotation](04-recommendation-rotation-design.md) — seeded, weighted, reportable rotation that respects priority.
5. [UI Migration Plan](05-recommendation-ui-migration-plan.md) — inventory of ≥3 divergent card layouts → one themeable `RecommendationCard`. No UI changes.
6. [Chatbot Audit](06-chatbot-audit.md) — empirical results for the 7 test phrases; root causes; intent coverage gaps.
7. [Restaurant Knowledge Architecture](07-restaurant-knowledge-architecture.md) — local, deterministic knowledge system (hours, policies, allergens, ingredients, specials, pairings).

## Headline findings (proven live)

- A **dessert-only cart** was recommended a **STARTER** plus **both a coffee and a wine** — violating course logic and "one primary beverage."
- A **wine-only cart** was recommended **water** ("drink→drink").
- The most natural question, **"whats good here"**, returns **two tequilas and a plate of snails** (intent-gate gap + stopword stripping + `here`→`herencia` substring match).
- **Misspellings** ("stake", "wats gud") are not understood (no spell-correction).
- **Chef curation is low-leverage**: chef groups only fire when the cart already matches, and per-item `chefPick`/`popular` flags are ignored by the engine — so "chef-curated over algorithmic" is not achievable today (motivates Deliverable 2).

## Scope note

Phase 2 stops at audit + design. Implementation (schema migration, engine changes, UI
consolidation, chatbot normalization, knowledge service) is sequenced for a later phase
and must remain fully local with no external AI.
