PRAGMA foreign_keys = ON;

-- Review 11: authenticated allergy ownership is immutable.
CREATE TRIGGER user_allergies_owner_immutable_r11
BEFORE UPDATE OF user_id ON user_allergies
WHEN NEW.user_id IS NOT OLD.user_id
BEGIN SELECT RAISE(ABORT, 'allergy ownership is immutable'); END;

-- Canonical safety identifiers use a deliberately narrow machine-safe alphabet.
CREATE TRIGGER allergen_catalog_id_charset_insert_r11
BEFORE INSERT ON allergen_catalog
WHEN NEW.id IS NULL OR length(NEW.id) = 0 OR NEW.id GLOB '*[^A-Za-z0-9._:-]*'
BEGIN SELECT RAISE(ABORT, 'allergen id must use canonical identifier characters'); END;
CREATE TRIGGER allergen_catalog_id_charset_update_r11
BEFORE UPDATE OF id ON allergen_catalog
WHEN NEW.id IS NULL OR length(NEW.id) = 0 OR NEW.id GLOB '*[^A-Za-z0-9._:-]*'
BEGIN SELECT RAISE(ABORT, 'allergen id must use canonical identifier characters'); END;
CREATE TRIGGER dietary_rule_catalog_id_charset_insert_r11
BEFORE INSERT ON dietary_rule_catalog
WHEN NEW.id IS NULL OR length(NEW.id) = 0 OR NEW.id GLOB '*[^A-Za-z0-9._:-]*'
BEGIN SELECT RAISE(ABORT, 'dietary rule id must use canonical identifier characters'); END;
CREATE TRIGGER dietary_rule_catalog_id_charset_update_r11
BEFORE UPDATE OF id ON dietary_rule_catalog
WHEN NEW.id IS NULL OR length(NEW.id) = 0 OR NEW.id GLOB '*[^A-Za-z0-9._:-]*'
BEGIN SELECT RAISE(ABORT, 'dietary rule id must use canonical identifier characters'); END;

-- Catalog display names must contain a non-whitespace code point, including Unicode spaces.
CREATE TRIGGER allergen_catalog_visible_name_insert_r11
BEFORE INSERT ON allergen_catalog
WHEN NEW.canonical_name IS NULL OR length(
  replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(
    NEW.canonical_name,
    ' ',''),char(9),''),char(10),''),char(11),''),char(12),''),char(13),''),char(160),''),char(5760),''),char(8192),''),char(8193),''),char(8194),''),char(8195),''),char(8196),''),char(8197),''),char(8198),''),char(8199),''),char(8200),''),char(8201),''),char(8202),''),char(8239),''),char(12288),'')
) = 0
BEGIN SELECT RAISE(ABORT, 'allergen name must contain visible text'); END;
CREATE TRIGGER dietary_rule_catalog_visible_name_insert_r11
BEFORE INSERT ON dietary_rule_catalog
WHEN NEW.canonical_name IS NULL OR length(
  replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(
    NEW.canonical_name,
    ' ',''),char(9),''),char(10),''),char(11),''),char(12),''),char(13),''),char(160),''),char(5760),''),char(8192),''),char(8193),''),char(8194),''),char(8195),''),char(8196),''),char(8197),''),char(8198),''),char(8199),''),char(8200),''),char(8201),''),char(8202),''),char(8239),''),char(12288),'')
) = 0
BEGIN SELECT RAISE(ABORT, 'dietary rule name must contain visible text'); END;

