PRAGMA foreign_keys = ON;

-- User-owned water history cannot move between accounts.
CREATE TRIGGER water_logs_owner_immutable_r10
BEFORE UPDATE OF user_id ON water_logs
WHEN NEW.user_id IS NOT OLD.user_id
BEGIN SELECT RAISE(ABORT, 'water log ownership is immutable'); END;

-- Goal targets are numeric truth. SQLite affinity alone is not sufficient.
CREATE TRIGGER goals_numeric_truth_insert_r10
BEFORE INSERT ON goals
WHEN typeof(NEW.energy_kcal) NOT IN ('integer','real')
  OR typeof(NEW.protein_g) NOT IN ('integer','real')
  OR typeof(NEW.carbs_g) NOT IN ('integer','real')
  OR typeof(NEW.fat_g) NOT IN ('integer','real')
  OR (NEW.fiber_g IS NOT NULL AND typeof(NEW.fiber_g) NOT IN ('integer','real'))
  OR (NEW.water_ml IS NOT NULL AND typeof(NEW.water_ml) NOT IN ('integer','real'))
  OR NEW.energy_kcal <= 0 OR NEW.energy_kcal > 20000
  OR NEW.protein_g < 0 OR NEW.protein_g > 2000
  OR NEW.carbs_g < 0 OR NEW.carbs_g > 3000
  OR NEW.fat_g < 0 OR NEW.fat_g > 2000
  OR (NEW.fiber_g IS NOT NULL AND (NEW.fiber_g < 0 OR NEW.fiber_g > 1000))
  OR (NEW.water_ml IS NOT NULL AND (NEW.water_ml < 0 OR NEW.water_ml > 20000))
BEGIN SELECT RAISE(ABORT, 'goal target outside numeric safety bounds'); END;

CREATE TRIGGER goals_numeric_truth_update_r10
BEFORE UPDATE OF energy_kcal, protein_g, carbs_g, fat_g, fiber_g, water_ml ON goals
WHEN typeof(NEW.energy_kcal) NOT IN ('integer','real')
  OR typeof(NEW.protein_g) NOT IN ('integer','real')
  OR typeof(NEW.carbs_g) NOT IN ('integer','real')
  OR typeof(NEW.fat_g) NOT IN ('integer','real')
  OR (NEW.fiber_g IS NOT NULL AND typeof(NEW.fiber_g) NOT IN ('integer','real'))
  OR (NEW.water_ml IS NOT NULL AND typeof(NEW.water_ml) NOT IN ('integer','real'))
  OR NEW.energy_kcal <= 0 OR NEW.energy_kcal > 20000
  OR NEW.protein_g < 0 OR NEW.protein_g > 2000
  OR NEW.carbs_g < 0 OR NEW.carbs_g > 3000
  OR NEW.fat_g < 0 OR NEW.fat_g > 2000
  OR (NEW.fiber_g IS NOT NULL AND (NEW.fiber_g < 0 OR NEW.fiber_g > 1000))
  OR (NEW.water_ml IS NOT NULL AND (NEW.water_ml < 0 OR NEW.water_ml > 20000))
BEGIN SELECT RAISE(ABORT, 'goal target outside numeric safety bounds'); END;

-- Calculation inputs must have one interpretation in SQLite and JSON.parse.
CREATE TRIGGER goals_calculation_inputs_no_duplicate_keys_insert_r10
BEFORE INSERT ON goals
WHEN NEW.source = 'arven-calculated' AND EXISTS (
  SELECT 1 FROM json_tree(NEW.calculation_inputs_json) jt
  WHERE jt.key IS NOT NULL
  GROUP BY jt.parent, jt.key
  HAVING COUNT(*) > 1
)
BEGIN SELECT RAISE(ABORT, 'calculation inputs contain duplicate JSON object keys'); END;

CREATE TRIGGER goals_calculation_inputs_no_duplicate_keys_update_r10
BEFORE UPDATE OF calculation_inputs_json ON goals
WHEN NEW.source = 'arven-calculated' AND EXISTS (
  SELECT 1 FROM json_tree(NEW.calculation_inputs_json) jt
  WHERE jt.key IS NOT NULL
  GROUP BY jt.parent, jt.key
  HAVING COUNT(*) > 1
)
BEGIN SELECT RAISE(ABORT, 'calculation inputs contain duplicate JSON object keys'); END;

