import assert from "node:assert/strict";
import test from "node:test";
import { assertMealEnergyAllocations } from "../lib/goals/types";

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
