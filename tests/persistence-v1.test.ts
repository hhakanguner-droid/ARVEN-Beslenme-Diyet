import assert from "node:assert/strict";
import test from "node:test";
import type { AllergenSafetyExclusion, DietarySafetyExclusion } from "@/lib/health-safety/policy";
import { V1MutationService,deriveNutritionLocalDate,type AuthenticatedUserContext,type ScientificReferenceSnapshot,type StoredAssessmentSnapshot,type StoredBodyMeasurement,type StoredBodyPhotoSet,type StoredCustomFoodVersion,type StoredDecision,type StoredGoalVersion,type StoredLabDocument,type StoredLabResultEntry,type StoredMealPlanVersion,type StoredMemoryFact,type StoredNutritionEvent,type StoredOutcome,type StoredPantryItem,type StoredPhotoAsset,type StoredProfile,type StoredProgressMilestone,type StoredProgressReportExport,type StoredProposal,type StoredRecipe,type StoredSafetyAcknowledgement,type StoredShoppingListItem,type StoredSupplementRecord,type StoredVerifiedFoodImport,type StoredWeekPrepPreferences,type StoredWeekPrepStatus,type StoredWeeklyInsightSnapshot,type StoredWeeklyPlanVersion,type V1Transaction,type V1TransactionRunner,type VersionedFood } from "@/lib/persistence/v1-boundary";
class MemoryTx implements V1Transaction{
 context:AuthenticatedUserContext={timezone:"Europe/Istanbul",nutritionDayStartMinutes:0};proposals=new Map<string,StoredProposal>();decisions=new Map<string,StoredDecision>();outcomes=new Map<string,StoredOutcome>();events=new Map<string,StoredNutritionEvent>();foods=new Map<string,VersionedFood>();allergens:AllergenSafetyExclusion[]=[];exclusions:DietarySafetyExclusion[]=[];refs=new Map<string,ScientificReferenceSnapshot>();goals=new Map<string,StoredGoalVersion>();currentGoal:string|null=null;purgedSubjects:string[]=[];users=new Map<string,AuthenticatedUserContext>();profiles=new Map<string,StoredProfile>();assessments=new Map<string,StoredAssessmentSnapshot>();acknowledgements=new Map<string,StoredSafetyAcknowledgement>();mealPlans=new Map<string,StoredMealPlanVersion>();currentMealPlan:string|null=null;customFoods=new Map<string,StoredCustomFoodVersion>();memoryFacts=new Map<string,StoredMemoryFact>();weeklyInsights:StoredWeeklyInsightSnapshot[]=[];photoAssets=new Map<string,StoredPhotoAsset>();
 async insertPhotoAsset(asset:StoredPhotoAsset){this.photoAssets.set(asset.id,asset)}
 async getPhotoAsset(s:string,id:string){const v=this.photoAssets.get(id);return v?.userSubject===s?v:null}
 async listPhotoAssets(s:string){return [...this.photoAssets.values()].filter(p=>p.userSubject===s).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))}
 async deletePhotoAsset(s:string,id:string){const p=this.photoAssets.get(id);if(p&&p.userSubject===s)this.photoAssets.delete(id)}
 labDocuments=new Map<string,StoredLabDocument>();labResultEntries=new Map<string,StoredLabResultEntry>();supplementRecords=new Map<string,StoredSupplementRecord>();
 async insertLabDocument(doc:StoredLabDocument){this.labDocuments.set(doc.id,doc)}
 async getLabDocument(s:string,id:string){const v=this.labDocuments.get(id);return v?.userSubject===s?v:null}
 async listLabDocuments(s:string){return [...this.labDocuments.values()].filter(d=>d.userSubject===s).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))}
 async deleteLabDocument(s:string,id:string){const d=this.labDocuments.get(id);if(d&&d.userSubject===s)this.labDocuments.delete(id)}
 async insertLabResultEntry(entry:StoredLabResultEntry){this.labResultEntries.set(entry.id,entry)}
 async listLabResultEntries(s:string){return [...this.labResultEntries.values()].filter(e=>e.userSubject===s).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))}
 async confirmLabResultEntry(s:string,id:string,edited:{markerName:string;valueText:string;unitText:string|null;referenceRangeText:string|null}){
   const existing=this.labResultEntries.get(id);
   if(!existing||existing.userSubject!==s) throw new Error("Lab result entry not found");
   const updated:StoredLabResultEntry={...existing,...edited,status:"confirmed"};
   this.labResultEntries.set(id,updated);
   return updated;
 }
 async deleteLabResultEntry(s:string,id:string){const e=this.labResultEntries.get(id);if(e&&e.userSubject===s)this.labResultEntries.delete(id)}
 async insertSupplementRecord(record:StoredSupplementRecord){this.supplementRecords.set(record.id,record)}
 async listSupplementRecords(s:string){return [...this.supplementRecords.values()].filter(r=>r.userSubject===s).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))}
 async setSupplementRecordActive(s:string,id:string,isActive:boolean){
   const existing=this.supplementRecords.get(id);
   if(!existing||existing.userSubject!==s) throw new Error("Supplement record not found");
   this.supplementRecords.set(id,{...existing,isActive});
 }
 async deleteSupplementRecord(s:string,id:string){const r=this.supplementRecords.get(id);if(r&&r.userSubject===s)this.supplementRecords.delete(id)}
 async insertMemoryFact(fact:StoredMemoryFact){this.memoryFacts.set(fact.id,fact)}
 async listMemoryFacts(s:string){return [...this.memoryFacts.values()].filter(f=>f.userSubject===s).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))}
 async deleteMemoryFact(s:string,id:string){const f=this.memoryFacts.get(id);if(f&&f.userSubject===s)this.memoryFacts.delete(id)}
 async insertWeeklyInsightSnapshot(snapshot:StoredWeeklyInsightSnapshot){this.weeklyInsights.push(snapshot)}
 async getLatestWeeklyInsightSnapshot(s:string,weekStartLocalDate:string){return [...this.weeklyInsights].filter(w=>w.userSubject===s&&w.weekStartLocalDate===weekStartLocalDate).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0]??null}
 async getCurrentGoalVersion(_s:string){return this.currentGoal?this.goals.get(this.currentGoal)??null:null}
 async listNutritionEventsForLocalDate(s:string,localDate:string){return [...this.events.values()].filter(e=>e.userSubject===s&&e.localDate===localDate)}
 async searchFoodVersions(_s:string,query:string,limit:number){const q=query.trim().toLocaleLowerCase("tr-TR");return [...this.foods.values()].filter(f=>f.name.toLocaleLowerCase("tr-TR").includes(q)).slice(0,limit)}
 async findFoodVersionByBarcode(_s:string,barcode:string){return [...this.foods.values()].find(f=>f.barcode===barcode)??null}
 async getFoodVersionByFoodKey(_s:string,foodKey:string){return [...this.foods.values()].find(f=>f.foodKey===foodKey)??null}
 async importVerifiedFoodVersion(food:StoredVerifiedFoodImport){this.foods.set(food.id,{id:food.id,foodKey:food.foodKey,name:food.name,brand:food.brand??undefined,barcode:food.barcode??undefined,isLiquid:food.isLiquid,basisGrams:100,nutrition:{energyKcal:food.energyKcal,proteinG:food.proteinG,carbsG:food.carbsG,fatG:food.fatG,fiberG:food.fiberG??undefined},source:{provider:food.sourceProvider,externalId:food.sourceExternalId,verifiedAt:food.verifiedAt,evidenceUrl:food.sourceEvidenceUrl??undefined},allergenIds:[],allergenDataStatus:"unknown",dietaryConflictRuleIds:[],dietarySafetyDataStatus:"unknown",portionOptions:[]})}
 async insertMealPlanVersionAndSetCurrent(plan:StoredMealPlanVersion,_selectedAt:string){this.mealPlans.set(plan.id,plan);this.currentMealPlan=plan.id}
 async getCurrentMealPlan(_s:string){return this.currentMealPlan?this.mealPlans.get(this.currentMealPlan)??null:null}
 async deleteManualNutritionEvent(s:string,id:string){const v=this.events.get(id);if(!v||v.userSubject!==s)throw new Error("Nutrition event not found");if([...this.outcomes.values()].some(o=>o.resultEventId===id))throw new Error("Cannot delete a nutrition event created by a confirmed AI action");this.events.delete(id)}
 async insertCustomFoodVersion(food:StoredCustomFoodVersion){this.customFoods.set(food.id,food);this.foods.set(food.id,{id:food.id,foodKey:food.foodKey,name:food.name,isLiquid:food.isLiquid,basisGrams:100,nutrition:{energyKcal:food.energyKcal,proteinG:food.proteinG,carbsG:food.carbsG,fatG:food.fatG,fiberG:food.fiberG??undefined},source:{provider:"manual-verified",verifiedAt:food.verifiedAt},allergenIds:food.allergenIds,allergenDataStatus:food.allergenDataStatus,dietaryConflictRuleIds:food.dietaryConflictRuleIds,dietarySafetyDataStatus:food.dietarySafetyDataStatus,portionOptions:food.portions.map(p=>({id:p.id,measure:p.measure as never,label:p.label,gramsPerUnit:p.gramsPerUnit,source:{provider:"manual-verified",verifiedAt:food.verifiedAt}}))})}
 async getUserContext(){return this.context} async getProposal(s:string,id:string){const v=this.proposals.get(id);return v?.userSubject===s?v:null} async insertProposalIfAbsent(v:StoredProposal){const old=[...this.proposals.values()].find(p=>p.userSubject===v.userSubject&&p.idempotencyKey===v.idempotencyKey);if(old)return old;this.proposals.set(v.id,v);return v} async getDecision(s:string,id:string){const v=this.decisions.get(id);return v?.userSubject===s?v:null} async insertDecision(v:StoredDecision){this.decisions.set(v.actionId,v)} async getOutcome(s:string,id:string){const v=this.outcomes.get(id);return v?.userSubject===s?v:null} async insertOutcome(v:StoredOutcome){if(this.outcomes.has(v.actionId))throw new Error("duplicate outcome");this.outcomes.set(v.actionId,v)} async getNutritionEvent(s:string,id:string){const v=this.events.get(id);return v?.userSubject===s?v:null} async insertNutritionEvent(v:StoredNutritionEvent){this.events.set(v.id,v)} async insertNutritionEventWithOutcome(e:StoredNutritionEvent,o:StoredOutcome){this.events.set(e.id,e);await this.insertOutcome(o)} async getFoodVersion(_s:string,id:string){return this.foods.get(id)??null} async getActiveAllergenExclusions(){return this.allergens} async getActiveDietaryExclusions(){return this.exclusions} async getScientificReferenceSnapshots(ids:string[]){return ids.flatMap(id=>this.refs.get(id)??[])} async insertGoalVersion(g:StoredGoalVersion){this.goals.set(g.id,g)} async setCurrentGoal(_s:string,id:string){this.currentGoal=id} async insertGoalVersionAndSetCurrent(g:StoredGoalVersion,_at:string){this.goals.set(g.id,g);this.currentGoal=g.id} async purgeAuthenticatedUser(subject:string){this.purgedSubjects.push(subject);for(const [id,v] of this.outcomes)if(v.userSubject===subject)this.outcomes.delete(id);for(const [id,v] of this.decisions)if(v.userSubject===subject)this.decisions.delete(id);for(const [id,v] of this.proposals)if(v.userSubject===subject)this.proposals.delete(id);for(const [id,v] of this.events)if(v.userSubject===subject)this.events.delete(id);for(const [id,v] of this.goals)if(v.userSubject===subject)this.goals.delete(id);this.currentGoal=null;this.users.delete(subject);this.profiles.delete(subject);for(const [id,v] of this.assessments)if(v.userSubject===subject)this.assessments.delete(id);for(const [id,v] of this.acknowledgements)if(v.userSubject===subject)this.acknowledgements.delete(id)}
 async getOrCreateUser(subject:string,defaults:{timezone:string;locale:string}){let u=this.users.get(subject);if(!u){u={timezone:defaults.timezone,nutritionDayStartMinutes:0};this.users.set(subject,u)}return u}
 async getProfile(subject:string){return this.profiles.get(subject)??null}
 async upsertProfile(profile:StoredProfile){this.profiles.set(profile.userSubject,profile)}
 async insertAssessmentSnapshot(snapshot:StoredAssessmentSnapshot){this.assessments.set(snapshot.id,snapshot)}
 async getAssessmentSnapshots(subject:string){return [...this.assessments.values()].filter(a=>a.userSubject===subject)}
 async insertSafetyAcknowledgement(ack:StoredSafetyAcknowledgement){this.acknowledgements.set(ack.id,ack)}
 async getSafetyAcknowledgements(subject:string){return [...this.acknowledgements.values()].filter(a=>a.userSubject===subject)}
 recipes=new Map<string,StoredRecipe>();weeklyPlans=new Map<string,StoredWeeklyPlanVersion>();currentWeeklyPlans=new Map<string,string>();pantryItems=new Map<string,StoredPantryItem>();shoppingListItems=new Map<string,StoredShoppingListItem>();weekPrepPreferences=new Map<string,StoredWeekPrepPreferences>();weekPrepStatuses=new Map<string,StoredWeekPrepStatus>();
 async insertRecipe(recipe:StoredRecipe){this.recipes.set(recipe.id,recipe)}
 async listRecipes(s:string){return [...this.recipes.values()].filter(r=>r.userSubject===s).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))}
 async getRecipe(s:string,id:string){const v=this.recipes.get(id);return v?.userSubject===s?v:null}
 async deleteRecipe(s:string,id:string){const v=this.recipes.get(id);if(v&&v.userSubject===s)this.recipes.delete(id)}
 async insertWeeklyPlanVersionAndSetCurrent(plan:StoredWeeklyPlanVersion,_selectedAt:string){this.weeklyPlans.set(plan.id,plan);this.currentWeeklyPlans.set(`${plan.userSubject}:${plan.weekStartLocalDate}`,plan.id)}
 async getCurrentWeeklyPlan(s:string,weekStartLocalDate:string){const id=this.currentWeeklyPlans.get(`${s}:${weekStartLocalDate}`);return id?this.weeklyPlans.get(id)??null:null}
 async insertPantryItem(item:StoredPantryItem){this.pantryItems.set(item.id,item)}
 async listPantryItems(s:string){return [...this.pantryItems.values()].filter(i=>i.userSubject===s).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))}
 async updatePantryItem(s:string,id:string,edit:{quantityGrams:number|null;quantityNote:string|null}){const existing=this.pantryItems.get(id);if(!existing||existing.userSubject!==s)throw new Error("Pantry item not found");const updated={...existing,...edit,updatedAt:new Date().toISOString()};this.pantryItems.set(id,updated);return updated}
 async deletePantryItem(s:string,id:string){const v=this.pantryItems.get(id);if(v&&v.userSubject===s)this.pantryItems.delete(id)}
 async replaceShoppingListItems(s:string,weekStartLocalDate:string,items:StoredShoppingListItem[]){for(const [id,v] of this.shoppingListItems)if(v.userSubject===s&&v.weekStartLocalDate===weekStartLocalDate)this.shoppingListItems.delete(id);for(const item of items)this.shoppingListItems.set(item.id,item)}
 async listShoppingListItems(s:string,weekStartLocalDate:string){return [...this.shoppingListItems.values()].filter(i=>i.userSubject===s&&i.weekStartLocalDate===weekStartLocalDate).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))}
 async setShoppingListItemChecked(s:string,id:string,isChecked:boolean){const existing=this.shoppingListItems.get(id);if(!existing||existing.userSubject!==s)throw new Error("Shopping list item not found");this.shoppingListItems.set(id,{...existing,isChecked})}
 async getWeekPrepPreferences(s:string){return this.weekPrepPreferences.get(s)??null}
 async upsertWeekPrepPreferences(preferences:StoredWeekPrepPreferences){this.weekPrepPreferences.set(preferences.userSubject,preferences)}
 async getWeekPrepStatus(s:string,weekStartLocalDate:string){return this.weekPrepStatuses.get(`${s}:${weekStartLocalDate}`)??null}
 async upsertWeekPrepStatus(status:StoredWeekPrepStatus){this.weekPrepStatuses.set(`${status.userSubject}:${status.weekStartLocalDate}`,status)}
 bodyMeasurements=new Map<string,StoredBodyMeasurement>();bodyPhotoSets=new Map<string,StoredBodyPhotoSet>();progressMilestones=new Map<string,StoredProgressMilestone>();progressReportExports=new Map<string,StoredProgressReportExport>();
 async insertBodyMeasurement(measurement:StoredBodyMeasurement){this.bodyMeasurements.set(measurement.id,measurement)}
 async listBodyMeasurements(s:string){return [...this.bodyMeasurements.values()].filter(m=>m.userSubject===s)}
 async deleteBodyMeasurement(s:string,id:string){const v=this.bodyMeasurements.get(id);if(v&&v.userSubject===s)this.bodyMeasurements.delete(id)}
 async insertBodyPhotoSet(photo:StoredBodyPhotoSet){this.bodyPhotoSets.set(photo.id,photo)}
 async getBodyPhotoSet(s:string,id:string){const v=this.bodyPhotoSets.get(id);return v?.userSubject===s?v:null}
 async listBodyPhotoSets(s:string){return [...this.bodyPhotoSets.values()].filter(p=>p.userSubject===s).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))}
 async deleteBodyPhotoSet(s:string,id:string){const v=this.bodyPhotoSets.get(id);if(v&&v.userSubject===s)this.bodyPhotoSets.delete(id)}
 async hasProgressMilestone(s:string,milestoneKey:string){return [...this.progressMilestones.values()].some(m=>m.userSubject===s&&m.milestoneKey===milestoneKey)}
 async insertProgressMilestone(milestone:StoredProgressMilestone){this.progressMilestones.set(milestone.id,milestone)}
 async listProgressMilestones(s:string){return [...this.progressMilestones.values()].filter(m=>m.userSubject===s).sort((a,b)=>b.achievedAt.localeCompare(a.achievedAt))}
 async insertProgressReportExport(report:StoredProgressReportExport){this.progressReportExports.set(report.id,report)}
 async getProgressReportExport(s:string,id:string){const v=this.progressReportExports.get(id);return v?.userSubject===s?v:null}
 async listProgressReportExports(s:string){return [...this.progressReportExports.values()].filter(r=>r.userSubject===s).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))}
 async deleteProgressReportExport(s:string,id:string){const v=this.progressReportExports.get(id);if(v&&v.userSubject===s)this.progressReportExports.delete(id)}
}
class MemoryRunner implements V1TransactionRunner{constructor(readonly tx=new MemoryTx()){} async transaction<T>(work:(tx:V1Transaction)=>Promise<T>){return work(this.tx)}}
class OutcomeRaceTx extends MemoryTx{
 raced=false;
 override async insertOutcome(v:StoredOutcome){
  if(!this.raced&&v.outcome==="applied"&&v.resultEventId){
   this.raced=true;
   this.events.delete(v.resultEventId);
   const winner:StoredNutritionEvent={id:"event-winner",userSubject:v.userSubject,eventType:v.actionType,occurredAt:"2026-09-02T20:00:00Z",localDate:"2026-09-02",payloadJson:"{}",createdAt:v.recordedAt};
   this.events.set(winner.id,winner);
   this.outcomes.set(v.actionId,{...v,resultEventId:winner.id});
   throw new Error("duplicate outcome");
  }
  return super.insertOutcome(v);
 }
}
class OutcomeRaceRunner implements V1TransactionRunner{readonly tx=new OutcomeRaceTx();async transaction<T>(work:(tx:V1Transaction)=>Promise<T>){return work(this.tx)}}
function ids(...values:string[]){let i=0;return()=>values[i++]??`id-${i}`}
function food():VersionedFood{return{id:"food-v1",foodKey:"yogurt",name:"Yoğurt",basisGrams:100,nutrition:{energyKcal:60,proteinG:4,carbsG:5,fatG:3,fiberG:0},source:{provider:"manual-verified",verifiedAt:"2026-09-02T20:00:00Z"},portionOptions:[{id:"portion-v1",measure:"serving",label:"1 porsiyon",gramsPerUnit:150,source:{provider:"manual-verified",verifiedAt:"2026-09-02T20:00:00Z"}}],allergenDataStatus:"verified",allergenIds:[],dietarySafetyDataStatus:"verified",dietaryConflictRuleIds:[]}}
test("nutrition date uses authenticated Istanbul local day instead of UTC date",()=>assert.equal(deriveNutritionLocalDate("2026-09-02T22:30:00Z","Europe/Istanbul",0),"2026-09-03"));
test("nutrition-day boundary can move early local hours to previous date",()=>assert.equal(deriveNutritionLocalDate("2026-09-02T23:30:00Z","Europe/Istanbul",180),"2026-09-02"));
test("AI application requires confirmation and retry returns one terminal result",async()=>{const r=new MemoryRunner();const s=new V1MutationService("u1",r,ids("action-1","event-1"),{now:()=>new Date("2026-09-02T20:00:00Z")});const p=await s.createAiProposal("water-log",{schemaVersion:"WaterLogActionV1",occurredAt:"2026-09-02T20:00:00Z",milliliters:250},"k1");await assert.rejects(()=>s.applyConfirmedAiAction(p.id),/Explicit confirmation/);await s.decideAiAction(p.id,"confirmed");const a=await s.applyConfirmedAiAction(p.id);const retry=await s.applyConfirmedAiAction(p.id);assert.equal(a.id,"event-1");assert.equal(retry.id,a.id);assert.equal(r.tx.events.size,1);assert.equal(r.tx.outcomes.size,1)});
test("concurrent confirmed application recovers the winning terminal event",async()=>{const r=new OutcomeRaceRunner();const s=new V1MutationService("u1",r,ids("action-1","event-loser"),{now:()=>new Date("2026-09-02T20:00:00Z")});const p=await s.createAiProposal("water-log",{schemaVersion:"WaterLogActionV1",occurredAt:"2026-09-02T20:00:00Z",milliliters:250},"race");await s.decideAiAction(p.id,"confirmed");const event=await s.applyConfirmedAiAction(p.id);assert.equal(event.id,"event-winner");assert.equal(r.tx.events.size,1);assert.equal(r.tx.outcomes.get(p.id)?.resultEventId,"event-winner")});
test("idempotency key cannot be rebound",async()=>{const r=new MemoryRunner();const s=new V1MutationService("u1",r,ids("a","b"),{now:()=>new Date("2026-09-02T20:00:00Z")});await s.createAiProposal("water-log",{schemaVersion:"WaterLogActionV1",occurredAt:"2026-09-02T20:00:00Z",milliliters:250},"same");await assert.rejects(()=>s.createAiProposal("water-log",{schemaVersion:"WaterLogActionV1",occurredAt:"2026-09-02T20:00:00Z",milliliters:500},"same"),/different immutable proposal/)});
test("concurrent identical proposal creation converges on one immutable proposal",async()=>{const r=new MemoryRunner();const s=new V1MutationService("u1",r,ids("a","b"),{now:()=>new Date("2026-09-02T20:00:00Z")});const input={schemaVersion:"WaterLogActionV1" as const,occurredAt:"2026-09-02T20:00:00Z",milliliters:250};const [a,b]=await Promise.all([s.createAiProposal("water-log",input,"same"),s.createAiProposal("water-log",input,"same")]);assert.equal(a.id,b.id);assert.equal(r.tx.proposals.size,1)});
test("failed confirmed action is structurally terminal in service",async()=>{const r=new MemoryRunner();const s=new V1MutationService("u1",r,ids("a"),{now:()=>new Date("2026-09-02T20:00:00Z")});const p=await s.createAiProposal("water-log",{schemaVersion:"WaterLogActionV1",occurredAt:"2026-09-02T20:00:00Z",milliliters:250},"k");await s.decideAiAction(p.id,"confirmed");await s.recordConfirmedFailure(p.id,"provider");await assert.rejects(()=>s.applyConfirmedAiAction(p.id),/cannot later be applied/);assert.equal(r.tx.events.size,0)});
test("meal apply rechecks authenticated allergy context and commits a terminal failed outcome",async()=>{const r=new MemoryRunner();const f=food();f.allergenIds=["milk"];r.tx.foods.set(f.id,f);r.tx.allergens=[{id:"milk",label:"Süt",resolutionStatus:"resolved"}];const s=new V1MutationService("u1",r,ids("a","e"),{now:()=>new Date("2026-09-02T20:00:00Z")});const p=await s.createAiProposal("meal-log",{schemaVersion:"MealLogActionV1",occurredAt:"2026-09-02T20:00:00Z",mealType:"dinner",items:[{foodVersionId:"food-v1",calculationVersion:"nutrition-v1",selection:{kind:"household",portionVersionId:"portion-v1",quantity:1}}]},"m");await s.decideAiAction(p.id,"confirmed");await assert.rejects(()=>s.applyConfirmedAiAction(p.id),/failed permanently.*safety-conflict/);assert.equal(r.tx.events.size,0);assert.equal(r.tx.outcomes.get(p.id)?.outcome,"failed");assert.equal(r.tx.outcomes.get(p.id)?.failureCode,"safety-conflict");await assert.rejects(()=>s.applyConfirmedAiAction(p.id),/cannot later be applied/)});
test("unresolved active allergen exclusion cannot disappear behind a null target id",async()=>{const r=new MemoryRunner();const f=food();r.tx.foods.set(f.id,f);r.tx.allergens=[{id:null,label:"Aktif alerjen",resolutionStatus:"unresolved"}];const s=new V1MutationService("u1",r,ids("e"),{now:()=>new Date("2026-09-02T20:00:00Z")});await assert.rejects(()=>s.appendManualMeal({occurredAt:"2026-09-02T20:00:00Z",mealType:"dinner",items:[{foodVersionId:"food-v1",calculationVersion:"nutrition-v1",selection:{kind:"household",portionVersionId:"portion-v1",quantity:1}}]}),/active allergen unresolved/);assert.equal(r.tx.events.size,0)});
test("food exclusions bind to stable food identity across corrected versions",async()=>{const r=new MemoryRunner();const f=food();f.id="food-v2";f.portionOptions=[{...f.portionOptions![0]!,id:"portion-v2"}];r.tx.foods.set(f.id,f);r.tx.exclusions=[{kind:"food",id:"yogurt",label:"Yoğurt",resolutionStatus:"resolved"}];const s=new V1MutationService("u1",r,ids("e"),{now:()=>new Date("2026-09-02T20:00:00Z")});await assert.rejects(()=>s.appendManualMeal({occurredAt:"2026-09-02T20:00:00Z",mealType:"dinner",items:[{foodVersionId:"food-v2",calculationVersion:"nutrition-v1",selection:{kind:"household",portionVersionId:"portion-v2",quantity:1}}]}),/Dietary safety conflict/);assert.equal(r.tx.events.size,0)});
test("canonical event JSON omits undefined optional nutrition properties",async()=>{const r=new MemoryRunner();const f=food();delete f.nutrition.fiberG;r.tx.foods.set(f.id,f);const s=new V1MutationService("u1",r,ids("event-1"),{now:()=>new Date("2026-09-02T20:00:00Z")});const e=await s.appendManualMeal({occurredAt:"2026-09-02T20:00:00Z",mealType:"dinner",items:[{foodVersionId:"food-v1",calculationVersion:"nutrition-v1",selection:{kind:"household",portionVersionId:"portion-v1",quantity:1}}]});const payload=JSON.parse(e.payloadJson);assert.equal("fiberG" in payload.items[0].nutrition,false)});
test("malformed immutable stored payload becomes one terminal failed outcome",async()=>{const r=new MemoryRunner();const s=new V1MutationService("u1",r,ids("a"),{now:()=>new Date("2026-09-02T20:00:00Z")});const p=await s.createAiProposal("water-log",{schemaVersion:"WaterLogActionV1",occurredAt:"2026-09-02T20:00:00Z",milliliters:250},"corrupt");await s.decideAiAction(p.id,"confirmed");r.tx.proposals.set(p.id,{...p,payloadJson:"{"});await assert.rejects(()=>s.applyConfirmedAiAction(p.id),/invalid-stored-payload/);assert.equal(r.tx.outcomes.get(p.id)?.outcome,"failed");assert.equal(r.tx.events.size,0)});
test("AI meal schema rejects custom grams, unsupported calculation version, and unrepresentable household quantities",async()=>{const s=new V1MutationService("u1",new MemoryRunner(),ids("a"));await assert.rejects(()=>s.createAiProposal("meal-log",{schemaVersion:"MealLogActionV1",occurredAt:"2026-09-02T20:00:00Z",mealType:"lunch",items:[{foodVersionId:"food-v1",calculationVersion:"bogus-v99",selection:{kind:"custom-grams",grams:100}}]},"bad"));await assert.rejects(()=>s.createAiProposal("meal-log",{schemaVersion:"MealLogActionV1",occurredAt:"2026-09-02T20:00:00Z",mealType:"lunch",items:[{foodVersionId:"food-v1",calculationVersion:"nutrition-v1",selection:{kind:"household",portionVersionId:"portion-v1",quantity:0.004}}]},"tiny"),/two decimal places|greater than or equal/)});
test("calculated goals are derived server-side and snapshot exact scientific evidence",async()=>{const r=new MemoryRunner();r.tx.refs.set("ref-v1",{id:"ref-v1",title:"Protein reference",citation:"Reference citation"});const s=new V1MutationService("u1",r,ids("goal-1"),{now:()=>new Date("2026-09-02T20:00:00Z")});const g=await s.createCalculatedGoalVersion({weightKg:80,heightCm:180,ageYears:40,sexAtBirth:"male",activityFactor:1.4,energyAdjustmentKcal:0,proteinGPerKg:1.6,fatEnergyPct:0.3,waterMlPerKg:35},["ref-v1"],[{mealType:"breakfast",energyShareBps:3000},{mealType:"lunch",energyShareBps:3500},{mealType:"dinner",energyShareBps:3500}]);assert.equal(r.tx.currentGoal,"goal-1");assert.equal(JSON.parse(g.referenceSnapshotsJson)[0].id,"ref-v1");assert.ok(g.energyKcal>0)});
test("calculated goal snapshots caller inputs before asynchronous reference lookup",async()=>{const r=new MemoryRunner();r.tx.refs.set("ref-v1",{id:"ref-v1",title:"Ref",citation:"Citation"});const s=new V1MutationService("u1",r,ids("goal-1"),{now:()=>new Date("2026-09-02T20:00:00Z")});const inputs={weightKg:80,heightCm:180,ageYears:40,sexAtBirth:"male" as const,activityFactor:1.4,energyAdjustmentKcal:0,proteinGPerKg:1.6,fatEnergyPct:0.3,waterMlPerKg:35};const allocations=[{mealType:"dinner" as const,energyShareBps:10000}];const promise=s.createCalculatedGoalVersion(inputs,["ref-v1"],allocations);inputs.weightKg=120;allocations[0]!.energyShareBps=5000;const g=await promise;assert.equal(JSON.parse(g.calculatorInputsJson).weightKg,80);assert.equal(JSON.parse(g.mealAllocationsJson)[0].energyShareBps,10000)});
test("calculated goal refuses unresolved scientific evidence",async()=>{const s=new V1MutationService("u1",new MemoryRunner(),ids("g"));await assert.rejects(()=>s.createCalculatedGoalVersion({weightKg:80,heightCm:180,ageYears:40,sexAtBirth:"male",activityFactor:1.4,energyAdjustmentKcal:0,proteinGPerKg:1.6,fatEnergyPct:0.3,waterMlPerKg:35},["missing"],[{mealType:"dinner",energyShareBps:10000}]),/Every scientific reference/)});
test("account deletion is routed through one authenticated transactional purge primitive",async()=>{const r=new MemoryRunner();const s=new V1MutationService("u1",r);await s.deleteAccount();assert.deepEqual(r.tx.purgedSubjects,["u1"])});
test("get-or-create user is idempotent and does not reset an already-customized timezone",async()=>{const r=new MemoryRunner();const s=new V1MutationService("u1",r);const first=await s.getOrCreateAuthenticatedUser({timezone:"Europe/Istanbul",locale:"tr-TR"});r.tx.users.set("u1",{...first,timezone:"America/New_York"});const second=await s.getOrCreateAuthenticatedUser({timezone:"Europe/Istanbul",locale:"tr-TR"});assert.equal(second.timezone,"America/New_York")});
test("profile upsert overwrites the previous row instead of appending",async()=>{const r=new MemoryRunner();const s=new V1MutationService("u1",r,ids("p1"),{now:()=>new Date("2026-09-02T20:00:00Z")});await s.upsertProfile({schemaVersion:"ProfileUpsertV1",displayName:"Ayşe",birthDate:"1990-05-01",sexAtBirth:"female",heightCm:165,activityLevel:"light"});await s.upsertProfile({schemaVersion:"ProfileUpsertV1",displayName:"Ayşe Yılmaz",birthDate:"1990-05-01",sexAtBirth:"female",heightCm:165,activityLevel:"active"});assert.equal(r.tx.profiles.size,1);assert.equal(r.tx.profiles.get("u1")?.displayName,"Ayşe Yılmaz");assert.equal(r.tx.profiles.get("u1")?.activityLevel,"active")});
test("profile upsert rejects malformed input",async()=>{const s=new V1MutationService("u1",new MemoryRunner());await assert.rejects(()=>s.upsertProfile({schemaVersion:"ProfileUpsertV1",displayName:null,birthDate:null,sexAtBirth:"other",heightCm:null,activityLevel:null}));await assert.rejects(()=>s.upsertProfile({schemaVersion:"ProfileUpsertV1",displayName:null,birthDate:"2026-13-40",sexAtBirth:null,heightCm:null,activityLevel:null}))});
test("assessment snapshots and safety acknowledgements accumulate as append-only history",async()=>{const r=new MemoryRunner();const s=new V1MutationService("u1",r,ids("a1","a2","ack1"),{now:()=>new Date("2026-09-02T20:00:00Z")});await s.recordAssessmentSnapshot({schemaVersion:"AssessmentSnapshotPayloadV1",answers:{goalIntent:"maintain"}});await s.recordAssessmentSnapshot({schemaVersion:"AssessmentSnapshotPayloadV1",answers:{goalIntent:"lose-weight"}});assert.equal(r.tx.assessments.size,2);await s.recordSafetyAcknowledgement({schemaVersion:"SafetyAcknowledgementV1",acknowledgementType:"non-diagnostic-health-boundary",policyVersion:"v1"});assert.equal(r.tx.acknowledgements.size,1);assert.equal([...r.tx.acknowledgements.values()][0]?.acknowledgementType,"non-diagnostic-health-boundary")});
test("assessment snapshot rejects an empty answers bag",async()=>{const s=new V1MutationService("u1",new MemoryRunner());await assert.rejects(()=>s.recordAssessmentSnapshot({schemaVersion:"AssessmentSnapshotPayloadV1",answers:{}}))});
test("safety acknowledgement rejects an unknown type and a blank policy version",async()=>{const s=new V1MutationService("u1",new MemoryRunner());await assert.rejects(()=>s.recordSafetyAcknowledgement({schemaVersion:"SafetyAcknowledgementV1",acknowledgementType:"marketing",policyVersion:"v1"}));await assert.rejects(()=>s.recordSafetyAcknowledgement({schemaVersion:"SafetyAcknowledgementV1",acknowledgementType:"non-diagnostic-health-boundary",policyVersion:"   "}))});test("createMealPlanVersion resolves and safety-checks each slot's items, then getCurrentMealPlan returns the latest version",async()=>{const r=new MemoryRunner();r.tx.foods.set("food-v1",food());const s=new V1MutationService("u1",r,ids("plan-1"),{now:()=>new Date("2026-09-02T20:00:00Z")});assert.equal(await s.getCurrentMealPlan(),null);const plan=await s.createMealPlanVersion({schemaVersion:"MealPlanVersionV1",slots:[{mealType:"breakfast",items:[{foodVersionId:"food-v1",calculationVersion:"nutrition-v1",selection:{kind:"household",portionVersionId:"portion-v1",quantity:1}}]}]});const slots=JSON.parse(plan.slotsJson);assert.equal(slots[0].mealType,"breakfast");assert.equal(slots[0].items[0].foodName,"Yoğurt");const current=await s.getCurrentMealPlan();assert.equal(current?.id,plan.id)});
test("deleteManualNutritionEvent removes a manual entry but refuses one tied to a confirmed AI action",async()=>{const r=new MemoryRunner();const s=new V1MutationService("u1",r,ids("event-1"),{now:()=>new Date("2026-09-02T20:00:00Z")});const manual=await s.appendManualWater("2026-09-02T20:00:00Z",250);assert.equal(r.tx.events.size,1);await s.deleteManualNutritionEvent(manual.id);assert.equal(r.tx.events.size,0);await assert.rejects(()=>s.deleteManualNutritionEvent(manual.id),/not found/);r.tx.events.set("ai-event",{id:"ai-event",userSubject:"u1",eventType:"water-log",occurredAt:"2026-09-02T20:00:00Z",localDate:"2026-09-02",payloadJson:"{}",createdAt:"2026-09-02T20:00:00Z"});r.tx.outcomes.set("action-1",{actionId:"action-1",userSubject:"u1",actionType:"water-log",confirmationMarker:"confirmed",outcome:"applied",resultEventId:"ai-event",failureCode:null,recordedAt:"2026-09-02T20:00:00Z"});await assert.rejects(()=>s.deleteManualNutritionEvent("ai-event"),/Cannot delete/)});
test("createCustomFood stores a private owner-scoped food usable immediately",async()=>{const r=new MemoryRunner();const s=new V1MutationService("u1",r,ids("custom-1","portion-1"),{now:()=>new Date("2026-09-02T20:00:00Z")});const created=await s.createCustomFood({schemaVersion:"CustomFoodV1",name:"Ev yapımı köfte",energyKcal:250,proteinG:20,carbsG:5,fatG:15,portions:[{measure:"serving",label:"1 porsiyon",gramsPerUnit:120}]});assert.equal(created.name,"Ev yapımı köfte");assert.equal(r.tx.customFoods.size,1);assert.equal(created.portionOptions?.[0]?.gramsPerUnit,120)});
test("createRecipeFood sums verified ingredients into one new per-100g food, inheriting their allergen/dietary flags",async()=>{const r=new MemoryRunner();const f=food();f.allergenIds=["milk"];f.allergenDataStatus="verified";r.tx.foods.set(f.id,f);const s=new V1MutationService("u1",r,ids("recipe-1","portion-1"),{now:()=>new Date("2026-09-02T20:00:00Z")});const recipe=await s.createRecipeFood({schemaVersion:"RecipeFoodV1",name:"Yoğurtlu tarif",servings:3,ingredients:[{foodVersionId:"food-v1",calculationVersion:"nutrition-v1",selection:{kind:"household",portionVersionId:"portion-v1",quantity:2}}]});assert.ok(Math.abs(recipe.nutrition.energyKcal-60)<0.01);assert.deepEqual(recipe.allergenIds,["milk"]);assert.equal(recipe.portionOptions?.[0]?.gramsPerUnit,100)});
test("importVerifiedFood imports a new Open Food Facts product into the shared catalog",async()=>{const r=new MemoryRunner();const s=new V1MutationService("u1",r,ids("off-1"),{now:()=>new Date("2026-09-02T20:00:00Z")});const imported=await s.importVerifiedFood({schemaVersion:"VerifiedFoodImportV1",sourceProvider:"open-food-facts",sourceExternalId:"3017620422003",barcode:"3017620422003",name:"Nutella",brand:"Ferrero",energyKcal:539,proteinG:6.3,carbsG:57.5,fatG:30.9,fiberG:null,sourceEvidenceUrl:"https://world.openfoodfacts.org/x"});assert.equal(imported.name,"Nutella");assert.equal(imported.foodKey,"off-3017620422003");assert.equal(imported.source.provider,"open-food-facts");assert.equal(imported.source.externalId,"3017620422003");assert.equal(r.tx.foods.size,1)});
test("importVerifiedFood is idempotent: re-importing the same product returns the existing row instead of duplicating it",async()=>{const r=new MemoryRunner();const s=new V1MutationService("u1",r,ids("off-1","off-2"),{now:()=>new Date("2026-09-02T20:00:00Z")});const input={schemaVersion:"VerifiedFoodImportV1" as const,sourceProvider:"open-food-facts" as const,sourceExternalId:"3017620422003",barcode:"3017620422003",name:"Nutella",brand:"Ferrero",energyKcal:539,proteinG:6.3,carbsG:57.5,fatG:30.9,fiberG:null,sourceEvidenceUrl:"https://world.openfoodfacts.org/x"};const first=await s.importVerifiedFood(input);const second=await s.importVerifiedFood(input);assert.equal(first.id,second.id);assert.equal(r.tx.foods.size,1)});
test("createMealPlanVersion refuses a slot that conflicts with an active allergen exclusion",async()=>{const r=new MemoryRunner();const f=food();f.allergenIds=["milk"];r.tx.foods.set(f.id,f);r.tx.allergens=[{id:"milk",label:"Süt",resolutionStatus:"resolved"}];const s=new V1MutationService("u1",r,ids("plan-1"));await assert.rejects(()=>s.createMealPlanVersion({schemaVersion:"MealPlanVersionV1",slots:[{mealType:"dinner",items:[{foodVersionId:"food-v1",calculationVersion:"nutrition-v1",selection:{kind:"household",portionVersionId:"portion-v1",quantity:1}}]}]}),/Allergy conflict/);assert.equal(r.tx.mealPlans.size,0)});
test("recordMemoryFacts appends facts the user can later list and delete",async()=>{const r=new MemoryRunner();const s=new V1MutationService("u1",r,ids("fact-1","fact-2"),{now:()=>new Date("2026-09-02T20:00:00Z")});const recorded=await s.recordMemoryFacts({schemaVersion:"MemoryFactRecordV1",facts:[{factText:"Kahvaltıda genelde yumurta tercih ediyor.",confidence:"medium"},{factText:"Süt alerjisi olduğunu belirtti.",confidence:"high",provenance:"user-stated"}]});assert.equal(recorded.length,2);assert.equal(recorded[1]?.provenance,"user-stated");assert.equal(recorded[0]?.provenance,"ai-inferred");let listed=await s.listMemoryFacts();assert.equal(listed.length,2);await s.deleteMemoryFact("fact-1");listed=await s.listMemoryFacts();assert.deepEqual(listed.map(f=>f.id),["fact-2"])});
test("recordMemoryFacts rejects an empty batch and an out-of-range confidence",async()=>{const s=new V1MutationService("u1",new MemoryRunner());await assert.rejects(()=>s.recordMemoryFacts({schemaVersion:"MemoryFactRecordV1",facts:[]}));await assert.rejects(()=>s.recordMemoryFacts({schemaVersion:"MemoryFactRecordV1",facts:[{factText:"x",confidence:"certain"}]}))});
test("deleteMemoryFact scoped to the authenticated subject cannot remove another user's fact",async()=>{const r=new MemoryRunner();r.tx.memoryFacts.set("other-fact",{id:"other-fact",userSubject:"u2",factText:"Başka kullanıcının notu.",provenance:"ai-inferred",confidence:"low",createdAt:"2026-09-02T20:00:00Z"});const s=new V1MutationService("u1",r);await s.deleteMemoryFact("other-fact");assert.equal(r.tx.memoryFacts.has("other-fact"),true)});
test("recordWeeklyInsightSnapshot stores deterministic metrics immediately and the narrative once generated, retrievable by exact week",async()=>{const r=new MemoryRunner();let tick=0;const s=new V1MutationService("u1",r,ids("wi-1","wi-2"),{now:()=>new Date(Date.parse("2026-09-02T20:00:00Z")+(tick++)*1000)});const withoutNarrative=await s.recordWeeklyInsightSnapshot("2026-08-31",{averageEnergyKcal:1950},null);assert.equal(withoutNarrative.narrativeJson,null);const withNarrative=await s.recordWeeklyInsightSnapshot("2026-08-31",{averageEnergyKcal:1950},{schemaVersion:"WeeklyInsightV1",summary:"Bu hafta düzenli bir ritim oluştu.",positives:[],areasForImprovement:[],suggestions:[],uncertainty:[]});assert.ok(withNarrative.narrativeJson?.includes("WeeklyInsightV1"));const latest=await s.getWeeklyInsightSnapshot("2026-08-31");assert.equal(latest?.id,withNarrative.id);assert.equal(await s.getWeeklyInsightSnapshot("2026-09-07"),null)});
test("recordWeeklyInsightSnapshot rejects a malformed week start date",async()=>{const s=new V1MutationService("u1",new MemoryRunner());await assert.rejects(()=>s.recordWeeklyInsightSnapshot("31-08-2026",{},null))});
test("recordPhotoAsset stores metadata the owner can later list and delete, scoped to the authenticated subject",async()=>{
 const r=new MemoryRunner();
 let tick=0;
 const s=new V1MutationService("u1",r,ids("photo-1","photo-2"),{now:()=>new Date(Date.parse("2026-09-02T20:00:00Z")+(tick++)*1000)});
 const first=await s.recordPhotoAsset({kind:"meal-photo",mimeType:"image/jpeg",byteSize:12345,storageKey:"u1/photo-1"});
 assert.equal(first.id,"photo-1");
 const second=await s.recordPhotoAsset({kind:"menu-photo",mimeType:"image/png",byteSize:54321,storageKey:"u1/photo-2"});
 const listed=await s.listPhotoAssets();
 assert.equal(listed.length,2);
 assert.equal(listed[0]?.id,second.id);
 const fetched=await s.getPhotoAsset(first.id);
 assert.equal(fetched?.storageKey,"u1/photo-1");
 const other=new V1MutationService("u2",r);
 assert.equal(await other.getPhotoAsset(first.id),null);
 await other.deletePhotoAsset(first.id);
 assert.equal((await s.listPhotoAssets()).length,2,"another user's delete must not remove this user's photo");
 await s.deletePhotoAsset(first.id);
 const remaining=await s.listPhotoAssets();
 assert.equal(remaining.length,1);
 assert.equal(remaining[0]?.id,second.id);
});
test("recordPhotoAsset rejects an unsupported mime type and an oversized byte count",async()=>{
 const s=new V1MutationService("u1",new MemoryRunner());
 await assert.rejects(()=>s.recordPhotoAsset({kind:"meal-photo",mimeType:"image/gif",byteSize:100,storageKey:"u1/x"}));
 await assert.rejects(()=>s.recordPhotoAsset({kind:"meal-photo",mimeType:"image/jpeg",byteSize:9_000_000,storageKey:"u1/x"}));
});