-- Scientific reference identifiers are explicitly non-null and null-safe immutable when used.
CREATE TRIGGER scientific_references_nonnull_id_insert_r10
BEFORE INSERT ON scientific_references
WHEN NEW.id IS NULL OR length(trim(NEW.id, char(9)||char(10)||char(13)||' ')) = 0
BEGIN SELECT RAISE(ABORT, 'scientific reference id must be nonnull and nonblank'); END;

CREATE TRIGGER scientific_references_nonnull_id_update_r10
BEFORE UPDATE OF id ON scientific_references
WHEN NEW.id IS NULL OR length(trim(NEW.id, char(9)||char(10)||char(13)||' ')) = 0
BEGIN SELECT RAISE(ABORT, 'scientific reference id must be nonnull and nonblank'); END;

CREATE TRIGGER scientific_references_prevent_nullsafe_id_rewrite_r10
BEFORE UPDATE OF id ON scientific_references
WHEN NEW.id IS NOT OLD.id AND EXISTS (
  SELECT 1 FROM goals g, json_each(g.reference_ids_json) refs
  WHERE json_valid(g.reference_ids_json) = 1 AND trim(CAST(refs.value AS TEXT)) = OLD.id
)
BEGIN SELECT RAISE(ABORT, 'scientific reference id is still used by a goal'); END;

-- Full whitespace class, not SQLite trim()'s default space-only behavior.
CREATE TRIGGER allergen_catalog_whitespace_insert_r10
BEFORE INSERT ON allergen_catalog
WHEN NEW.id IS NULL OR NEW.canonical_name IS NULL
  OR length(trim(NEW.id, char(9)||char(10)||char(13)||' ')) = 0
  OR length(trim(NEW.canonical_name, char(9)||char(10)||char(13)||' ')) = 0
BEGIN SELECT RAISE(ABORT, 'allergen identifiers and names must be canonical'); END;

CREATE TRIGGER allergen_catalog_whitespace_update_r10
BEFORE UPDATE OF id, canonical_name ON allergen_catalog
WHEN NEW.id IS NULL OR NEW.canonical_name IS NULL
  OR length(trim(NEW.id, char(9)||char(10)||char(13)||' ')) = 0
  OR length(trim(NEW.canonical_name, char(9)||char(10)||char(13)||' ')) = 0
BEGIN SELECT RAISE(ABORT, 'allergen identifiers and names must be canonical'); END;

CREATE TRIGGER dietary_rule_catalog_whitespace_insert_r10
BEFORE INSERT ON dietary_rule_catalog
WHEN NEW.id IS NULL OR NEW.canonical_name IS NULL
  OR length(trim(NEW.id, char(9)||char(10)||char(13)||' ')) = 0
  OR length(trim(NEW.canonical_name, char(9)||char(10)||char(13)||' ')) = 0
BEGIN SELECT RAISE(ABORT, 'dietary rule identifiers and names must be canonical'); END;

CREATE TRIGGER dietary_rule_catalog_whitespace_update_r10
BEFORE UPDATE OF id, canonical_name ON dietary_rule_catalog
WHEN NEW.id IS NULL OR NEW.canonical_name IS NULL
  OR length(trim(NEW.id, char(9)||char(10)||char(13)||' ')) = 0
  OR length(trim(NEW.canonical_name, char(9)||char(10)||char(13)||' ')) = 0
BEGIN SELECT RAISE(ABORT, 'dietary rule identifiers and names must be canonical'); END;

-- Numeric storage classes are mandatory at every persisted nutrition boundary.
CREATE TRIGGER foods_numeric_storage_insert_r10
BEFORE INSERT ON foods
WHEN typeof(NEW.energy_kcal_100g) NOT IN ('integer','real')
  OR typeof(NEW.protein_g_100g) NOT IN ('integer','real')
  OR typeof(NEW.carbs_g_100g) NOT IN ('integer','real')
  OR typeof(NEW.fat_g_100g) NOT IN ('integer','real')
  OR (NEW.fiber_g_100g IS NOT NULL AND typeof(NEW.fiber_g_100g) NOT IN ('integer','real'))
