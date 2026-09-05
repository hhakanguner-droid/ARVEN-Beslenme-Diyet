import assert from "node:assert/strict";
import test from "node:test";
import type { AllergenSafetyExclusion, DietarySafetyExclusion } from "@/lib/health-safety/policy";
import { computeWeeklyMetrics } from "@/lib/nutrition/weekly-metrics";
import {
  type AuthenticatedUserContext,
  type ScientificReferenceSnapshot,
  type StoredAssessmentSnapshot,
  type StoredDecision,
  type StoredGoalVersion,
  type StoredMemoryFact,
  type StoredNutritionEvent,
  type StoredOutcome,
  type StoredProfile,
  type StoredProposal,
  type StoredSafetyAcknowledgement,
  type StoredWeeklyInsightSnapshot,
  type V1Transaction,
  type V1TransactionRunner,
  type VersionedFood,
} from "@/lib/persistence/v1-boundary";

/** Minimal fake covering exactly what computeWeeklyMetrics and buildAiContext read; everything unrelated throws. */
class FakeTx implements V1Transaction {
  context: AuthenticatedUserContext = { timezone: "Europe/Istanbul", nutritionDayStartMinutes: 0 };
  events = new Map<string, StoredNutritionEvent>();
  goals = new Map<string, StoredGoalVersion>();
  currentGoalId: string | null = null;
  allergens: AllergenSafetyExclusion[] = [];
  exclusions: DietarySafetyExclusion[] = [];
  profile: StoredProfile | null = null;
  memoryFacts: StoredMemoryFact[] = [];

  async getUserContext() { return this.context; }
  async getCurrentGoalVersion() { return this.currentGoalId ? this.goals.get(this.currentGoalId) ?? null : null; }
  async listNutritionEventsForLocalDate(s: string, localDate: string) {
    return [...this.events.values()].filter((e) => e.userSubject === s && e.localDate === localDate);
  }
  async getProfile() { return this.profile; }
  async getActiveAllergenExclusions() { return this.allergens; }
  async getActiveDietaryExclusions() { return this.exclusions; }
  async listMemoryFacts() { return this.memoryFacts; }

  async getOrCreateUser(): Promise<AuthenticatedUserContext> { throw new Error("unused"); }
  async upsertProfile(): Promise<void> { throw new Error("unused"); }
  async insertAssessmentSnapshot(): Promise<void> { throw new Error("unused"); }
  async getAssessmentSnapshots(): Promise<StoredAssessmentSnapshot[]> { return []; }
  async insertSafetyAcknowledgement(): Promise<void> { throw new Error("unused"); }
  async getSafetyAcknowledgements(): Promise<StoredSafetyAcknowledgement[]> { return []; }
  async getProposal(): Promise<StoredProposal | null> { return null; }
  async insertProposalIfAbsent(v: StoredProposal) { return v; }
  async getDecision(): Promise<StoredDecision | null> { return null; }
  async insertDecision(): Promise<void> { throw new Error("unused"); }
  async getOutcome(): Promise<StoredOutcome | null> { return null; }
  async insertOutcome(): Promise<void> { throw new Error("unused"); }
  async getNutritionEvent(): Promise<StoredNutritionEvent | null> { return null; }
  async insertNutritionEvent(): Promise<void> { throw new Error("unused"); }
  async insertNutritionEventWithOutcome(): Promise<void> { throw new Error("unused"); }
  async getFoodVersion(): Promise<VersionedFood | null> { return null; }
  async getScientificReferenceSnapshots(): Promise<ScientificReferenceSnapshot[]> { return []; }
  async insertGoalVersion(): Promise<void> { throw new Error("unused"); }
  async setCurrentGoal(): Promise<void> { throw new Error("unused"); }
  async insertGoalVersionAndSetCurrent(): Promise<void> { throw new Error("unused"); }
  async searchFoodVersions(): Promise<VersionedFood[]> { return []; }
  async findFoodVersionByBarcode(): Promise<VersionedFood | null> { return null; }
  async getFoodVersionByFoodKey(): Promise<VersionedFood | null> { return null; }
  async importVerifiedFoodVersion(): Promise<void> { throw new Error("unused"); }
  async insertMealPlanVersionAndSetCurrent(): Promise<void> { throw new Error("unused"); }
  async getCurrentMealPlan() { return null; }
  async deleteManualNutritionEvent(): Promise<void> { throw new Error("unused"); }
  async insertCustomFoodVersion(): Promise<void> { throw new Error("unused"); }
  async purgeAuthenticatedUser(): Promise<void> { throw new Error("unused"); }
  async insertMemoryFact(): Promise<void> { throw new Error("unused"); }
  async deleteMemoryFact(): Promise<void> { throw new Error("unused"); }
  async insertWeeklyInsightSnapshot(): Promise<void> { throw new Error("unused"); }
  async getLatestWeeklyInsightSnapshot(): Promise<StoredWeeklyInsightSnapshot | null> { return null; }
  async insertPhotoAsset(): Promise<void> { throw new Error("unused"); }
  async getPhotoAsset(): Promise<null> { return null; }
  async listPhotoAssets(): Promise<never[]> { return []; }
  async deletePhotoAsset(): Promise<void> { throw new Error("unused"); }
}

