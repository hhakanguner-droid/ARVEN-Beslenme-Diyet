PRAGMA foreign_keys = ON;

-- Review 14 systemic hardening.
-- This layer closes the remaining invariant classes rather than adding isolated fixes.

-- ---------------------------------------------------------------------------
-- 1) Persisted identities are explicit, non-null and cannot be replaced through
-- SQLite INSERT OR REPLACE to bypass UPDATE immutability/ownership guards.
-- ---------------------------------------------------------------------------
CREATE TRIGGER goals_identity_insert_r14
BEFORE INSERT ON goals
WHEN NEW.id IS NULL OR length(trim(NEW.id)) = 0 OR EXISTS (SELECT 1 FROM goals x WHERE x.id = NEW.id)
BEGIN SELECT RAISE(ABORT, 'goal identity must be new and nonblank'); END;

CREATE TRIGGER foods_identity_insert_r14
BEFORE INSERT ON foods
WHEN NEW.id IS NULL OR length(trim(NEW.id)) = 0 OR EXISTS (SELECT 1 FROM foods x WHERE x.id = NEW.id)
BEGIN SELECT RAISE(ABORT, 'food identity must be new and nonblank'); END;

CREATE TRIGGER food_preferences_identity_insert_r14
BEFORE INSERT ON food_preferences
WHEN NEW.id IS NULL OR length(trim(NEW.id)) = 0 OR EXISTS (SELECT 1 FROM food_preferences x WHERE x.id = NEW.id)
BEGIN SELECT RAISE(ABORT, 'food preference identity must be new and nonblank'); END;

CREATE TRIGGER assessment_snapshots_identity_insert_r14
BEFORE INSERT ON assessment_snapshots
WHEN NEW.id IS NULL OR length(trim(NEW.id)) = 0 OR EXISTS (SELECT 1 FROM assessment_snapshots x WHERE x.id = NEW.id)
BEGIN SELECT RAISE(ABORT, 'assessment identity must be new and nonblank'); END;

CREATE TRIGGER meal_entries_identity_insert_r14
BEFORE INSERT ON meal_entries
WHEN NEW.id IS NULL OR length(trim(NEW.id)) = 0 OR EXISTS (SELECT 1 FROM meal_entries x WHERE x.id = NEW.id)
BEGIN SELECT RAISE(ABORT, 'meal identity must be new and nonblank'); END;

CREATE TRIGGER meal_entry_items_identity_insert_r14
BEFORE INSERT ON meal_entry_items
WHEN NEW.id IS NULL OR length(trim(NEW.id)) = 0 OR EXISTS (SELECT 1 FROM meal_entry_items x WHERE x.id = NEW.id)
BEGIN SELECT RAISE(ABORT, 'meal item identity must be new and nonblank'); END;

CREATE TRIGGER water_logs_identity_insert_r14
BEFORE INSERT ON water_logs
WHEN NEW.id IS NULL OR length(trim(NEW.id)) = 0 OR EXISTS (SELECT 1 FROM water_logs x WHERE x.id = NEW.id)
BEGIN SELECT RAISE(ABORT, 'water log identity must be new and nonblank'); END;

CREATE TRIGGER ai_actions_nonnull_identity_insert_r14
BEFORE INSERT ON ai_actions
WHEN NEW.id IS NULL OR length(trim(NEW.id)) = 0
BEGIN SELECT RAISE(ABORT, 'AI action identity must be nonblank'); END;

CREATE TRIGGER food_portion_options_identity_insert_r14
BEFORE INSERT ON food_portion_options
WHEN NEW.id IS NULL OR length(trim(NEW.id)) = 0 OR EXISTS (SELECT 1 FROM food_portion_options x WHERE x.id = NEW.id)
BEGIN SELECT RAISE(ABORT, 'portion option identity must be new and nonblank'); END;

-- Composite historical identities are also collision-safe.
CREATE TRIGGER food_nutrients_collision_insert_r14
BEFORE INSERT ON food_nutrients
WHEN EXISTS (
  SELECT 1 FROM food_nutrients x
  WHERE x.food_id = NEW.food_id AND x.nutrient_key = NEW.nutrient_key
)
BEGIN SELECT RAISE(ABORT, 'food nutrient identity collision'); END;

