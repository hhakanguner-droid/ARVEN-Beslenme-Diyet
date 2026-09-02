# Open-source research notes

ARVEN is built from a clean codebase. The projects below are architecture/product references, not copied source. License boundaries are respected: we reuse product concepts and public architectural lessons, not AGPL/GPL implementation code.

## Mealie

Repository: `mealie-recipes/mealie`

Useful ideas:

- meal planning and shopping list belong in one product loop
- recipe data should be reusable rather than duplicated per plan
- external API boundaries make later integrations easier
- Docker/self-host discipline encourages explicit persistence and configuration

License note: Mealie is AGPL. We do not copy its implementation into ARVEN.

## Tandoor Recipes

Repository: `TandoorRecipes/recipes`

Useful ideas:

- planning, recipes, pantry and shopping are stronger when connected
- ingredient/unit normalization matters early
- search/tagging becomes important once the food/recipe catalog grows
- AI should augment structured recipe data rather than replace it

License note: Tandoor has AGPL/Common-Clause licensing considerations. We use product concepts only, not source code.

## Open Food Facts

Repository: `openfoodfacts/openfoodfacts-server`

Useful ideas:

- nutrition facts need provenance and product identifiers
- barcode/product data is a catalog-enrichment path
- ingredient/allergen identities are safer than matching food names
- label/OCR/AI extraction must preserve uncertainty and source evidence

Open Food Facts is a candidate external source adapter, not ARVEN's only source. Source-specific API/data-license requirements must be reviewed before production ingestion.

## OpenNutriTracker

Repository: `simonoppowa/OpenNutriTracker`

Useful ideas adopted into ARVEN architecture:

- calorie/energy target calculations should expose the method, version, inputs and scientific references rather than behave like a black box
- daily energy can be distributed across breakfast/lunch/dinner/snacks with user-configurable shares that total 100%
- recently logged foods deserve a fast re-log path
- barcode lookup and manual barcode entry are first-class food discovery paths
- multiple nutrition databases can coexist behind one normalized model
- nutrition-day start can be configured for people whose eating/logging day crosses midnight
- kcal/kJ is a display preference, not a separate nutrition truth model
- missing micronutrients must be represented as incomplete/unknown rather than silently counted as zero
- water quick-add should have a simple undo/correction path
- export/import is part of user ownership, not an afterthought

Not copied: implementation code, equations without independent verification, UI assets or database-specific code.

## FoodYou

Repository: `maksimowiczm/FoodYou`

Useful ideas adopted into ARVEN architecture:

- the home screen can be modular and user-orderable while keeping an ARVEN canonical default layout
- food search can filter/priority-order multiple data providers
- a nutrition model should support a broad micronutrient set without making every source pretend to have every value
- nutrient values carry completeness state (`complete`, `partial`, `unknown`)
- serving/household measurements resolve to internal weights before calculation
- data backup/export and recipe creation deserve explicit domain boundaries

Important ARVEN difference: FoodYou is strongly local/privacy oriented; ARVEN is planned as a multi-user cloud product, so its privacy model is implemented through server-side authorization, user isolation and private storage rather than by copying local-only persistence.

## SmartFit Planner AI

Repository: `BALADURGAG24/smartfit-planner-ai`

Useful ideas adopted into ARVEN planning:

- a structured onboarding/assessment can collect goals, activity, dietary preferences, restrictions and health context
- progress analytics can feed a weekly AI narrative: positives, improvement areas and practical suggestions
- weekly reports/PDF exports are useful user-facing outputs
- future activity/sleep/step integrations can enrich context when the user chooses to connect them

Explicitly rejected pattern:

- SmartFit prompts the model to generate maintenance calories, target calories, macros and meal calories. ARVEN does **not** adopt this. Energy/macro targets and adherence metrics remain deterministic, versioned and source/provenance-aware. AI may interpret precomputed metrics but cannot replace them with model-authored numbers.

## ARVEN decisions derived from the research

1. `plan -> recipe/food -> pantry -> shopping` will share normalized ingredient identifiers.
2. Foods always carry provenance. AI cannot create trusted nutrition records.
3. Natural household portions are the user language; verified grams remain the calculation language.
4. Nutrition completeness is explicit. Unknown fibre/micronutrients are never converted to factual zero.
5. Food/allergen safety is identifier-based and fail-closed when required allergen evidence is unresolved.
6. Multiple nutrition providers are normalized behind one catalog contract and can be enabled/prioritized per user.
7. Scientific target calculations store method/version/inputs/reference IDs and can be explained to the user.
8. Per-meal target allocation is a first-class domain concept and must sum to 100%.
9. Recently logged foods, barcode lookup, water correction, nutrition-day start and kcal/kJ preferences are supported by core contracts rather than UI hacks.
10. AI proposals are schema-validated and confirmation-gated; weekly AI insights are narrative-only over deterministic metrics.
11. Recipes and plans are versioned so a user's historical log does not change when a recipe is edited later.
12. The core domain remains independent of the first database/storage vendor.
13. User data portability (versioned export/import) is a product requirement.
