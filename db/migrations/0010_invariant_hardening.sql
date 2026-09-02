-- Cross-cutting invariant hardening.
-- This migration deliberately fixes invariant classes rather than one review finding at a time.

-- ---------------------------------------------------------------------------
-- 1) Every user-owned root record has immutable ownership.
-- ---------------------------------------------------------------------------
CREATE TRIGGER profiles_owner_immutable_r13
BEFORE UPDATE OF user_id ON profiles
WHEN NEW.user_id IS NOT OLD.user_id
BEGIN
  SELECT RAISE(ABORT, 'profile ownership is immutable');
END;

CREATE TRIGGER user_ui_preferences_owner_immutable_r13
BEFORE UPDATE OF user_id ON user_ui_preferences
WHEN NEW.user_id IS NOT OLD.user_id
BEGIN
  SELECT RAISE(ABORT, 'UI preference ownership is immutable');
END;

CREATE TRIGGER food_source_preferences_owner_immutable_r13
BEFORE UPDATE OF user_id ON food_source_preferences
WHEN NEW.user_id IS NOT OLD.user_id
BEGIN
  SELECT RAISE(ABORT, 'food source preference ownership is immutable');
END;

CREATE TRIGGER assessment_snapshots_owner_immutable_r13
BEFORE UPDATE OF user_id ON assessment_snapshots
WHEN NEW.user_id IS NOT OLD.user_id
BEGIN
  SELECT RAISE(ABORT, 'assessment snapshot ownership is immutable');
END;

-- ---------------------------------------------------------------------------
-- 2) Historical meal snapshots are immutable numeric truth.
-- Corrections must replace/re-log an item rather than partially mutating it.
-- ---------------------------------------------------------------------------
CREATE TRIGGER meal_entry_items_snapshot_immutable_r13
BEFORE UPDATE OF
  food_id, portion_option_id, portion_quantity, portion_label, grams,
  energy_kcal, protein_g, carbs_g, fat_g, fiber_g, calculation_version
ON meal_entry_items
WHEN NEW.food_id IS NOT OLD.food_id
  OR NEW.portion_option_id IS NOT OLD.portion_option_id
  OR NEW.portion_quantity IS NOT OLD.portion_quantity
  OR NEW.portion_label IS NOT OLD.portion_label
  OR NEW.grams IS NOT OLD.grams
  OR NEW.energy_kcal IS NOT OLD.energy_kcal
  OR NEW.protein_g IS NOT OLD.protein_g
  OR NEW.carbs_g IS NOT OLD.carbs_g
  OR NEW.fat_g IS NOT OLD.fat_g
  OR NEW.fiber_g IS NOT OLD.fiber_g
  OR NEW.calculation_version IS NOT OLD.calculation_version
BEGIN
  SELECT RAISE(ABORT, 'historical meal item snapshot is immutable; replace the item');
END;

CREATE TRIGGER meal_entry_item_nutrients_snapshot_immutable_r13
BEFORE UPDATE ON meal_entry_item_nutrients
WHEN NEW.meal_entry_item_id IS NOT OLD.meal_entry_item_id
  OR NEW.nutrient_key IS NOT OLD.nutrient_key
  OR NEW.amount IS NOT OLD.amount
  OR NEW.unit IS NOT OLD.unit
  OR NEW.completeness IS NOT OLD.completeness
BEGIN
  SELECT RAISE(ABORT, 'historical extended nutrient snapshot is immutable');
END;

-- Storage precision is six decimals for every persisted meal contribution.
-- Presentation/daily totals round only after aggregation.
DROP TRIGGER IF EXISTS meal_items_snapshot_derivation_insert_r10;
DROP TRIGGER IF EXISTS meal_items_snapshot_derivation_update_r10;

