import assert from "node:assert/strict";
import test from "node:test";
import { buildUserExport } from "@/lib/portability/export";
import { importUserExport } from "@/lib/portability/import";
import { V1MutationService } from "@/lib/persistence/v1-boundary";
import { MemoryRunner } from "./fixtures/memory-transaction";

/**
 * Faz 9 hardening regression suite for Risk 2 (`lib/portability/import.ts` must never write raw
 * backup fields into persistence — see that file's module doc comment for the full design). Every
 * test here exercises the real `importUserExport` against a real in-memory `V1Transaction`
 * (`MemoryRunner`), so a regression in the top-level allowlist, in any per-section reconstruction, or
 * in the reuse of a canonical domain validator/mutation-service method shows up here directly.
 */

const CLOCK = { now: () => new Date("2026-09-07T10:00:00.000Z") };

function validManifest(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    format: "ArvenNutritionExportV1",
    exportedAt: "2026-09-07T10:00:00.000Z",
    locale: "tr-TR",
    timezone: "Europe/Istanbul",
    sections: ["profile"],
    recordCounts: { profile: 1 },
    ...overrides,
  };
}

test("malformed JSON: a non-object (or non-JSON-object) payload is rejected outright", async () => {
  const runner = new MemoryRunner();
  await assert.rejects(() => importUserExport(runner, "u1", "this is not an export file"), /beklenmeyen içerik/);
  await assert.rejects(() => importUserExport(runner, "u1", 42), /beklenmeyen içerik/);
  await assert.rejects(() => importUserExport(runner, "u1", null), /beklenmeyen içerik/);
  await assert.rejects(() => importUserExport(runner, "u1", ["not", "a", "record"]), /beklenmeyen içerik/);
});

test("unsupported schema version: a manifest whose format is not ArvenNutritionExportV1 is rejected outright", async () => {
  const runner = new MemoryRunner();
  await assert.rejects(
    () => importUserExport(runner, "u1", { manifest: validManifest({ format: "SomeOtherAppExportV9" }) }),
    /Unsupported ARVEN export format/,
  );
});

test("forged userSubject/ownerSubject: any such top-level field is rejected outright, never read", async () => {
  const runner = new MemoryRunner();
  await assert.rejects(
    () => importUserExport(runner, "victim-subject", { manifest: validManifest(), userSubject: "attacker-controlled-subject" }),
    /tanınmayan alan/,
  );
  await assert.rejects(
    () => importUserExport(runner, "victim-subject", { manifest: validManifest(), ownerSubject: "attacker-controlled-subject" }),
    /tanınmayan alan/,
  );
});

test("unexpected extra fields: any top-level key this export format has never produced is rejected outright", async () => {
  const runner = new MemoryRunner();
  await assert.rejects(
    () => importUserExport(runner, "u1", { manifest: validManifest(), somethingTheExportNeverIncludes: true }),
    /tanınmayan alan/,
  );
});

test("medication-as-supplement import: a smuggled top-level supplements section is rejected outright, not merged into the account's supplement list", async () => {
  const runner = new MemoryRunner();
  await assert.rejects(
    () => importUserExport(runner, "u1", { manifest: validManifest(), supplements: [{ name: "Varfarin", note: "Günde 2 kez 5mg, doktor takibiyle" }] }),
    /tanınmayan alan/,
  );
});

test("unsafe lab payload: a smuggled top-level lab-results section is rejected outright, not merged into the account's lab history", async () => {
  const runner = new MemoryRunner();
  await assert.rejects(
    () => importUserExport(runner, "u1", { manifest: validManifest(), labResults: [{ markerName: "Kan şekeri", valueText: "300", unitText: "mg/dL" }] }),
    /tanınmayan alan/,
  );
});

