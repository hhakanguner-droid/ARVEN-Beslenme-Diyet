PRAGMA foreign_keys = ON;

-- Authenticated ownership is never transferable by ordinary updates.
CREATE TRIGGER food_preferences_owner_immutable_r12
BEFORE UPDATE OF user_id ON food_preferences
WHEN NEW.user_id IS NOT OLD.user_id
BEGIN SELECT RAISE(ABORT,'food preference ownership is immutable'); END;

CREATE TRIGGER goals_owner_immutable_r12
BEFORE UPDATE OF user_id ON goals
WHEN NEW.user_id IS NOT OLD.user_id
BEGIN SELECT RAISE(ABORT,'goal ownership is immutable'); END;

-- AI action identity and idempotency identity are fixed at proposal creation.
CREATE TRIGGER ai_actions_identity_immutable_r12
BEFORE UPDATE OF id, idempotency_key ON ai_actions
WHEN NEW.id IS NOT OLD.id OR NEW.idempotency_key IS NOT OLD.idempotency_key
BEGIN SELECT RAISE(ABORT,'AI action identity is immutable'); END;

-- Catalog names must remain visible on updates too (full whitespace family used by R11 inserts).
CREATE TRIGGER allergen_catalog_visible_name_update_r12
BEFORE UPDATE OF canonical_name ON allergen_catalog
WHEN NEW.canonical_name IS NULL OR length(
  replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(
    NEW.canonical_name,
    ' ',''),char(9),''),char(10),''),char(11),''),char(12),''),char(13),''),char(160),''),char(5760),''),char(8192),''),char(8193),''),char(8194),''),char(8195),''),char(8196),''),char(8197),''),char(8198),''),char(8199),''),char(8200),''),char(8201),''),char(8202),''),char(8239),''),char(12288),'')
) = 0
BEGIN SELECT RAISE(ABORT,'allergen name must contain visible text'); END;

CREATE TRIGGER dietary_rule_catalog_visible_name_update_r12
BEFORE UPDATE OF canonical_name ON dietary_rule_catalog
WHEN NEW.canonical_name IS NULL OR length(
  replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(
    NEW.canonical_name,
    ' ',''),char(9),''),char(10),''),char(11),''),char(12),''),char(13),''),char(160),''),char(5760),''),char(8192),''),char(8193),''),char(8194),''),char(8195),''),char(8196),''),char(8197),''),char(8198),''),char(8199),''),char(8200),''),char(8201),''),char(8202),''),char(8239),''),char(12288),'')
) = 0
BEGIN SELECT RAISE(ABORT,'dietary rule name must contain visible text'); END;

-- Verified nutrition/portion data cannot change under stale evidence.
CREATE TRIGGER foods_nutrition_requires_fresh_verification_r12
BEFORE UPDATE OF energy_kcal_100g, protein_g_100g, carbs_g_100g, fat_g_100g, fiber_g_100g ON foods
WHEN (
  NEW.energy_kcal_100g IS NOT OLD.energy_kcal_100g OR NEW.protein_g_100g IS NOT OLD.protein_g_100g
  OR NEW.carbs_g_100g IS NOT OLD.carbs_g_100g OR NEW.fat_g_100g IS NOT OLD.fat_g_100g
  OR NEW.fiber_g_100g IS NOT OLD.fiber_g_100g
) AND NEW.verified_at IS OLD.verified_at
BEGIN SELECT RAISE(ABORT,'nutrition changes require a fresh verification timestamp'); END;

CREATE TRIGGER portions_grams_requires_fresh_verification_r12
BEFORE UPDATE OF grams_per_unit ON food_portion_options
WHEN NEW.grams_per_unit IS NOT OLD.grams_per_unit AND NEW.verified_at IS OLD.verified_at
BEGIN SELECT RAISE(ABORT,'portion gram changes require a fresh verification timestamp'); END;

