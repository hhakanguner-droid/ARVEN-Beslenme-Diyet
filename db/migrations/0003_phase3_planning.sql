PRAGMA foreign_keys = ON;

-- Phase 3: "Planım" — a versioned day meal plan, mirroring the goal_versions /
-- user_current_goal append-only + current-pointer pattern (see 0001_initial.sql)
-- instead of allowing in-place edits, so a past plan a user actually followed is
-- never silently rewritten.

CREATE TABLE meal_plan_versions (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
  user_subject TEXT NOT NULL REFERENCES users(subject) ON DELETE CASCADE,
  slots_json TEXT NOT NULL CHECK (json_valid(slots_json) = 1 AND json_type(slots_json) = 'array'),
  created_at TEXT NOT NULL,
  UNIQUE (id, user_subject)
) STRICT, WITHOUT ROWID;
CREATE INDEX meal_plan_versions_user_idx ON meal_plan_versions(user_subject, created_at);

CREATE TABLE user_current_meal_plan (
  user_subject TEXT PRIMARY KEY NOT NULL REFERENCES users(subject) ON DELETE CASCADE,
  meal_plan_version_id TEXT NOT NULL,
  selected_at TEXT NOT NULL,
  FOREIGN KEY (meal_plan_version_id, user_subject) REFERENCES meal_plan_versions(id, user_subject) ON DELETE RESTRICT
) STRICT, WITHOUT ROWID;
