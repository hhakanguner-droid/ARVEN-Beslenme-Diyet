PRAGMA foreign_keys = ON;

-- Phase 2: identity/onboarding/consent additions on top of the Clean V1 baseline.

CREATE TABLE safety_acknowledgements (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
  user_subject TEXT NOT NULL REFERENCES users(subject) ON DELETE CASCADE,
  acknowledgement_type TEXT NOT NULL CHECK (acknowledgement_type IN ('non-diagnostic-health-boundary','data-processing-consent')),
  policy_version TEXT NOT NULL CHECK (length(trim(policy_version)) > 0),
  acknowledged_at TEXT NOT NULL,
  created_at TEXT NOT NULL
) STRICT, WITHOUT ROWID;
CREATE INDEX safety_acknowledgements_user_idx ON safety_acknowledgements(user_subject, acknowledgement_type, acknowledged_at);

-- Resolves the UserNutritionPreferences.energyUnit contract having no backing column.
ALTER TABLE user_ui_preferences ADD COLUMN energy_unit TEXT NOT NULL DEFAULT 'kcal' CHECK (energy_unit IN ('kcal','kj'));
