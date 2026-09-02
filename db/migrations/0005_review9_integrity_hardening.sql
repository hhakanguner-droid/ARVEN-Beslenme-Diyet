PRAGMA foreign_keys = ON;

-- A meal item is part of one user's immutable meal history. Reparenting is not
-- an edit operation; delete/recreate inside the authenticated user's meal if needed.
CREATE TRIGGER meal_entry_items_parent_immutable
BEFORE UPDATE OF meal_entry_id ON meal_entry_items
WHEN NEW.meal_entry_id IS NOT OLD.meal_entry_id
BEGIN
  SELECT RAISE(ABORT, 'meal item parent is immutable');
END;

-- SQLite REAL accepts infinity. Bound every persisted nutrition snapshot/source
-- field so deterministic sums can never become non-finite.
CREATE TRIGGER foods_numeric_bounds_insert_r9
BEFORE INSERT ON foods
WHEN CAST(NEW.energy_kcal_100g AS REAL) > 1000000
  OR CAST(NEW.protein_g_100g AS REAL) > 1000000
  OR CAST(NEW.carbs_g_100g AS REAL) > 1000000
  OR CAST(NEW.fat_g_100g AS REAL) > 1000000
  OR (NEW.fiber_g_100g IS NOT NULL AND CAST(NEW.fiber_g_100g AS REAL) > 1000000)
BEGIN SELECT RAISE(ABORT, 'food nutrition outside finite safety bounds'); END;

CREATE TRIGGER foods_numeric_bounds_update_r9
BEFORE UPDATE OF energy_kcal_100g, protein_g_100g, carbs_g_100g, fat_g_100g, fiber_g_100g ON foods
WHEN CAST(NEW.energy_kcal_100g AS REAL) > 1000000
  OR CAST(NEW.protein_g_100g AS REAL) > 1000000
  OR CAST(NEW.carbs_g_100g AS REAL) > 1000000
  OR CAST(NEW.fat_g_100g AS REAL) > 1000000
  OR (NEW.fiber_g_100g IS NOT NULL AND CAST(NEW.fiber_g_100g AS REAL) > 1000000)
BEGIN SELECT RAISE(ABORT, 'food nutrition outside finite safety bounds'); END;

CREATE TRIGGER food_portion_options_numeric_bounds_insert_r9
BEFORE INSERT ON food_portion_options
WHEN CAST(NEW.grams_per_unit AS REAL) > 1000000
BEGIN SELECT RAISE(ABORT, 'portion grams outside finite safety bounds'); END;

CREATE TRIGGER food_portion_options_numeric_bounds_update_r9
BEFORE UPDATE OF grams_per_unit ON food_portion_options
WHEN CAST(NEW.grams_per_unit AS REAL) > 1000000
BEGIN SELECT RAISE(ABORT, 'portion grams outside finite safety bounds'); END;

CREATE TRIGGER food_nutrients_numeric_bounds_insert_r9
BEFORE INSERT ON food_nutrients
WHEN NEW.amount_per_100g IS NOT NULL AND CAST(NEW.amount_per_100g AS REAL) > 1000000000000
BEGIN SELECT RAISE(ABORT, 'food nutrient amount outside finite safety bounds'); END;

CREATE TRIGGER food_nutrients_numeric_bounds_update_r9
BEFORE UPDATE OF amount_per_100g ON food_nutrients
WHEN NEW.amount_per_100g IS NOT NULL AND CAST(NEW.amount_per_100g AS REAL) > 1000000000000
BEGIN SELECT RAISE(ABORT, 'food nutrient amount outside finite safety bounds'); END;

CREATE TRIGGER meal_entry_items_snapshot_bounds_insert_r9
BEFORE INSERT ON meal_entry_items
WHEN CAST(NEW.energy_kcal AS REAL) > 1000000
  OR CAST(NEW.protein_g AS REAL) > 1000000
  OR CAST(NEW.carbs_g AS REAL) > 1000000
  OR CAST(NEW.fat_g AS REAL) > 1000000
  OR (NEW.fiber_g IS NOT NULL AND CAST(NEW.fiber_g AS REAL) > 1000000)
