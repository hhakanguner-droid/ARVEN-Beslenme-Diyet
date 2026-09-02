PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  external_subject TEXT NOT NULL UNIQUE,
  email TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  locale TEXT NOT NULL DEFAULT 'tr-TR',
  timezone TEXT NOT NULL DEFAULT 'Europe/Istanbul',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name TEXT,
  birth_date TEXT,
  sex_at_birth TEXT,
  height_cm REAL,
  activity_level TEXT,
  nutrition_day_start_minutes INTEGER NOT NULL DEFAULT 0 CHECK (nutrition_day_start_minutes BETWEEN 0 AND 1439),
  energy_unit TEXT NOT NULL DEFAULT 'kcal' CHECK (energy_unit IN ('kcal','kj')),
  updated_at TEXT NOT NULL
);

CREATE TABLE user_ui_preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  home_card_order_json TEXT NOT NULL DEFAULT '["calendar","daily-goals","today-meals"]',
  nutrient_order_json TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL
);

CREATE TABLE scientific_references (
  id TEXT PRIMARY KEY CHECK (length(trim(id)) > 0),
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  citation TEXT NOT NULL CHECK (length(trim(citation)) > 0),
  evidence_url TEXT,
  published_year INTEGER,
  created_at TEXT NOT NULL
);

CREATE TABLE goals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  effective_from TEXT NOT NULL CHECK (date(effective_from) IS NOT NULL AND effective_from = date(effective_from)),
  effective_to TEXT CHECK (effective_to IS NULL OR (date(effective_to) IS NOT NULL AND effective_to = date(effective_to) AND effective_to >= effective_from)),
  energy_kcal REAL NOT NULL CHECK (energy_kcal > 0),
  protein_g REAL NOT NULL CHECK (protein_g >= 0),
  carbs_g REAL NOT NULL CHECK (carbs_g >= 0),
  fat_g REAL NOT NULL CHECK (fat_g >= 0),
  fiber_g REAL CHECK (fiber_g IS NULL OR fiber_g >= 0),
  water_ml REAL CHECK (water_ml IS NULL OR water_ml >= 0),
  source TEXT NOT NULL CHECK (source IN ('manual','arven-calculated')),
  calculation_method TEXT,
  calculation_version TEXT,
  calculation_inputs_json TEXT,
  reference_ids_json TEXT NOT NULL DEFAULT '[]'
    CHECK (json_valid(reference_ids_json) = 1 AND json_type(reference_ids_json) = 'array'),
  created_at TEXT NOT NULL,
  CHECK (
    source <> 'arven-calculated' OR (
      calculation_method IS NOT NULL AND length(trim(calculation_method)) > 0
      AND calculation_version IS NOT NULL AND length(trim(calculation_version)) > 0
      AND calculation_inputs_json IS NOT NULL
      AND json_valid(calculation_inputs_json) = 1
      AND json_type(calculation_inputs_json) = 'object'
      AND json_array_length(reference_ids_json) > 0
    )
  )
);
CREATE INDEX goals_user_effective_idx ON goals(user_id, effective_from, effective_to);

CREATE TRIGGER goals_validate_arven_calculated_insert
BEFORE INSERT ON goals
WHEN NEW.source = 'arven-calculated'
BEGIN
  SELECT CASE WHEN
    (SELECT COUNT(*) FROM json_each(NEW.calculation_inputs_json)) = 0
    OR (SELECT COUNT(*) FROM json_each(NEW.calculation_inputs_json) WHERE length(trim(key)) = 0) > 0
    OR (SELECT COUNT(*) FROM json_each(NEW.reference_ids_json)
        WHERE type = 'text' AND length(trim(CAST(value AS TEXT))) > 0)
       <> json_array_length(NEW.reference_ids_json)
    OR EXISTS (
      SELECT 1 FROM json_each(NEW.reference_ids_json) refs
      LEFT JOIN scientific_references sr ON sr.id = trim(CAST(refs.value AS TEXT))
      WHERE sr.id IS NULL
    )
  THEN RAISE(ABORT, 'ARVEN-calculated goals require resolvable scientific provenance') END;