BEGIN SELECT RAISE(ABORT, 'food nutrition must use numeric storage'); END;

CREATE TRIGGER foods_numeric_storage_update_r10
BEFORE UPDATE OF energy_kcal_100g, protein_g_100g, carbs_g_100g, fat_g_100g, fiber_g_100g ON foods
WHEN typeof(NEW.energy_kcal_100g) NOT IN ('integer','real')
  OR typeof(NEW.protein_g_100g) NOT IN ('integer','real')
  OR typeof(NEW.carbs_g_100g) NOT IN ('integer','real')
  OR typeof(NEW.fat_g_100g) NOT IN ('integer','real')
  OR (NEW.fiber_g_100g IS NOT NULL AND typeof(NEW.fiber_g_100g) NOT IN ('integer','real'))
BEGIN SELECT RAISE(ABORT, 'food nutrition must use numeric storage'); END;

CREATE TRIGGER food_portions_numeric_storage_insert_r10
BEFORE INSERT ON food_portion_options
WHEN typeof(NEW.grams_per_unit) NOT IN ('integer','real')
BEGIN SELECT RAISE(ABORT, 'portion grams must use numeric storage'); END;

CREATE TRIGGER food_portions_numeric_storage_update_r10
BEFORE UPDATE OF grams_per_unit ON food_portion_options
WHEN typeof(NEW.grams_per_unit) NOT IN ('integer','real')
BEGIN SELECT RAISE(ABORT, 'portion grams must use numeric storage'); END;

CREATE TRIGGER food_nutrients_numeric_storage_insert_r10
BEFORE INSERT ON food_nutrients
WHEN NEW.amount_per_100g IS NOT NULL AND typeof(NEW.amount_per_100g) NOT IN ('integer','real')
BEGIN SELECT RAISE(ABORT, 'food nutrient amount must use numeric storage'); END;

CREATE TRIGGER food_nutrients_numeric_storage_update_r10
BEFORE UPDATE OF amount_per_100g ON food_nutrients
WHEN NEW.amount_per_100g IS NOT NULL AND typeof(NEW.amount_per_100g) NOT IN ('integer','real')
BEGIN SELECT RAISE(ABORT, 'food nutrient amount must use numeric storage'); END;

CREATE TRIGGER meal_items_numeric_storage_insert_r10
BEFORE INSERT ON meal_entry_items
WHEN typeof(NEW.grams) NOT IN ('integer','real')
  OR typeof(NEW.energy_kcal) NOT IN ('integer','real')
  OR typeof(NEW.protein_g) NOT IN ('integer','real')
  OR typeof(NEW.carbs_g) NOT IN ('integer','real')
  OR typeof(NEW.fat_g) NOT IN ('integer','real')
  OR (NEW.fiber_g IS NOT NULL AND typeof(NEW.fiber_g) NOT IN ('integer','real'))
  OR (NEW.portion_quantity IS NOT NULL AND typeof(NEW.portion_quantity) NOT IN ('integer','real'))
BEGIN SELECT RAISE(ABORT, 'meal item numeric truth must use numeric storage'); END;

CREATE TRIGGER meal_items_numeric_storage_update_r10
BEFORE UPDATE OF grams, energy_kcal, protein_g, carbs_g, fat_g, fiber_g, portion_quantity ON meal_entry_items
WHEN typeof(NEW.grams) NOT IN ('integer','real')
  OR typeof(NEW.energy_kcal) NOT IN ('integer','real')
  OR typeof(NEW.protein_g) NOT IN ('integer','real')
  OR typeof(NEW.carbs_g) NOT IN ('integer','real')
  OR typeof(NEW.fat_g) NOT IN ('integer','real')
  OR (NEW.fiber_g IS NOT NULL AND typeof(NEW.fiber_g) NOT IN ('integer','real'))
  OR (NEW.portion_quantity IS NOT NULL AND typeof(NEW.portion_quantity) NOT IN ('integer','real'))
