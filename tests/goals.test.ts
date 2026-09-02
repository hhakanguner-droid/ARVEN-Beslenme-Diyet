import assert from "node:assert/strict";
import test from "node:test";
import { assertGoalCalculationProvenance, assertMealEnergyAllocations } from "../lib/goals/types";

test("meal target allocations must total one hundred percent", () => {
  assert.doesNotThrow(() => assertMealEnergyAllocations([
    { mealType: "breakfast", energyShareBps: 2500 },
    { mealType: "lunch", energyShareBps: 3500 },
    { mealType: "dinner", energyShareBps: 3000 },
    { mealType: "snack", energyShareBps: 1000 },
  ]));

  assert.throws(() => assertMealEnergyAllocations([
    { mealType: "breakfast", energyShareBps: 2500 },
    { mealType: "lunch", energyShareBps: 3500 },
  ]), /must total 10000/);
});

test("duplicate meal allocations are rejected", () => {
  assert.throws(() => assertMealEnergyAllocations([
    { mealType: "breakfast", energyShareBps: 5000 },
    { mealType: "breakfast", energyShareBps: 5000 },
  ]), /Duplicate/);
});

test("meal allocation ids must be canonical and whitespace-free", () => {
  assert.throws(() => assertMealEnergyAllocations([
    { mealType: "breakfast", energyShareBps: 5000 },
    { mealType: " breakfast" as never, energyShareBps: 5000 },
  ]), /Invalid mealType/);
});

test("ARVEN-calculated goal provenance requires method, inputs and scientific references", () => {
  assert.doesNotThrow(() => assertGoalCalculationProvenance({
    method: "iom-eer",
    version: "1.0.0",
    inputs: { age: 47, heightCm: 195, activityLevel: "moderate" },
    referenceIds: ["iom-2005-eer"],
  }));

  assert.throws(() => assertGoalCalculationProvenance({
    method: "iom-eer",
    version: "1.0.0",
    inputs: {},
    referenceIds: [],
  }), /inputs cannot be empty|scientific reference/);
});