test("invalid nutrition event: a meal-log entry referencing a food that isn't in this user's catalog is skipped, not written", async () => {
  const runner = new MemoryRunner();
  const summary = await importUserExport(runner, "u1", {
    manifest: validManifest({ sections: ["meal-log"], recordCounts: { "meal-log": 1 } }),
    mealLog: [{
      occurredAt: "2026-09-01T08:00:00.000Z",
      localDate: "2026-09-01",
      payloadJson: JSON.stringify({ schemaVersion: "MealEventV1", mealType: "breakfast", items: [{ foodVersionId: "does-not-exist", calculationVersion: "nutrition-v1", grams: 100 }] }),
    }],
  });
  assert.equal(summary.imported["meal-log"], 0);
  assert.equal(summary.skipped["meal-log"], 1);
  const service = new V1MutationService("u1", runner);
  assert.equal((await service.listAllNutritionEvents()).length, 0);
});

test("invalid nutrition event: an out-of-range grams value in a meal-log entry is skipped, not written", async () => {
  const runner = new MemoryRunner();
  runner.tx.foods.set("food-v1", { id: "food-v1", foodKey: "yogurt", name: "Yoğurt", basisGrams: 100, nutrition: { energyKcal: 60, proteinG: 4, carbsG: 5, fatG: 3 }, source: { provider: "manual-verified", verifiedAt: "2026-09-01T00:00:00.000Z" }, portionOptions: [], allergenDataStatus: "verified", allergenIds: [], dietarySafetyDataStatus: "verified", dietaryConflictRuleIds: [] });
  const summary = await importUserExport(runner, "u1", {
    manifest: validManifest({ sections: ["meal-log"], recordCounts: { "meal-log": 1 } }),
    mealLog: [{
      occurredAt: "2026-09-01T08:00:00.000Z",
      localDate: "2026-09-01",
      payloadJson: JSON.stringify({ schemaVersion: "MealEventV1", mealType: "breakfast", items: [{ foodVersionId: "food-v1", calculationVersion: "nutrition-v1", grams: -50 }] }),
    }],
  });
  assert.equal(summary.imported["meal-log"], 0);
  assert.equal(summary.skipped["meal-log"], 1);
});

test("invalid recipe ingredient: a portion quantity outside the allowed range is skipped, not written", async () => {
  const runner = new MemoryRunner();
  runner.tx.foods.set("food-v1", { id: "food-v1", foodKey: "yogurt", name: "Yoğurt", basisGrams: 100, nutrition: { energyKcal: 60, proteinG: 4, carbsG: 5, fatG: 3 }, source: { provider: "manual-verified", verifiedAt: "2026-09-01T00:00:00.000Z" }, portionOptions: [{ id: "portion-v1", measure: "serving", label: "1 porsiyon", gramsPerUnit: 150, source: { provider: "manual-verified", verifiedAt: "2026-09-01T00:00:00.000Z" } }], allergenDataStatus: "verified", allergenIds: [], dietarySafetyDataStatus: "verified", dietaryConflictRuleIds: [] });
  const summary = await importUserExport(runner, "u1", {
    manifest: validManifest({ sections: ["recipes"], recordCounts: { recipes: 1 } }),
    recipes: [{
      name: "Bozuk tarif", servings: 2,
      ingredientsJson: JSON.stringify([{ foodVersionId: "food-v1", calculationVersion: "nutrition-v1", selection: { kind: "household", portionVersionId: "portion-v1", quantity: 999 } }]),
    }],
  });
  assert.equal(summary.imported.recipes, 0);
  assert.equal(summary.skipped.recipes, 1);
  const service = new V1MutationService("u1", runner);
  assert.equal((await service.listRecipes()).length, 0);
});

test("invalid activityLevel: a profile with an activityLevel outside the enum is skipped, not written", async () => {
  const runner = new MemoryRunner();
  const summary = await importUserExport(runner, "u1", {
    manifest: validManifest(),
    profile: { displayName: "Ada", birthDate: "1990-01-01", sexAtBirth: "female", heightCm: 165, activityLevel: "flying" },
  });
  assert.equal(summary.imported.profile, undefined);
  assert.equal(summary.skipped.profile, 1);
  const stored = await runner.transaction((tx) => tx.getProfile("u1"));
  assert.equal(stored, null);
});