BEGIN SELECT RAISE(ABORT, 'meal item numeric truth must use numeric storage'); END;

CREATE TRIGGER meal_item_nutrients_numeric_storage_insert_r10
BEFORE INSERT ON meal_entry_item_nutrients
WHEN NEW.amount IS NOT NULL AND typeof(NEW.amount) NOT IN ('integer','real')
BEGIN SELECT RAISE(ABORT, 'meal nutrient amount must use numeric storage'); END;

CREATE TRIGGER meal_item_nutrients_numeric_storage_update_r10
BEFORE UPDATE OF amount ON meal_entry_item_nutrients
WHEN NEW.amount IS NOT NULL AND typeof(NEW.amount) NOT IN ('integer','real')
BEGIN SELECT RAISE(ABORT, 'meal nutrient amount must use numeric storage'); END;

CREATE TRIGGER water_logs_numeric_storage_insert_r10
BEFORE INSERT ON water_logs
WHEN typeof(NEW.milliliters) NOT IN ('integer','real') OR NEW.milliliters > 20000
BEGIN SELECT RAISE(ABORT, 'water amount must be finite numeric storage'); END;

CREATE TRIGGER water_logs_numeric_storage_update_r10
BEFORE UPDATE OF milliliters ON water_logs
WHEN typeof(NEW.milliliters) NOT IN ('integer','real') OR NEW.milliliters > 20000
BEGIN SELECT RAISE(ABORT, 'water amount must be finite numeric storage'); END;

-- Meal snapshots are derived from the referenced food and resolved grams.
CREATE TRIGGER meal_items_snapshot_derivation_insert_r10
BEFORE INSERT ON meal_entry_items
WHEN EXISTS (
  SELECT 1 FROM foods f WHERE f.id = NEW.food_id AND (
    NEW.energy_kcal IS NOT ROUND(f.energy_kcal_100g * NEW.grams / 100.0, 0)
    OR NEW.protein_g IS NOT ROUND(f.protein_g_100g * NEW.grams / 100.0, 1)
    OR NEW.carbs_g IS NOT ROUND(f.carbs_g_100g * NEW.grams / 100.0, 1)
    OR NEW.fat_g IS NOT ROUND(f.fat_g_100g * NEW.grams / 100.0, 1)
    OR (f.fiber_g_100g IS NULL AND NEW.fiber_g IS NOT NULL)
    OR (f.fiber_g_100g IS NOT NULL AND NEW.fiber_g IS NOT ROUND(f.fiber_g_100g * NEW.grams / 100.0, 1))
  )
)
BEGIN SELECT RAISE(ABORT, 'meal nutrition snapshot must be derived from food and grams'); END;

CREATE TRIGGER meal_items_snapshot_derivation_update_r10
BEFORE UPDATE OF food_id, grams, energy_kcal, protein_g, carbs_g, fat_g, fiber_g ON meal_entry_items
WHEN EXISTS (
  SELECT 1 FROM foods f WHERE f.id = NEW.food_id AND (
    NEW.energy_kcal IS NOT ROUND(f.energy_kcal_100g * NEW.grams / 100.0, 0)
    OR NEW.protein_g IS NOT ROUND(f.protein_g_100g * NEW.grams / 100.0, 1)
    OR NEW.carbs_g IS NOT ROUND(f.carbs_g_100g * NEW.grams / 100.0, 1)
    OR NEW.fat_g IS NOT ROUND(f.fat_g_100g * NEW.grams / 100.0, 1)
    OR (f.fiber_g_100g IS NULL AND NEW.fiber_g IS NOT NULL)
    OR (f.fiber_g_100g IS NOT NULL AND NEW.fiber_g IS NOT ROUND(f.fiber_g_100g * NEW.grams / 100.0, 1))
  )
)
BEGIN SELECT RAISE(ABORT, 'meal nutrition snapshot must be derived from food and grams'); END;

