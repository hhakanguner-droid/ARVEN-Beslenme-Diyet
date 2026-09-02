PRAGMA foreign_keys = ON;

-- Safety identifiers are not free text. A malformed dietary-rule catalog row
-- must never become evidence that silently bypasses a user's active rule.
CREATE TRIGGER dietary_rule_catalog_validate_insert
BEFORE INSERT ON dietary_rule_catalog
WHEN length(trim(NEW.id)) = 0 OR length(trim(NEW.canonical_name)) = 0
BEGIN
  SELECT RAISE(ABORT, 'dietary rule identifiers and names must be nonblank');
END;

CREATE TRIGGER dietary_rule_catalog_validate_update
BEFORE UPDATE OF id, canonical_name ON dietary_rule_catalog
WHEN length(trim(NEW.id)) = 0 OR length(trim(NEW.canonical_name)) = 0
BEGIN
  SELECT RAISE(ABORT, 'dietary rule identifiers and names must be nonblank');
END;

-- Once scientific evidence is used by a goal, its content is historical
-- provenance. Corrections create a new version/reference id instead of silently
-- rewriting the evidence behind an existing calculated target.
CREATE TRIGGER scientific_references_freeze_used_content
BEFORE UPDATE OF title, citation, evidence_url, published_year, created_at ON scientific_references
WHEN EXISTS (
  SELECT 1
  FROM goals g, json_each(g.reference_ids_json) refs
  WHERE trim(CAST(refs.value AS TEXT)) = OLD.id
) AND (
  NEW.title IS NOT OLD.title
  OR NEW.citation IS NOT OLD.citation
  OR NEW.evidence_url IS NOT OLD.evidence_url
  OR NEW.published_year IS NOT OLD.published_year
  OR NEW.created_at IS NOT OLD.created_at
)
BEGIN
  SELECT RAISE(ABORT, 'used scientific reference content is immutable; create a new reference version');
END;

-- A meal log belongs to the authenticated user that created it. Ingredient
-- visibility has no bearing on ownership, so even all-global meals cannot move
-- between accounts.
DROP TRIGGER IF EXISTS meal_entries_private_food_user_update;
CREATE TRIGGER meal_entries_user_immutable
BEFORE UPDATE OF user_id ON meal_entries
WHEN NEW.user_id IS NOT OLD.user_id
BEGIN
  SELECT RAISE(ABORT, 'meal ownership is immutable');
END;

-- Final persistence boundaries use hard quantity ceilings so SQLite REAL
-- infinity (for example 1e999) cannot corrupt deterministic totals.
CREATE TRIGGER meal_entry_items_quantity_bounds_insert
BEFORE INSERT ON meal_entry_items
WHEN CAST(NEW.grams AS REAL) < 0.1 OR CAST(NEW.grams AS REAL) > 10000
BEGIN
  SELECT RAISE(ABORT, 'meal item grams outside finite safety bounds');
END;

CREATE TRIGGER meal_entry_items_quantity_bounds_update
BEFORE UPDATE OF grams ON meal_entry_items
WHEN CAST(NEW.grams AS REAL) < 0.1 OR CAST(NEW.grams AS REAL) > 10000
BEGIN
  SELECT RAISE(ABORT, 'meal item grams outside finite safety bounds');
END;

CREATE TRIGGER water_logs_quantity_bounds_insert
BEFORE INSERT ON water_logs
WHEN CAST(NEW.milliliters AS REAL) <= 0 OR CAST(NEW.milliliters AS REAL) > 10000
BEGIN
  SELECT RAISE(ABORT, 'water quantity outside finite safety bounds');
END;

CREATE TRIGGER water_logs_quantity_bounds_update
BEFORE UPDATE OF milliliters ON water_logs
WHEN CAST(NEW.milliliters AS REAL) <= 0 OR CAST(NEW.milliliters AS REAL) > 10000
BEGIN
  SELECT RAISE(ABORT, 'water quantity outside finite safety bounds');
END;

-- Null means no trustworthy numeric subtotal. Therefore null is always
-- 'unknown'; 'partial' is reserved for a known numeric subtotal with incomplete
-- coverage.
CREATE TRIGGER food_nutrients_null_requires_unknown_insert
BEFORE INSERT ON food_nutrients
WHEN NEW.amount_per_100g IS NULL AND NEW.completeness <> 'unknown'
BEGIN
  SELECT RAISE(ABORT, 'null nutrient amount must be unknown');
END;

CREATE TRIGGER food_nutrients_null_requires_unknown_update
BEFORE UPDATE OF amount_per_100g, completeness ON food_nutrients
WHEN NEW.amount_per_100g IS NULL AND NEW.completeness <> 'unknown'
BEGIN
  SELECT RAISE(ABORT, 'null nutrient amount must be unknown');
END;

CREATE TRIGGER meal_item_nutrients_null_requires_unknown_insert
BEFORE INSERT ON meal_entry_item_nutrients
WHEN NEW.amount IS NULL AND NEW.completeness <> 'unknown'
BEGIN
  SELECT RAISE(ABORT, 'null nutrient amount must be unknown');
END;

CREATE TRIGGER meal_item_nutrients_null_requires_unknown_update
BEFORE UPDATE OF amount, completeness ON meal_entry_item_nutrients
WHEN NEW.amount IS NULL AND NEW.completeness <> 'unknown'
BEGIN
  SELECT RAISE(ABORT, 'null nutrient amount must be unknown');
END;