test("recordLabDocument stores metadata the owner can later list and delete, scoped to the authenticated subject",async()=>{
 const r=new MemoryRunner();
 let tick=0;
 const s=new V1MutationService("u1",r,ids("doc-1","doc-2"),{now:()=>new Date(Date.parse("2026-09-02T20:00:00Z")+(tick++)*1000)});
 const first=await s.recordLabDocument({mimeType:"image/jpeg",byteSize:12345,storageKey:"u1/doc-1"});
 assert.equal(first.id,"doc-1");
 const second=await s.recordLabDocument({mimeType:"image/png",byteSize:54321,storageKey:"u1/doc-2"});
 const listed=await s.listLabDocuments();
 assert.equal(listed.length,2);
 assert.equal(listed[0]?.id,second.id);
 assert.equal((await s.getLabDocument(first.id))?.storageKey,"u1/doc-1");
 const other=new V1MutationService("u2",r);
 assert.equal(await other.getLabDocument(first.id),null);
 await other.deleteLabDocument(first.id);
 assert.equal((await s.listLabDocuments()).length,2,"another user's delete must not remove this user's document");
 await s.deleteLabDocument(first.id);
 assert.equal((await s.listLabDocuments()).length,1);
});

test("recordLabDocument rejects an unsupported mime type and an oversized byte count",async()=>{
 const s=new V1MutationService("u1",new MemoryRunner());
 await assert.rejects(()=>s.recordLabDocument({mimeType:"application/pdf",byteSize:100,storageKey:"u1/x"}));
 await assert.rejects(()=>s.recordLabDocument({mimeType:"image/jpeg",byteSize:9_000_000,storageKey:"u1/x"}));
});