CREATE TRIGGER meal_items_snapshot_derivation_insert_r13
BEFORE INSERT ON meal_entry_items
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM foods f
    WHERE f.id = NEW.food_id
      AND NEW.energy_kcal IS ROUND(f.energy_kcal_100g * NEW.grams / 100.0, 6)
      AND NEW.protein_g IS ROUND(f.protein_g_100g * NEW.grams / 100.0, 6)
      AND NEW.carbs_g IS ROUND(f.carbs_g_100g * NEW.grams / 100.0, 6)
      AND NEW.fat_g IS ROUND(f.fat_g_100g * NEW.grams / 100.0, 6)
      AND (
        (f.fiber_g_100g IS NULL AND NEW.fiber_g IS NULL)
        OR NEW.fiber_g IS ROUND(f.fiber_g_100g * NEW.grams / 100.0, 6)
      )
  ) THEN RAISE(ABORT, 'meal snapshot must be deterministically derived at storage precision') END;
END;

DROP TRIGGER IF EXISTS meal_item_nutrients_derivation_insert_r11;
DROP TRIGGER IF EXISTS meal_item_nutrients_derivation_update_r11;

CREATE TRIGGER meal_item_nutrients_derivation_insert_r13
BEFORE INSERT ON meal_entry_item_nutrients
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM meal_entry_items i
    JOIN food_nutrients n
      ON n.food_id = i.food_id
     AND n.nutrient_key = NEW.nutrient_key
    WHERE i.id = NEW.meal_entry_item_id
      AND NEW.unit = n.unit
      AND NEW.completeness = n.completeness
      AND (
        (n.amount_per_100g IS NULL AND NEW.amount IS NULL AND NEW.completeness = 'unknown')
        OR (
          n.amount_per_100g IS NOT NULL
          AND NEW.amount IS ROUND(n.amount_per_100g * i.grams / 100.0, 6)
        )
      )
  ) THEN RAISE(ABORT, 'extended nutrient snapshot must be derived at storage precision') END;
END;

-- ---------------------------------------------------------------------------
-- 3) Extended nutrient values carry their own verification snapshot. Updates
-- require a genuinely refreshed parent-food verification instant, so a sodium
-- or vitamin value cannot inherit evidence that predates the changed value.
-- ---------------------------------------------------------------------------
ALTER TABLE food_nutrients ADD COLUMN source_verified_at TEXT;

UPDATE food_nutrients
SET source_verified_at = (
  SELECT f.verified_at FROM foods f WHERE f.id = food_nutrients.food_id
)
WHERE source_verified_at IS NULL;

CREATE TRIGGER food_nutrients_provenance_insert_r13
BEFORE INSERT ON food_nutrients
WHEN NEW.source_verified_at IS NOT NULL AND (
  NEW.source_verified_at IS NOT (SELECT f.verified_at FROM foods f WHERE f.id = NEW.food_id)
  OR length(NEW.source_verified_at) NOT IN (20,24)
  OR substr(NEW.source_verified_at,11,1) <> 'T'
  OR substr(NEW.source_verified_at,14,1) <> ':'
  OR substr(NEW.source_verified_at,17,1) <> ':'
  OR substr(NEW.source_verified_at,-1,1) <> 'Z'
  OR strftime('%Y-%m-%dT%H:%M:%SZ',NEW.source_verified_at) IS NULL
  OR strftime('%Y-%m-%dT%H:%M:%SZ',NEW.source_verified_at) <> substr(NEW.source_verified_at,1,19)||'Z'
  OR (length(NEW.source_verified_at)=24 AND (substr(NEW.source_verified_at,20,1)<>'.' OR substr(NEW.source_verified_at,21,3) NOT GLOB '[0-9][0-9][0-9]'))
)
BEGIN
  SELECT RAISE(ABORT, 'extended nutrient verification must match canonical food verification');
END;

CREATE TRIGGER food_nutrients_provenance_stamp_r13
AFTER INSERT ON food_nutrients
WHEN NEW.source_verified_at IS NULL
BEGIN
  UPDATE food_nutrients
  SET source_verified_at = (SELECT f.verified_at FROM foods f WHERE f.id = NEW.food_id)
  WHERE food_id = NEW.food_id AND nutrient_key = NEW.nutrient_key;
END;

CREATE TRIGGER food_nutrients_provenance_refresh_r13
BEFORE UPDATE OF amount_per_100g, unit, completeness ON food_nutrients
WHEN NEW.amount_per_100g IS NOT OLD.amount_per_100g
  OR NEW.unit IS NOT OLD.unit
  OR NEW.completeness IS NOT OLD.completeness