-- Safety evidence is an immutable verified snapshot. Downgrade the food to unknown
-- before changing associations, then re-verify the complete snapshot atomically.
CREATE TRIGGER food_allergens_freeze_verified_insert_r11
BEFORE INSERT ON food_allergens
WHEN EXISTS (SELECT 1 FROM foods f WHERE f.id=NEW.food_id AND f.allergen_data_status='verified')
BEGIN SELECT RAISE(ABORT, 'downgrade allergen safety before mutating verified evidence'); END;
CREATE TRIGGER food_allergens_freeze_verified_update_r11
BEFORE UPDATE ON food_allergens
WHEN EXISTS (SELECT 1 FROM foods f WHERE f.id=OLD.food_id AND f.allergen_data_status='verified')
BEGIN SELECT RAISE(ABORT, 'downgrade allergen safety before mutating verified evidence'); END;
CREATE TRIGGER food_allergens_freeze_verified_delete_r11
BEFORE DELETE ON food_allergens
WHEN EXISTS (SELECT 1 FROM foods f WHERE f.id=OLD.food_id AND f.allergen_data_status='verified')
BEGIN SELECT RAISE(ABORT, 'downgrade allergen safety before mutating verified evidence'); END;
CREATE TRIGGER food_dietary_conflicts_freeze_verified_insert_r11
BEFORE INSERT ON food_dietary_rule_conflicts
WHEN EXISTS (SELECT 1 FROM foods f WHERE f.id=NEW.food_id AND f.dietary_safety_data_status='verified')
BEGIN SELECT RAISE(ABORT, 'downgrade dietary safety before mutating verified evidence'); END;
CREATE TRIGGER food_dietary_conflicts_freeze_verified_update_r11
BEFORE UPDATE ON food_dietary_rule_conflicts
WHEN EXISTS (SELECT 1 FROM foods f WHERE f.id=OLD.food_id AND f.dietary_safety_data_status='verified')
BEGIN SELECT RAISE(ABORT, 'downgrade dietary safety before mutating verified evidence'); END;
CREATE TRIGGER food_dietary_conflicts_freeze_verified_delete_r11
BEFORE DELETE ON food_dietary_rule_conflicts
WHEN EXISTS (SELECT 1 FROM foods f WHERE f.id=OLD.food_id AND f.dietary_safety_data_status='verified')
BEGIN SELECT RAISE(ABORT, 'downgrade dietary safety before mutating verified evidence'); END;

-- Canonical UTC instant predicate is repeated at final persistence boundaries.
-- Accepted shapes: YYYY-MM-DDTHH:MM:SSZ and YYYY-MM-DDTHH:MM:SS.SSSZ.
CREATE TRIGGER meal_entries_instant_syntax_insert_r11
BEFORE INSERT ON meal_entries
WHEN length(NEW.occurred_at) NOT IN (20,24)
 OR substr(NEW.occurred_at,5,1)<>'-' OR substr(NEW.occurred_at,8,1)<>'-'
 OR substr(NEW.occurred_at,11,1)<>'T' OR substr(NEW.occurred_at,14,1)<>':' OR substr(NEW.occurred_at,17,1)<>':'
 OR substr(NEW.occurred_at,-1,1)<>'Z'
 OR substr(NEW.occurred_at,1,4) NOT GLOB '[0-9][0-9][0-9][0-9]'
 OR substr(NEW.occurred_at,6,2) NOT GLOB '[0-9][0-9]' OR substr(NEW.occurred_at,9,2) NOT GLOB '[0-9][0-9]'
 OR substr(NEW.occurred_at,12,2) NOT GLOB '[0-9][0-9]' OR substr(NEW.occurred_at,15,2) NOT GLOB '[0-9][0-9]' OR substr(NEW.occurred_at,18,2) NOT GLOB '[0-9][0-9]'
 OR (length(NEW.occurred_at)=24 AND (substr(NEW.occurred_at,20,1)<>'.' OR substr(NEW.occurred_at,21,3) NOT GLOB '[0-9][0-9][0-9]'))
 OR strftime('%Y-%m-%dT%H:%M:%SZ',NEW.occurred_at) IS NULL
 OR strftime('%Y-%m-%dT%H:%M:%SZ',NEW.occurred_at) <> substr(NEW.occurred_at,1,19)||'Z'