test("recordLabResultEntries inserts every extraction candidate as 'extracted', and confirmLabResultEntry edits the text and flips it to 'confirmed', scoped to the authenticated subject",async()=>{
 const r=new MemoryRunner();
 let tick=0;
 const s=new V1MutationService("u1",r,ids("doc-1","entry-1","entry-2"),{now:()=>new Date(Date.parse("2026-09-02T20:00:00Z")+(tick++)*1000)});
 const doc=await s.recordLabDocument({mimeType:"image/jpeg",byteSize:12345,storageKey:"u1/doc-1"});
 const [entry1,entry2]=await s.recordLabResultEntries(doc.id,[
   {markerName:"Glukoz",valueText:"95",unitText:"mg/dL",referenceRangeText:"70-100"},
   {markerName:"HbA1c",valueText:"5.4",unitText:"%",referenceRangeText:null},
 ]);
 assert.equal(entry1.status,"extracted");
 assert.equal(entry2.status,"extracted");
 assert.equal((await s.listLabResultEntries()).length,2);

 const other=new V1MutationService("u2",r);
 await assert.rejects(()=>other.confirmLabResultEntry(entry1.id,{markerName:"Glukoz",valueText:"95",unitText:"mg/dL",referenceRangeText:"70-100"}));

 const confirmed=await s.confirmLabResultEntry(entry1.id,{markerName:"Açlık glukoz",valueText:"96",unitText:"mg/dL",referenceRangeText:"70-100"});
 assert.equal(confirmed.status,"confirmed");
 assert.equal(confirmed.markerName,"Açlık glukoz");

 await other.deleteLabResultEntry(entry2.id);
 assert.equal((await s.listLabResultEntries()).length,2,"another user's delete must not remove this user's entry");
 await s.deleteLabResultEntry(entry2.id);
 assert.equal((await s.listLabResultEntries()).length,1);
});

