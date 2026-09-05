import assert from "node:assert/strict";
import test from "node:test";
import { assertNoMedicalOverreach, type AllergenSafetyExclusion, type DietarySafetyExclusion } from "../lib/health-safety/policy";
import { remainingTargets } from "../lib/nutrition/calculations";
import { resolvePortionSelection } from "../lib/nutrition/portions";
import type { Food } from "../lib/nutrition/types";
import {
  V1MutationService,
  type AuthenticatedUserContext,
  type ScientificReferenceSnapshot,
  type StoredAssessmentSnapshot,
  type StoredDecision,
  type StoredGoalVersion,
  type StoredNutritionEvent,
  type StoredOutcome,
  type StoredProfile,
  type StoredProposal,
  type StoredSafetyAcknowledgement,
  type V1Transaction,
  type V1TransactionRunner,
  type VersionedFood,
} from "../lib/persistence/v1-boundary";

test("health boundary blocks diagnostic inference but allows ordinary preparation", () => {
  for (const unsafe of [
    "Bu belirtiler diyabete işaret ediyor.",
    "Bu durum kanseri düşündürüyor.",
  ]) assert.throws(() => assertNoMedicalOverreach(unsafe), /non-diagnostic/, unsafe);

  for (const safe of [
    "Ocaktan al.",
    "Pişirmeye başla.",
    "Karışımı dinlenmeye bırak.",
  ]) assert.doesNotThrow(() => assertNoMedicalOverreach(safe), safe);
});