-- Safety evidence update timestamps must be canonical UTC, not only inserts.
CREATE TRIGGER safety_allergens_verified_instant_update_r12
BEFORE UPDATE OF verified_at ON food_allergens
WHEN length(NEW.verified_at) NOT IN (20,24)
 OR substr(NEW.verified_at,5,1)<>'-' OR substr(NEW.verified_at,8,1)<>'-'
 OR substr(NEW.verified_at,11,1)<>'T' OR substr(NEW.verified_at,14,1)<>':' OR substr(NEW.verified_at,17,1)<>':'
 OR substr(NEW.verified_at,-1,1)<>'Z'
 OR substr(NEW.verified_at,1,4) NOT GLOB '[0-9][0-9][0-9][0-9]'
 OR substr(NEW.verified_at,6,2) NOT GLOB '[0-9][0-9]' OR substr(NEW.verified_at,9,2) NOT GLOB '[0-9][0-9]'
 OR substr(NEW.verified_at,12,2) NOT GLOB '[0-9][0-9]' OR substr(NEW.verified_at,15,2) NOT GLOB '[0-9][0-9]' OR substr(NEW.verified_at,18,2) NOT GLOB '[0-9][0-9]'
 OR (length(NEW.verified_at)=24 AND (substr(NEW.verified_at,20,1)<>'.' OR substr(NEW.verified_at,21,3) NOT GLOB '[0-9][0-9][0-9]'))
 OR strftime('%Y-%m-%dT%H:%M:%SZ',NEW.verified_at) IS NULL
 OR strftime('%Y-%m-%dT%H:%M:%SZ',NEW.verified_at)<>substr(NEW.verified_at,1,19)||'Z'
BEGIN SELECT RAISE(ABORT,'allergen evidence verification instant must be canonical UTC'); END;

CREATE TRIGGER safety_dietary_verified_instant_update_r12
BEFORE UPDATE OF verified_at ON food_dietary_rule_conflicts
WHEN length(NEW.verified_at) NOT IN (20,24)
 OR substr(NEW.verified_at,5,1)<>'-' OR substr(NEW.verified_at,8,1)<>'-'
 OR substr(NEW.verified_at,11,1)<>'T' OR substr(NEW.verified_at,14,1)<>':' OR substr(NEW.verified_at,17,1)<>':'
 OR substr(NEW.verified_at,-1,1)<>'Z'
 OR substr(NEW.verified_at,1,4) NOT GLOB '[0-9][0-9][0-9][0-9]'
 OR substr(NEW.verified_at,6,2) NOT GLOB '[0-9][0-9]' OR substr(NEW.verified_at,9,2) NOT GLOB '[0-9][0-9]'
 OR substr(NEW.verified_at,12,2) NOT GLOB '[0-9][0-9]' OR substr(NEW.verified_at,15,2) NOT GLOB '[0-9][0-9]' OR substr(NEW.verified_at,18,2) NOT GLOB '[0-9][0-9]'
 OR (length(NEW.verified_at)=24 AND (substr(NEW.verified_at,20,1)<>'.' OR substr(NEW.verified_at,21,3) NOT GLOB '[0-9][0-9][0-9]'))
 OR strftime('%Y-%m-%dT%H:%M:%SZ',NEW.verified_at) IS NULL
 OR strftime('%Y-%m-%dT%H:%M:%SZ',NEW.verified_at)<>substr(NEW.verified_at,1,19)||'Z'
BEGIN SELECT RAISE(ABORT,'dietary evidence verification instant must be canonical UTC'); END;

-- Confirmation/application evidence uses the same canonical UTC representation as created_at.
CREATE TRIGGER ai_actions_lifecycle_instants_canonical_r12
BEFORE UPDATE OF confirmed_at, applied_at ON ai_actions
WHEN (NEW.confirmed_at IS NOT NULL AND (
  length(NEW.confirmed_at) NOT IN (20,24) OR substr(NEW.confirmed_at,11,1)<>'T' OR substr(NEW.confirmed_at,14,1)<>':' OR substr(NEW.confirmed_at,17,1)<>':' OR substr(NEW.confirmed_at,-1,1)<>'Z'
  OR strftime('%Y-%m-%dT%H:%M:%SZ',NEW.confirmed_at) IS NULL OR strftime('%Y-%m-%dT%H:%M:%SZ',NEW.confirmed_at)<>substr(NEW.confirmed_at,1,19)||'Z'
  OR (length(NEW.confirmed_at)=24 AND (substr(NEW.confirmed_at,20,1)<>'.' OR substr(NEW.confirmed_at,21,3) NOT GLOB '[0-9][0-9][0-9]'))
)) OR (NEW.applied_at IS NOT NULL AND (
  length(NEW.applied_at) NOT IN (20,24) OR substr(NEW.applied_at,11,1)<>'T' OR substr(NEW.applied_at,14,1)<>':' OR substr(NEW.applied_at,17,1)<>':' OR substr(NEW.applied_at,-1,1)<>'Z'
  OR strftime('%Y-%m-%dT%H:%M:%SZ',NEW.applied_at) IS NULL OR strftime('%Y-%m-%dT%H:%M:%SZ',NEW.applied_at)<>substr(NEW.applied_at,1,19)||'Z'
  OR (length(NEW.applied_at)=24 AND (substr(NEW.applied_at,20,1)<>'.' OR substr(NEW.applied_at,21,3) NOT GLOB '[0-9][0-9][0-9]'))
))
BEGIN SELECT RAISE(ABORT,'AI lifecycle timestamps must be canonical UTC'); END;

