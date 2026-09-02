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
  updated_at TEXT NOT NULL
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
  created_at TEXT NOT NULL
);
CREATE INDEX goals_user_effective_idx ON goals(user_id, effective_from, effective_to);

CREATE TABLE foods (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  energy_kcal_100g REAL NOT NULL CHECK (energy_kcal_100g >= 0),
  protein_g_100g REAL NOT NULL CHECK (protein_g_100g >= 0),
  carbs_g_100g REAL NOT NULL CHECK (carbs_g_100g >= 0),
  fat_g_100g REAL NOT NULL CHECK (fat_g_100g >= 0),
  fiber_g_100g REAL,
  source_provider TEXT NOT NULL CHECK (source_provider IN ('open-food-facts','usda','turkomp','manual-verified')),
  source_external_id TEXT,
  source_evidence_url TEXT,
  verified_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX foods_name_idx ON foods(normalized_name);
CREATE INDEX foods_owner_idx ON foods(owner_user_id);

CREATE TABLE allergies (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  allergen TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL
);
CREATE INDEX allergies_user_idx ON allergies(user_id, active);

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

CREATE TABLE water_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  occurred_at TEXT NOT NULL,
  local_date TEXT NOT NULL,
  milliliters REAL NOT NULL CHECK (milliliters > 0),
  created_at TEXT NOT NULL
);
CREATE INDEX water_logs_user_date_idx ON water_logs(user_id, local_date);

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
