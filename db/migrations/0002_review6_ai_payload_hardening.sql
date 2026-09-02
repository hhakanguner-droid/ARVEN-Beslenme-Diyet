PRAGMA foreign_keys = ON;

-- SQLite comparisons involving missing JSON paths evaluate to NULL. These
-- supplemental triggers use explicit IS/IS NOT checks so incomplete payloads
-- fail closed even when every required field is absent.
CREATE TRIGGER ai_actions_payload_shape_insert
BEFORE INSERT ON ai_actions
WHEN
  (NEW.action_type = 'meal-log' AND (
    json_type(NEW.payload_json, '$.localDate') IS NOT 'text'
    OR date(json_extract(NEW.payload_json, '$.localDate')) IS NULL
    OR json_extract(NEW.payload_json, '$.localDate') IS NOT date(json_extract(NEW.payload_json, '$.localDate'))
    OR json_type(NEW.payload_json, '$.occurredAt') IS NOT 'text'
    OR julianday(json_extract(NEW.payload_json, '$.occurredAt')) IS NULL
    OR json_type(NEW.payload_json, '$.mealType') IS NOT 'text'
    OR json_extract(NEW.payload_json, '$.mealType') NOT IN ('breakfast','morning-snack','lunch','afternoon-snack','dinner','snack','custom')
    OR json_type(NEW.payload_json, '$.items') IS NOT 'array'
    OR COALESCE(json_array_length(json_extract(NEW.payload_json, '$.items')), 0) = 0
    OR EXISTS (
      SELECT 1 FROM json_each(NEW.payload_json, '$.items') item
      WHERE json_type(item.value) IS NOT 'object'
         OR json_type(item.value, '$.foodId') IS NOT 'text'
         OR length(trim(COALESCE(json_extract(item.value, '$.foodId'), ''))) = 0
         OR json_type(item.value, '$.grams') NOT IN ('integer','real')
         OR COALESCE(CAST(json_extract(item.value, '$.grams') AS REAL), 0) <= 0
         OR json_type(item.value, '$.calculationVersion') IS NOT 'text'
         OR length(trim(COALESCE(json_extract(item.value, '$.calculationVersion'), ''))) = 0
    )
  ))
  OR
  (NEW.action_type = 'water-log' AND (
    json_type(NEW.payload_json, '$.occurredAt') IS NOT 'text'
    OR julianday(json_extract(NEW.payload_json, '$.occurredAt')) IS NULL
    OR json_type(NEW.payload_json, '$.milliliters') NOT IN ('integer','real')
    OR COALESCE(CAST(json_extract(NEW.payload_json, '$.milliliters') AS REAL), 0) <= 0
  ))
BEGIN
  SELECT RAISE(ABORT, 'AI action payload does not match declared schema');
END;

CREATE TRIGGER ai_actions_payload_shape_update
BEFORE UPDATE OF action_type, schema_version, payload_json ON ai_actions
WHEN
  (NEW.action_type = 'meal-log' AND (
    json_type(NEW.payload_json, '$.localDate') IS NOT 'text'
    OR date(json_extract(NEW.payload_json, '$.localDate')) IS NULL
    OR json_extract(NEW.payload_json, '$.localDate') IS NOT date(json_extract(NEW.payload_json, '$.localDate'))
    OR json_type(NEW.payload_json, '$.occurredAt') IS NOT 'text'
    OR julianday(json_extract(NEW.payload_json, '$.occurredAt')) IS NULL
    OR json_type(NEW.payload_json, '$.mealType') IS NOT 'text'
    OR json_extract(NEW.payload_json, '$.mealType') NOT IN ('breakfast','morning-snack','lunch','afternoon-snack','dinner','snack','custom')
    OR json_type(NEW.payload_json, '$.items') IS NOT 'array'
    OR COALESCE(json_array_length(json_extract(NEW.payload_json, '$.items')), 0) = 0
    OR EXISTS (
      SELECT 1 FROM json_each(NEW.payload_json, '$.items') item
      WHERE json_type(item.value) IS NOT 'object'
         OR json_type(item.value, '$.foodId') IS NOT 'text'
         OR length(trim(COALESCE(json_extract(item.value, '$.foodId'), ''))) = 0
         OR json_type(item.value, '$.grams') NOT IN ('integer','real')
         OR COALESCE(CAST(json_extract(item.value, '$.grams') AS REAL), 0) <= 0
         OR json_type(item.value, '$.calculationVersion') IS NOT 'text'
         OR length(trim(COALESCE(json_extract(item.value, '$.calculationVersion'), ''))) = 0
    )
  ))
  OR
  (NEW.action_type = 'water-log' AND (
    json_type(NEW.payload_json, '$.occurredAt') IS NOT 'text'
    OR julianday(json_extract(NEW.payload_json, '$.occurredAt')) IS NULL
    OR json_type(NEW.payload_json, '$.milliliters') NOT IN ('integer','real')
    OR COALESCE(CAST(json_extract(NEW.payload_json, '$.milliliters') AS REAL), 0) <= 0
  ))
BEGIN
  SELECT RAISE(ABORT, 'AI action payload does not match declared schema');
END;