CREATE TRIGGER meal_item_nutrients_collision_insert_r14
BEFORE INSERT ON meal_entry_item_nutrients
WHEN EXISTS (
  SELECT 1 FROM meal_entry_item_nutrients x
  WHERE x.meal_entry_item_id = NEW.meal_entry_item_id AND x.nutrient_key = NEW.nutrient_key
)
BEGIN SELECT RAISE(ABORT, 'meal nutrient identity collision'); END;

-- ---------------------------------------------------------------------------
-- 2) Parent identities for persisted child records are immutable.
-- ---------------------------------------------------------------------------
CREATE TRIGGER goal_meal_allocations_parent_immutable_r14
BEFORE UPDATE OF goal_id ON goal_meal_allocations
WHEN NEW.goal_id IS NOT OLD.goal_id
BEGIN SELECT RAISE(ABORT, 'meal allocation parent is immutable'); END;

CREATE TRIGGER food_nutrients_parent_immutable_r14
BEFORE UPDATE OF food_id, nutrient_key ON food_nutrients
WHEN NEW.food_id IS NOT OLD.food_id OR NEW.nutrient_key IS NOT OLD.nutrient_key
BEGIN SELECT RAISE(ABORT, 'food nutrient identity and parent are immutable'); END;

-- ---------------------------------------------------------------------------
-- 3) Core verified food truth is versioned once reviewed by an active proposal
-- or used in meal history. A correction requires a new food version.
-- ---------------------------------------------------------------------------
CREATE TRIGGER foods_core_truth_version_freeze_r14
BEFORE UPDATE OF
  energy_kcal_100g, protein_g_100g, carbs_g_100g, fat_g_100g, fiber_g_100g,
  source_provider, source_external_id, source_evidence_url, source_license_id, verified_at
ON foods
WHEN (
  NEW.energy_kcal_100g IS NOT OLD.energy_kcal_100g
  OR NEW.protein_g_100g IS NOT OLD.protein_g_100g
  OR NEW.carbs_g_100g IS NOT OLD.carbs_g_100g
  OR NEW.fat_g_100g IS NOT OLD.fat_g_100g
  OR NEW.fiber_g_100g IS NOT OLD.fiber_g_100g
  OR NEW.source_provider IS NOT OLD.source_provider
  OR NEW.source_external_id IS NOT OLD.source_external_id
  OR NEW.source_evidence_url IS NOT OLD.source_evidence_url
  OR NEW.source_license_id IS NOT OLD.source_license_id
  OR NEW.verified_at IS NOT OLD.verified_at
) AND (
  EXISTS (SELECT 1 FROM meal_entry_items i WHERE i.food_id = OLD.id)
  OR EXISTS (
    SELECT 1 FROM ai_actions a, json_each(a.payload_json, '$.items') item
    WHERE a.action_type = 'meal-log'
      AND a.status IN ('proposed','confirmed')
      AND json_extract(item.value, '$.foodId') = OLD.id
  )
)
BEGIN SELECT RAISE(ABORT, 'reviewed or used food truth is immutable; create a new food version'); END;

-- ---------------------------------------------------------------------------
-- 4) Assessments use the same canonical UTC instant invariant as other history.
-- ---------------------------------------------------------------------------
CREATE TRIGGER assessment_completed_at_insert_r14
BEFORE INSERT ON assessment_snapshots
WHEN NEW.completed_at IS NULL
  OR length(NEW.completed_at) NOT IN (20,24)
  OR substr(NEW.completed_at,11,1) <> 'T'
  OR substr(NEW.completed_at,14,1) <> ':'
  OR substr(NEW.completed_at,17,1) <> ':'
  OR substr(NEW.completed_at,-1,1) <> 'Z'
  OR strftime('%Y-%m-%dT%H:%M:%SZ', NEW.completed_at) IS NULL
  OR strftime('%Y-%m-%dT%H:%M:%SZ', NEW.completed_at) <> substr(NEW.completed_at,1,19) || 'Z'
  OR (length(NEW.completed_at)=24 AND (substr(NEW.completed_at,20,1) <> '.' OR substr(NEW.completed_at,21,3) NOT GLOB '[0-9][0-9][0-9]'))