BEGIN SELECT RAISE(ABORT, 'meal nutrition snapshot outside finite safety bounds'); END;

CREATE TRIGGER meal_entry_items_snapshot_bounds_update_r9
BEFORE UPDATE OF energy_kcal, protein_g, carbs_g, fat_g, fiber_g ON meal_entry_items
WHEN CAST(NEW.energy_kcal AS REAL) > 1000000
  OR CAST(NEW.protein_g AS REAL) > 1000000
  OR CAST(NEW.carbs_g AS REAL) > 1000000
  OR CAST(NEW.fat_g AS REAL) > 1000000
  OR (NEW.fiber_g IS NOT NULL AND CAST(NEW.fiber_g AS REAL) > 1000000)
BEGIN SELECT RAISE(ABORT, 'meal nutrition snapshot outside finite safety bounds'); END;

CREATE TRIGGER meal_item_nutrients_numeric_bounds_insert_r9
BEFORE INSERT ON meal_entry_item_nutrients
WHEN NEW.amount IS NOT NULL AND CAST(NEW.amount AS REAL) > 1000000000000
BEGIN SELECT RAISE(ABORT, 'meal nutrient snapshot outside finite safety bounds'); END;

CREATE TRIGGER meal_item_nutrients_numeric_bounds_update_r9
BEFORE UPDATE OF amount ON meal_entry_item_nutrients
WHEN NEW.amount IS NOT NULL AND CAST(NEW.amount AS REAL) > 1000000000000
BEGIN SELECT RAISE(ABORT, 'meal nutrient snapshot outside finite safety bounds'); END;

-- Shape-only ISO checks are insufficient because julianday normalizes impossible
-- dates (e.g. 2026-02-31). Round-trip the calendar date component explicitly.
CREATE TRIGGER ai_actions_occurrence_calendar_insert_r9
BEFORE INSERT ON ai_actions
WHEN NEW.action_type IN ('meal-log','water-log')
  AND date(substr(json_extract(NEW.payload_json, '$.occurredAt'), 1, 10)) IS NOT substr(json_extract(NEW.payload_json, '$.occurredAt'), 1, 10)
BEGIN SELECT RAISE(ABORT, 'AI action occurredAt contains an invalid calendar date'); END;

CREATE TRIGGER ai_actions_occurrence_calendar_update_r9
BEFORE UPDATE OF action_type, payload_json ON ai_actions
WHEN NEW.action_type IN ('meal-log','water-log')
  AND date(substr(json_extract(NEW.payload_json, '$.occurredAt'), 1, 10)) IS NOT substr(json_extract(NEW.payload_json, '$.occurredAt'), 1, 10)
BEGIN SELECT RAISE(ABORT, 'AI action occurredAt contains an invalid calendar date'); END;

-- Lifecycle timestamps are state evidence, not independently writable metadata.
CREATE TRIGGER ai_actions_timestamp_state_consistency_r9
BEFORE UPDATE OF status, confirmed_at, applied_at ON ai_actions
WHEN (NEW.status = 'proposed' AND (NEW.confirmed_at IS NOT NULL OR NEW.applied_at IS NOT NULL))
   OR (NEW.status = 'confirmed' AND (NEW.confirmed_at IS NULL OR NEW.applied_at IS NOT NULL))
   OR (NEW.status = 'applied' AND (NEW.confirmed_at IS NULL OR NEW.applied_at IS NULL))
   OR (NEW.status = 'rejected' AND (NEW.confirmed_at IS NOT NULL OR NEW.applied_at IS NOT NULL))
   OR (NEW.status = 'failed' AND NEW.applied_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'AI action timestamps are inconsistent with lifecycle status'); END;