test("recordManualLabResultEntry stores an already-confirmed row with no AI extraction involved",async()=>{
 const s=new V1MutationService("u1",new MemoryRunner());
 const entry=await s.recordManualLabResultEntry({labDocumentId:null,markerName:"TSH",valueText:"2.1",unitText:"mIU/L",referenceRangeText:"0.4-4.0"});
 assert.equal(entry.status,"confirmed");
 assert.equal(entry.labDocumentId,null);
});

test("recordSupplement adds an active record the owner can list, deactivate and delete, scoped to the authenticated subject",async()=>{
 const r=new MemoryRunner();
 const s=new V1MutationService("u1",r,ids("sup-1"));
 const record=await s.recordSupplement({foodVersionId:null,name:"D Vitamini",note:null});
 assert.equal(record.isActive,true);
 assert.equal((await s.listSupplements()).length,1);

 const other=new V1MutationService("u2",r);
 await assert.rejects(()=>other.setSupplementActive(record.id,false));

 await s.setSupplementActive(record.id,false);
 assert.equal((await s.listSupplements())[0]?.isActive,false);

 await other.deleteSupplement(record.id);
 assert.equal((await s.listSupplements()).length,1,"another user's delete must not remove this user's supplement");
 await s.deleteSupplement(record.id);
 assert.equal((await s.listSupplements()).length,0);
});