BEGIN SELECT RAISE(ABORT, 'meal occurrence instant must be canonical UTC'); END;
CREATE TRIGGER meal_entries_instant_syntax_update_r11
BEFORE UPDATE OF occurred_at ON meal_entries
WHEN length(NEW.occurred_at) NOT IN (20,24)
 OR substr(NEW.occurred_at,5,1)<>'-' OR substr(NEW.occurred_at,8,1)<>'-'
 OR substr(NEW.occurred_at,11,1)<>'T' OR substr(NEW.occurred_at,14,1)<>':' OR substr(NEW.occurred_at,17,1)<>':'
 OR substr(NEW.occurred_at,-1,1)<>'Z'
 OR substr(NEW.occurred_at,1,4) NOT GLOB '[0-9][0-9][0-9][0-9]'
 OR substr(NEW.occurred_at,6,2) NOT GLOB '[0-9][0-9]' OR substr(NEW.occurred_at,9,2) NOT GLOB '[0-9][0-9]'
 OR substr(NEW.occurred_at,12,2) NOT GLOB '[0-9][0-9]' OR substr(NEW.occurred_at,15,2) NOT GLOB '[0-9][0-9]' OR substr(NEW.occurred_at,18,2) NOT GLOB '[0-9][0-9]'
 OR (length(NEW.occurred_at)=24 AND (substr(NEW.occurred_at,20,1)<>'.' OR substr(NEW.occurred_at,21,3) NOT GLOB '[0-9][0-9][0-9]'))
 OR strftime('%Y-%m-%dT%H:%M:%SZ',NEW.occurred_at) IS NULL
 OR strftime('%Y-%m-%dT%H:%M:%SZ',NEW.occurred_at) <> substr(NEW.occurred_at,1,19)||'Z'
BEGIN SELECT RAISE(ABORT, 'meal occurrence instant must be canonical UTC'); END;
CREATE TRIGGER water_logs_instant_syntax_insert_r11
BEFORE INSERT ON water_logs
WHEN length(NEW.occurred_at) NOT IN (20,24)
 OR substr(NEW.occurred_at,5,1)<>'-' OR substr(NEW.occurred_at,8,1)<>'-'
 OR substr(NEW.occurred_at,11,1)<>'T' OR substr(NEW.occurred_at,14,1)<>':' OR substr(NEW.occurred_at,17,1)<>':'
 OR substr(NEW.occurred_at,-1,1)<>'Z'
 OR substr(NEW.occurred_at,1,4) NOT GLOB '[0-9][0-9][0-9][0-9]'
 OR substr(NEW.occurred_at,6,2) NOT GLOB '[0-9][0-9]' OR substr(NEW.occurred_at,9,2) NOT GLOB '[0-9][0-9]'
 OR substr(NEW.occurred_at,12,2) NOT GLOB '[0-9][0-9]' OR substr(NEW.occurred_at,15,2) NOT GLOB '[0-9][0-9]' OR substr(NEW.occurred_at,18,2) NOT GLOB '[0-9][0-9]'
 OR (length(NEW.occurred_at)=24 AND (substr(NEW.occurred_at,20,1)<>'.' OR substr(NEW.occurred_at,21,3) NOT GLOB '[0-9][0-9][0-9]'))
 OR strftime('%Y-%m-%dT%H:%M:%SZ',NEW.occurred_at) IS NULL
 OR strftime('%Y-%m-%dT%H:%M:%SZ',NEW.occurred_at) <> substr(NEW.occurred_at,1,19)||'Z'
