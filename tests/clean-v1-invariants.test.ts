import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { deriveMifflinStJeorV1 } from "../lib/goals/calculator";
import { assertNoMedicalOverreach } from "../lib/health-safety/policy";

test("personal-pronoun modal diagnoses fail closed", () => {
  for (const message of ["You may be diabetic.", "They might be hypertensive.", "She could be ill."]) {
    assert.throws(() => assertNoMedicalOverreach(message), /non-diagnostic/, message);
  }
});

test("clean food snapshot storage accepts every supported safety evidence status", () => {
  const migration = readFileSync(new URL("../db/migrations/0001_initial.sql", import.meta.url), "utf8");
  assert.match(migration, /allergen_data_status IN \('verified','unknown','not-applicable'\)/);
  assert.match(migration, /dietary_safety_data_status IN \('verified','unknown','not-applicable'\)/);
});

test("Mifflin-St Jeor V1 rejects undeclared calculator input fields", () => {
  const input = {
    weightKg: 80,
    heightCm: 180,
    ageYears: 40,
    sexAtBirth: "male" as const,
    activityFactor: 1.4,
    energyAdjustmentKcal: 0,
    proteinGPerKg: 1.6,
    fatEnergyPct: 0.3,
    waterMlPerKg: 30,
    energyKcal: 500,
  };
  assert.throws(() => deriveMifflinStJeorV1(input), /unrecognized|unrecognized_keys/i);
});