class FakeRunner implements V1TransactionRunner {
  constructor(readonly tx = new FakeTx()) {}
  async transaction<T>(work: (tx: V1Transaction) => Promise<T>): Promise<T> { return work(this.tx); }
}

function waterEvent(id: string, localDate: string, milliliters: number): StoredNutritionEvent {
  return { id, userSubject: "u1", eventType: "water-log", occurredAt: `${localDate}T12:00:00.000Z`, localDate, payloadJson: JSON.stringify({ schemaVersion: "WaterEventV1", milliliters }), createdAt: `${localDate}T12:00:00.000Z` };
}

function mealEvent(id: string, localDate: string, macros: { energyKcal: number; proteinG: number; carbsG: number; fatG: number }): StoredNutritionEvent {
  return {
    id, userSubject: "u1", eventType: "meal-log", occurredAt: `${localDate}T12:00:00.000Z`, localDate,
    payloadJson: JSON.stringify({ schemaVersion: "MealEventV1", mealType: "lunch", items: [{ foodVersionId: "f1", nutrition: macros }] }),
    createdAt: `${localDate}T12:00:00.000Z`,
  };
}

test("computeWeeklyMetrics rejects a week start that is not a canonical local date", async () => {
  const runner = new FakeRunner();
  await assert.rejects(() => computeWeeklyMetrics(runner, "u1", "not-a-date"));
});

test("computeWeeklyMetrics averages only over days with logged food, but water over all seven days", async () => {
  const runner = new FakeRunner();
  runner.tx.events.set("m1", mealEvent("m1", "2026-08-31", { energyKcal: 1800, proteinG: 100, carbsG: 200, fatG: 60 }));
  runner.tx.events.set("m2", mealEvent("m2", "2026-09-01", { energyKcal: 2000, proteinG: 120, carbsG: 220, fatG: 70 }));
  runner.tx.events.set("w1", waterEvent("w1", "2026-08-31", 1000));
  runner.tx.events.set("w2", waterEvent("w2", "2026-09-02", 2000));

  const metrics = await computeWeeklyMetrics(runner, "u1", "2026-08-31");
  assert.equal(metrics.weekEndLocalDate, "2026-09-06");
  assert.equal(metrics.daysWithLoggedFood, 2);
  assert.equal(metrics.averageEnergyKcal, 1900);
  assert.equal(metrics.averageProteinG, 110);
  // Water is averaged over all 7 days: (1000 + 0 + 2000 + 0*4) / 7 = 428.57... -> rounded to one decimal.
  assert.equal(metrics.averageWaterMl, 428.6);
});

test("computeWeeklyMetrics reports hasGoal and daysWaterGoalMet only when a goal is active", async () => {
  const runner = new FakeRunner();
  const goal: StoredGoalVersion = {
    id: "g1", userSubject: "u1", source: "arven-calculated", calculatorId: "mifflin-st-jeor@v1",
    calculatorInputsJson: "{}", referenceSnapshotsJson: "[]",
    energyKcal: 2000, proteinG: 120, carbsG: 220, fatG: 70, fiberG: 30, waterMl: 2000,
    mealAllocationsJson: "[]", createdAt: "2026-08-01T00:00:00.000Z",
  };
  runner.tx.goals.set(goal.id, goal);
  runner.tx.currentGoalId = goal.id;
  runner.tx.events.set("w1", waterEvent("w1", "2026-08-31", 2500));

  const withGoal = await computeWeeklyMetrics(runner, "u1", "2026-08-31");
  assert.equal(withGoal.hasGoal, true);
  assert.equal(withGoal.daysWaterGoalMet, 1);

  const noGoalRunner = new FakeRunner();
  const withoutGoal = await computeWeeklyMetrics(noGoalRunner, "u1", "2026-08-31");
  assert.equal(withoutGoal.hasGoal, false);
  assert.equal(withoutGoal.daysWaterGoalMet, null);
});

test("computeWeeklyMetrics reports null averages and zero days for a week with no data at all", async () => {
  const runner = new FakeRunner();
  const metrics = await computeWeeklyMetrics(runner, "u1", "2026-08-31");
  assert.equal(metrics.daysWithLoggedFood, 0);
  assert.equal(metrics.averageEnergyKcal, null);
  assert.equal(metrics.averageWaterMl, 0);
});