BEGIN SELECT RAISE(ABORT, 'assessment completion instant must be canonical UTC'); END;

CREATE TRIGGER assessment_completed_at_update_r14
BEFORE UPDATE OF completed_at ON assessment_snapshots
WHEN NEW.completed_at IS NOT OLD.completed_at AND (
  NEW.completed_at IS NULL
  OR length(NEW.completed_at) NOT IN (20,24)
  OR substr(NEW.completed_at,11,1) <> 'T'
  OR substr(NEW.completed_at,14,1) <> ':'
  OR substr(NEW.completed_at,17,1) <> ':'
  OR substr(NEW.completed_at,-1,1) <> 'Z'
  OR strftime('%Y-%m-%dT%H:%M:%SZ', NEW.completed_at) IS NULL
  OR strftime('%Y-%m-%dT%H:%M:%SZ', NEW.completed_at) <> substr(NEW.completed_at,1,19) || 'Z'
  OR (length(NEW.completed_at)=24 AND (substr(NEW.completed_at,20,1) <> '.' OR substr(NEW.completed_at,21,3) NOT GLOB '[0-9][0-9][0-9]'))
)
BEGIN SELECT RAISE(ABORT, 'assessment completion instant must be canonical UTC'); END;

-- ---------------------------------------------------------------------------
-- 5) Only the application-supported calculator may create new calculated goals.
-- Legacy calculator identities remain historical data only.
-- ---------------------------------------------------------------------------
CREATE TRIGGER goals_supported_calculator_only_insert_r14
BEFORE INSERT ON goals
WHEN NEW.source = 'arven-calculated'
  AND NOT (NEW.calculation_method = 'mifflin-st-jeor' AND NEW.calculation_version = 'v1')
BEGIN SELECT RAISE(ABORT, 'unsupported calculator identity for new goal'); END;

-- ---------------------------------------------------------------------------
-- 6) Natural-portion truth cannot be asserted without a verified portion option.
-- Custom grams may have no natural quantity; if a label is persisted it is the
-- canonical gram label only.
-- ---------------------------------------------------------------------------
CREATE TRIGGER meal_items_custom_gram_representation_insert_r14
BEFORE INSERT ON meal_entry_items
WHEN NEW.portion_option_id IS NULL AND (
  NEW.portion_quantity IS NOT NULL
  OR (NEW.portion_label IS NOT NULL AND NEW.portion_label <> printf('%g g', NEW.grams))
)
BEGIN SELECT RAISE(ABORT, 'custom gram entries cannot claim an unverified natural portion'); END;

-- ---------------------------------------------------------------------------
-- 7) AI actions are bound to exactly one persisted mutation before `applied`.
-- Manual entries keep ai_action_id NULL.
-- ---------------------------------------------------------------------------
ALTER TABLE meal_entries ADD COLUMN ai_action_id TEXT REFERENCES ai_actions(id);
ALTER TABLE meal_entry_items ADD COLUMN ai_action_item_index INTEGER;
ALTER TABLE water_logs ADD COLUMN ai_action_id TEXT REFERENCES ai_actions(id);

CREATE UNIQUE INDEX meal_entries_ai_action_unique_r14
ON meal_entries(ai_action_id) WHERE ai_action_id IS NOT NULL;
CREATE UNIQUE INDEX water_logs_ai_action_unique_r14
ON water_logs(ai_action_id) WHERE ai_action_id IS NOT NULL;
CREATE UNIQUE INDEX meal_items_action_index_unique_r14
ON meal_entry_items(meal_entry_id, ai_action_item_index) WHERE ai_action_item_index IS NOT NULL;

CREATE TRIGGER meal_entries_action_binding_insert_r14
BEFORE INSERT ON meal_entries
WHEN NEW.ai_action_id IS NOT NULL
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM ai_actions a
    WHERE a.id = NEW.ai_action_id
      AND a.user_id = NEW.user_id
      AND a.action_type = 'meal-log'
      AND a.status = 'confirmed'
      AND json_extract(a.payload_json, '$.localDate') = NEW.local_date
      AND json_extract(a.payload_json, '$.occurredAt') = NEW.occurred_at
      AND json_extract(a.payload_json, '$.mealType') = NEW.meal_type
  ) THEN RAISE(ABORT, 'meal result must bind the confirmed matching action') END;