END;

CREATE TRIGGER goals_validate_arven_calculated_update
BEFORE UPDATE OF source, calculation_method, calculation_version, calculation_inputs_json, reference_ids_json,
  energy_kcal, protein_g, carbs_g, fat_g, fiber_g, water_ml ON goals
WHEN NEW.source = 'arven-calculated'
BEGIN
  SELECT CASE WHEN
    NEW.calculation_method IS NULL OR length(trim(NEW.calculation_method)) = 0
    OR NEW.calculation_version IS NULL OR length(trim(NEW.calculation_version)) = 0
    OR NEW.calculation_inputs_json IS NULL
    OR json_valid(NEW.calculation_inputs_json) <> 1
    OR json_type(NEW.calculation_inputs_json) <> 'object'
    OR (SELECT COUNT(*) FROM json_each(NEW.calculation_inputs_json)) = 0
    OR (SELECT COUNT(*) FROM json_each(NEW.calculation_inputs_json) WHERE length(trim(key)) = 0) > 0
    OR json_array_length(NEW.reference_ids_json) = 0
    OR (SELECT COUNT(*) FROM json_each(NEW.reference_ids_json)
        WHERE type = 'text' AND length(trim(CAST(value AS TEXT))) > 0)
       <> json_array_length(NEW.reference_ids_json)
    OR EXISTS (
      SELECT 1 FROM json_each(NEW.reference_ids_json) refs
      LEFT JOIN scientific_references sr ON sr.id = trim(CAST(refs.value AS TEXT))
      WHERE sr.id IS NULL
    )
  THEN RAISE(ABORT, 'ARVEN-calculated goals require resolvable scientific provenance') END;
END;

CREATE TRIGGER goals_prevent_calculated_target_mutation
BEFORE UPDATE OF energy_kcal, protein_g, carbs_g, fat_g, fiber_g, water_ml ON goals
WHEN OLD.source = 'arven-calculated' AND (
  NEW.energy_kcal IS NOT OLD.energy_kcal
  OR NEW.protein_g IS NOT OLD.protein_g
  OR NEW.carbs_g IS NOT OLD.carbs_g
  OR NEW.fat_g IS NOT OLD.fat_g
  OR NEW.fiber_g IS NOT OLD.fiber_g
  OR NEW.water_ml IS NOT OLD.water_ml
)
BEGIN
  SELECT RAISE(ABORT, 'calculated goal targets are immutable; create a recalculated goal');
END;

CREATE TRIGGER scientific_references_prevent_delete
BEFORE DELETE ON scientific_references
WHEN EXISTS (
  SELECT 1
  FROM goals g, json_each(g.reference_ids_json) refs
  WHERE trim(CAST(refs.value AS TEXT)) = OLD.id
)
BEGIN
  SELECT RAISE(ABORT, 'scientific reference is still used by a goal');
END;

CREATE TRIGGER scientific_references_prevent_id_update
BEFORE UPDATE OF id ON scientific_references
WHEN NEW.id <> OLD.id AND EXISTS (
  SELECT 1
  FROM goals g, json_each(g.reference_ids_json) refs
  WHERE trim(CAST(refs.value AS TEXT)) = OLD.id
)
BEGIN
  SELECT RAISE(ABORT, 'scientific reference id is still used by a goal');
END;

CREATE TRIGGER goals_prevent_overlap_insert
BEFORE INSERT ON goals
WHEN EXISTS (
  SELECT 1 FROM goals g
  WHERE g.user_id = NEW.user_id
    AND g.effective_from <= COALESCE(NEW.effective_to, '9999-12-31')
    AND NEW.effective_from <= COALESCE(g.effective_to, '9999-12-31')
)
BEGIN
  SELECT RAISE(ABORT, 'goal interval overlap');
END;

