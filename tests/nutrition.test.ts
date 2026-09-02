import assert from "node:assert/strict";
import test from "node:test";
import { remainingTargets, scaleNutrition, sumNutrition } from "../lib/nutrition/calculations";
import { assertVerifiedNutritionSource } from "../lib/nutrition/sources";
import type { Food } from "../lib/nutrition/types";

const verifiedFood: Food = {
  id: "food-1",
  name: "Test food",
  basisGrams: 100,
  nutrition: { energyKcal: 200, proteinG: 20, carbsG: 10, fatG: 8, fiberG: 4 },
  source: { provider: "usda", externalId: "test-id", verifiedAt: "2026-09-02T00:00:00.000Z" },
};

test("portion nutrition scales deterministically", () => {
  assert.deepEqual(scaleNutrition({ food: verifiedFood, grams: 150 }), {
    energyKcal: 300,
    proteinG: 30,
    carbsG: 15,
    fatG: 12,
    fiberG: 6,
  });
});

test("nutrition totals are summed by code", () => {
  assert.deepEqual(sumNutrition([
    { energyKcal: 100, proteinG: 10, carbsG: 5, fatG: 3 },
    { energyKcal: 80, proteinG: 4, carbsG: 8, fatG: 2 },
  ]), { energyKcal: 180, proteinG: 14, carbsG: 13, fatG: 5, fiberG: 0 });
});

test("remaining targets never go below zero", () => {
  const result = remainingTargets(
    { energyKcal: 2000, proteinG: 150, carbsG: 200, fatG: 70 },
    { energyKcal: 2100, proteinG: 100, carbsG: 250, fatG: 50 },
  );
  assert.equal(result.energyKcal, 0);
  assert.equal(result.carbsG, 0);
  assert.equal(result.proteinG, 50);
  assert.equal(result.fatG, 20);
});

test("verified source is required", () => {
  assert.doesNotThrow(() => assertVerifiedNutritionSource(verifiedFood));
  const invalid: Food = { ...verifiedFood, source: { provider: "usda", verifiedAt: "2026-09-02T00:00:00.000Z" } };
  assert.throws(() => assertVerifiedNutritionSource(invalid), /external source id/);
});