END;

CREATE TRIGGER meal_entries_action_binding_immutable_r14
BEFORE UPDATE OF ai_action_id, user_id, local_date, meal_type, occurred_at ON meal_entries
WHEN OLD.ai_action_id IS NOT NULL AND (
  NEW.ai_action_id IS NOT OLD.ai_action_id
  OR NEW.user_id IS NOT OLD.user_id
  OR NEW.local_date IS NOT OLD.local_date
  OR NEW.meal_type IS NOT OLD.meal_type
  OR NEW.occurred_at IS NOT OLD.occurred_at
)
BEGIN SELECT RAISE(ABORT, 'applied meal receipt fields are immutable'); END;

CREATE TRIGGER meal_entries_applied_binding_delete_r14
BEFORE DELETE ON meal_entries
WHEN OLD.ai_action_id IS NOT NULL AND EXISTS (
  SELECT 1 FROM ai_actions a WHERE a.id=OLD.ai_action_id AND a.status='applied'
)
BEGIN SELECT RAISE(ABORT, 'applied meal result cannot be deleted'); END;

CREATE TRIGGER meal_items_action_binding_insert_r14
BEFORE INSERT ON meal_entry_items
WHEN EXISTS (SELECT 1 FROM meal_entries m WHERE m.id=NEW.meal_entry_id AND m.ai_action_id IS NOT NULL)
BEGIN
  SELECT CASE WHEN NEW.ai_action_item_index IS NULL OR NEW.ai_action_item_index < 0
    THEN RAISE(ABORT, 'AI meal item requires a payload index') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM meal_entries m
    JOIN ai_actions a ON a.id = m.ai_action_id
    WHERE m.id = NEW.meal_entry_id
      AND NEW.ai_action_item_index < json_array_length(json_extract(a.payload_json,'$.items'))
      AND json_extract(a.payload_json, '$.items[' || NEW.ai_action_item_index || '].foodId') = NEW.food_id
      AND CAST(json_extract(a.payload_json, '$.items[' || NEW.ai_action_item_index || '].grams') AS REAL) = NEW.grams
      AND json_extract(a.payload_json, '$.items[' || NEW.ai_action_item_index || '].calculationVersion') = NEW.calculation_version
  ) THEN RAISE(ABORT, 'meal item must match the exact confirmed action item') END;
END;

CREATE TRIGGER meal_items_manual_action_index_insert_r14
BEFORE INSERT ON meal_entry_items
WHEN NOT EXISTS (SELECT 1 FROM meal_entries m WHERE m.id=NEW.meal_entry_id AND m.ai_action_id IS NOT NULL)
  AND NEW.ai_action_item_index IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'manual meal item cannot claim an AI action index'); END;

CREATE TRIGGER meal_items_action_index_immutable_r14
BEFORE UPDATE OF ai_action_item_index ON meal_entry_items
WHEN NEW.ai_action_item_index IS NOT OLD.ai_action_item_index
BEGIN SELECT RAISE(ABORT, 'AI action item index is immutable'); END;

CREATE TRIGGER water_logs_action_binding_insert_r14
BEFORE INSERT ON water_logs
WHEN NEW.ai_action_id IS NOT NULL
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM ai_actions a
    WHERE a.id = NEW.ai_action_id
      AND a.user_id = NEW.user_id
      AND a.action_type = 'water-log'
      AND a.status = 'confirmed'
      AND json_extract(a.payload_json, '$.occurredAt') = NEW.occurred_at
      AND substr(json_extract(a.payload_json, '$.occurredAt'),1,10) = NEW.local_date
      AND CAST(json_extract(a.payload_json, '$.milliliters') AS REAL) = NEW.milliliters
  ) THEN RAISE(ABORT, 'water result must bind the confirmed matching action') END;
END;