CREATE TRIGGER goals_prevent_overlap_update
BEFORE UPDATE OF user_id, effective_from, effective_to ON goals
WHEN EXISTS (
  SELECT 1 FROM goals g
  WHERE g.user_id = NEW.user_id
    AND g.id <> NEW.id
    AND g.effective_from <= COALESCE(NEW.effective_to, '9999-12-31')
    AND NEW.effective_from <= COALESCE(g.effective_to, '9999-12-31')
)
BEGIN
  SELECT RAISE(ABORT, 'goal interval overlap');
END;

-- Meal allocations are stored as one atomic validated set so an incomplete
-- row-by-row aggregate can never be committed as a valid plan.
CREATE TABLE goal_meal_allocations (
  goal_id TEXT PRIMARY KEY REFERENCES goals(id) ON DELETE CASCADE,
  allocations_json TEXT NOT NULL
    CHECK (json_valid(allocations_json) = 1 AND json_type(allocations_json) = 'array' AND json_array_length(allocations_json) > 0),
  updated_at TEXT NOT NULL
);

CREATE TRIGGER goal_meal_allocations_validate_insert
BEFORE INSERT ON goal_meal_allocations
BEGIN
  SELECT CASE WHEN
    EXISTS (
      SELECT 1 FROM json_each(NEW.allocations_json) item
      WHERE json_type(item.value) <> 'object'
         OR json_type(item.value, '$.mealType') <> 'text'
         OR json_extract(item.value, '$.mealType') NOT IN ('breakfast','morning-snack','lunch','afternoon-snack','dinner','snack','custom')
         OR json_type(item.value, '$.energyShareBps') <> 'integer'
         OR CAST(json_extract(item.value, '$.energyShareBps') AS INTEGER) NOT BETWEEN 0 AND 10000
    )
    OR (SELECT COUNT(*) FROM json_each(NEW.allocations_json)) <>
       (SELECT COUNT(DISTINCT json_extract(item.value, '$.mealType')) FROM json_each(NEW.allocations_json) item)
    OR COALESCE((SELECT SUM(CAST(json_extract(item.value, '$.energyShareBps') AS INTEGER)) FROM json_each(NEW.allocations_json) item), 0) <> 10000
  THEN RAISE(ABORT, 'meal allocations must be canonical, unique and total 10000 basis points') END;
END;

CREATE TRIGGER goal_meal_allocations_validate_update
BEFORE UPDATE OF allocations_json ON goal_meal_allocations
BEGIN
  SELECT CASE WHEN
    EXISTS (
      SELECT 1 FROM json_each(NEW.allocations_json) item
      WHERE json_type(item.value) <> 'object'
         OR json_type(item.value, '$.mealType') <> 'text'
         OR json_extract(item.value, '$.mealType') NOT IN ('breakfast','morning-snack','lunch','afternoon-snack','dinner','snack','custom')
         OR json_type(item.value, '$.energyShareBps') <> 'integer'
         OR CAST(json_extract(item.value, '$.energyShareBps') AS INTEGER) NOT BETWEEN 0 AND 10000
    )
    OR (SELECT COUNT(*) FROM json_each(NEW.allocations_json)) <>
       (SELECT COUNT(DISTINCT json_extract(item.value, '$.mealType')) FROM json_each(NEW.allocations_json) item)
    OR COALESCE((SELECT SUM(CAST(json_extract(item.value, '$.energyShareBps') AS INTEGER)) FROM json_each(NEW.allocations_json) item), 0) <> 10000
  THEN RAISE(ABORT, 'meal allocations must be canonical, unique and total 10000 basis points') END;
END;