test("recordSupplement rejects a blank name",async()=>{
 const s=new V1MutationService("u1",new MemoryRunner());
 await assert.rejects(()=>s.recordSupplement({foodVersionId:null,name:"   ",note:null}));
});

test("createRecipe stores a stable-ingredient recipe the owner can list, fetch and delete, scoped to the authenticated subject",async()=>{
 const r=new MemoryRunner();r.tx.foods.set("food-v1",food());
 const s=new V1MutationService("u1",r,ids("recipe-1"),{now:()=>new Date("2026-09-02T20:00:00Z")});
 const recipe=await s.createRecipe({schemaVersion:"RecipeCreateV1",name:"Yoğurtlu tarif",servings:2,ingredients:[{foodVersionId:"food-v1",calculationVersion:"nutrition-v1",selection:{kind:"household",portionVersionId:"portion-v1",quantity:2}}]});
 assert.equal(recipe.name,"Yoğurtlu tarif");
 assert.equal((await s.listRecipes()).length,1);
 assert.equal((await s.getRecipe(recipe.id))?.id,recipe.id);
 const other=new V1MutationService("u2",r);
 assert.equal(await other.getRecipe(recipe.id),null);
 await other.deleteRecipe(recipe.id);
 assert.equal((await s.listRecipes()).length,1,"another user's delete must not remove this user's recipe");
 await s.deleteRecipe(recipe.id);
 assert.equal((await s.listRecipes()).length,0);
});

