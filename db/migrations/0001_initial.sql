PRAGMA foreign_keys = ON;

-- ARVEN Beslenme & Diyet V1 clean persistence baseline.
-- SQLite owns structural/referential integrity. Authenticated semantic writes
-- are available only through the server-side V1 mutation service.

CREATE TABLE users (
  subject TEXT PRIMARY KEY NOT NULL CHECK (length(trim(subject)) > 0),
  timezone TEXT NOT NULL DEFAULT 'Europe/Istanbul' CHECK (length(trim(timezone)) > 0),
  nutrition_day_start_minutes INTEGER NOT NULL DEFAULT 0 CHECK (nutrition_day_start_minutes BETWEEN 0 AND 1439),
  locale TEXT NOT NULL DEFAULT 'tr-TR' CHECK (length(trim(locale)) > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT, WITHOUT ROWID;

CREATE TABLE profiles (
  user_subject TEXT PRIMARY KEY NOT NULL REFERENCES users(subject) ON DELETE CASCADE,
  display_name TEXT,
  birth_date TEXT,
  sex_at_birth TEXT,
  height_cm REAL CHECK (height_cm IS NULL OR height_cm BETWEEN 100 AND 260),
  activity_level TEXT,
  updated_at TEXT NOT NULL
) STRICT, WITHOUT ROWID;

CREATE TABLE user_ui_preferences (
  user_subject TEXT PRIMARY KEY NOT NULL REFERENCES users(subject) ON DELETE CASCADE,
  home_card_order_json TEXT NOT NULL DEFAULT '["calendar","daily-goals","today-meals"]' CHECK (json_valid(home_card_order_json) = 1),
  nutrient_order_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(nutrient_order_json) = 1),
  updated_at TEXT NOT NULL
) STRICT, WITHOUT ROWID;

CREATE TABLE scientific_reference_versions (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
  reference_key TEXT NOT NULL CHECK (length(trim(reference_key)) > 0),
  version INTEGER NOT NULL CHECK (version > 0),
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  citation TEXT NOT NULL CHECK (length(trim(citation)) > 0),
  evidence_url TEXT,
  published_year INTEGER CHECK (published_year IS NULL OR published_year BETWEEN 1800 AND 2200),
  created_at TEXT NOT NULL,
  UNIQUE(reference_key, version)
) STRICT, WITHOUT ROWID;

CREATE TABLE goal_versions (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
  user_subject TEXT NOT NULL REFERENCES users(subject) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('manual','arven-calculated')),
  calculator_id TEXT,
  calculator_inputs_json TEXT,
  reference_snapshots_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(reference_snapshots_json) = 1 AND json_type(reference_snapshots_json) = 'array'),
  energy_kcal REAL NOT NULL CHECK (energy_kcal > 0 AND energy_kcal <= 20000),
  protein_g REAL NOT NULL CHECK (protein_g >= 0 AND protein_g <= 2000),
  carbs_g REAL NOT NULL CHECK (carbs_g >= 0 AND carbs_g <= 3000),
  fat_g REAL NOT NULL CHECK (fat_g >= 0 AND fat_g <= 2000),
  fiber_g REAL CHECK (fiber_g IS NULL OR (fiber_g >= 0 AND fiber_g <= 1000)),
  water_ml REAL CHECK (water_ml IS NULL OR (water_ml >= 0 AND water_ml <= 20000)),
  meal_allocations_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(meal_allocations_json) = 1 AND json_type(meal_allocations_json) = 'array'),
  created_at TEXT NOT NULL,
  CHECK ((source = 'manual' AND calculator_id IS NULL AND calculator_inputs_json IS NULL)
    OR (source = 'arven-calculated' AND calculator_id = 'mifflin-st-jeor@v1'
      AND calculator_inputs_json IS NOT NULL AND json_valid(calculator_inputs_json) = 1
      AND json_type(calculator_inputs_json) = 'object' AND json_array_length(reference_snapshots_json) > 0)),
  UNIQUE (id, user_subject)
) STRICT, WITHOUT ROWID;
CREATE INDEX goal_versions_user_idx ON goal_versions(user_subject, created_at);

CREATE TABLE user_current_goal (
  user_subject TEXT PRIMARY KEY NOT NULL REFERENCES users(subject) ON DELETE CASCADE,
  goal_version_id TEXT NOT NULL,
  selected_at TEXT NOT NULL,
  FOREIGN KEY (goal_version_id, user_subject) REFERENCES goal_versions(id, user_subject) ON DELETE RESTRICT
) STRICT, WITHOUT ROWID;