-- Atomic meal-allocation JSON must have one interpretation in SQLite JSON1 and
-- JavaScript JSON.parse. Reject duplicate keys inside every allocation object.
CREATE TRIGGER goal_meal_allocations_no_duplicate_keys_insert_r9
BEFORE INSERT ON goal_meal_allocations
WHEN EXISTS (
  SELECT 1 FROM json_each(NEW.allocations_json) item
  WHERE EXISTS (
    SELECT 1 FROM json_tree(item.value) jt
    WHERE jt.key IS NOT NULL
    GROUP BY jt.parent, jt.key
    HAVING COUNT(*) > 1
  )
)
BEGIN SELECT RAISE(ABORT, 'meal allocation contains duplicate JSON object keys'); END;

CREATE TRIGGER goal_meal_allocations_no_duplicate_keys_update_r9
BEFORE UPDATE OF allocations_json ON goal_meal_allocations
WHEN EXISTS (
  SELECT 1 FROM json_each(NEW.allocations_json) item
  WHERE EXISTS (
    SELECT 1 FROM json_tree(item.value) jt
    WHERE jt.key IS NOT NULL
    GROUP BY jt.parent, jt.key
    HAVING COUNT(*) > 1
  )
)
BEGIN SELECT RAISE(ABORT, 'meal allocation contains duplicate JSON object keys'); END;

-- REPLACE executes an INSERT path and may bypass delete/update trigger assumptions
-- when recursive_triggers is off. Refuse any insert collision for a reference id
-- already used by a goal; corrections create a new version id.
CREATE TRIGGER scientific_references_prevent_replace_used_r9
BEFORE INSERT ON scientific_references
WHEN EXISTS (SELECT 1 FROM scientific_references s WHERE s.id = NEW.id)
  AND EXISTS (
    SELECT 1 FROM goals g, json_each(g.reference_ids_json) refs
    WHERE json_valid(g.reference_ids_json) = 1
      AND trim(CAST(refs.value AS TEXT)) = NEW.id
  )
BEGIN SELECT RAISE(ABORT, 'used scientific reference cannot be replaced; create a new version'); END;

-- TEXT PRIMARY KEY is not an implicit NOT NULL guarantee in ordinary SQLite
-- rowid tables. Safety identifiers are explicitly non-null and nonblank.
CREATE TRIGGER allergen_catalog_nonnull_insert_r9
BEFORE INSERT ON allergen_catalog
WHEN NEW.id IS NULL OR NEW.canonical_name IS NULL OR length(trim(NEW.id)) = 0 OR length(trim(NEW.canonical_name)) = 0
BEGIN SELECT RAISE(ABORT, 'allergen identifiers and names must be nonnull and nonblank'); END;

CREATE TRIGGER allergen_catalog_nonnull_update_r9
BEFORE UPDATE OF id, canonical_name ON allergen_catalog
WHEN NEW.id IS NULL OR NEW.canonical_name IS NULL OR length(trim(NEW.id)) = 0 OR length(trim(NEW.canonical_name)) = 0
BEGIN SELECT RAISE(ABORT, 'allergen identifiers and names must be nonnull and nonblank'); END;

CREATE TRIGGER dietary_rule_catalog_nonnull_insert_r9
BEFORE INSERT ON dietary_rule_catalog
WHEN NEW.id IS NULL OR NEW.canonical_name IS NULL OR length(trim(NEW.id)) = 0 OR length(trim(NEW.canonical_name)) = 0
BEGIN SELECT RAISE(ABORT, 'dietary rule identifiers and names must be nonnull and nonblank'); END;

CREATE TRIGGER dietary_rule_catalog_nonnull_update_r9
BEFORE UPDATE OF id, canonical_name ON dietary_rule_catalog
WHEN NEW.id IS NULL OR NEW.canonical_name IS NULL OR length(trim(NEW.id)) = 0 OR length(trim(NEW.canonical_name)) = 0
BEGIN SELECT RAISE(ABORT, 'dietary rule identifiers and names must be nonnull and nonblank'); END;