-- Natural household labels and internal grams must resolve to the same quantity.
CREATE TRIGGER meal_items_portion_resolution_insert_r10
BEFORE INSERT ON meal_entry_items
WHEN NEW.portion_option_id IS NOT NULL AND (
  NEW.portion_quantity IS NULL OR NOT EXISTS (
    SELECT 1 FROM food_portion_options p
    WHERE p.id = NEW.portion_option_id AND p.food_id = NEW.food_id
      AND ABS(NEW.grams - ROUND(NEW.portion_quantity * p.grams_per_unit, 1)) < 0.000001
  )
)
BEGIN SELECT RAISE(ABORT, 'household portion must match resolved grams'); END;

CREATE TRIGGER meal_items_portion_resolution_update_r10
BEFORE UPDATE OF portion_option_id, portion_quantity, food_id, grams ON meal_entry_items
WHEN NEW.portion_option_id IS NOT NULL AND (
  NEW.portion_quantity IS NULL OR NOT EXISTS (
    SELECT 1 FROM food_portion_options p
    WHERE p.id = NEW.portion_option_id AND p.food_id = NEW.food_id
      AND ABS(NEW.grams - ROUND(NEW.portion_quantity * p.grams_per_unit, 1)) < 0.000001
  )
)
BEGIN SELECT RAISE(ABORT, 'household portion must match resolved grams'); END;

-- Canonical UTC occurrence instants: YYYY-MM-DDTHH:MM:SSZ or .SSSZ.
CREATE TRIGGER ai_actions_occurrence_time_canonical_insert_r10
BEFORE INSERT ON ai_actions
WHEN NEW.action_type IN ('meal-log','water-log') AND (
  length(json_extract(NEW.payload_json,'$.occurredAt')) NOT IN (20,24)
  OR substr(json_extract(NEW.payload_json,'$.occurredAt'),5,1) <> '-'
  OR substr(json_extract(NEW.payload_json,'$.occurredAt'),8,1) <> '-'
  OR substr(json_extract(NEW.payload_json,'$.occurredAt'),11,1) <> 'T'
  OR substr(json_extract(NEW.payload_json,'$.occurredAt'),14,1) <> ':'
  OR substr(json_extract(NEW.payload_json,'$.occurredAt'),17,1) <> ':'
  OR substr(json_extract(NEW.payload_json,'$.occurredAt'),-1,1) <> 'Z'
  OR CAST(substr(json_extract(NEW.payload_json,'$.occurredAt'),12,2) AS INTEGER) NOT BETWEEN 0 AND 23
  OR CAST(substr(json_extract(NEW.payload_json,'$.occurredAt'),15,2) AS INTEGER) NOT BETWEEN 0 AND 59
  OR CAST(substr(json_extract(NEW.payload_json,'$.occurredAt'),18,2) AS INTEGER) NOT BETWEEN 0 AND 59
  OR (length(json_extract(NEW.payload_json,'$.occurredAt')) = 24 AND substr(json_extract(NEW.payload_json,'$.occurredAt'),20,1) <> '.')
)
BEGIN SELECT RAISE(ABORT, 'AI action occurredAt must be a canonical UTC instant'); END;

CREATE TRIGGER ai_actions_occurrence_time_canonical_update_r10
BEFORE UPDATE OF action_type, payload_json ON ai_actions
WHEN NEW.action_type IN ('meal-log','water-log') AND (
  length(json_extract(NEW.payload_json,'$.occurredAt')) NOT IN (20,24)
  OR substr(json_extract(NEW.payload_json,'$.occurredAt'),-1,1) <> 'Z'
  OR CAST(substr(json_extract(NEW.payload_json,'$.occurredAt'),12,2) AS INTEGER) NOT BETWEEN 0 AND 23
  OR CAST(substr(json_extract(NEW.payload_json,'$.occurredAt'),15,2) AS INTEGER) NOT BETWEEN 0 AND 59
  OR CAST(substr(json_extract(NEW.payload_json,'$.occurredAt'),18,2) AS INTEGER) NOT BETWEEN 0 AND 59
  OR (length(json_extract(NEW.payload_json,'$.occurredAt')) = 24 AND substr(json_extract(NEW.payload_json,'$.occurredAt'),20,1) <> '.')
)
BEGIN SELECT RAISE(ABORT, 'AI action occurredAt must be a canonical UTC instant'); END;