BEGIN
  SELECT CASE WHEN
    NEW.source_verified_at IS NULL
    OR NEW.source_verified_at IS OLD.source_verified_at
    OR NEW.source_verified_at IS NOT (SELECT f.verified_at FROM foods f WHERE f.id = NEW.food_id)
    OR length(NEW.source_verified_at) NOT IN (20,24)
    OR substr(NEW.source_verified_at,11,1) <> 'T'
    OR substr(NEW.source_verified_at,14,1) <> ':'
    OR substr(NEW.source_verified_at,17,1) <> ':'
    OR substr(NEW.source_verified_at,-1,1) <> 'Z'
    OR strftime('%Y-%m-%dT%H:%M:%SZ',NEW.source_verified_at) IS NULL
    OR strftime('%Y-%m-%dT%H:%M:%SZ',NEW.source_verified_at) <> substr(NEW.source_verified_at,1,19)||'Z'
    OR (length(NEW.source_verified_at)=24 AND (substr(NEW.source_verified_at,20,1)<>'.' OR substr(NEW.source_verified_at,21,3) NOT GLOB '[0-9][0-9][0-9]'))
  THEN RAISE(ABORT, 'extended nutrient changes require refreshed verification provenance') END;
END;

-- Once a verified food has produced history, its extended nutrient source set
-- becomes versioned/immutable. Corrected nutrition requires a new food version.
CREATE TRIGGER food_nutrients_used_insert_freeze_r13
BEFORE INSERT ON food_nutrients
WHEN EXISTS (SELECT 1 FROM meal_entry_items i WHERE i.food_id = NEW.food_id)
BEGIN
  SELECT RAISE(ABORT, 'used food nutrient set is immutable; create a new food version');
END;

CREATE TRIGGER food_nutrients_used_update_freeze_r13
BEFORE UPDATE ON food_nutrients
WHEN EXISTS (SELECT 1 FROM meal_entry_items i WHERE i.food_id = OLD.food_id)
BEGIN
  SELECT RAISE(ABORT, 'used food nutrient set is immutable; create a new food version');
END;

CREATE TRIGGER food_nutrients_used_delete_freeze_r13
BEFORE DELETE ON food_nutrients
WHEN EXISTS (SELECT 1 FROM meal_entry_items i WHERE i.food_id = OLD.food_id)
BEGIN
  SELECT RAISE(ABORT, 'used food nutrient set is immutable; create a new food version');
END;

-- Freeze the source nutrient set while a user is reviewing/has confirmed a
-- meal proposal as well; numeric truth must not move underneath confirmation.
CREATE TRIGGER food_nutrients_active_action_insert_freeze_r13
BEFORE INSERT ON food_nutrients
WHEN EXISTS (
  SELECT 1 FROM ai_actions a, json_each(a.payload_json, '$.items') item
  WHERE a.action_type = 'meal-log'
    AND a.status IN ('proposed','confirmed')
    AND json_extract(item.value, '$.foodId') = NEW.food_id
)
BEGIN
  SELECT RAISE(ABORT, 'food nutrient set is frozen by an active meal proposal');
END;

CREATE TRIGGER food_nutrients_active_action_update_freeze_r13
BEFORE UPDATE ON food_nutrients
WHEN EXISTS (
  SELECT 1 FROM ai_actions a, json_each(a.payload_json, '$.items') item
  WHERE a.action_type = 'meal-log'
    AND a.status IN ('proposed','confirmed')
    AND json_extract(item.value, '$.foodId') = OLD.food_id
)
BEGIN
  SELECT RAISE(ABORT, 'food nutrient set is frozen by an active meal proposal');
END;

CREATE TRIGGER food_nutrients_active_action_delete_freeze_r13
BEFORE DELETE ON food_nutrients
WHEN EXISTS (
  SELECT 1 FROM ai_actions a, json_each(a.payload_json, '$.items') item
  WHERE a.action_type = 'meal-log'
    AND a.status IN ('proposed','confirmed')
    AND json_extract(item.value, '$.foodId') = OLD.food_id
)
BEGIN
  SELECT RAISE(ABORT, 'food nutrient set is frozen by an active meal proposal');
END;
