import assert from "node:assert/strict";
import test from "node:test";
import { assertNoMedicalOverreach } from "@/lib/health-safety/policy";
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
} from "@/lib/persistence/v1-boundary";
import type { AllergenSafetyExclusion, DietarySafetyExclusion } from "@/lib/health-safety/policy";

class Tx implements V1Transaction {
  context: AuthenticatedUserContext = { timezone: "Europe/Istanbul", nutritionDayStartMinutes: 0 };
  proposals = new Map<string, StoredProposal>();
  decisions = new Map<string, StoredDecision>();
  outcomes = new Map<string, StoredOutcome>();
  events = new Map<string, StoredNutritionEvent>();
  users = new Map<string, AuthenticatedUserContext>();
  profiles = new Map<string, StoredProfile>();
  assessments = new Map<string, StoredAssessmentSnapshot>();
  acknowledgements = new Map<string, StoredSafetyAcknowledgement>();
  failAfterOutcomeInsert = false;

  async getUserContext(){ return this.context; }
  async getOrCreateUser(subject:string,defaults:{timezone:string;locale:string}){ let u=this.users.get(subject); if(!u){ u={timezone:defaults.timezone,nutritionDayStartMinutes:0}; this.users.set(subject,u); } return u; }
  async getProfile(subject:string){ return this.profiles.get(subject)??null; }
  async upsertProfile(profile:StoredProfile){ this.profiles.set(profile.userSubject,profile); }
  async insertAssessmentSnapshot(snapshot:StoredAssessmentSnapshot){ this.assessments.set(snapshot.id,snapshot); }
  async getAssessmentSnapshots(subject:string){ return [...this.assessments.values()].filter(a=>a.userSubject===subject); }
  async insertSafetyAcknowledgement(ack:StoredSafetyAcknowledgement){ this.acknowledgements.set(ack.id,ack); }
  async getSafetyAcknowledgements(subject:string){ return [...this.acknowledgements.values()].filter(a=>a.userSubject===subject); }
  async getProposal(s:string,id:string){ const v=this.proposals.get(id); return v?.userSubject===s?v:null; }
  async insertProposalIfAbsent(v:StoredProposal){ const old=[...this.proposals.values()].find(p=>p.userSubject===v.userSubject&&p.idempotencyKey===v.idempotencyKey); if(old)return old; this.proposals.set(v.id,v); return v; }
  async getDecision(s:string,id:string){ const v=this.decisions.get(id); return v?.userSubject===s?v:null; }
  async insertDecision(v:StoredDecision){ this.decisions.set(v.actionId,v); }
  async getOutcome(s:string,id:string){ const v=this.outcomes.get(id); return v?.userSubject===s?v:null; }
  async insertOutcome(v:StoredOutcome){ this.outcomes.set(v.actionId,v); if(this.failAfterOutcomeInsert){ this.failAfterOutcomeInsert=false; throw new Error("simulated uniqueness race"); } }
  async getNutritionEvent(s:string,id:string){ const v=this.events.get(id); return v?.userSubject===s?v:null; }
  async insertNutritionEvent(v:StoredNutritionEvent){ this.events.set(v.id,v); }
  async insertNutritionEventWithOutcome(e:StoredNutritionEvent,o:StoredOutcome){ this.events.set(e.id,e); await this.insertOutcome(o); }
  async getFoodVersion(_s:string,_id:string):Promise<VersionedFood|null>{ return null; }
  async getActiveAllergenExclusions():Promise<AllergenSafetyExclusion[]>{ return []; }
  async getActiveDietaryExclusions():Promise<DietarySafetyExclusion[]>{ return []; }
  async getScientificReferenceSnapshots(_ids:string[]):Promise<ScientificReferenceSnapshot[]>{ return []; }
  async insertGoalVersion(_goal:StoredGoalVersion):Promise<void>{}
  async setCurrentGoal(_s:string,_id:string,_at:string):Promise<void>{}
  async insertGoalVersionAndSetCurrent(_goal:StoredGoalVersion,_selectedAt:string):Promise<void>{}
  async getCurrentGoalVersion():Promise<StoredGoalVersion|null>{ return null; }
  async listNutritionEventsForLocalDate():Promise<StoredNutritionEvent[]>{ return []; }
  async searchFoodVersions():Promise<VersionedFood[]>{ return []; }
  async findFoodVersionByBarcode():Promise<VersionedFood|null>{ return null; }
  async getFoodVersionByFoodKey():Promise<VersionedFood|null>{ return null; }
  async importVerifiedFoodVersion():Promise<void>{}
  async insertMealPlanVersionAndSetCurrent():Promise<void>{}
  async getCurrentMealPlan(){ return null; }
  async deleteManualNutritionEvent():Promise<void>{}
  async insertCustomFoodVersion():Promise<void>{}
  async purgeAuthenticatedUser(_s:string):Promise<void>{}
  async insertMemoryFact():Promise<void>{}
  async listMemoryFacts(){ return []; }
  async deleteMemoryFact():Promise<void>{}
  async insertWeeklyInsightSnapshot():Promise<void>{}
  async getLatestWeeklyInsightSnapshot(){ return null; }
}
class Runner implements V1TransactionRunner { constructor(readonly tx=new Tx()){} async transaction<T>(work:(tx:V1Transaction)=>Promise<T>){ return work(this.tx); } }
function ids(...values:string[]){ let i=0; return()=>values[i++]??`id-${i}`; }
const clock={now:()=>new Date("2026-09-03T06:00:00Z")};

test("English diagnostic grammar fails closed for unenumerated conditions",()=>{
  for(const message of ["You have heart disease.","It may be kidney disease.","You have lupus."]){
    assert.throws(()=>assertNoMedicalOverreach(message),/non-diagnostic/,message);
  }
  for(const message of ["You have a balanced plan.","This is a healthy meal."]){
    assert.doesNotThrow(()=>assertNoMedicalOverreach(message),message);
  }
});

test("confirmed apply verifies immutable proposal hash before parsing",async()=>{
  const r=new Runner();
  const s=new V1MutationService("u1",r,ids("action-1","event-1"),clock);
  const p=await s.createAiProposal("water-log",{schemaVersion:"WaterLogActionV1",occurredAt:"2026-09-03T06:00:00Z",milliliters:250},"hash-test");
  await s.decideAiAction(p.id,"confirmed");
  r.tx.proposals.set(p.id,{...p,payloadJson:JSON.stringify({schemaVersion:"WaterLogActionV1",occurredAt:"2026-09-03T06:00:00Z",milliliters:10000})});
  await assert.rejects(()=>s.applyConfirmedAiAction(p.id),/proposal-integrity-failed/);
  assert.equal(r.tx.events.size,0);
  assert.equal(r.tx.outcomes.get(p.id)?.outcome,"failed");
  assert.equal(r.tx.outcomes.get(p.id)?.failureCode,"proposal-integrity-failed");
});

test("duplicate confirmed-failure recording converges on immutable winner",async()=>{
  const r=new Runner();
  const s=new V1MutationService("u1",r,ids("action-1"),clock);
  const p=await s.createAiProposal("water-log",{schemaVersion:"WaterLogActionV1",occurredAt:"2026-09-03T06:00:00Z",milliliters:250},"failure-race");
  await s.decideAiAction(p.id,"confirmed");
  r.tx.failAfterOutcomeInsert=true;
  const outcome=await s.recordConfirmedFailure(p.id,"provider-failed");
  assert.equal(outcome.outcome,"failed");
  assert.equal(outcome.failureCode,"provider-failed");
  assert.equal(r.tx.outcomes.size,1);
});