test("createRecipe refuses an ingredient that does not resolve to a verified food",async()=>{
 const s=new V1MutationService("u1",new MemoryRunner());
 await assert.rejects(()=>s.createRecipe({schemaVersion:"RecipeCreateV1",name:"Tarif",servings:1,ingredients:[{foodVersionId:"missing",calculationVersion:"nutrition-v1",selection:{kind:"custom-grams",grams:100}}]}));
});

test("createWeeklyPlanVersion resolves food and recipe items, safety-checks them, and getCurrentWeeklyPlan returns the latest version for that exact week",async()=>{
 const r=new MemoryRunner();r.tx.foods.set("food-v1",food());
 const s=new V1MutationService("u1",r,ids("recipe-1","plan-1"),{now:()=>new Date("2026-09-02T20:00:00Z")});
 const recipe=await s.createRecipe({schemaVersion:"RecipeCreateV1",name:"Yoğurtlu tarif",servings:2,ingredients:[{foodVersionId:"food-v1",calculationVersion:"nutrition-v1",selection:{kind:"household",portionVersionId:"portion-v1",quantity:2}}]});
 assert.equal(await s.getCurrentWeeklyPlan("2026-08-31"),null);
 const days=[0,1,2,3,4,5,6].map((offset)=>({localDate:["2026-08-31","2026-09-01","2026-09-02","2026-09-03","2026-09-04","2026-09-05","2026-09-06"][offset],slots:offset===0?[{mealType:"breakfast" as const,items:[{kind:"food" as const,foodVersionId:"food-v1",calculationVersion:"nutrition-v1" as const,selection:{kind:"household" as const,portionVersionId:"portion-v1",quantity:1}},{kind:"recipe" as const,recipeId:recipe.id,servings:4}]}]:[]}));
 const plan=await s.createWeeklyPlanVersion({schemaVersion:"WeeklyPlanVersionV1",weekStartLocalDate:"2026-08-31",days});
 const storedDays=JSON.parse(plan.daysJson);
 assert.equal(storedDays[0].slots[0].items[0].kind,"food");
 assert.equal(storedDays[0].slots[0].items[1].kind,"recipe");
 assert.equal(storedDays[0].slots[0].items[1].recipeId,recipe.id);
 const current=await s.getCurrentWeeklyPlan("2026-08-31");
 assert.equal(current?.id,plan.id);
});

