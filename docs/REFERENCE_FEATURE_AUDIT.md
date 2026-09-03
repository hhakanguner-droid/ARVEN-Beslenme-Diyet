# Reference feature audit

This document records which ideas were adopted from public nutrition/fitness projects and how ARVEN differs. It is a product/architecture audit, not a source-code derivation log.

| Reference | Useful idea | ARVEN status | ARVEN implementation / phase |
|---|---|---|---|
| OpenNutriTracker | Scientific references behind targets | Adopted | `scientific_references`, goal calculation provenance, Phase 2 details screen |
| OpenNutriTracker | Per-meal energy target shares | Adopted | `goal_meal_allocations`, `MealEnergyAllocation` |
| OpenNutriTracker | Recent foods / one-tap re-log | Adopted | `FoodRepository.getRecentlyLogged`, Phase 3 UI |
| OpenNutriTracker | Barcode lookup | Adopted | food barcode index + repository lookup, Phase 3 scanner/manual entry |
| OpenNutriTracker | Multiple nutrition databases | Adopted | normalized providers + per-user provider priority |
| OpenNutriTracker | Micronutrients with unknown-state handling | Adopted | `ExtendedNutritionFacts`, completeness state, `food_nutrients` |
| OpenNutriTracker | kcal/kJ preference | Adopted | profile preference; kcal remains internal canonical energy truth |
| OpenNutriTracker | Nutrition-day boundary | Adopted | `nutrition_day_start_minutes` |
| OpenNutriTracker | Transparent list of external data destinations | Adopted | `lib/privacy/data-flows.ts`; Privacy UI later renders this registry |
| OpenNutriTracker | Data export/import ownership | Adopted | versioned export manifest + Phase 9 implementation |
| FoodYou | Modular home cards | Adopted | user home-card ordering with ARVEN canonical default |
| FoodYou | Broad micronutrient tracking | Adopted | extended nutrient model with per-value completeness |
| FoodYou | Multi-source food search | Adopted | provider-aware catalog contract and source preferences |
| FoodYou | Household serving measures | Adopted | natural portion options resolve to verified grams |
| FoodYou | Recipe nutrition calculated from ingredients | Planned | Phase 3 recipe builder; deterministic calculations only |
| SmartFit Planner AI | Structured fitness/nutrition assessment | Adopted | `assessment_snapshots`; full onboarding in Phase 2 |
| SmartFit Planner AI | AI coach | Adopted with stricter boundary | ARVEN chat/Context Engine; AI cannot author numeric nutrition truth |
| SmartFit Planner AI | Progress analytics | Adopted | deterministic weekly metrics, Phase 8 charts |
| SmartFit Planner AI | Narrative weekly coaching | Adopted with stricter boundary | AI receives precomputed metrics and writes narrative only |
| SmartFit Planner AI | PDF progress report | Planned | Phase 8, generated from verified deterministic metrics |
| SmartFit Planner AI | AI-generated calories/macros | Rejected | targets/calories/macros remain deterministic and provenance-aware |
| Mealie | Recipes + plans + shopping list loop | Adopted | shared ingredient identities; Phases 3/7 |
| Tandoor Recipes | Recipes + pantry + shopping integration | Adopted | Phase 7 |
| Open Food Facts | Product identity, barcode and allergen evidence | Adopted | verified food source + barcode + identifier-based allergen model |

## Clean-room rule

ARVEN does not copy GPL/AGPL implementation code, assets or UI. The references above inform requirements and architecture only. Every ARVEN implementation is written in this repository against ARVEN's own domain rules, safety constraints and data model.