CREATE TABLE foods (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  brand TEXT,
  barcode TEXT,
  is_liquid INTEGER NOT NULL DEFAULT 0 CHECK (is_liquid IN (0,1)),
  allergen_data_status TEXT NOT NULL DEFAULT 'unknown' CHECK (allergen_data_status IN ('verified','unknown','not-applicable')),
  dietary_safety_data_status TEXT NOT NULL DEFAULT 'unknown' CHECK (dietary_safety_data_status IN ('verified','unknown','not-applicable')),
  energy_kcal_100g REAL NOT NULL CHECK (energy_kcal_100g >= 0),
  protein_g_100g REAL NOT NULL CHECK (protein_g_100g >= 0),
  carbs_g_100g REAL NOT NULL CHECK (carbs_g_100g >= 0),
  fat_g_100g REAL NOT NULL CHECK (fat_g_100g >= 0),
  fiber_g_100g REAL CHECK (fiber_g_100g IS NULL OR fiber_g_100g >= 0),
  source_provider TEXT NOT NULL CHECK (source_provider IN ('open-food-facts','usda','turkomp','bls','swiss-fcd','manual-verified')),
  source_external_id TEXT,
  source_evidence_url TEXT,
  source_license_id TEXT,
  verified_at TEXT NOT NULL CHECK (length(trim(verified_at)) > 0 AND julianday(verified_at) IS NOT NULL),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (source_provider = 'manual-verified' OR (source_external_id IS NOT NULL AND length(trim(source_external_id)) > 0))
);
CREATE INDEX foods_name_idx ON foods(normalized_name);
CREATE INDEX foods_owner_idx ON foods(owner_user_id);
CREATE INDEX foods_barcode_idx ON foods(barcode);
CREATE INDEX foods_source_idx ON foods(source_provider, source_external_id);

-- Ownership changes are not an edit operation. Publishing a private food must
-- create a separately reviewed global record rather than nulling owner_user_id.
CREATE TRIGGER foods_owner_immutable
BEFORE UPDATE OF owner_user_id ON foods
WHEN NEW.owner_user_id IS NOT OLD.owner_user_id
BEGIN
  SELECT RAISE(ABORT, 'food ownership is immutable');
END;

CREATE TABLE nutrient_catalog (
  nutrient_key TEXT PRIMARY KEY,
  unit TEXT NOT NULL CHECK (unit IN ('g','mg','mcg')),
  UNIQUE (nutrient_key, unit)
);

INSERT INTO nutrient_catalog (nutrient_key, unit) VALUES
  ('saturated-fat','g'), ('trans-fat','g'), ('monounsaturated-fat','g'),
  ('polyunsaturated-fat','g'), ('omega-3','g'), ('omega-6','g'),
  ('sugars','g'), ('added-sugars','g'), ('sodium','mg'), ('salt','g'),
  ('cholesterol','mg'), ('caffeine','mg'), ('calcium','mg'), ('iron','mg'),
  ('potassium','mg'), ('magnesium','mg'), ('zinc','mg'), ('phosphorus','mg'),
  ('selenium','mcg'), ('iodine','mcg'), ('vitamin-a','mcg'), ('vitamin-b1','mg'),
  ('vitamin-b2','mg'), ('vitamin-b3','mg'), ('vitamin-b5','mg'), ('vitamin-b6','mg'),
  ('vitamin-b7','mcg'), ('vitamin-b9','mcg'), ('vitamin-b12','mcg'), ('vitamin-c','mg'),
  ('vitamin-d','mcg'), ('vitamin-e','mg'), ('vitamin-k','mcg');

CREATE TABLE food_nutrients (
  food_id TEXT NOT NULL REFERENCES foods(id) ON DELETE CASCADE,
  nutrient_key TEXT NOT NULL,
  amount_per_100g REAL CHECK (amount_per_100g IS NULL OR amount_per_100g >= 0),
  unit TEXT NOT NULL CHECK (unit IN ('g','mg','mcg')),
  completeness TEXT NOT NULL CHECK (completeness IN ('complete','partial','unknown')),
  CHECK (amount_per_100g IS NOT NULL OR completeness <> 'complete'),
  PRIMARY KEY (food_id, nutrient_key),
  FOREIGN KEY (nutrient_key, unit) REFERENCES nutrient_catalog(nutrient_key, unit)
);