test("negative/invalid measurement: an out-of-range weightKg is skipped, not written", async () => {
  const runner = new MemoryRunner();
  const summary = await importUserExport(runner, "u1", {
    manifest: validManifest({ sections: ["measurements"], recordCounts: { measurements: 1 } }),
    measurements: [{ localDate: "2026-09-01", weightKg: -10, bodyFatPercent: null, waistCm: null, hipCm: null, chestCm: null, note: null }],
  });
  assert.equal(summary.imported.measurements, 0);
  assert.equal(summary.skipped.measurements, 1);
  const service = new V1MutationService("u1", runner);
  assert.equal((await service.listBodyMeasurements()).length, 0);
});

test("valid export -> import roundtrip for a calculated goal: re-derived through the real calculator and reference lookup, not written from stored totals", async () => {
  const sourceRunner = new MemoryRunner();
  sourceRunner.tx.refs.set("ref-v1", { id: "ref-v1", title: "Protein reference", citation: "Reference citation" });
  const sourceService = new V1MutationService("original-user", sourceRunner, undefined, CLOCK);
  await sourceService.getOrCreateAuthenticatedUser({ timezone: "Europe/Istanbul", locale: "tr-TR" });
  await sourceService.createCalculatedGoalVersion(
    { weightKg: 80, heightCm: 180, ageYears: 40, sexAtBirth: "male", activityFactor: 1.4, energyAdjustmentKcal: 0, proteinGPerKg: 1.6, fatEnergyPct: 0.3, waterMlPerKg: 35 },
    ["ref-v1"],
    [{ mealType: "breakfast", energyShareBps: 4000 }, { mealType: "lunch", energyShareBps: 3000 }, { mealType: "dinner", energyShareBps: 3000 }],
  );
  const userContext = await sourceService.getOrCreateAuthenticatedUser({ timezone: "Europe/Istanbul", locale: "tr-TR" });
  const exportPayload = await buildUserExport(sourceRunner, "original-user", userContext, "tr-TR", CLOCK.now());
  assert.ok(exportPayload.goals, "the seeded goal must actually be present in the export");

  const targetRunner = new MemoryRunner();
  targetRunner.tx.refs.set("ref-v1", { id: "ref-v1", title: "Protein reference", citation: "Reference citation" });
  const summary = await importUserExport(targetRunner, "restored-user", exportPayload);
  assert.equal(summary.imported.goals, 1);
  const restoredGoal = await targetRunner.transaction((tx) => tx.getCurrentGoalVersion("restored-user"));
  assert.equal(restoredGoal?.userSubject, "restored-user");
  assert.equal(restoredGoal?.energyKcal, exportPayload.goals?.energyKcal, "re-deriving the same inputs through the same calculator must reproduce the same targets");
});

test("goal import is skipped, not written, when its scientific reference no longer resolves in the target account's catalog", async () => {
  const sourceRunner = new MemoryRunner();
  sourceRunner.tx.refs.set("ref-v1", { id: "ref-v1", title: "Protein reference", citation: "Reference citation" });
  const sourceService = new V1MutationService("original-user", sourceRunner, undefined, CLOCK);
  await sourceService.createCalculatedGoalVersion(
    { weightKg: 80, heightCm: 180, ageYears: 40, sexAtBirth: "male", activityFactor: 1.4, energyAdjustmentKcal: 0, proteinGPerKg: 1.6, fatEnergyPct: 0.3, waterMlPerKg: 35 },
    ["ref-v1"],
    [{ mealType: "dinner", energyShareBps: 10000 }],
  );
  const userContext = await sourceService.getOrCreateAuthenticatedUser({ timezone: "Europe/Istanbul", locale: "tr-TR" });
  const exportPayload = await buildUserExport(sourceRunner, "original-user", userContext, "tr-TR", CLOCK.now());

  const targetRunner = new MemoryRunner(); // deliberately does NOT seed ref-v1
  const summary = await importUserExport(targetRunner, "restored-user", exportPayload);
  assert.equal(summary.imported.goals, undefined);
  assert.equal(summary.skipped.goals, 1);
});
