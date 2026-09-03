import assert from "node:assert/strict";
import test from "node:test";
import { assertMealEnergyAllocations } from "../lib/goals/types";
import { assertNoDietaryExclusionConflict, assertNoMedicalOverreach } from "../lib/health-safety/policy";

test("Turkish treatment directives validate the complete connector-bound target", () => {
  assert.throws(() => assertNoMedicalOverreach("İbuprofen ile suyu al."), /non-diagnostic/);
  assert.throws(() => assertNoMedicalOverreach("Warfarini sebze ile kullan."), /non-diagnostic/);
  assert.doesNotThrow(() => assertNoMedicalOverreach("Su ile meyveyi al."));
  assert.doesNotThrow(() => assertNoMedicalOverreach("Zeytinyağı ile sebzeyi kullan."));
});

test("food exclusions compare canonical trimmed stable food identities", () => {
  const candidate = [{
    foodId: " yogurt ",
    foodName: "Yoğurt",
    dietarySafetyDataStatus: "verified" as const,
    dietaryConflictRuleIds: [],
  }];
  assert.throws(() => assertNoDietaryExclusionConflict(candidate, [
    { kind: "food", id: " yogurt ", label: "Yoğurt", resolutionStatus: "resolved" },
  ]), /Dietary safety conflict/);
  assert.throws(() => assertNoDietaryExclusionConflict([{ ...candidate[0], foodId: "   " }], [
    { kind: "food", id: "yogurt", label: "Yoğurt", resolutionStatus: "resolved" },
  ]), /food identifier unresolved/);
});

test("meal allocation snapshots reject undeclared runtime fields", () => {
  assert.throws(() => assertMealEnergyAllocations([
    { mealType: "dinner", energyShareBps: 10000, energyKcal: 500 } as never,
  ]), /undeclared fields/);
  assert.doesNotThrow(() => assertMealEnergyAllocations([
    { mealType: "dinner", energyShareBps: 10000 },
  ]));
});
