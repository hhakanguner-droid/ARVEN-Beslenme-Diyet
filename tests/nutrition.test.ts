import assert from "node:assert/strict";
import test from "node:test";
import {
  calculatePortions,
  remainingTargets,
  scaleNutrition,
  sumNutrition,
} from "../lib/nutrition/calculations";
import {
  assertExtendedNutritionFacts,
  scaleNutrientValue,
  sumNutrientValues,
} from "../lib/nutrition/nutrients";
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
    extended: undefined,
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

test("household portions that round below 0.1 g are rejected", () => {
  const tinyOptionFood: Food = {
    ...verifiedFood,
    id: "tiny-option-food",
    portionOptions: [{
      id: "tiny-option",
      measure: "piece",
      label: "minik parça",
      gramsPerUnit: 5,
      source: { provider: "manual-verified", verifiedAt: "2026-09-02T00:00:00.000Z" },
    }],
  };

  assert.throws(() => resolvePortionSelection(tinyOptionFood, {
    kind: "household",
    portionOptionId: "tiny-option",
    quantity: 0.001,
  }), /below ARVEN's 0.1 g precision/);
});

test("custom grams remain available as an advanced fallback", () => {
  const portion = resolvePortionSelection(verifiedFood, { kind: "custom-grams", grams: 135 });
  assert.equal(portion.grams, 135);
  assert.equal(portion.display?.label, "135 g");
});

test("nutrition totals preserve unknown fibre instead of inventing zero", () => {
  assert.deepEqual(sumNutrition([
    { energyKcal: 100, proteinG: 10, carbsG: 5, fatG: 3, fiberG: 2 },
    { energyKcal: 80, proteinG: 4, carbsG: 8, fatG: 2 },
  ]), {
    energyKcal: 180,
    proteinG: 14,
    carbsG: 13,
    fatG: 5,
    fiberG: undefined,
    extended: undefined,
  });
});

test("extended nutrient sums remain partial when any contributing source is incomplete", () => {
  assert.deepEqual(sumNutrientValues([
    { amount: 100, unit: "mg", completeness: "complete" },
    { amount: 50, unit: "mg", completeness: "partial" },
  ], "mg"), { amount: 150, unit: "mg", completeness: "partial" });

  assert.deepEqual(sumNutrientValues([
    { amount: null, unit: "mg", completeness: "unknown" },
    { amount: null, unit: "mg", completeness: "unknown" },
  ], "mg"), { amount: null, unit: "mg", completeness: "unknown" });
});

test("null nutrient amounts can never remain complete", () => {
  assert.deepEqual(
    scaleNutrientValue({ amount: null, unit: "mg", completeness: "complete" }, 0.5),
    { amount: null, unit: "mg", completeness: "unknown" },
  );

  assert.deepEqual(sumNutrientValues([
    { amount: 100, unit: "mg", completeness: "complete" },
    { amount: null, unit: "mg", completeness: "complete" },
  ], "mg"), { amount: 100, unit: "mg", completeness: "partial" });
});

test("canonical nutrient key and unit pairs are enforced at runtime", () => {
  assert.throws(() => assertExtendedNutritionFacts({
    sodium: { amount: 100, unit: "g", completeness: "complete" },
  }), /canonical unit mg/);

  assert.throws(() => assertExtendedNutritionFacts({
    typo: { amount: 1, unit: "mg", completeness: "complete" },
  } as never), /Unsupported nutrient key/);
});

test("remaining targets never go below zero and subtract logged water", () => {
  const result = remainingTargets(
    { energyKcal: 2000, proteinG: 150, carbsG: 200, fatG: 70, waterMl: 2000 },
    { energyKcal: 2100, proteinG: 100, carbsG: 250, fatG: 50 },
    1000,
  );
  assert.equal(result.energyKcal, 0);
  assert.equal(result.carbsG, 0);
  assert.equal(result.proteinG, 50);
  assert.equal(result.fatG, 20);
  assert.equal(result.waterMl, 1000);
});

test("remaining micronutrients inherit completeness from both target and consumption", () => {
  const result = remainingTargets(
    {
      energyKcal: 2000,
      proteinG: 150,
      carbsG: 200,
      fatG: 70,
      extended: {
        sodium: { amount: 2000, unit: "mg", completeness: "partial" },
        calcium: { amount: 1000, unit: "mg", completeness: "unknown" },
      },
    },
    {
      energyKcal: 1000,
      proteinG: 50,
      carbsG: 100,
      fatG: 30,
      extended: {
        sodium: { amount: 500, unit: "mg", completeness: "complete" },
        calcium: { amount: 300, unit: "mg", completeness: "complete" },
      },
    },
  );

  assert.deepEqual(result.extended?.sodium, { amount: 1500, unit: "mg", completeness: "partial" });
  assert.deepEqual(result.extended?.calcium, { amount: 700, unit: "mg", completeness: "unknown" });
});

test("verified source is required by both validation and calculation boundary", () => {
  assert.doesNotThrow(() => assertVerifiedNutritionSource(verifiedFood));
  const missingId: Food = {
    ...verifiedFood,
    source: { provider: "usda", verifiedAt: "2026-09-02T00:00:00.000Z" },
  };
  const blankId: Food = {
    ...verifiedFood,
    source: { provider: "usda", externalId: "   ", verifiedAt: "2026-09-02T00:00:00.000Z" },
  };
  assert.throws(() => assertVerifiedNutritionSource(missingId), /external source id/);
  assert.throws(() => assertVerifiedNutritionSource(blankId), /external source id/);
  assert.throws(() => scaleNutrition({ food: missingId, grams: 100 }), /external source id/);
});

test("core nutrition facts are validated before any portion scaling", () => {
  const invalidFoods: Food[] = [
    { ...verifiedFood, id: "negative", nutrition: { ...verifiedFood.nutrition, energyKcal: -1 } },
    { ...verifiedFood, id: "nan", nutrition: { ...verifiedFood.nutrition, proteinG: Number.NaN } },
    { ...verifiedFood, id: "infinite", nutrition: { ...verifiedFood.nutrition, carbsG: Number.POSITIVE_INFINITY } },
  ];

  for (const food of invalidFoods) {
    assert.throws(() => scaleNutrition({ food, grams: 100 }), /finite non-negative/);
  }
});

test("meal totals accumulate exact portion values before final rounding", () => {
  const tinyFood: Food = {
    ...verifiedFood,
    id: "tiny-energy",
    nutrition: { energyKcal: 49, proteinG: 0, carbsG: 0, fatG: 0 },
  };
  const portions = Array.from({ length: 100 }, () => ({ food: tinyFood, grams: 1 }));

  assert.equal(scaleNutrition(portions[0]!).energyKcal, 0);
  assert.equal(calculatePortions(portions).energyKcal, 49);
});

test("negative optional targets are rejected before remaining calculations", () => {
  assert.throws(() => remainingTargets(
    { energyKcal: 2000, proteinG: 100, carbsG: 200, fatG: 70, fiberG: -1 },
    { energyKcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  ), /finite non-negative/);

  assert.throws(() => remainingTargets(
    { energyKcal: 2000, proteinG: 100, carbsG: 200, fatG: 70, waterMl: -100 },
    { energyKcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  ), /finite non-negative/);
});