CREATE TRIGGER water_logs_action_binding_immutable_r14
BEFORE UPDATE OF ai_action_id, user_id, occurred_at, local_date, milliliters ON water_logs
WHEN OLD.ai_action_id IS NOT NULL AND (
  NEW.ai_action_id IS NOT OLD.ai_action_id
  OR NEW.user_id IS NOT OLD.user_id
  OR NEW.occurred_at IS NOT OLD.occurred_at
  OR NEW.local_date IS NOT OLD.local_date
  OR NEW.milliliters IS NOT OLD.milliliters
)
BEGIN SELECT RAISE(ABORT, 'applied water receipt fields are immutable'); END;

CREATE TRIGGER water_logs_applied_binding_delete_r14
BEFORE DELETE ON water_logs
WHEN OLD.ai_action_id IS NOT NULL AND EXISTS (
  SELECT 1 FROM ai_actions a WHERE a.id=OLD.ai_action_id AND a.status='applied'
)
BEGIN SELECT RAISE(ABORT, 'applied water result cannot be deleted'); END;

CREATE TRIGGER ai_actions_require_exact_result_apply_r14
BEFORE UPDATE OF status ON ai_actions
WHEN NEW.status = 'applied'
BEGIN
  SELECT CASE WHEN NEW.action_type='water-log' AND (
    (SELECT COUNT(*) FROM water_logs w WHERE w.ai_action_id=NEW.id AND w.user_id=NEW.user_id) <> 1
  ) THEN RAISE(ABORT, 'water action requires exactly one persisted result before apply') END;

  SELECT CASE WHEN NEW.action_type='meal-log' AND (
    (SELECT COUNT(*) FROM meal_entries m WHERE m.ai_action_id=NEW.id AND m.user_id=NEW.user_id) <> 1
    OR NOT EXISTS (
      SELECT 1 FROM meal_entries m
      WHERE m.ai_action_id=NEW.id
        AND (SELECT COUNT(*) FROM meal_entry_items i WHERE i.meal_entry_id=m.id)
            = json_array_length(json_extract(NEW.payload_json,'$.items'))
        AND NOT EXISTS (
          SELECT 1 FROM json_each(NEW.payload_json,'$.items') item
          WHERE NOT EXISTS (
            SELECT 1 FROM meal_entry_items i
            WHERE i.meal_entry_id=m.id
              AND i.ai_action_item_index=CAST(item.key AS INTEGER)
              AND i.food_id=json_extract(item.value,'$.foodId')
              AND i.grams=CAST(json_extract(item.value,'$.grams') AS REAL)
              AND i.calculation_version=json_extract(item.value,'$.calculationVersion')
          )
        )
    )
  ) THEN RAISE(ABORT, 'meal action requires one exact persisted result before apply') END;
END;

-- Preserve truthful confirmation evidence when an action fails.
CREATE TRIGGER ai_actions_failed_confirmation_semantics_r14
BEFORE UPDATE OF status ON ai_actions
WHEN NEW.status='failed' AND (
  (OLD.status='proposed' AND NEW.confirmed_at IS NOT NULL)
  OR (OLD.status='confirmed' AND (NEW.confirmed_at IS NULL OR NEW.confirmed_at IS NOT OLD.confirmed_at))
)
BEGIN SELECT RAISE(ABORT, 'failed action confirmation evidence must reflect its actual lifecycle'); END;