-- Final manual/direct log boundaries get the same calendar and instant rules.
CREATE TRIGGER meal_entries_dates_insert_r10
BEFORE INSERT ON meal_entries
WHEN date(NEW.local_date) IS NOT NEW.local_date
  OR length(NEW.occurred_at) NOT IN (20,24)
  OR substr(NEW.occurred_at,-1,1) <> 'Z'
  OR date(substr(NEW.occurred_at,1,10)) IS NOT substr(NEW.occurred_at,1,10)
  OR CAST(substr(NEW.occurred_at,12,2) AS INTEGER) NOT BETWEEN 0 AND 23
  OR CAST(substr(NEW.occurred_at,15,2) AS INTEGER) NOT BETWEEN 0 AND 59
  OR CAST(substr(NEW.occurred_at,18,2) AS INTEGER) NOT BETWEEN 0 AND 59
BEGIN SELECT RAISE(ABORT, 'meal entry dates must be canonical'); END;

CREATE TRIGGER meal_entries_dates_update_r10
BEFORE UPDATE OF local_date, occurred_at ON meal_entries
WHEN date(NEW.local_date) IS NOT NEW.local_date
  OR length(NEW.occurred_at) NOT IN (20,24)
  OR substr(NEW.occurred_at,-1,1) <> 'Z'
  OR date(substr(NEW.occurred_at,1,10)) IS NOT substr(NEW.occurred_at,1,10)
  OR CAST(substr(NEW.occurred_at,12,2) AS INTEGER) NOT BETWEEN 0 AND 23
  OR CAST(substr(NEW.occurred_at,15,2) AS INTEGER) NOT BETWEEN 0 AND 59
  OR CAST(substr(NEW.occurred_at,18,2) AS INTEGER) NOT BETWEEN 0 AND 59
BEGIN SELECT RAISE(ABORT, 'meal entry dates must be canonical'); END;

CREATE TRIGGER water_logs_dates_insert_r10
BEFORE INSERT ON water_logs
WHEN date(NEW.local_date) IS NOT NEW.local_date
  OR length(NEW.occurred_at) NOT IN (20,24)
  OR substr(NEW.occurred_at,-1,1) <> 'Z'
  OR date(substr(NEW.occurred_at,1,10)) IS NOT substr(NEW.occurred_at,1,10)
  OR CAST(substr(NEW.occurred_at,12,2) AS INTEGER) NOT BETWEEN 0 AND 23
  OR CAST(substr(NEW.occurred_at,15,2) AS INTEGER) NOT BETWEEN 0 AND 59
  OR CAST(substr(NEW.occurred_at,18,2) AS INTEGER) NOT BETWEEN 0 AND 59
BEGIN SELECT RAISE(ABORT, 'water log dates must be canonical'); END;

CREATE TRIGGER water_logs_dates_update_r10
BEFORE UPDATE OF local_date, occurred_at ON water_logs
WHEN date(NEW.local_date) IS NOT NEW.local_date
  OR length(NEW.occurred_at) NOT IN (20,24)
  OR substr(NEW.occurred_at,-1,1) <> 'Z'
  OR date(substr(NEW.occurred_at,1,10)) IS NOT substr(NEW.occurred_at,1,10)
  OR CAST(substr(NEW.occurred_at,12,2) AS INTEGER) NOT BETWEEN 0 AND 23
  OR CAST(substr(NEW.occurred_at,15,2) AS INTEGER) NOT BETWEEN 0 AND 59
  OR CAST(substr(NEW.occurred_at,18,2) AS INTEGER) NOT BETWEEN 0 AND 59
BEGIN SELECT RAISE(ABORT, 'water log dates must be canonical'); END;

