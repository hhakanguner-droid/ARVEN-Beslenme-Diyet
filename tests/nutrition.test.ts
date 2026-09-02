import assert from "node:assert/strict";
import test from "node:test";
import { remainingTargets, scaleNutrition, sumNutrition } from "../lib/nutrition/calculations";
import { approximateGramLabel, resolvePortionSelection } from "../lib/nutrition/portions";
import { assertVerifiedNutritionSource } from "../lib/nutrition/sources";
import type { Food } from "../lib/nutrition/types";

const verifiedFood: Food = {
  id: "food-1",
  name: "Test food",
  basisGrams: 100,
  nutrition: { energyKcal: 200, proteinG: 20, carbsG: 10, fatG: 8, fiberG: 4 },
  source: { provider: "usda", externalId: "test-id", verifiedAt: "2026-09-02T00:00:00.000Z" },
  portionOptions: [
    {
      id: "portion-bowl-small",
      measure: "bowl",
      size: "small",
      label: "küçük kase",
      gramsPerUnit: 180,
      source: { provider: "manual-verified", verifiedAt: "2026-09-02T00:00:00.000Z" },
    },
  ],
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

test("household portion is resolved to internal grams", () => {
  const portion = resolvePortionSelection(verifiedFood, {
    kind: "household",
    portionOptionId: "portion-bowl-small",
    quantity: 1,
  });

  assert.equal(portion.grams, 180);
  assert.equal(portion.display?.label, "1 küçük kase");
  assert.equal(approximateGramLabel(portion), "≈ 180 g");
  assert.equal(scaleNutrition(portion).energyKcal, 360);
});

test("fractional natural portions are supported", () => {
  const portion = resolvePortionSelection(verifiedFood, {
    kind: "household",
    portionOptionId: "portion-bowl-small",
    quantity: 0.5,
  });

  assert.equal(portion.grams, 90);
  assert.equal(portion.display?.label, "0,5 küçük kase");
});

test("custom grams remain available as an advanced fallback", () => {
  const portion = resolvePortionSelection(verifiedFood, { kind: "custom-grams", grams: 135 });
  assert.equal(portion.grams, 135);
  assert.equal(portion.display?.label, "135 g");
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