CREATE TABLE food_portion_options (
  id TEXT PRIMARY KEY,
  food_id TEXT NOT NULL REFERENCES foods(id) ON DELETE CASCADE,
  measure TEXT NOT NULL CHECK (measure IN ('piece','slice','teaspoon','tablespoon','tea-glass','water-glass','cup','bowl','handful','palm','serving','package','bottle','can','ladle')),
  size TEXT CHECK (size IN ('small','medium','large')),
  label TEXT NOT NULL,
  grams_per_unit REAL NOT NULL CHECK (grams_per_unit > 0),
  source_provider TEXT NOT NULL CHECK (source_provider IN ('open-food-facts','usda','turkomp','bls','swiss-fcd','manual-verified')),
  source_external_id TEXT,
  source_evidence_url TEXT,
  source_license_id TEXT,
  verified_at TEXT NOT NULL CHECK (length(trim(verified_at)) > 0 AND julianday(verified_at) IS NOT NULL),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (source_provider = 'manual-verified' OR (source_external_id IS NOT NULL AND length(trim(source_external_id)) > 0)),
  UNIQUE (id, food_id)
);
CREATE INDEX food_portion_options_food_idx ON food_portion_options(food_id);

CREATE TABLE allergen_catalog (
  id TEXT PRIMARY KEY,
  canonical_name TEXT NOT NULL,
  aliases_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);

CREATE TABLE user_allergies (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  allergen_id TEXT NOT NULL REFERENCES allergen_catalog(id),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, allergen_id)
);
CREATE INDEX user_allergies_active_idx ON user_allergies(user_id, active);

CREATE TABLE food_allergens (
  food_id TEXT NOT NULL REFERENCES foods(id) ON DELETE CASCADE,
  allergen_id TEXT NOT NULL REFERENCES allergen_catalog(id),
  source_provider TEXT NOT NULL CHECK (source_provider IN ('open-food-facts','usda','turkomp','bls','swiss-fcd','manual-verified')),
  source_external_id TEXT,
  verified_at TEXT NOT NULL CHECK (length(trim(verified_at)) > 0 AND julianday(verified_at) IS NOT NULL),
  CHECK (source_provider = 'manual-verified' OR (source_external_id IS NOT NULL AND length(trim(source_external_id)) > 0)),
  PRIMARY KEY (food_id, allergen_id)
);

CREATE TABLE dietary_rule_catalog (
  id TEXT PRIMARY KEY,
  canonical_name TEXT NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE food_dietary_rule_conflicts (
  food_id TEXT NOT NULL REFERENCES foods(id) ON DELETE CASCADE,
  dietary_rule_id TEXT NOT NULL REFERENCES dietary_rule_catalog(id),
  source_provider TEXT NOT NULL CHECK (source_provider IN ('open-food-facts','usda','turkomp','bls','swiss-fcd','manual-verified')),
  source_external_id TEXT,
  verified_at TEXT NOT NULL CHECK (length(trim(verified_at)) > 0 AND julianday(verified_at) IS NOT NULL),
  CHECK (source_provider = 'manual-verified' OR (source_external_id IS NOT NULL AND length(trim(source_external_id)) > 0)),
  PRIMARY KEY (food_id, dietary_rule_id)
);

CREATE TABLE food_source_preferences (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('open-food-facts','usda','turkomp','bls','swiss-fcd','manual-verified')),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  priority INTEGER NOT NULL DEFAULT 100,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, provider)
);

CREATE TABLE food_preferences (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  food_term TEXT NOT NULL,
  food_id TEXT REFERENCES foods(id),
  dietary_rule_id TEXT REFERENCES dietary_rule_catalog(id),
  resolution_status TEXT NOT NULL DEFAULT 'unresolved' CHECK (resolution_status IN ('resolved','unresolved')),
  preference TEXT NOT NULL CHECK (preference IN ('like','dislike','avoid','dietary-rule')),
  strength INTEGER NOT NULL DEFAULT 1 CHECK (strength BETWEEN 1 AND 5),
  provenance TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    resolution_status = 'unresolved'
    OR preference NOT IN ('avoid','dietary-rule')
    OR (preference = 'avoid' AND food_id IS NOT NULL)
    OR (preference = 'dietary-rule' AND dietary_rule_id IS NOT NULL)
  )
);
CREATE INDEX food_preferences_user_idx ON food_preferences(user_id);
CREATE INDEX food_preferences_safety_idx ON food_preferences(user_id, preference, resolution_status);