CREATE TABLE food_versions (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
  food_key TEXT NOT NULL CHECK (length(trim(food_key)) > 0),
  version INTEGER NOT NULL CHECK (version > 0),
  owner_subject TEXT REFERENCES users(subject) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  normalized_name TEXT NOT NULL CHECK (length(trim(normalized_name)) > 0),
  brand TEXT,
  barcode TEXT,
  is_liquid INTEGER NOT NULL DEFAULT 0 CHECK (is_liquid IN (0,1)),
  energy_kcal_100g REAL NOT NULL CHECK (energy_kcal_100g >= 0 AND energy_kcal_100g <= 10000),
  protein_g_100g REAL NOT NULL CHECK (protein_g_100g >= 0 AND protein_g_100g <= 1000),
  carbs_g_100g REAL NOT NULL CHECK (carbs_g_100g >= 0 AND carbs_g_100g <= 1000),
  fat_g_100g REAL NOT NULL CHECK (fat_g_100g >= 0 AND fat_g_100g <= 1000),
  fiber_g_100g REAL CHECK (fiber_g_100g IS NULL OR (fiber_g_100g >= 0 AND fiber_g_100g <= 1000)),
  extended_nutrition_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(extended_nutrition_json) = 1 AND json_type(extended_nutrition_json) = 'object'),
  allergen_data_status TEXT NOT NULL CHECK (allergen_data_status IN ('verified','unknown')),
  allergen_ids_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(allergen_ids_json) = 1 AND json_type(allergen_ids_json) = 'array'),
  dietary_safety_data_status TEXT NOT NULL CHECK (dietary_safety_data_status IN ('verified','unknown')),
  dietary_conflict_rule_ids_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(dietary_conflict_rule_ids_json) = 1 AND json_type(dietary_conflict_rule_ids_json) = 'array'),
  source_provider TEXT NOT NULL CHECK (source_provider IN ('open-food-facts','usda','turkomp','bls','swiss-fcd','manual-verified')),
  source_external_id TEXT,
  source_evidence_url TEXT,
  source_license_id TEXT,
  verified_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CHECK (source_provider = 'manual-verified' OR (source_external_id IS NOT NULL AND length(trim(source_external_id)) > 0)),
  UNIQUE (food_key, version),
  UNIQUE (id, owner_subject)
) STRICT, WITHOUT ROWID;
CREATE INDEX food_versions_name_idx ON food_versions(normalized_name);
CREATE INDEX food_versions_owner_idx ON food_versions(owner_subject);
CREATE INDEX food_versions_barcode_idx ON food_versions(barcode);

CREATE TABLE portion_versions (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
  portion_key TEXT NOT NULL CHECK (length(trim(portion_key)) > 0),
  version INTEGER NOT NULL CHECK (version > 0),
  food_version_id TEXT NOT NULL REFERENCES food_versions(id) ON DELETE RESTRICT,
  measure TEXT NOT NULL CHECK (measure IN ('piece','slice','teaspoon','tablespoon','tea-glass','water-glass','cup','bowl','handful','palm','serving','package','bottle','can','ladle')),
  size TEXT CHECK (size IS NULL OR size IN ('small','medium','large')),
  label TEXT NOT NULL CHECK (length(trim(label)) > 0),
  grams_per_unit REAL NOT NULL CHECK (grams_per_unit >= 0.1 AND grams_per_unit <= 100000),
  source_provider TEXT NOT NULL CHECK (source_provider IN ('open-food-facts','usda','turkomp','bls','swiss-fcd','manual-verified')),
  source_external_id TEXT,
  source_evidence_url TEXT,
  source_license_id TEXT,
  verified_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CHECK (source_provider = 'manual-verified' OR (source_external_id IS NOT NULL AND length(trim(source_external_id)) > 0)),
  UNIQUE (portion_key, version)
) STRICT, WITHOUT ROWID;
CREATE INDEX portion_versions_food_idx ON portion_versions(food_version_id);

CREATE TABLE allergen_catalog (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
  canonical_name TEXT NOT NULL CHECK (length(trim(canonical_name)) > 0),
  created_at TEXT NOT NULL
) STRICT, WITHOUT ROWID;

CREATE TABLE dietary_rule_catalog (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
  canonical_name TEXT NOT NULL CHECK (length(trim(canonical_name)) > 0),
  created_at TEXT NOT NULL
) STRICT, WITHOUT ROWID;