test("createWeeklyPlanVersion refuses a days array whose local dates do not exactly match weekStartLocalDate + 0..6",async()=>{
 const s=new V1MutationService("u1",new MemoryRunner());
 const days=[0,1,2,3,4,5,6].map((offset)=>({localDate:offset===1?"2026-09-05":["2026-08-31","2026-09-01","2026-09-02","2026-09-03","2026-09-04","2026-09-05","2026-09-06"][offset],slots:[]}));
 await assert.rejects(()=>s.createWeeklyPlanVersion({schemaVersion:"WeeklyPlanVersionV1",weekStartLocalDate:"2026-08-31",days}),/days\[1\]/);
});

test("createWeeklyPlanVersion refuses a slot that conflicts with an active allergen exclusion",async()=>{
 const r=new MemoryRunner();const f=food();f.allergenIds=["milk"];r.tx.foods.set(f.id,f);r.tx.allergens=[{id:"milk",label:"Süt",resolutionStatus:"resolved"}];
 const s=new V1MutationService("u1",r,ids("plan-1"));
 const days=["2026-08-31","2026-09-01","2026-09-02","2026-09-03","2026-09-04","2026-09-05","2026-09-06"].map((localDate,offset)=>({localDate,slots:offset===0?[{mealType:"dinner" as const,items:[{kind:"food" as const,foodVersionId:"food-v1",calculationVersion:"nutrition-v1" as const,selection:{kind:"household" as const,portionVersionId:"portion-v1",quantity:1}}]}]:[]}));
 await assert.rejects(()=>s.createWeeklyPlanVersion({schemaVersion:"WeeklyPlanVersionV1",weekStartLocalDate:"2026-08-31",days}),/Allergy conflict/);
 assert.equal(r.tx.weeklyPlans.size,0);
});