-- Mirror the TypeScript Mifflin-St Jeor V1 supported ranges in SQLite.
CREATE TRIGGER goals_mifflin_input_bounds_insert_r12
BEFORE INSERT ON goals
WHEN NEW.source='arven-calculated' AND NEW.calculation_method='mifflin-st-jeor' AND NEW.calculation_version='v1' AND (
  json_extract(NEW.calculation_inputs_json,'$.weightKg') NOT BETWEEN 20 AND 400
  OR json_extract(NEW.calculation_inputs_json,'$.heightCm') NOT BETWEEN 100 AND 260
  OR json_extract(NEW.calculation_inputs_json,'$.ageYears') NOT BETWEEN 18 AND 120
  OR json_extract(NEW.calculation_inputs_json,'$.activityFactor') NOT BETWEEN 1 AND 2.5
  OR json_extract(NEW.calculation_inputs_json,'$.energyAdjustmentKcal') NOT BETWEEN -1500 AND 1500
  OR json_extract(NEW.calculation_inputs_json,'$.proteinGPerKg') NOT BETWEEN 0.5 AND 4
  OR json_extract(NEW.calculation_inputs_json,'$.fatEnergyPct') NOT BETWEEN 0.15 AND 0.5
  OR json_extract(NEW.calculation_inputs_json,'$.waterMlPerKg') NOT BETWEEN 15 AND 60
)
BEGIN SELECT RAISE(ABORT,'calculated goal inputs are outside supported range'); END;

CREATE TRIGGER goals_mifflin_input_bounds_update_r12
BEFORE UPDATE ON goals
WHEN NEW.source='arven-calculated' AND NEW.calculation_method='mifflin-st-jeor' AND NEW.calculation_version='v1' AND (
  json_extract(NEW.calculation_inputs_json,'$.weightKg') NOT BETWEEN 20 AND 400
  OR json_extract(NEW.calculation_inputs_json,'$.heightCm') NOT BETWEEN 100 AND 260
  OR json_extract(NEW.calculation_inputs_json,'$.ageYears') NOT BETWEEN 18 AND 120
  OR json_extract(NEW.calculation_inputs_json,'$.activityFactor') NOT BETWEEN 1 AND 2.5
  OR json_extract(NEW.calculation_inputs_json,'$.energyAdjustmentKcal') NOT BETWEEN -1500 AND 1500
  OR json_extract(NEW.calculation_inputs_json,'$.proteinGPerKg') NOT BETWEEN 0.5 AND 4
  OR json_extract(NEW.calculation_inputs_json,'$.fatEnergyPct') NOT BETWEEN 0.15 AND 0.5
  OR json_extract(NEW.calculation_inputs_json,'$.waterMlPerKg') NOT BETWEEN 15 AND 60
)
BEGIN SELECT RAISE(ABORT,'calculated goal inputs are outside supported range'); END;

-- Historical meal snapshots materialize every known structured nutrient at append time.
CREATE TRIGGER meal_item_materialize_extended_nutrients_r12
AFTER INSERT ON meal_entry_items
BEGIN
  INSERT OR IGNORE INTO meal_entry_item_nutrients(meal_entry_item_id,nutrient_key,amount,unit,completeness)
  SELECT NEW.id, n.nutrient_key,
    CASE WHEN n.amount_per_100g IS NULL THEN NULL ELSE ROUND(n.amount_per_100g * NEW.grams / 100.0, 6) END,
    n.unit,
    n.completeness
  FROM food_nutrients n
  WHERE n.food_id=NEW.food_id;
END;
