/**
 * Per-user Durable Object SQLite schema.
 *
 * This is the DO-owned subset of the Clean V1 baseline (see
 * `db/migrations/0001_initial.sql` and `db/migrations/0002_phase2_identity.sql`).
 * Every production Durable Object instance stores exactly one authenticated
 * user's rows, addressed by `UserDurableObject` (see
 * `lib/persistence/user-durable-object.ts`).
 *
 * Deliberately excluded: `food_versions`, `portion_versions`,
 * `scientific_reference_versions`, `allergen_catalog`, `dietary_rule_catalog`.
 * Those stay in the shared D1 catalog. A foreign key cannot be enforced
 * across two separate SQLite database instances (D1 and a Durable Object are
 * genuinely separate databases in production), so this schema carries no
 * `food_versions`/`portion_versions` tables and no FK pointing at them —
 * that was the actual bug in the original single-connection design (see the
 * `purgeAuthenticatedUser` and test comments in
 * `lib/persistence/durable-object-adapter.ts` /
 * `tests/durable-object-adapter.test.ts`). `DurableObjectV1Transaction` is
 * unaffected by the split: it already reads the catalog exclusively through
 * the injected `D1LikeQuery`, never through a local join.
 *
 * `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS` make this
 * script safe to run unconditionally on every Durable Object wake-up.
 */