BEGIN SELECT RAISE(ABORT, 'water occurrence instant must be canonical UTC'); END;
CREATE TRIGGER water_logs_instant_syntax_update_r11
BEFORE UPDATE OF occurred_at ON water_logs
WHEN length(NEW.occurred_at) NOT IN (20,24)
 OR substr(NEW.occurred_at,5,1)<>'-' OR substr(NEW.occurred_at,8,1)<>'-'
 OR substr(NEW.occurred_at,11,1)<>'T' OR substr(NEW.occurred_at,14,1)<>':' OR substr(NEW.occurred_at,17,1)<>':'
 OR substr(NEW.occurred_at,-1,1)<>'Z'
 OR substr(NEW.occurred_at,1,4) NOT GLOB '[0-9][0-9][0-9][0-9]'
 OR substr(NEW.occurred_at,6,2) NOT GLOB '[0-9][0-9]' OR substr(NEW.occurred_at,9,2) NOT GLOB '[0-9][0-9]'
 OR substr(NEW.occurred_at,12,2) NOT GLOB '[0-9][0-9]' OR substr(NEW.occurred_at,15,2) NOT GLOB '[0-9][0-9]' OR substr(NEW.occurred_at,18,2) NOT GLOB '[0-9][0-9]'
 OR (length(NEW.occurred_at)=24 AND (substr(NEW.occurred_at,20,1)<>'.' OR substr(NEW.occurred_at,21,3) NOT GLOB '[0-9][0-9][0-9]'))
 OR strftime('%Y-%m-%dT%H:%M:%SZ',NEW.occurred_at) IS NULL
 OR strftime('%Y-%m-%dT%H:%M:%SZ',NEW.occurred_at) <> substr(NEW.occurred_at,1,19)||'Z'
BEGIN SELECT RAISE(ABORT, 'water occurrence instant must be canonical UTC'); END;

-- Verification evidence uses the same canonical instant syntax for every safety/nutrition source.
CREATE TRIGGER foods_verified_instant_r11 BEFORE INSERT ON foods
WHEN length(NEW.verified_at) NOT IN (20,24) OR substr(NEW.verified_at,11,1)<>'T' OR substr(NEW.verified_at,14,1)<>':' OR substr(NEW.verified_at,17,1)<>':' OR substr(NEW.verified_at,-1,1)<>'Z'
 OR strftime('%Y-%m-%dT%H:%M:%SZ',NEW.verified_at) IS NULL OR strftime('%Y-%m-%dT%H:%M:%SZ',NEW.verified_at)<>substr(NEW.verified_at,1,19)||'Z'
 OR (length(NEW.verified_at)=24 AND (substr(NEW.verified_at,20,1)<>'.' OR substr(NEW.verified_at,21,3) NOT GLOB '[0-9][0-9][0-9]'))
BEGIN SELECT RAISE(ABORT,'food verification instant must be canonical UTC'); END;
CREATE TRIGGER foods_verified_instant_update_r11 BEFORE UPDATE OF verified_at ON foods
WHEN length(NEW.verified_at) NOT IN (20,24) OR substr(NEW.verified_at,11,1)<>'T' OR substr(NEW.verified_at,14,1)<>':' OR substr(NEW.verified_at,17,1)<>':' OR substr(NEW.verified_at,-1,1)<>'Z'
 OR strftime('%Y-%m-%dT%H:%M:%SZ',NEW.verified_at) IS NULL OR strftime('%Y-%m-%dT%H:%M:%SZ',NEW.verified_at)<>substr(NEW.verified_at,1,19)||'Z'
 OR (length(NEW.verified_at)=24 AND (substr(NEW.verified_at,20,1)<>'.' OR substr(NEW.verified_at,21,3) NOT GLOB '[0-9][0-9][0-9]'))
BEGIN SELECT RAISE(ABORT,'food verification instant must be canonical UTC'); END;
CREATE TRIGGER portions_verified_instant_r11 BEFORE INSERT ON food_portion_options
WHEN length(NEW.verified_at) NOT IN (20,24) OR substr(NEW.verified_at,11,1)<>'T' OR substr(NEW.verified_at,14,1)<>':' OR substr(NEW.verified_at,17,1)<>':' OR substr(NEW.verified_at,-1,1)<>'Z'
 OR strftime('%Y-%m-%dT%H:%M:%SZ',NEW.verified_at) IS NULL OR strftime('%Y-%m-%dT%H:%M:%SZ',NEW.verified_at)<>substr(NEW.verified_at,1,19)||'Z'
 OR (length(NEW.verified_at)=24 AND (substr(NEW.verified_at,20,1)<>'.' OR substr(NEW.verified_at,21,3) NOT GLOB '[0-9][0-9][0-9]'))
