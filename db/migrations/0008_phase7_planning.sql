PRAGMA foreign_keys = ON;

-- Phase 7: weekly planning system. A reusable recipe with *stable* ingredient identifiers
-- (food_version_id), distinct from the frozen one-off custom food created by createRecipeFood
-- (see lib/persistence/v1-boundary.ts's RecipeCreateV1 doc comment). Deliberately no update
-- column/endpoint — editing a recipe means deleting and recreating it (docs/ARCHITECTURE.md).
CREATE TABLE recipes (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
  user_subject TEXT NOT NULL REFERENCES users(subject) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0 AND length(name) <= 160),
  servings INTEGER NOT NULL CHECK (servings BETWEEN 1 AND 50),
  ingredients_json TEXT NOT NULL CHECK (json_valid(ingredients_json) = 1 AND json_type(ingredients_json) = 'array'),
  created_at TEXT NOT NULL,
  UNIQUE (id, user_subject)
) STRICT, WITHOUT ROWID;
CREATE INDEX recipes_user_idx ON recipes(user_subject, created_at);

-- A date-scoped, versioned weekly plan — the same versioned-plus-current-pointer pattern as
-- meal_plan_versions/user_current_meal_plan (db/migrations/0001_initial.sql), but keyed to a
-- specific week_start_local_date so every week keeps its own current version independently.
CREATE TABLE weekly_plan_versions (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
  user_subject TEXT NOT NULL REFERENCES users(subject) ON DELETE CASCADE,
  week_start_local_date TEXT NOT NULL CHECK (length(week_start_local_date) = 10),
  days_json TEXT NOT NULL CHECK (json_valid(days_json) = 1 AND json_type(days_json) = 'array'),
  created_at TEXT NOT NULL,
  UNIQUE (id, user_subject)
) STRICT, WITHOUT ROWID;
CREATE INDEX weekly_plan_versions_user_idx ON weekly_plan_versions(user_subject, week_start_local_date, created_at);

CREATE TABLE user_current_weekly_plan (
  user_subject TEXT NOT NULL REFERENCES users(subject) ON DELETE CASCADE,
  week_start_local_date TEXT NOT NULL CHECK (length(week_start_local_date) = 10),
  weekly_plan_version_id TEXT NOT NULL,
  selected_at TEXT NOT NULL,
  PRIMARY KEY (user_subject, week_start_local_date),
  FOREIGN KEY (weekly_plan_version_id, user_subject) REFERENCES weekly_plan_versions(id, user_subject) ON DELETE RESTRICT
) STRICT, WITHOUT ROWID;

-- Simple stock tracking ("Kilerim"). food_version_id is optional: when set, it lets
-- generateShoppingList (lib/persistence/v1-boundary.ts) automatically subtract this item's
-- quantity from the matching planned need; a free-text item (no food_version_id, or no
-- quantity_grams) is never auto-subtracted — the user manages it manually.
CREATE TABLE pantry_items (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
  user_subject TEXT NOT NULL REFERENCES users(subject) ON DELETE CASCADE,
  food_version_id TEXT REFERENCES food_versions(id) ON DELETE SET NULL,
  label TEXT NOT NULL CHECK (length(trim(label)) > 0 AND length(label) <= 160),
  quantity_grams REAL CHECK (quantity_grams IS NULL OR (quantity_grams >= 0 AND quantity_grams <= 100000)),
  quantity_note TEXT CHECK (quantity_note IS NULL OR length(trim(quantity_note)) <= 80),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT, WITHOUT ROWID;
CREATE INDEX pantry_items_user_idx ON pantry_items(user_subject, created_at);

-- Generated, checkable shopping-list rows. Fully replaced on every generateShoppingList call
-- (see that function's doc comment) — no partial-edit history is kept, only the checked state
-- the user ticks off while actually shopping.
CREATE TABLE shopping_list_items (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
  user_subject TEXT NOT NULL REFERENCES users(subject) ON DELETE CASCADE,
  week_start_local_date TEXT NOT NULL CHECK (length(week_start_local_date) = 10),
  food_version_id TEXT REFERENCES food_versions(id) ON DELETE SET NULL,
  label TEXT NOT NULL CHECK (length(trim(label)) > 0 AND length(label) <= 160),
  needed_grams REAL CHECK (needed_grams IS NULL OR (needed_grams >= 0 AND needed_grams <= 200000)),
  is_checked INTEGER NOT NULL DEFAULT 0 CHECK (is_checked IN (0, 1)),
  created_at TEXT NOT NULL
) STRICT, WITHOUT ROWID;
CREATE INDEX shopping_list_items_user_idx ON shopping_list_items(user_subject, week_start_local_date, created_at);

-- Week-prep workflow and reminders — deliberately just a stored preference plus a per-week
-- completion flag, NOT a push-notification scheduler. No push/SMS delivery infrastructure exists
-- anywhere in this app; the reminder is surfaced in-app from this preference only (see
-- docs/ARCHITECTURE.md's Phase 7 entry for the full rationale).
CREATE TABLE week_prep_preferences (
  user_subject TEXT PRIMARY KEY NOT NULL REFERENCES users(subject) ON DELETE CASCADE,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  prep_day_of_week INTEGER NOT NULL DEFAULT 0 CHECK (prep_day_of_week BETWEEN 0 AND 6),
  prep_local_time TEXT NOT NULL DEFAULT '10:00' CHECK (prep_local_time GLOB '[01][0-9]:[0-5][0-9]' OR prep_local_time GLOB '2[0-3]:[0-5][0-9]'),
  updated_at TEXT NOT NULL
) STRICT, WITHOUT ROWID;

CREATE TABLE week_prep_status (
  user_subject TEXT NOT NULL REFERENCES users(subject) ON DELETE CASCADE,
  week_start_local_date TEXT NOT NULL CHECK (length(week_start_local_date) = 10),
  is_completed INTEGER NOT NULL DEFAULT 0 CHECK (is_completed IN (0, 1)),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_subject, week_start_local_date)
) STRICT, WITHOUT ROWID;