CREATE TRIGGER food_preferences_private_food_insert
BEFORE INSERT ON food_preferences
WHEN NEW.food_id IS NOT NULL AND EXISTS (
  SELECT 1 FROM foods f
  WHERE f.id = NEW.food_id
    AND f.owner_user_id IS NOT NULL
    AND f.owner_user_id <> NEW.user_id
)
BEGIN
  SELECT RAISE(ABORT, 'private preference food ownership mismatch');
END;

CREATE TRIGGER food_preferences_private_food_update
BEFORE UPDATE OF user_id, food_id ON food_preferences
WHEN NEW.food_id IS NOT NULL AND EXISTS (
  SELECT 1 FROM foods f
  WHERE f.id = NEW.food_id
    AND f.owner_user_id IS NOT NULL
    AND f.owner_user_id <> NEW.user_id
)
BEGIN
  SELECT RAISE(ABORT, 'private preference food ownership mismatch');
END;

CREATE TABLE assessment_snapshots (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  schema_version TEXT NOT NULL,
  answers_json TEXT NOT NULL,
  completed_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX assessment_snapshots_user_idx ON assessment_snapshots(user_id, completed_at);

CREATE TABLE meal_entries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  local_date TEXT NOT NULL,
  meal_type TEXT NOT NULL CHECK (meal_type IN ('breakfast','morning-snack','lunch','afternoon-snack','dinner','snack','custom')),
  occurred_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('draft','confirmed','deleted')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX meal_entries_user_date_idx ON meal_entries(user_id, local_date, status);

CREATE TABLE meal_entry_items (
  id TEXT PRIMARY KEY,
  meal_entry_id TEXT NOT NULL REFERENCES meal_entries(id) ON DELETE CASCADE,
  food_id TEXT NOT NULL REFERENCES foods(id),
  portion_option_id TEXT,
  portion_quantity REAL CHECK (portion_quantity IS NULL OR portion_quantity > 0),
  portion_label TEXT,
  grams REAL NOT NULL CHECK (grams > 0),
  energy_kcal REAL NOT NULL CHECK (energy_kcal >= 0),
  protein_g REAL NOT NULL CHECK (protein_g >= 0),
  carbs_g REAL NOT NULL CHECK (carbs_g >= 0),
  fat_g REAL NOT NULL CHECK (fat_g >= 0),
  fiber_g REAL CHECK (fiber_g IS NULL OR fiber_g >= 0),
  calculation_version TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (portion_option_id, food_id) REFERENCES food_portion_options(id, food_id)
);
CREATE INDEX meal_entry_items_entry_idx ON meal_entry_items(meal_entry_id);

CREATE TRIGGER meal_entry_items_private_food_insert
BEFORE INSERT ON meal_entry_items
WHEN EXISTS (
  SELECT 1 FROM meal_entries m
  JOIN foods f ON f.id = NEW.food_id
  WHERE m.id = NEW.meal_entry_id
    AND f.owner_user_id IS NOT NULL
    AND f.owner_user_id <> m.user_id
)
BEGIN
  SELECT RAISE(ABORT, 'private food ownership mismatch');
END;

CREATE TRIGGER meal_entry_items_private_food_update
BEFORE UPDATE OF meal_entry_id, food_id ON meal_entry_items
WHEN EXISTS (
  SELECT 1 FROM meal_entries m
  JOIN foods f ON f.id = NEW.food_id
  WHERE m.id = NEW.meal_entry_id
    AND f.owner_user_id IS NOT NULL
    AND f.owner_user_id <> m.user_id
)
BEGIN
  SELECT RAISE(ABORT, 'private food ownership mismatch');
END;

CREATE TRIGGER meal_entries_private_food_user_update
BEFORE UPDATE OF user_id ON meal_entries
WHEN EXISTS (
  SELECT 1 FROM meal_entry_items i
  JOIN foods f ON f.id = i.food_id
  WHERE i.meal_entry_id = NEW.id
    AND f.owner_user_id IS NOT NULL
    AND f.owner_user_id <> NEW.user_id
)
BEGIN
  SELECT RAISE(ABORT, 'meal user change would violate private food ownership');
END;

CREATE TABLE meal_entry_item_nutrients (
  meal_entry_item_id TEXT NOT NULL REFERENCES meal_entry_items(id) ON DELETE CASCADE,
  nutrient_key TEXT NOT NULL,
  amount REAL CHECK (amount IS NULL OR amount >= 0),
  unit TEXT NOT NULL CHECK (unit IN ('g','mg','mcg')),
  completeness TEXT NOT NULL CHECK (completeness IN ('complete','partial','unknown')),
  CHECK (amount IS NOT NULL OR completeness <> 'complete'),
  PRIMARY KEY (meal_entry_item_id, nutrient_key),
  FOREIGN KEY (nutrient_key, unit) REFERENCES nutrient_catalog(nutrient_key, unit)
);

CREATE TABLE water_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  occurred_at TEXT NOT NULL,
  local_date TEXT NOT NULL,
  milliliters REAL NOT NULL CHECK (milliliters > 0),
  created_at TEXT NOT NULL
);
CREATE INDEX water_logs_user_date_idx ON water_logs(user_id, local_date, occurred_at);

