# Open-source research notes

ARVEN is built from a clean codebase. The projects below are architecture/product references, not copied source.

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
- barcode/product data is a future catalog-enrichment path
- label/OCR/AI extraction must preserve uncertainty and source evidence

Open Food Facts is a candidate external source adapter, not ARVEN's only source. Source-specific API/data-license requirements must be reviewed before production ingestion.

## ARVEN decisions derived from the research

1. `plan -> recipe/food -> pantry -> shopping` will share normalized ingredient identifiers.
2. Foods always carry provenance. AI cannot create trusted nutrition records.
3. Recipes and plans are versioned so a user's historical log does not change when a recipe is edited later.
4. AI proposals are schema-validated and confirmation-gated.
5. The core domain remains independent of the first database/storage vendor.
