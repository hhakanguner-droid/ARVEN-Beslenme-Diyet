import assert from "node:assert/strict";
import test from "node:test";
import { deriveCalculatedGoal } from "../lib/goals/calculator";
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

test("ARVEN-calculated goal provenance requires finite primitive inputs and scientific references", () => {
  assert.doesNotThrow(() => assertGoalCalculationProvenance({
    method: "mifflin-st-jeor",
    version: "v1",
    inputs: { weightKg: 80, heightCm: 180, ageYears: 40, sexAtBirth: "male" },
    referenceIds: ["mifflin-1990"],
  }));

  assert.throws(() => assertGoalCalculationProvenance({
    method: "mifflin-st-jeor",
    version: "v1",
    inputs: {},
    referenceIds: [],
  }), /inputs cannot be empty|scientific reference/);
  assert.throws(() => assertGoalCalculationProvenance({
    method: "mifflin-st-jeor",
    version: "v1",
    inputs: { weightKg: Infinity },
    referenceIds: ["mifflin-1990"],
  }), /must be finite/);
  assert.throws(() => assertGoalCalculationProvenance({
    method: "mifflin-st-jeor",
    version: "v1",
    inputs: { weightKg: [80] as never },
    referenceIds: ["mifflin-1990"],
  }), /primitive scalar/);
});

test("versioned goal calculator deterministically derives every target", () => {
  const targets = deriveCalculatedGoal({
    method: "mifflin-st-jeor",
    version: "v1",
    inputs: {
      weightKg: 80, heightCm: 180, ageYears: 40, sexAtBirth: "male", activityFactor: 1.2,
      energyAdjustmentKcal: 0, proteinGPerKg: 1.5, fatEnergyPct: 0.3, waterMlPerKg: 30,
    },
    referenceIds: ["mifflin-1990"],
  });
  assert.deepEqual(targets, { energyKcal: 2076, proteinG: 120, carbsG: 243.3, fatG: 69.2, fiberG: 29.1, waterMl: 2400 });
});

test("versioned goal calculator rejects input combinations that derive invalid targets", () => {
  assert.throws(() => deriveCalculatedGoal({
    method: "mifflin-st-jeor",
    version: "v1",
    inputs: {
      weightKg: 20, heightCm: 100, ageYears: 120, sexAtBirth: "female", activityFactor: 1,
      energyAdjustmentKcal: -1500, proteinGPerKg: 0.5, fatEnergyPct: 0.15, waterMlPerKg: 15,
    },
    referenceIds: ["mifflin-1990"],
  }), /derived energyKcal is outside supported range/);
});

test("versioned goal calculator rejects individually valid but internally inconsistent macro inputs", () => {
  assert.throws(() => deriveCalculatedGoal({
    method: "mifflin-st-jeor",
    version: "v1",
    inputs: {
      weightKg: 80, heightCm: 180, ageYears: 40, sexAtBirth: "male", activityFactor: 1,
      energyAdjustmentKcal: -1500, proteinGPerKg: 4, fatEnergyPct: 0.5, waterMlPerKg: 30,
    },
    referenceIds: ["mifflin-1990"],
  }), /internally inconsistent|exceed the derived energy target/);
});