CREATE TABLE ai_actions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (action_type IN ('meal-log','water-log')),
  schema_version TEXT NOT NULL CHECK (
    (action_type = 'meal-log' AND schema_version = 'MealLogActionV1')
    OR (action_type = 'water-log' AND schema_version = 'WaterLogActionV1')
  ),
  request_hash TEXT NOT NULL CHECK (length(trim(request_hash)) > 0),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json) = 1 AND json_type(payload_json) = 'object'),
  status TEXT NOT NULL CHECK (status IN ('proposed','confirmed','rejected','applied','failed')),
  idempotency_key TEXT NOT NULL CHECK (length(trim(idempotency_key)) > 0),
  created_at TEXT NOT NULL,
  confirmed_at TEXT CHECK (
    confirmed_at IS NULL OR (length(trim(confirmed_at)) > 0 AND julianday(confirmed_at) IS NOT NULL)
  ),
  applied_at TEXT CHECK (
    applied_at IS NULL OR (length(trim(applied_at)) > 0 AND julianday(applied_at) IS NOT NULL)
  ),
  CHECK (status NOT IN ('confirmed','applied') OR confirmed_at IS NOT NULL),
  CHECK (
    status <> 'applied'
    OR (
      applied_at IS NOT NULL
      AND julianday(applied_at) >= julianday(confirmed_at)
    )
  ),
  UNIQUE(user_id, idempotency_key)
);
CREATE INDEX ai_actions_user_status_idx ON ai_actions(user_id, status);