export const USER_DURABLE_OBJECT_SCHEMA_V1 = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  subject TEXT PRIMARY KEY NOT NULL CHECK (length(trim(subject)) > 0),
  timezone TEXT NOT NULL DEFAULT 'Europe/Istanbul' CHECK (length(trim(timezone)) > 0),
  nutrition_day_start_minutes INTEGER NOT NULL DEFAULT 0 CHECK (nutrition_day_start_minutes BETWEEN 0 AND 1439),
  locale TEXT NOT NULL DEFAULT 'tr-TR' CHECK (length(trim(locale)) > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT, WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS profiles (
  user_subject TEXT PRIMARY KEY NOT NULL REFERENCES users(subject) ON DELETE CASCADE,
  display_name TEXT,
  birth_date TEXT,
  sex_at_birth TEXT,
  height_cm REAL CHECK (height_cm IS NULL OR height_cm BETWEEN 100 AND 260),
  activity_level TEXT,
  updated_at TEXT NOT NULL
) STRICT, WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS user_ui_preferences (
  user_subject TEXT PRIMARY KEY NOT NULL REFERENCES users(subject) ON DELETE CASCADE,
  home_card_order_json TEXT NOT NULL DEFAULT '["calendar","daily-goals","today-meals"]' CHECK (json_valid(home_card_order_json) = 1),
  nutrient_order_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(nutrient_order_json) = 1),
  energy_unit TEXT NOT NULL DEFAULT 'kcal' CHECK (energy_unit IN ('kcal','kj')),
  updated_at TEXT NOT NULL
) STRICT, WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS goal_versions (
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
CREATE INDEX IF NOT EXISTS goal_versions_user_idx ON goal_versions(user_subject, created_at);

CREATE TABLE IF NOT EXISTS user_current_goal (
  user_subject TEXT PRIMARY KEY NOT NULL REFERENCES users(subject) ON DELETE CASCADE,
  goal_version_id TEXT NOT NULL,
  selected_at TEXT NOT NULL,
  FOREIGN KEY (goal_version_id, user_subject) REFERENCES goal_versions(id, user_subject) ON DELETE RESTRICT
) STRICT, WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS user_safety_exclusions (
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
CREATE INDEX IF NOT EXISTS user_safety_exclusions_active_idx ON user_safety_exclusions(user_subject, active);

CREATE TABLE IF NOT EXISTS ai_action_proposals (
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

CREATE TABLE IF NOT EXISTS ai_action_decisions (
  action_id TEXT PRIMARY KEY NOT NULL,
  user_subject TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('confirmed','rejected')),
  decided_at TEXT NOT NULL,
  UNIQUE (action_id, user_subject, decision),
  FOREIGN KEY (action_id, user_subject) REFERENCES ai_action_proposals(id, user_subject) ON DELETE RESTRICT
) STRICT, WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS nutrition_events (
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
CREATE INDEX IF NOT EXISTS nutrition_events_day_idx ON nutrition_events(user_subject, local_date, occurred_at);

CREATE TABLE IF NOT EXISTS ai_action_outcomes (
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

CREATE TABLE IF NOT EXISTS assessment_snapshots (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
  user_subject TEXT NOT NULL REFERENCES users(subject) ON DELETE CASCADE,
  completed_at TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json) = 1 AND json_type(payload_json) = 'object'),
  created_at TEXT NOT NULL
) STRICT, WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS assessment_snapshots_user_idx ON assessment_snapshots(user_subject, completed_at);

CREATE TABLE IF NOT EXISTS safety_acknowledgements (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
  user_subject TEXT NOT NULL REFERENCES users(subject) ON DELETE CASCADE,
  acknowledgement_type TEXT NOT NULL CHECK (acknowledgement_type IN ('non-diagnostic-health-boundary','data-processing-consent')),
  policy_version TEXT NOT NULL CHECK (length(trim(policy_version)) > 0),
  acknowledged_at TEXT NOT NULL,
  created_at TEXT NOT NULL
) STRICT, WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS safety_acknowledgements_user_idx ON safety_acknowledgements(user_subject, acknowledgement_type, acknowledged_at);

-- "Planım": a versioned day meal plan (one or more meal slots, each with resolved
-- food items). Mirrors the goal_versions/user_current_goal append-only + current-pointer
-- pattern instead of allowing in-place edits, so a past plan a user actually followed is
-- never silently rewritten.
CREATE TABLE IF NOT EXISTS meal_plan_versions (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
  user_subject TEXT NOT NULL REFERENCES users(subject) ON DELETE CASCADE,
  slots_json TEXT NOT NULL CHECK (json_valid(slots_json) = 1 AND json_type(slots_json) = 'array'),
  created_at TEXT NOT NULL,
  UNIQUE (id, user_subject)
) STRICT, WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS meal_plan_versions_user_idx ON meal_plan_versions(user_subject, created_at);

CREATE TABLE IF NOT EXISTS user_current_meal_plan (
  user_subject TEXT PRIMARY KEY NOT NULL REFERENCES users(subject) ON DELETE CASCADE,
  meal_plan_version_id TEXT NOT NULL,
  selected_at TEXT NOT NULL,
  FOREIGN KEY (meal_plan_version_id, user_subject) REFERENCES meal_plan_versions(id, user_subject) ON DELETE RESTRICT
) STRICT, WITHOUT ROWID;

-- Phase 4: ARVEN AI — memory facts (user-deletable, see db/migrations/0004_phase4_ai.sql)
-- and weekly insight report snapshots (deterministic metrics + validated narrative-only output).
CREATE TABLE IF NOT EXISTS ai_memory_facts (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
  user_subject TEXT NOT NULL REFERENCES users(subject) ON DELETE CASCADE,
  fact_text TEXT NOT NULL CHECK (length(trim(fact_text)) > 0 AND length(fact_text) <= 300),
  provenance TEXT NOT NULL CHECK (provenance IN ('user-stated','ai-inferred')),
  confidence TEXT NOT NULL CHECK (confidence IN ('high','medium','low')),
  created_at TEXT NOT NULL
) STRICT, WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS ai_memory_facts_user_idx ON ai_memory_facts(user_subject, created_at);

CREATE TABLE IF NOT EXISTS weekly_insight_snapshots (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
  user_subject TEXT NOT NULL REFERENCES users(subject) ON DELETE CASCADE,
  week_start_local_date TEXT NOT NULL CHECK (length(week_start_local_date) = 10),
  metrics_json TEXT NOT NULL CHECK (json_valid(metrics_json) = 1 AND json_type(metrics_json) = 'object'),
  narrative_json TEXT CHECK (narrative_json IS NULL OR (json_valid(narrative_json) = 1 AND json_type(narrative_json) = 'object')),
  created_at TEXT NOT NULL
) STRICT, WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS weekly_insight_snapshots_user_idx ON weekly_insight_snapshots(user_subject, week_start_local_date, created_at);

-- Phase 5: vision — private photo metadata only; actual bytes live outside this database (see
-- db/migrations/0005_phase5_vision.sql for the full rationale).
CREATE TABLE IF NOT EXISTS photo_assets (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
  user_subject TEXT NOT NULL REFERENCES users(subject) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('meal-photo', 'menu-photo', 'product-photo')),
  mime_type TEXT NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  byte_size INTEGER NOT NULL CHECK (byte_size > 0 AND byte_size <= 8000000),
  storage_key TEXT NOT NULL CHECK (length(trim(storage_key)) > 0),
  created_at TEXT NOT NULL
) STRICT, WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS photo_assets_user_idx ON photo_assets(user_subject, created_at);
`;