CREATE TABLE user_safety_exclusions (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
  user_subject TEXT NOT NULL REFERENCES users(subject) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('allergen','food','dietary-rule')),
  target_id TEXT,
  label TEXT NOT NULL CHECK (length(trim(label)) > 0),
  resolution_status TEXT NOT NULL CHECK (resolution_status IN ('resolved','unresolved')),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK ((resolution_status = 'resolved' AND target_id IS NOT NULL AND length(trim(target_id)) > 0) OR resolution_status = 'unresolved'),
  UNIQUE (user_subject, kind, target_id)
) STRICT, WITHOUT ROWID;
CREATE INDEX user_safety_exclusions_active_idx ON user_safety_exclusions(user_subject, active);

CREATE TABLE ai_action_proposals (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
  user_subject TEXT NOT NULL REFERENCES users(subject) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (action_type IN ('meal-log','water-log')),
  schema_version TEXT NOT NULL CHECK (schema_version IN ('MealLogActionV1','WaterLogActionV1')),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json) = 1 AND json_type(payload_json) = 'object'),
  payload_sha256 TEXT NOT NULL CHECK (length(payload_sha256) = 64),
  idempotency_key TEXT NOT NULL CHECK (length(trim(idempotency_key)) > 0),
  created_at TEXT NOT NULL,
  CHECK ((action_type = 'meal-log' AND schema_version = 'MealLogActionV1')
      OR (action_type = 'water-log' AND schema_version = 'WaterLogActionV1')),
  UNIQUE (user_subject, idempotency_key),
  UNIQUE (id, user_subject),
  UNIQUE (id, user_subject, action_type)
) STRICT, WITHOUT ROWID;

CREATE TABLE ai_action_decisions (
  action_id TEXT PRIMARY KEY NOT NULL,
  user_subject TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('confirmed','rejected')),
  decided_at TEXT NOT NULL,
  UNIQUE (action_id, user_subject, decision),
  FOREIGN KEY (action_id, user_subject) REFERENCES ai_action_proposals(id, user_subject) ON DELETE RESTRICT
) STRICT, WITHOUT ROWID;

CREATE TABLE nutrition_events (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
  user_subject TEXT NOT NULL REFERENCES users(subject) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('meal-log','water-log')),
  occurred_at TEXT NOT NULL,
  local_date TEXT NOT NULL CHECK (length(local_date) = 10),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json) = 1 AND json_type(payload_json) = 'object'),
  created_at TEXT NOT NULL,
  UNIQUE (id, user_subject),
  UNIQUE (id, user_subject, event_type)
) STRICT, WITHOUT ROWID;
CREATE INDEX nutrition_events_day_idx ON nutrition_events(user_subject, local_date, occurred_at);

CREATE TABLE ai_action_outcomes (
  action_id TEXT PRIMARY KEY NOT NULL,
  user_subject TEXT NOT NULL,
  action_type TEXT NOT NULL CHECK (action_type IN ('meal-log','water-log')),
  confirmation_marker TEXT NOT NULL DEFAULT 'confirmed' CHECK (confirmation_marker = 'confirmed'),
  outcome TEXT NOT NULL CHECK (outcome IN ('applied','failed')),
  result_event_id TEXT UNIQUE,
  failure_code TEXT,
  recorded_at TEXT NOT NULL,
  CHECK ((outcome='applied' AND result_event_id IS NOT NULL AND failure_code IS NULL)
      OR (outcome='failed' AND result_event_id IS NULL AND failure_code IS NOT NULL AND length(trim(failure_code)) > 0)),
  FOREIGN KEY (action_id, user_subject, action_type) REFERENCES ai_action_proposals(id, user_subject, action_type) ON DELETE RESTRICT,
  FOREIGN KEY (action_id, user_subject, confirmation_marker) REFERENCES ai_action_decisions(action_id, user_subject, decision) ON DELETE RESTRICT,
  FOREIGN KEY (result_event_id, user_subject, action_type) REFERENCES nutrition_events(id, user_subject, event_type) ON DELETE RESTRICT
) STRICT, WITHOUT ROWID;

CREATE TABLE assessment_snapshots (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
  user_subject TEXT NOT NULL REFERENCES users(subject) ON DELETE CASCADE,
  completed_at TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json) = 1 AND json_type(payload_json) = 'object'),
  created_at TEXT NOT NULL
) STRICT, WITHOUT ROWID;
CREATE INDEX assessment_snapshots_user_idx ON assessment_snapshots(user_subject, completed_at);