BEGIN SELECT RAISE(ABORT,'portion verification instant must be canonical UTC'); END;
CREATE TRIGGER safety_allergens_verified_instant_r11 BEFORE INSERT ON food_allergens
WHEN length(NEW.verified_at) NOT IN (20,24) OR substr(NEW.verified_at,11,1)<>'T' OR substr(NEW.verified_at,14,1)<>':' OR substr(NEW.verified_at,17,1)<>':' OR substr(NEW.verified_at,-1,1)<>'Z'
 OR strftime('%Y-%m-%dT%H:%M:%SZ',NEW.verified_at) IS NULL OR strftime('%Y-%m-%dT%H:%M:%SZ',NEW.verified_at)<>substr(NEW.verified_at,1,19)||'Z'
 OR (length(NEW.verified_at)=24 AND (substr(NEW.verified_at,20,1)<>'.' OR substr(NEW.verified_at,21,3) NOT GLOB '[0-9][0-9][0-9]'))
BEGIN SELECT RAISE(ABORT,'allergen evidence instant must be canonical UTC'); END;
CREATE TRIGGER safety_dietary_verified_instant_r11 BEFORE INSERT ON food_dietary_rule_conflicts
WHEN length(NEW.verified_at) NOT IN (20,24) OR substr(NEW.verified_at,11,1)<>'T' OR substr(NEW.verified_at,14,1)<>':' OR substr(NEW.verified_at,17,1)<>':' OR substr(NEW.verified_at,-1,1)<>'Z'
 OR strftime('%Y-%m-%dT%H:%M:%SZ',NEW.verified_at) IS NULL OR strftime('%Y-%m-%dT%H:%M:%SZ',NEW.verified_at)<>substr(NEW.verified_at,1,19)||'Z'
 OR (length(NEW.verified_at)=24 AND (substr(NEW.verified_at,20,1)<>'.' OR substr(NEW.verified_at,21,3) NOT GLOB '[0-9][0-9][0-9]'))
BEGIN SELECT RAISE(ABORT,'dietary evidence instant must be canonical UTC'); END;

-- Core nutrition changes must carry fresh provenance in the same update.
CREATE TRIGGER foods_nutrition_requires_provenance_refresh_r11
BEFORE UPDATE OF energy_kcal_100g,protein_g_100g,carbs_g_100g,fat_g_100g,fiber_g_100g ON foods
WHEN (NEW.energy_kcal_100g IS NOT OLD.energy_kcal_100g OR NEW.protein_g_100g IS NOT OLD.protein_g_100g OR NEW.carbs_g_100g IS NOT OLD.carbs_g_100g OR NEW.fat_g_100g IS NOT OLD.fat_g_100g OR NEW.fiber_g_100g IS NOT OLD.fiber_g_100g)
 AND NEW.verified_at IS OLD.verified_at
 AND NEW.source_provider IS OLD.source_provider
 AND NEW.source_external_id IS OLD.source_external_id
 AND NEW.source_evidence_url IS OLD.source_evidence_url
 AND NEW.source_license_id IS OLD.source_license_id
BEGIN SELECT RAISE(ABORT,'nutrition changes require refreshed provenance'); END;

