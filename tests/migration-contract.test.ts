import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const initial = readFileSync("db/migrations/0001_initial.sql", "utf8");
const review6 = readFileSync("db/migrations/0002_review6_ai_payload_hardening.sql", "utf8");

test("migrations persist the current safety and integrity invariants", () => {
  assert.match(initial, /source IN \('manual','arven-calculated'\)/);
  assert.match(initial, /json_valid\(reference_ids_json\) = 1/);
  assert.match(initial, /scientific_references_prevent_delete/);
  assert.match(initial, /calculated goal targets are immutable/);
  assert.match(initial, /meal allocations must be canonical, unique and total 10000 basis points/);
  assert.match(initial, /amount_per_100g IS NOT NULL OR completeness <> 'complete'/);
  assert.match(initial, /CREATE TABLE dietary_rule_catalog/);
  assert.match(initial, /CREATE TABLE food_dietary_rule_conflicts/);
  assert.doesNotMatch(initial, /CREATE TABLE user_medications/);
  assert.match(initial, /private food ownership mismatch/);
  assert.match(initial, /private preference food ownership mismatch/);
  assert.match(initial, /food ownership is immutable/);
  assert.match(initial, /goal interval overlap/);
  assert.match(initial, /julianday\(applied_at\) >= julianday\(confirmed_at\)/);
  assert.match(initial, /json_valid\(payload_json\) = 1/);
  assert.match(initial, /MealLogActionV1/);
  assert.match(initial, /WaterLogActionV1/);
  assert.match(initial, /confirmed AI action proposal is immutable/);
  assert.match(initial, /julianday\(verified_at\) IS NOT NULL/);
  assert.match(review6, /AI action payload does not match declared schema/);
  assert.match(review6, /invalid AI action confirmation\/application transition/);
});