test("household portions below storage precision are rejected before rounding", () => {
  const food: Food = {
    id: "tiny-food",
    name: "Tiny",
    basisGrams: 100,
    nutrition: { energyKcal: 100, proteinG: 1, carbsG: 1, fatG: 1 },
    source: { provider: "manual-verified", verifiedAt: "2026-09-03T00:00:00.000Z" },
    portionOptions: [{
      id: "p1",
      measure: "piece",
      label: "1 parça",
      gramsPerUnit: 5,
      source: { provider: "manual-verified", verifiedAt: "2026-09-03T00:00:00.000Z" },
    }],
  };
  assert.throws(() => resolvePortionSelection(food, {
    kind: "household",
    portionOptionId: "p1",
    quantity: 0.01,
  }), /below ARVEN's 0.1 g precision/);
});

test("empty-day coverage cannot accompany logged food consumption", () => {
  assert.throws(() => remainingTargets(
    { energyKcal: 2000, proteinG: 100, carbsG: 200, fatG: 70, fiberG: 30 },
    { energyKcal: 500, proteinG: 20, carbsG: 50, fatG: 10 },
    0,
    "empty-day",
  ), /empty-day coverage requires zero logged food consumption/);
});

class SafetyRaceTx implements V1Transaction {
  context: AuthenticatedUserContext = { timezone: "Europe/Istanbul", nutritionDayStartMinutes: 0 };
  allergens: AllergenSafetyExclusion[] = [];
  events = new Map<string, StoredNutritionEvent>();
  food: VersionedFood = {
    id: "milk-v1",
    foodKey: "milk",
    name: "Süt",
    basisGrams: 100,
    nutrition: { energyKcal: 60, proteinG: 3, carbsG: 5, fatG: 3 },
    source: { provider: "manual-verified", verifiedAt: "2026-09-03T00:00:00.000Z" },
    portionOptions: [{ id: "cup-v1", measure: "cup", label: "1 bardak", gramsPerUnit: 200, source: { provider: "manual-verified", verifiedAt: "2026-09-03T00:00:00.000Z" } }],
    allergenDataStatus: "verified",
    allergenIds: ["milk"],
    dietarySafetyDataStatus: "verified",
    dietaryConflictRuleIds: [],
  };
  async getUserContext(){ return this.context; }
  async getFoodVersion(){ this.allergens = [{ id: "milk", label: "Süt", resolutionStatus: "resolved" }]; return this.food; }
  async getActiveAllergenExclusions(){ return this.allergens; }
  async getActiveDietaryExclusions(): Promise<DietarySafetyExclusion[]>{ return []; }
  async insertNutritionEvent(event: StoredNutritionEvent){ this.events.set(event.id,event); }
  async insertNutritionEventWithOutcome(_e:StoredNutritionEvent,_o:StoredOutcome){ throw new Error("unused"); }
  async getProposal(): Promise<StoredProposal|null>{ return null; }
  async insertProposalIfAbsent(v:StoredProposal){ return v; }
  async getDecision(): Promise<StoredDecision|null>{ return null; }
  async insertDecision(_v:StoredDecision){ throw new Error("unused"); }
  async getOutcome(): Promise<StoredOutcome|null>{ return null; }
  async insertOutcome(_v:StoredOutcome){ throw new Error("unused"); }
  async getNutritionEvent(): Promise<StoredNutritionEvent|null>{ return null; }
  async getScientificReferenceSnapshots(): Promise<ScientificReferenceSnapshot[]>{ return []; }
  async insertGoalVersion(_g:StoredGoalVersion){ throw new Error("unused"); }
  async setCurrentGoal(){ throw new Error("unused"); }
  async insertGoalVersionAndSetCurrent(_g:StoredGoalVersion,_selectedAt:string){ throw new Error("unused"); }
  async purgeAuthenticatedUser(){ throw new Error("unused"); }
  async getOrCreateUser(): Promise<AuthenticatedUserContext>{ throw new Error("unused"); }
  async getProfile(): Promise<StoredProfile|null>{ return null; }
  async upsertProfile(_p:StoredProfile){ throw new Error("unused"); }
  async insertAssessmentSnapshot(_s:StoredAssessmentSnapshot){ throw new Error("unused"); }
  async getAssessmentSnapshots(): Promise<StoredAssessmentSnapshot[]>{ return []; }
  async insertSafetyAcknowledgement(_a:StoredSafetyAcknowledgement){ throw new Error("unused"); }
  async getSafetyAcknowledgements(): Promise<StoredSafetyAcknowledgement[]>{ return []; }
  async getCurrentGoalVersion(): Promise<StoredGoalVersion|null>{ return null; }
  async listNutritionEventsForLocalDate(): Promise<StoredNutritionEvent[]>{ return []; }
  async searchFoodVersions(): Promise<VersionedFood[]>{ return []; }
  async findFoodVersionByBarcode(): Promise<VersionedFood|null>{ return null; }
  async getFoodVersionByFoodKey(): Promise<VersionedFood|null>{ return null; }
  async importVerifiedFoodVersion(){ throw new Error("unused"); }
  async insertMealPlanVersionAndSetCurrent(){ throw new Error("unused"); }
  async getCurrentMealPlan(){ return null; }
  async deleteManualNutritionEvent(){ throw new Error("unused"); }
  async insertCustomFoodVersion(){ throw new Error("unused"); }
}
class SafetyRaceRunner implements V1TransactionRunner {
  constructor(readonly tx = new SafetyRaceTx()) {}
  async transaction<T>(work:(tx:V1Transaction)=>Promise<T>){ return work(this.tx); }
}

test("meal persistence reloads hard safety context after asynchronous food resolution", async () => {
  const runner = new SafetyRaceRunner();
  const service = new V1MutationService("user-1", runner, () => "event-1", { now: () => new Date("2026-09-03T00:00:00.000Z") });
  await assert.rejects(() => service.appendManualMeal({
    occurredAt: "2026-09-03T00:00:00.000Z",
    mealType: "breakfast",
    items: [{
      foodVersionId: "milk-v1",
      calculationVersion: "nutrition-v1",
      selection: { kind: "household", portionVersionId: "cup-v1", quantity: 1 },
    }],
  }), /Allergy conflict/);
  assert.equal(runner.tx.events.size, 0);
});