CREATE TRIGGER ai_actions_validate_payload_insert
BEFORE INSERT ON ai_actions
BEGIN
  SELECT CASE
    WHEN NEW.action_type = 'meal-log' AND (
      json_type(NEW.payload_json, '$.localDate') <> 'text'
      OR date(json_extract(NEW.payload_json, '$.localDate')) IS NULL
      OR json_extract(NEW.payload_json, '$.localDate') <> date(json_extract(NEW.payload_json, '$.localDate'))
      OR json_type(NEW.payload_json, '$.occurredAt') <> 'text'
      OR julianday(json_extract(NEW.payload_json, '$.occurredAt')) IS NULL
      OR json_extract(NEW.payload_json, '$.mealType') NOT IN ('breakfast','morning-snack','lunch','afternoon-snack','dinner','snack','custom')
      OR json_type(NEW.payload_json, '$.items') <> 'array'
      OR json_array_length(json_extract(NEW.payload_json, '$.items')) = 0
      OR EXISTS (
        SELECT 1 FROM json_each(NEW.payload_json, '$.items') item
        WHERE json_type(item.value) <> 'object'
           OR json_type(item.value, '$.foodId') <> 'text'
           OR length(trim(json_extract(item.value, '$.foodId'))) = 0
           OR json_type(item.value, '$.grams') NOT IN ('integer','real')
           OR CAST(json_extract(item.value, '$.grams') AS REAL) <= 0
           OR json_type(item.value, '$.calculationVersion') <> 'text'
           OR length(trim(json_extract(item.value, '$.calculationVersion'))) = 0
      )
    ) THEN RAISE(ABORT, 'invalid MealLogActionV1 payload')
    WHEN NEW.action_type = 'water-log' AND (
      json_type(NEW.payload_json, '$.occurredAt') <> 'text'
      OR julianday(json_extract(NEW.payload_json, '$.occurredAt')) IS NULL
      OR json_type(NEW.payload_json, '$.milliliters') NOT IN ('integer','real')
      OR CAST(json_extract(NEW.payload_json, '$.milliliters') AS REAL) <= 0
    ) THEN RAISE(ABORT, 'invalid WaterLogActionV1 payload')
  END;
END;

CREATE TRIGGER ai_actions_validate_payload_update
BEFORE UPDATE OF action_type, schema_version, payload_json ON ai_actions
BEGIN
  SELECT CASE
    WHEN NEW.action_type = 'meal-log' AND (
      json_type(NEW.payload_json, '$.localDate') <> 'text'
      OR date(json_extract(NEW.payload_json, '$.localDate')) IS NULL
      OR json_extract(NEW.payload_json, '$.localDate') <> date(json_extract(NEW.payload_json, '$.localDate'))
      OR json_type(NEW.payload_json, '$.occurredAt') <> 'text'
      OR julianday(json_extract(NEW.payload_json, '$.occurredAt')) IS NULL
      OR json_extract(NEW.payload_json, '$.mealType') NOT IN ('breakfast','morning-snack','lunch','afternoon-snack','dinner','snack','custom')
      OR json_type(NEW.payload_json, '$.items') <> 'array'
      OR json_array_length(json_extract(NEW.payload_json, '$.items')) = 0
      OR EXISTS (
        SELECT 1 FROM json_each(NEW.payload_json, '$.items') item
        WHERE json_type(item.value) <> 'object'
           OR json_type(item.value, '$.foodId') <> 'text'
           OR length(trim(json_extract(item.value, '$.foodId'))) = 0
           OR json_type(item.value, '$.grams') NOT IN ('integer','real')
           OR CAST(json_extract(item.value, '$.grams') AS REAL) <= 0
           OR json_type(item.value, '$.calculationVersion') <> 'text'
           OR length(trim(json_extract(item.value, '$.calculationVersion'))) = 0
      )
    ) THEN RAISE(ABORT, 'invalid MealLogActionV1 payload')
    WHEN NEW.action_type = 'water-log' AND (
      json_type(NEW.payload_json, '$.occurredAt') <> 'text'
      OR julianday(json_extract(NEW.payload_json, '$.occurredAt')) IS NULL
      OR json_type(NEW.payload_json, '$.milliliters') NOT IN ('integer','real')
      OR CAST(json_extract(NEW.payload_json, '$.milliliters') AS REAL) <= 0
    ) THEN RAISE(ABORT, 'invalid WaterLogActionV1 payload')
  END;
END;

CREATE TRIGGER ai_actions_freeze_confirmed_proposal
BEFORE UPDATE OF action_type, schema_version, request_hash, payload_json ON ai_actions
WHEN OLD.confirmed_at IS NOT NULL AND (
  NEW.action_type IS NOT OLD.action_type
  OR NEW.schema_version IS NOT OLD.schema_version
  OR NEW.request_hash IS NOT OLD.request_hash
  OR NEW.payload_json IS NOT OLD.payload_json
)
BEGIN
  SELECT RAISE(ABORT, 'confirmed AI action proposal is immutable');
END;