-- Extended nutrient snapshots must be derived from the referenced food and grams.
CREATE TRIGGER meal_item_nutrients_derivation_insert_r11
BEFORE INSERT ON meal_entry_item_nutrients
WHEN NOT EXISTS (
  SELECT 1 FROM meal_entry_items i JOIN food_nutrients n ON n.food_id=i.food_id AND n.nutrient_key=NEW.nutrient_key
  WHERE i.id=NEW.meal_entry_item_id
    AND NEW.unit=n.unit
    AND NEW.completeness=n.completeness
    AND ((n.amount_per_100g IS NULL AND NEW.amount IS NULL AND NEW.completeness='unknown')
      OR (n.amount_per_100g IS NOT NULL AND NEW.amount IS ROUND(n.amount_per_100g*i.grams/100.0,3)))
)
BEGIN SELECT RAISE(ABORT,'extended nutrient snapshot must be derived from food and grams'); END;
CREATE TRIGGER meal_item_nutrients_derivation_update_r11
BEFORE UPDATE OF meal_entry_item_id,nutrient_key,amount,unit,completeness ON meal_entry_item_nutrients
WHEN NOT EXISTS (
  SELECT 1 FROM meal_entry_items i JOIN food_nutrients n ON n.food_id=i.food_id AND n.nutrient_key=NEW.nutrient_key
  WHERE i.id=NEW.meal_entry_item_id
    AND NEW.unit=n.unit
    AND NEW.completeness=n.completeness
    AND ((n.amount_per_100g IS NULL AND NEW.amount IS NULL AND NEW.completeness='unknown')
      OR (n.amount_per_100g IS NOT NULL AND NEW.amount IS ROUND(n.amount_per_100g*i.grams/100.0,3)))
)
BEGIN SELECT RAISE(ABORT,'extended nutrient snapshot must be derived from food and grams'); END;

-- Natural portion label is deterministic from quantity + verified option label.
CREATE TRIGGER meal_items_portion_label_insert_r11
BEFORE INSERT ON meal_entry_items
WHEN NEW.portion_option_id IS NOT NULL AND NOT EXISTS (
 SELECT 1 FROM food_portion_options p WHERE p.id=NEW.portion_option_id AND p.food_id=NEW.food_id
 AND NEW.portion_label = CASE WHEN p.label GLOB '1 *' THEN printf('%g %s',NEW.portion_quantity,substr(p.label,3)) ELSE printf('%g %s',NEW.portion_quantity,p.label) END
)
BEGIN SELECT RAISE(ABORT,'portion label must be derived from option and quantity'); END;
CREATE TRIGGER meal_items_portion_label_update_r11
BEFORE UPDATE OF portion_option_id,portion_quantity,portion_label,food_id ON meal_entry_items
WHEN NEW.portion_option_id IS NOT NULL AND NOT EXISTS (
 SELECT 1 FROM food_portion_options p WHERE p.id=NEW.portion_option_id AND p.food_id=NEW.food_id
 AND NEW.portion_label = CASE WHEN p.label GLOB '1 *' THEN printf('%g %s',NEW.portion_quantity,substr(p.label,3)) ELSE printf('%g %s',NEW.portion_quantity,p.label) END
)
BEGIN SELECT RAISE(ABORT,'portion label must be derived from option and quantity'); END;

-- AI lifecycle identities cannot be replaced to erase terminal audit/idempotency state.
CREATE TRIGGER ai_actions_no_identity_collision_insert_r11
BEFORE INSERT ON ai_actions
WHEN EXISTS (SELECT 1 FROM ai_actions a WHERE a.id=NEW.id)
 OR EXISTS (SELECT 1 FROM ai_actions a WHERE a.user_id=NEW.user_id AND a.idempotency_key=NEW.idempotency_key)
BEGIN SELECT RAISE(ABORT,'AI action identity already exists; use state transition, never replace'); END;

-- created_at is immutable audit evidence and must itself be a canonical UTC instant.
CREATE TRIGGER ai_actions_created_at_canonical_insert_r11
BEFORE INSERT ON ai_actions
WHEN length(NEW.created_at) NOT IN (20,24) OR substr(NEW.created_at,11,1)<>'T' OR substr(NEW.created_at,14,1)<>':' OR substr(NEW.created_at,17,1)<>':' OR substr(NEW.created_at,-1,1)<>'Z'
 OR strftime('%Y-%m-%dT%H:%M:%SZ',NEW.created_at) IS NULL OR strftime('%Y-%m-%dT%H:%M:%SZ',NEW.created_at)<>substr(NEW.created_at,1,19)||'Z'
 OR (length(NEW.created_at)=24 AND (substr(NEW.created_at,20,1)<>'.' OR substr(NEW.created_at,21,3) NOT GLOB '[0-9][0-9][0-9]'))