-- Every AI mutation has a complete audit lifecycle. Inserts are proposals only;
-- all terminal states must be reached through the enumerated update transitions.
DROP TRIGGER IF EXISTS ai_actions_no_preconfirmed_insert;
CREATE TRIGGER ai_actions_proposal_only_insert
BEFORE INSERT ON ai_actions
WHEN NEW.status <> 'proposed' OR NEW.confirmed_at IS NOT NULL OR NEW.applied_at IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'AI actions must originate as unconfirmed proposals');
END;

-- SQLite JSON1 and JavaScript JSON.parse disagree on duplicate object keys
-- (first vs last value in common access paths). Reject duplicates at every
-- object depth so validation and execution can never see different payloads.
CREATE TRIGGER ai_actions_no_duplicate_json_keys_insert
BEFORE INSERT ON ai_actions
WHEN EXISTS (
  SELECT 1
  FROM json_tree(NEW.payload_json)
  WHERE key IS NOT NULL
  GROUP BY parent, key
  HAVING COUNT(*) > 1
)
BEGIN
  SELECT RAISE(ABORT, 'AI action payload contains duplicate JSON object keys');
END;

CREATE TRIGGER ai_actions_no_duplicate_json_keys_update
BEFORE UPDATE OF payload_json ON ai_actions
WHEN EXISTS (
  SELECT 1
  FROM json_tree(NEW.payload_json)
  WHERE key IS NOT NULL
  GROUP BY parent, key
  HAVING COUNT(*) > 1
)
BEGIN
  SELECT RAISE(ABORT, 'AI action payload contains duplicate JSON object keys');
END;

-- occurredAt is an explicit ISO-8601 instant, not merely any string that
-- SQLite's permissive julianday() can interpret. V1 accepts second/fractional
-- precision with either Z or an explicit numeric offset.
CREATE TRIGGER ai_actions_canonical_occurrence_insert
BEFORE INSERT ON ai_actions
WHEN NEW.action_type IN ('meal-log','water-log') AND (
  json_type(NEW.payload_json, '$.occurredAt') IS NOT 'text'
  OR length(json_extract(NEW.payload_json, '$.occurredAt')) < 20
  OR substr(json_extract(NEW.payload_json, '$.occurredAt'), 1, 19) NOT GLOB
     '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]'
  OR julianday(json_extract(NEW.payload_json, '$.occurredAt')) IS NULL
  OR NOT (
    substr(json_extract(NEW.payload_json, '$.occurredAt'), -1, 1) = 'Z'
    OR (
      substr(json_extract(NEW.payload_json, '$.occurredAt'), -6, 1) IN ('+','-')
      AND substr(json_extract(NEW.payload_json, '$.occurredAt'), -3, 1) = ':'
    )
  )
)
BEGIN
  SELECT RAISE(ABORT, 'AI action occurredAt must be a canonical ISO-8601 instant');
END;

CREATE TRIGGER ai_actions_canonical_occurrence_update
BEFORE UPDATE OF action_type, payload_json ON ai_actions
WHEN NEW.action_type IN ('meal-log','water-log') AND (
  json_type(NEW.payload_json, '$.occurredAt') IS NOT 'text'
  OR length(json_extract(NEW.payload_json, '$.occurredAt')) < 20
  OR substr(json_extract(NEW.payload_json, '$.occurredAt'), 1, 19) NOT GLOB
     '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]'
  OR julianday(json_extract(NEW.payload_json, '$.occurredAt')) IS NULL
  OR NOT (
    substr(json_extract(NEW.payload_json, '$.occurredAt'), -1, 1) = 'Z'
    OR (
      substr(json_extract(NEW.payload_json, '$.occurredAt'), -6, 1) IN ('+','-')
      AND substr(json_extract(NEW.payload_json, '$.occurredAt'), -3, 1) = ':'
    )
  )
)
BEGIN
  SELECT RAISE(ABORT, 'AI action occurredAt must be a canonical ISO-8601 instant');
END;

-- Revalidate food scope on state transitions as well as proposal writes. A food
-- deleted or made inaccessible between proposal and confirmation/application
-- therefore prevents the action from claiming success.
CREATE TRIGGER ai_actions_meal_food_scope_status_update
BEFORE UPDATE OF status ON ai_actions
WHEN NEW.action_type = 'meal-log'
  AND NEW.status IN ('confirmed','applied')
  AND EXISTS (
    SELECT 1
    FROM json_each(NEW.payload_json, '$.items') item
    LEFT JOIN foods f
      ON f.id = trim(COALESCE(json_extract(item.value, '$.foodId'), ''))
    WHERE f.id IS NULL
       OR (f.owner_user_id IS NOT NULL AND f.owner_user_id <> NEW.user_id)
  )
BEGIN
  SELECT RAISE(ABORT, 'AI meal action references an inaccessible food during state transition');
END;

-- Do not allow active proposals to lose their referenced food before the user
-- has accepted/rejected them. This also keeps the UI review payload resolvable.
CREATE TRIGGER foods_prevent_delete_when_active_ai_action_references
BEFORE DELETE ON foods
WHEN EXISTS (
  SELECT 1
  FROM ai_actions a, json_each(a.payload_json, '$.items') item
  WHERE a.action_type = 'meal-log'
    AND a.status IN ('proposed','confirmed')
    AND trim(COALESCE(json_extract(item.value, '$.foodId'), '')) = OLD.id
)
BEGIN
  SELECT RAISE(ABORT, 'food is referenced by an active AI action');
END;
