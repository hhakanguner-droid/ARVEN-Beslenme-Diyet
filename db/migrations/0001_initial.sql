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
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  citation TEXT NOT NULL,
  evidence_url TEXT,
  published_year INTEGER,
  created_at TEXT NOT NULL
);

CREATE TABLE goals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  effective_from TEXT NOT NULL,
  effective_to TEXT,
  energy_kcal REAL NOT NULL CHECK (energy_kcal > 0),
  protein_g REAL NOT NULL CHECK (protein_g >= 0),
  carbs_g REAL NOT NULL CHECK (carbs_g >= 0),
  fat_g REAL NOT NULL CHECK (fat_g >= 0),
  fiber_g REAL,
  water_ml REAL,
  source TEXT NOT NULL,
  calculation_method TEXT,
  calculation_version TEXT,
  calculation_inputs_json TEXT,
  reference_ids_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);
CREATE INDEX goals_user_effective_idx ON goals(user_id, effective_from, effective_to);

CREATE TABLE goal_meal_allocations (
  goal_id TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  meal_type TEXT NOT NULL,
  energy_share_bps INTEGER NOT NULL CHECK (energy_share_bps BETWEEN 0 AND 10000),
  PRIMARY KEY (goal_id, meal_type)
);

CREATE TABLE foods (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  brand TEXT,
  barcode TEXT,
  is_liquid INTEGER NOT NULL DEFAULT 0 CHECK (is_liquid IN (0,1)),
  allergen_data_status TEXT NOT NULL DEFAULT 'unknown' CHECK (allergen_data_status IN ('verified','unknown','not-applicable')),
  energy_kcal_100g REAL NOT NULL CHECK (energy_kcal_100g >= 0),
  protein_g_100g REAL NOT NULL CHECK (protein_g_100g >= 0),
  carbs_g_100g REAL NOT NULL CHECK (carbs_g_100g >= 0),
  fat_g_100g REAL NOT NULL CHECK (fat_g_100g >= 0),
  fiber_g_100g REAL,
  source_provider TEXT NOT NULL CHECK (source_provider IN ('open-food-facts','usda','turkomp','bls','swiss-fcd','manual-verified')),
  source_external_id TEXT,
  source_evidence_url TEXT,
  source_license_id TEXT,
  verified_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX foods_name_idx ON foods(normalized_name);
CREATE INDEX foods_owner_idx ON foods(owner_user_id);
CREATE INDEX foods_barcode_idx ON foods(barcode);
CREATE INDEX foods_source_idx ON foods(source_provider, source_external_id);

CREATE TABLE food_nutrients (
  food_id TEXT NOT NULL REFERENCES foods(id) ON DELETE CASCADE,
  nutrient_key TEXT NOT NULL,
  amount_per_100g REAL,
  unit TEXT NOT NULL CHECK (unit IN ('g','mg','mcg')),
  completeness TEXT NOT NULL CHECK (completeness IN ('complete','partial','unknown')),
  PRIMARY KEY (food_id, nutrient_key)
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
  verified_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
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
  verified_at TEXT NOT NULL,
  PRIMARY KEY (food_id, allergen_id)
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
  preference TEXT NOT NULL CHECK (preference IN ('like','dislike','avoid','dietary-rule')),
  strength INTEGER NOT NULL DEFAULT 1 CHECK (strength BETWEEN 1 AND 5),
  provenance TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX food_preferences_user_idx ON food_preferences(user_id);

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
  meal_type TEXT NOT NULL,
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
  portion_option_id TEXT REFERENCES food_portion_options(id),
  portion_quantity REAL,
  portion_label TEXT,
  grams REAL NOT NULL CHECK (grams > 0),
  energy_kcal REAL NOT NULL CHECK (energy_kcal >= 0),
  protein_g REAL NOT NULL CHECK (protein_g >= 0),
  carbs_g REAL NOT NULL CHECK (carbs_g >= 0),
  fat_g REAL NOT NULL CHECK (fat_g >= 0),
  fiber_g REAL,
  calculation_version TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX meal_entry_items_entry_idx ON meal_entry_items(meal_entry_id);

CREATE TABLE meal_entry_item_nutrients (
  meal_entry_item_id TEXT NOT NULL REFERENCES meal_entry_items(id) ON DELETE CASCADE,
  nutrient_key TEXT NOT NULL,
  amount REAL,
  unit TEXT NOT NULL CHECK (unit IN ('g','mg','mcg')),
  completeness TEXT NOT NULL CHECK (completeness IN ('complete','partial','unknown')),
  PRIMARY KEY (meal_entry_item_id, nutrient_key)
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
  action_type TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('proposed','confirmed','rejected','applied','failed')),
  idempotency_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  confirmed_at TEXT,
  applied_at TEXT,
  UNIQUE(user_id, idempotency_key)
);
CREATE INDEX ai_actions_user_status_idx ON ai_actions(user_id, status);