BEGIN SELECT RAISE(ABORT,'AI action creation instant must be canonical UTC'); END;

-- Calculated goals are accepted only when the supported versioned calculator inputs
-- deterministically reproduce every persisted target.
CREATE TRIGGER goals_derive_mifflin_v1_insert_r11
BEFORE INSERT ON goals
WHEN NEW.source='arven-calculated' AND (
 NEW.calculation_method<>'mifflin-st-jeor' OR NEW.calculation_version<>'v1'
 OR json_type(NEW.calculation_inputs_json,'$.weightKg') NOT IN ('integer','real')
 OR json_type(NEW.calculation_inputs_json,'$.heightCm') NOT IN ('integer','real')
 OR json_type(NEW.calculation_inputs_json,'$.ageYears') NOT IN ('integer','real')
 OR json_extract(NEW.calculation_inputs_json,'$.sexAtBirth') NOT IN ('male','female')
 OR json_type(NEW.calculation_inputs_json,'$.activityFactor') NOT IN ('integer','real')
 OR json_type(NEW.calculation_inputs_json,'$.energyAdjustmentKcal') NOT IN ('integer','real')
 OR json_type(NEW.calculation_inputs_json,'$.proteinGPerKg') NOT IN ('integer','real')
 OR json_type(NEW.calculation_inputs_json,'$.fatEnergyPct') NOT IN ('integer','real')
 OR json_type(NEW.calculation_inputs_json,'$.waterMlPerKg') NOT IN ('integer','real')
 OR NEW.energy_kcal IS NOT ROUND(((10*json_extract(NEW.calculation_inputs_json,'$.weightKg'))+(6.25*json_extract(NEW.calculation_inputs_json,'$.heightCm'))-(5*json_extract(NEW.calculation_inputs_json,'$.ageYears'))+CASE json_extract(NEW.calculation_inputs_json,'$.sexAtBirth') WHEN 'male' THEN 5 ELSE -161 END)*json_extract(NEW.calculation_inputs_json,'$.activityFactor')+json_extract(NEW.calculation_inputs_json,'$.energyAdjustmentKcal'),0)
 OR NEW.protein_g IS NOT ROUND(json_extract(NEW.calculation_inputs_json,'$.weightKg')*json_extract(NEW.calculation_inputs_json,'$.proteinGPerKg'),1)
 OR NEW.fat_g IS NOT ROUND(NEW.energy_kcal*json_extract(NEW.calculation_inputs_json,'$.fatEnergyPct')/9.0,1)
 OR NEW.carbs_g IS NOT ROUND(MAX(0,(NEW.energy_kcal-(NEW.protein_g*4)-(NEW.fat_g*9))/4.0),1)
 OR NEW.fiber_g IS NOT ROUND((NEW.energy_kcal/1000.0)*14,1)
 OR NEW.water_ml IS NOT ROUND(json_extract(NEW.calculation_inputs_json,'$.weightKg')*json_extract(NEW.calculation_inputs_json,'$.waterMlPerKg'),0)
)
BEGIN SELECT RAISE(ABORT,'calculated goal targets must be derived by mifflin-st-jeor@v1'); END;

CREATE TRIGGER goals_prevent_manual_to_calculated_r11
BEFORE UPDATE OF source ON goals
WHEN OLD.source<>'arven-calculated' AND NEW.source='arven-calculated'
BEGIN SELECT RAISE(ABORT,'create a new calculator-derived goal instead of relabeling a manual goal'); END;