-- ---------------------------------------------------------------------------
-- 8) Authenticated allergy/dietary hard blocks are enforced at persisted AI
-- proposal creation and re-evaluated at confirmation/application.
-- ---------------------------------------------------------------------------
CREATE TRIGGER ai_meal_safety_insert_r14
BEFORE INSERT ON ai_actions
WHEN NEW.action_type='meal-log'
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM food_preferences p
    WHERE p.user_id=NEW.user_id
      AND p.preference IN ('avoid','dietary-rule')
      AND p.resolution_status <> 'resolved'
  ) THEN RAISE(ABORT, 'unresolved dietary safety context') END;

  SELECT CASE WHEN EXISTS (
    SELECT 1
    FROM json_each(NEW.payload_json,'$.items') item
    JOIN foods f ON f.id=json_extract(item.value,'$.foodId')
    WHERE EXISTS (SELECT 1 FROM user_allergies ua WHERE ua.user_id=NEW.user_id AND ua.active=1)
      AND (
        f.allergen_data_status <> 'verified'
        OR EXISTS (
          SELECT 1 FROM user_allergies ua
          JOIN food_allergens fa ON fa.allergen_id=ua.allergen_id AND fa.food_id=f.id
          WHERE ua.user_id=NEW.user_id AND ua.active=1
        )
      )
  ) THEN RAISE(ABORT, 'meal action conflicts with allergy safety context') END;

  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM json_each(NEW.payload_json,'$.items') item
    JOIN food_preferences p
      ON p.user_id=NEW.user_id AND p.preference='avoid' AND p.resolution_status='resolved'
     AND p.food_id=json_extract(item.value,'$.foodId')
  ) THEN RAISE(ABORT, 'meal action conflicts with avoided food') END;

  SELECT CASE WHEN EXISTS (
    SELECT 1
    FROM json_each(NEW.payload_json,'$.items') item
    JOIN foods f ON f.id=json_extract(item.value,'$.foodId')
    WHERE EXISTS (
      SELECT 1 FROM food_preferences p
      WHERE p.user_id=NEW.user_id AND p.preference='dietary-rule' AND p.resolution_status='resolved'
    )
      AND (
        f.dietary_safety_data_status <> 'verified'
        OR EXISTS (
          SELECT 1 FROM food_preferences p
          JOIN food_dietary_rule_conflicts c
            ON c.food_id=f.id AND c.dietary_rule_id=p.dietary_rule_id
          WHERE p.user_id=NEW.user_id
            AND p.preference='dietary-rule'
            AND p.resolution_status='resolved'
        )
      )
  ) THEN RAISE(ABORT, 'meal action conflicts with dietary rule safety context') END;
END;

CREATE TRIGGER ai_meal_safety_transition_r14
BEFORE UPDATE OF status ON ai_actions
WHEN NEW.action_type='meal-log' AND NEW.status IN ('confirmed','applied')
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM food_preferences p
    WHERE p.user_id=NEW.user_id
      AND p.preference IN ('avoid','dietary-rule')
      AND p.resolution_status <> 'resolved'
  ) THEN RAISE(ABORT, 'unresolved dietary safety context') END;

  SELECT CASE WHEN EXISTS (
    SELECT 1
    FROM json_each(NEW.payload_json,'$.items') item
    JOIN foods f ON f.id=json_extract(item.value,'$.foodId')
    WHERE EXISTS (SELECT 1 FROM user_allergies ua WHERE ua.user_id=NEW.user_id AND ua.active=1)
      AND (
        f.allergen_data_status <> 'verified'
        OR EXISTS (
          SELECT 1 FROM user_allergies ua
          JOIN food_allergens fa ON fa.allergen_id=ua.allergen_id AND fa.food_id=f.id
          WHERE ua.user_id=NEW.user_id AND ua.active=1
        )
      )
  ) THEN RAISE(ABORT, 'meal action conflicts with allergy safety context') END;

  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM json_each(NEW.payload_json,'$.items') item
    JOIN food_preferences p
      ON p.user_id=NEW.user_id AND p.preference='avoid' AND p.resolution_status='resolved'
     AND p.food_id=json_extract(item.value,'$.foodId')
  ) THEN RAISE(ABORT, 'meal action conflicts with avoided food') END;

  SELECT CASE WHEN EXISTS (
    SELECT 1
    FROM json_each(NEW.payload_json,'$.items') item
    JOIN foods f ON f.id=json_extract(item.value,'$.foodId')
    WHERE EXISTS (
      SELECT 1 FROM food_preferences p
      WHERE p.user_id=NEW.user_id AND p.preference='dietary-rule' AND p.resolution_status='resolved'
    )
      AND (
        f.dietary_safety_data_status <> 'verified'
        OR EXISTS (
          SELECT 1 FROM food_preferences p
          JOIN food_dietary_rule_conflicts c
            ON c.food_id=f.id AND c.dietary_rule_id=p.dietary_rule_id
          WHERE p.user_id=NEW.user_id
            AND p.preference='dietary-rule'
            AND p.resolution_status='resolved'
        )
      )
  ) THEN RAISE(ABORT, 'meal action conflicts with dietary rule safety context') END;
END;
