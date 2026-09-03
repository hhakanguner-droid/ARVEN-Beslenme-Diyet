import assert from "node:assert/strict";
import test from "node:test";
import { EMPTY_NUTRITION, remainingTargets } from "../lib/nutrition/calculations";

test("an explicit empty day preserves complete fibre and micronutrient targets", () => {
  const result = remainingTargets(
    {
      energyKcal: 2000,
      proteinG: 120,
      carbsG: 220,
      fatG: 70,
      fiberG: 30,
      extended: {
        calcium: { amount: 1000, unit: "mg", completeness: "complete" },
        iron: { amount: 10, unit: "mg", completeness: "partial" },
      },
    },
    EMPTY_NUTRITION,
    0,
    "empty-day",
  );

  assert.equal(result.fiberG, 30);
  assert.deepEqual(result.extended?.calcium, { amount: 1000, unit: "mg", completeness: "complete" });
  assert.deepEqual(result.extended?.iron, { amount: 10, unit: "mg", completeness: "partial" });
});

test("missing nutrient coverage on logged foods remains unknown", () => {
  const result = remainingTargets(
    {
      energyKcal: 2000,
      proteinG: 120,
      carbsG: 220,
      fatG: 70,
      extended: { calcium: { amount: 1000, unit: "mg", completeness: "complete" } },
    },
    { energyKcal: 500, proteinG: 20, carbsG: 60, fatG: 10 },
    0,
    "logged-foods",
  );

  assert.deepEqual(result.extended?.calcium, { amount: null, unit: "mg", completeness: "unknown" });
});