test("pantry items can be added, listed, quantity-updated and deleted, scoped to the authenticated subject",async()=>{
 const r=new MemoryRunner();r.tx.foods.set("food-v1",food());
 const s=new V1MutationService("u1",r,ids("pantry-1"),{now:()=>new Date("2026-09-02T20:00:00Z")});
 const item=await s.addPantryItem({foodVersionId:"food-v1",label:"Yoğurt",quantityGrams:500,quantityNote:null});
 assert.equal((await s.listPantryItems()).length,1);
 const updated=await s.updatePantryItem(item.id,{quantityGrams:250,quantityNote:"Buzdolabında"});
 assert.equal(updated.quantityGrams,250);
 const other=new V1MutationService("u2",r);
 await assert.rejects(()=>other.updatePantryItem(item.id,{quantityGrams:0,quantityNote:null}));
 await other.deletePantryItem(item.id);
 assert.equal((await s.listPantryItems()).length,1,"another user's delete must not remove this user's pantry item");
 await s.deletePantryItem(item.id);
 assert.equal((await s.listPantryItems()).length,0);
});

test("generateShoppingList aggregates live recipe ingredients and direct items by stable foodVersionId, then subtracts matching pantry stock",async()=>{
 const r=new MemoryRunner();r.tx.foods.set("food-v1",food());
 const s=new V1MutationService("u1",r,ids("recipe-1","plan-1","pantry-1"),{now:()=>new Date("2026-09-02T20:00:00Z")});
 const recipe=await s.createRecipe({schemaVersion:"RecipeCreateV1",name:"Yoğurtlu tarif",servings:2,ingredients:[{foodVersionId:"food-v1",calculationVersion:"nutrition-v1",selection:{kind:"household",portionVersionId:"portion-v1",quantity:2}}]});
 const days=["2026-08-31","2026-09-01","2026-09-02","2026-09-03","2026-09-04","2026-09-05","2026-09-06"].map((localDate,offset)=>({localDate,slots:offset===0?[{mealType:"breakfast" as const,items:[{kind:"recipe" as const,recipeId:recipe.id,servings:4}]}]:[]}));
 await s.createWeeklyPlanVersion({schemaVersion:"WeeklyPlanVersionV1",weekStartLocalDate:"2026-08-31",days});
 await s.addPantryItem({foodVersionId:"food-v1",label:"Yoğurt",quantityGrams:100,quantityNote:null});
 const list=await s.generateShoppingList("2026-08-31");
 assert.equal(list.length,1);
 assert.equal(list[0]?.foodVersionId,"food-v1");
 assert.equal(list[0]?.neededGrams,500); // ingredient portion 2*150g=300g, scaled by servings ratio 4/2=2 -> 600g, minus 100g pantry stock
 await s.setShoppingListItemChecked(list[0]!.id,true);
 assert.equal((await s.listShoppingListItems("2026-08-31"))[0]?.isChecked,true);
 const regenerated=await s.generateShoppingList("2026-08-31");
 assert.equal(regenerated[0]?.isChecked,false,"regenerating fully replaces the list, including checked state");
});

test("generateShoppingList refuses a week with no current plan",async()=>{
 const s=new V1MutationService("u1",new MemoryRunner());
 await assert.rejects(()=>s.generateShoppingList("2026-08-31"),/No weekly plan exists yet/);
});

test("week-prep preferences and per-week completion status are simple upserts, not a notification scheduler",async()=>{
 const s=new V1MutationService("u1",new MemoryRunner());
 assert.equal(await s.getWeekPrepPreferences(),null);
 const preferences=await s.upsertWeekPrepPreferences({enabled:true,prepDayOfWeek:0,prepLocalTime:"09:30"});
 assert.equal(preferences.enabled,true);
 assert.equal((await s.getWeekPrepPreferences())?.prepLocalTime,"09:30");
 assert.equal((await s.getWeekPrepStatus("2026-08-31"))?.isCompleted,undefined);
 const status=await s.setWeekPrepStatus("2026-08-31",true);
 assert.equal(status.isCompleted,true);
 assert.equal((await s.getWeekPrepStatus("2026-08-31"))?.isCompleted,true);
});

test("recordBodyMeasurement refuses an all-null submission",async()=>{
 const s=new V1MutationService("u1",new MemoryRunner());
 await assert.rejects(()=>s.recordBodyMeasurement({schemaVersion:"BodyMeasurementCreateV1",localDate:"2026-08-31",weightKg:null,bodyFatPercent:null,waistCm:null,hipCm:null,chestCm:null,note:null}));
});

test("recordBodyMeasurement earns milestones deterministically from measurement history and never earns the same milestone twice",async()=>{
 const s=new V1MutationService("u1",new MemoryRunner());
 const first=await s.recordBodyMeasurement({schemaVersion:"BodyMeasurementCreateV1",localDate:"2026-08-25",weightKg:80,bodyFatPercent:null,waistCm:null,hipCm:null,chestCm:null,note:null});
 assert.deepEqual(first.newMilestones.map(m=>m.milestoneKey),["first-measurement-logged"]);
 const second=await s.recordBodyMeasurement({schemaVersion:"BodyMeasurementCreateV1",localDate:"2026-08-31",weightKg:78.5,bodyFatPercent:null,waistCm:null,hipCm:null,chestCm:null,note:"sabah ölçümü"});
 assert.deepEqual(second.newMilestones.map(m=>m.milestoneKey),["weight-change-1kg-observed"]);
 const repeat=await s.recordBodyMeasurement({schemaVersion:"BodyMeasurementCreateV1",localDate:"2026-09-01",weightKg:78,bodyFatPercent:null,waistCm:null,hipCm:null,chestCm:null,note:null});
 assert.deepEqual(repeat.newMilestones,[],"weight-change-1kg-observed was already earned, so it is not earned again");
 assert.equal((await s.listBodyMeasurements()).length,3);
 assert.equal((await s.listProgressMilestones()).length,2);
});

test("deleteBodyMeasurement removes the measurement but keeps any milestone it helped earn",async()=>{
 const s=new V1MutationService("u1",new MemoryRunner());
 const {measurement}=await s.recordBodyMeasurement({schemaVersion:"BodyMeasurementCreateV1",localDate:"2026-08-31",weightKg:80,bodyFatPercent:null,waistCm:null,hipCm:null,chestCm:null,note:null});
 await s.deleteBodyMeasurement(measurement.id);
 assert.equal((await s.listBodyMeasurements()).length,0);
 assert.equal((await s.listProgressMilestones()).length,1,"an earned milestone is a record of a moment, not a live-recomputed property");
});

test("body-progress photo records are scoped to the authenticated subject",async()=>{
 const s=new V1MutationService("u1",new MemoryRunner());
 const photo=await s.recordBodyPhotoSet({localDate:"2026-08-31",angle:"front",mimeType:"image/jpeg",byteSize:12345,storageKey:"u1/body-progress-photo/1"});
 assert.equal((await s.getBodyPhotoSet(photo.id))?.angle,"front");
 await s.deleteBodyPhotoSet(photo.id);
 assert.equal(await s.getBodyPhotoSet(photo.id),null);
});

test("progress report export metadata is recorded and can be listed/deleted, never touching bytes itself",async()=>{
 const s=new V1MutationService("u1",new MemoryRunner());
 const report=await s.recordProgressReportExport({reportType:"weekly",periodLocalDate:"2026-08-31",byteSize:2048,storageKey:"u1/progress-report/1.pdf"});
 assert.equal(report.mimeType,"application/pdf");
 assert.equal((await s.listProgressReportExports()).length,1);
 await s.deleteProgressReportExport(report.id);
 assert.equal(await s.getProgressReportExport(report.id),null);
});