-- Verification provenance uses the same canonical UTC instant rules.
CREATE TRIGGER foods_verified_at_canonical_insert_r10
BEFORE INSERT ON foods
WHEN length(NEW.verified_at) NOT IN (20,24) OR substr(NEW.verified_at,-1,1) <> 'Z'
  OR date(substr(NEW.verified_at,1,10)) IS NOT substr(NEW.verified_at,1,10)
  OR CAST(substr(NEW.verified_at,12,2) AS INTEGER) NOT BETWEEN 0 AND 23
  OR CAST(substr(NEW.verified_at,15,2) AS INTEGER) NOT BETWEEN 0 AND 59
  OR CAST(substr(NEW.verified_at,18,2) AS INTEGER) NOT BETWEEN 0 AND 59
BEGIN SELECT RAISE(ABORT, 'food verified_at must be canonical UTC'); END;

CREATE TRIGGER foods_verified_at_canonical_update_r10
BEFORE UPDATE OF verified_at ON foods
WHEN length(NEW.verified_at) NOT IN (20,24) OR substr(NEW.verified_at,-1,1) <> 'Z'
  OR date(substr(NEW.verified_at,1,10)) IS NOT substr(NEW.verified_at,1,10)
  OR CAST(substr(NEW.verified_at,12,2) AS INTEGER) NOT BETWEEN 0 AND 23
  OR CAST(substr(NEW.verified_at,15,2) AS INTEGER) NOT BETWEEN 0 AND 59
  OR CAST(substr(NEW.verified_at,18,2) AS INTEGER) NOT BETWEEN 0 AND 59
BEGIN SELECT RAISE(ABORT, 'food verified_at must be canonical UTC'); END;

CREATE TRIGGER portions_verified_at_canonical_insert_r10
BEFORE INSERT ON food_portion_options
WHEN length(NEW.verified_at) NOT IN (20,24) OR substr(NEW.verified_at,-1,1) <> 'Z'
  OR date(substr(NEW.verified_at,1,10)) IS NOT substr(NEW.verified_at,1,10)
  OR CAST(substr(NEW.verified_at,12,2) AS INTEGER) NOT BETWEEN 0 AND 23
  OR CAST(substr(NEW.verified_at,15,2) AS INTEGER) NOT BETWEEN 0 AND 59
  OR CAST(substr(NEW.verified_at,18,2) AS INTEGER) NOT BETWEEN 0 AND 59
BEGIN SELECT RAISE(ABORT, 'portion verified_at must be canonical UTC'); END;

CREATE TRIGGER portions_verified_at_canonical_update_r10
BEFORE UPDATE OF verified_at ON food_portion_options
WHEN length(NEW.verified_at) NOT IN (20,24) OR substr(NEW.verified_at,-1,1) <> 'Z'
  OR date(substr(NEW.verified_at,1,10)) IS NOT substr(NEW.verified_at,1,10)
  OR CAST(substr(NEW.verified_at,12,2) AS INTEGER) NOT BETWEEN 0 AND 23
  OR CAST(substr(NEW.verified_at,15,2) AS INTEGER) NOT BETWEEN 0 AND 59
  OR CAST(substr(NEW.verified_at,18,2) AS INTEGER) NOT BETWEEN 0 AND 59
BEGIN SELECT RAISE(ABORT, 'portion verified_at must be canonical UTC'); END;

-- Confirmation/application timestamps are immutable audit evidence and ordered.
CREATE TRIGGER ai_actions_lifecycle_chronology_r10
BEFORE UPDATE OF created_at, confirmed_at, applied_at, status ON ai_actions
WHEN NEW.created_at IS NOT OLD.created_at
  OR (OLD.confirmed_at IS NOT NULL AND NEW.confirmed_at IS NOT OLD.confirmed_at)
  OR (OLD.applied_at IS NOT NULL AND NEW.applied_at IS NOT OLD.applied_at)
  OR (NEW.confirmed_at IS NOT NULL AND julianday(NEW.confirmed_at) < julianday(NEW.created_at))
  OR (NEW.applied_at IS NOT NULL AND (NEW.confirmed_at IS NULL OR julianday(NEW.applied_at) < julianday(NEW.confirmed_at)))
BEGIN SELECT RAISE(ABORT, 'AI action lifecycle timestamps are immutable and ordered'); END;
