import assert from "node:assert/strict";
import test from "node:test";
import type { AllergenSafetyExclusion, DietarySafetyExclusion } from "@/lib/health-safety/policy";
import { buildAiContext, renderSystemPrompt } from "@/lib/ai/context-engine";
import {
  V1MutationService,
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

/** Same minimal shape as tests/weekly-metrics.test.ts's FakeTx, extended with what buildAiContext also reads. */
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
  async insertLabDocument(): Promise<void> { throw new Error("unused"); }
  async getLabDocument(): Promise<null> { return null; }
  async listLabDocuments(): Promise<never[]> { return []; }
  async deleteLabDocument(): Promise<void> { throw new Error("unused"); }
  async insertLabResultEntry(): Promise<void> { throw new Error("unused"); }
  async listLabResultEntries(): Promise<never[]> { return []; }
  async confirmLabResultEntry(): Promise<never> { throw new Error("unused"); }
  async deleteLabResultEntry(): Promise<void> { throw new Error("unused"); }
  async insertSupplementRecord(): Promise<void> { throw new Error("unused"); }
  async listSupplementRecords(): Promise<never[]> { return []; }
  async setSupplementRecordActive(): Promise<void> { throw new Error("unused"); }
  async deleteSupplementRecord(): Promise<void> { throw new Error("unused"); }
  async insertRecipe(): Promise<void> { throw new Error("unused"); }
  async listRecipes(): Promise<never[]> { return []; }
  async getRecipe(): Promise<null> { return null; }
  async deleteRecipe(): Promise<void> { throw new Error("unused"); }
  async insertWeeklyPlanVersionAndSetCurrent(): Promise<void> { throw new Error("unused"); }
  async getCurrentWeeklyPlan(): Promise<null> { return null; }
  async insertPantryItem(): Promise<void> { throw new Error("unused"); }
  async listPantryItems(): Promise<never[]> { return []; }
  async updatePantryItem(): Promise<never> { throw new Error("unused"); }
  async deletePantryItem(): Promise<void> { throw new Error("unused"); }
  async replaceShoppingListItems(): Promise<void> { throw new Error("unused"); }
  async listShoppingListItems(): Promise<never[]> { return []; }
  async setShoppingListItemChecked(): Promise<void> { throw new Error("unused"); }
  async getWeekPrepPreferences(): Promise<null> { return null; }
  async upsertWeekPrepPreferences(): Promise<void> { throw new Error("unused"); }
  async getWeekPrepStatus(): Promise<null> { return null; }
  async upsertWeekPrepStatus(): Promise<void> { throw new Error("unused"); }
  async insertBodyMeasurement(): Promise<void> { throw new Error("unused"); }
  async listBodyMeasurements(): Promise<never[]> { throw new Error("unused"); }
  async deleteBodyMeasurement(): Promise<void> { throw new Error("unused"); }
  async insertBodyPhotoSet(): Promise<void> { throw new Error("unused"); }
  async getBodyPhotoSet(): Promise<null> { throw new Error("unused"); }
  async listBodyPhotoSets(): Promise<never[]> { throw new Error("unused"); }
  async deleteBodyPhotoSet(): Promise<void> { throw new Error("unused"); }
  async hasProgressMilestone(): Promise<boolean> { throw new Error("unused"); }
  async insertProgressMilestone(): Promise<void> { throw new Error("unused"); }
  async listProgressMilestones(): Promise<never[]> { throw new Error("unused"); }
  async insertProgressReportExport(): Promise<void> { throw new Error("unused"); }
  async getProgressReportExport(): Promise<null> { throw new Error("unused"); }
  async listProgressReportExports(): Promise<never[]> { throw new Error("unused"); }
  async deleteProgressReportExport(): Promise<void> { throw new Error("unused"); }
}

class FakeRunner implements V1TransactionRunner {
  constructor(readonly tx = new FakeTx()) {}
  async transaction<T>(work: (tx: V1Transaction) => Promise<T>): Promise<T> { return work(this.tx); }
}

function routeContext(runner: FakeRunner) {
  return {
    subject: "u1",
    runner,
    service: new V1MutationService("u1", runner),
    userContext: runner.tx.context,
    todayLocalDate: "2026-09-04",
  };
}

test("buildAiContext reports no active goal and no remaining-target figures when none is set", async () => {
  const runner = new FakeRunner();
  const context = await buildAiContext(routeContext(runner));
  assert.equal(context.hasGoal, false);
  assert.equal(context.remainingToday, null);
  assert.deepEqual(context.allergenLabels, []);
  assert.deepEqual(context.recentMemoryFacts, []);
});

test("buildAiContext surfaces active allergen and dietary exclusion labels and recent memory facts", async () => {
  const runner = new FakeRunner();
  runner.tx.allergens = [{ id: "milk", label: "Süt", resolutionStatus: "resolved" }];
  runner.tx.exclusions = [{ kind: "dietary-rule", id: "vegetarian", label: "Vejetaryen", resolutionStatus: "resolved" }];
  runner.tx.memoryFacts = [
    { id: "f1", userSubject: "u1", factText: "Kahvaltıda genelde yumurta tercih ediyor.", provenance: "ai-inferred", confidence: "medium", createdAt: "2026-09-01T00:00:00.000Z" },
  ];
  const context = await buildAiContext(routeContext(runner));
  assert.deepEqual(context.allergenLabels, ["Süt"]);
  assert.deepEqual(context.dietaryExclusionLabels, ["Vejetaryen"]);
  assert.equal(context.recentMemoryFacts.length, 1);

  const prompt = renderSystemPrompt(context);
  assert.match(prompt, /Süt/);
  assert.match(prompt, /Vejetaryen/);
  assert.match(prompt, /Kahvaltıda genelde yumurta tercih ediyor\./);
});

test("renderSystemPrompt never embeds a specific number even when a goal and consumption exist", async () => {
  const runner = new FakeRunner();
  const goal: StoredGoalVersion = {
    id: "g1", userSubject: "u1", source: "arven-calculated", calculatorId: "mifflin-st-jeor@v1",
    calculatorInputsJson: "{}", referenceSnapshotsJson: "[]",
    energyKcal: 2000, proteinG: 120, carbsG: 220, fatG: 70, fiberG: 30, waterMl: 2000,
    mealAllocationsJson: "[]", createdAt: "2026-08-01T00:00:00.000Z",
  };
  runner.tx.goals.set(goal.id, goal);
  runner.tx.currentGoalId = goal.id;
  runner.tx.events.set("m1", {
    id: "m1", userSubject: "u1", eventType: "meal-log", occurredAt: "2026-09-04T12:00:00.000Z", localDate: "2026-09-04",
    payloadJson: JSON.stringify({ schemaVersion: "MealEventV1", mealType: "lunch", items: [{ foodVersionId: "f1", nutrition: { energyKcal: 800, proteinG: 40, carbsG: 90, fatG: 20 } }] }),
    createdAt: "2026-09-04T12:00:00.000Z",
  });

  const context = await buildAiContext(routeContext(runner));
  assert.equal(context.hasGoal, true);
  assert.ok(context.remainingToday, "remainingToday should be computed once a goal exists");

  const prompt = renderSystemPrompt(context);
  assert.equal(/\d/.test(prompt), false, `system prompt must not contain any digit, got: ${prompt}`);
});
