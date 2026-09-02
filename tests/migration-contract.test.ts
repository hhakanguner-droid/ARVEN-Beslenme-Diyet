import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("db/migrations/0001_initial.sql", "utf8");

test("initial migration persists the current safety and integrity invariants", () => {
  assert.match(migration, /source <> 'arven-calculated'/);
  assert.match(migration, /json_array_length\(reference_ids_json\) > 0/);
  assert.match(migration, /scientific_references/);
  assert.match(migration, /amount_per_100g IS NOT NULL OR completeness <> 'complete'/);
  assert.match(migration, /CREATE TABLE dietary_rule_catalog/);
  assert.match(migration, /CREATE TABLE food_dietary_rule_conflicts/);
  assert.doesNotMatch(migration, /CREATE TABLE user_medications/);
  assert.match(migration, /meal_type TEXT NOT NULL CHECK \(meal_type IN/);
  assert.match(migration, /private food ownership mismatch/);
  assert.match(migration, /goal interval overlap/);
  assert.match(migration, /julianday\(applied_at\) >= julianday\(confirmed_at\)/);
});
