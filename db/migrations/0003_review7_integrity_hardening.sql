PRAGMA foreign_keys = ON;

-- Active allergen identifiers are security identifiers, not free text. Keep
-- malformed catalog rows out of persistence so a blank id cannot later be
-- interpreted as "no active allergies".
CREATE TRIGGER allergen_catalog_validate_insert
BEFORE INSERT ON allergen_catalog
WHEN length(trim(NEW.id)) = 0 OR length(trim(NEW.canonical_name)) = 0
BEGIN
  SELECT RAISE(ABORT, 'allergen catalog identifiers and names must be nonblank');
END;

CREATE TRIGGER allergen_catalog_validate_update
BEFORE UPDATE OF id, canonical_name ON allergen_catalog
WHEN length(trim(NEW.id)) = 0 OR length(trim(NEW.canonical_name)) = 0
BEGIN
  SELECT RAISE(ABORT, 'allergen catalog identifiers and names must be nonblank');
END;

-- A calculated goal is a reproducible immutable result. Closing its effective
-- interval is allowed, but its calculation identity/provenance must change only
-- by creating a newly recalculated goal.
CREATE TRIGGER goals_prevent_calculated_provenance_mutation
BEFORE UPDATE OF source, calculation_method, calculation_version, calculation_inputs_json, reference_ids_json ON goals
WHEN OLD.source = 'arven-calculated' AND (
  NEW.source IS NOT OLD.source
  OR NEW.calculation_method IS NOT OLD.calculation_method
  OR NEW.calculation_version IS NOT OLD.calculation_version
  OR NEW.calculation_inputs_json IS NOT OLD.calculation_inputs_json
  OR NEW.reference_ids_json IS NOT OLD.reference_ids_json
)
BEGIN
  SELECT RAISE(ABORT, 'calculated goal provenance is immutable; create a recalculated goal');
END;

-- The authenticated owner of an AI action cannot be reassigned after creation.
CREATE TRIGGER ai_actions_user_immutable
BEFORE UPDATE OF user_id ON ai_actions
WHEN NEW.user_id IS NOT OLD.user_id
BEGIN
  SELECT RAISE(ABORT, 'AI action owner is immutable');
END;

-- Replace the prior post-confirmation freeze with a stronger boundary that also
-- covers the exact UPDATE which records confirmation. A proposal may be edited
-- only while it remains an unconfirmed proposal.
DROP TRIGGER IF EXISTS ai_actions_freeze_confirmed_proposal;
CREATE TRIGGER ai_actions_freeze_confirmed_proposal
BEFORE UPDATE OF user_id, action_type, schema_version, request_hash, payload_json, idempotency_key ON ai_actions
WHEN (
  OLD.status <> 'proposed'
  OR NEW.status <> 'proposed'
  OR OLD.confirmed_at IS NOT NULL
  OR NEW.confirmed_at IS NOT NULL
) AND (
  NEW.user_id IS NOT OLD.user_id
  OR NEW.action_type IS NOT OLD.action_type
  OR NEW.schema_version IS NOT OLD.schema_version
  OR NEW.request_hash IS NOT OLD.request_hash
  OR NEW.payload_json IS NOT OLD.payload_json
  OR NEW.idempotency_key IS NOT OLD.idempotency_key
)
BEGIN
  SELECT RAISE(ABORT, 'AI action proposal is immutable when leaving proposed state');
END;

-- Explicitly enumerate the only legal state transitions. applied/rejected/failed
-- have no outgoing edge and are therefore terminal.
DROP TRIGGER IF EXISTS ai_actions_status_transition;
CREATE TRIGGER ai_actions_status_transition
BEFORE UPDATE OF status ON ai_actions
WHEN NEW.status IS NOT OLD.status AND NOT (
  (OLD.status = 'proposed' AND NEW.status IN ('confirmed','rejected','failed'))
  OR (OLD.status = 'confirmed' AND NEW.status IN ('applied','failed'))
)
BEGIN
  SELECT RAISE(ABORT, 'invalid or terminal AI action state transition');
END;

-- A meal action is valid only when every referenced food exists and is either
-- global or owned by the authenticated action user.
CREATE TRIGGER ai_actions_meal_food_scope_insert
BEFORE INSERT ON ai_actions
WHEN NEW.action_type = 'meal-log' AND EXISTS (
  SELECT 1
  FROM json_each(NEW.payload_json, '$.items') item
  LEFT JOIN foods f
    ON f.id = trim(COALESCE(json_extract(item.value, '$.foodId'), ''))
  WHERE f.id IS NULL
     OR (f.owner_user_id IS NOT NULL AND f.owner_user_id <> NEW.user_id)
)
BEGIN
  SELECT RAISE(ABORT, 'AI meal action references an inaccessible food');
END;

CREATE TRIGGER ai_actions_meal_food_scope_update
BEFORE UPDATE OF user_id, action_type, payload_json ON ai_actions
WHEN NEW.action_type = 'meal-log' AND EXISTS (
  SELECT 1
  FROM json_each(NEW.payload_json, '$.items') item
  LEFT JOIN foods f
    ON f.id = trim(COALESCE(json_extract(item.value, '$.foodId'), ''))
  WHERE f.id IS NULL
     OR (f.owner_user_id IS NOT NULL AND f.owner_user_id <> NEW.user_id)
)
BEGIN
  SELECT RAISE(ABORT, 'AI meal action references an inaccessible food');
END;

-- JSON1 can parse exponent notation such as 1e999 into an infinite REAL. Hard
-- upper bounds keep action quantities finite and within a defensible domain.
-- Meal item grams also honor ARVEN's shared 0.1 g precision floor.
CREATE TRIGGER ai_actions_quantity_bounds_insert
BEFORE INSERT ON ai_actions
WHEN
  (NEW.action_type = 'meal-log' AND EXISTS (
    SELECT 1 FROM json_each(NEW.payload_json, '$.items') item
    WHERE json_type(item.value, '$.grams') IN ('integer','real')
      AND (
        CAST(json_extract(item.value, '$.grams') AS REAL) < 0.1
        OR CAST(json_extract(item.value, '$.grams') AS REAL) > 10000
      )
  ))
  OR
  (NEW.action_type = 'water-log'
    AND json_type(NEW.payload_json, '$.milliliters') IN ('integer','real')
    AND (
      CAST(json_extract(NEW.payload_json, '$.milliliters') AS REAL) <= 0
      OR CAST(json_extract(NEW.payload_json, '$.milliliters') AS REAL) > 10000
    )
  )
BEGIN
  SELECT RAISE(ABORT, 'AI action quantity is outside finite safety bounds');
END;

CREATE TRIGGER ai_actions_quantity_bounds_update
BEFORE UPDATE OF action_type, payload_json ON ai_actions
WHEN
  (NEW.action_type = 'meal-log' AND EXISTS (
    SELECT 1 FROM json_each(NEW.payload_json, '$.items') item
    WHERE json_type(item.value, '$.grams') IN ('integer','real')
      AND (
        CAST(json_extract(item.value, '$.grams') AS REAL) < 0.1
        OR CAST(json_extract(item.value, '$.grams') AS REAL) > 10000
      )
  ))
  OR
  (NEW.action_type = 'water-log'
    AND json_type(NEW.payload_json, '$.milliliters') IN ('integer','real')
    AND (
      CAST(json_extract(NEW.payload_json, '$.milliliters') AS REAL) <= 0
      OR CAST(json_extract(NEW.payload_json, '$.milliliters') AS REAL) > 10000
    )
  )
BEGIN
  SELECT RAISE(ABORT, 'AI action quantity is outside finite safety bounds');
END;
