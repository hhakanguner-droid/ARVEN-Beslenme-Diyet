import type { AllergenSafetyExclusion, DietarySafetyExclusion } from "@/lib/health-safety/policy";
import {
  type AuthenticatedUserContext,type ScientificReferenceSnapshot,type StoredAssessmentSnapshot,type StoredBodyMeasurement,
  type StoredBodyPhotoSet,type StoredCustomFoodVersion,type StoredDecision,type StoredGoalVersion,type StoredLabDocument,
  type StoredLabResultEntry,type StoredMealPlanVersion,type StoredMemoryFact,type StoredNutritionEvent,type StoredOutcome,
  type StoredPantryItem,type StoredPhotoAsset,type StoredProfile,type StoredProgressMilestone,type StoredProgressReportExport,
  type StoredProposal,type StoredRecipe,type StoredSafetyAcknowledgement,type StoredShoppingListItem,type StoredSupplementRecord,
  type StoredVerifiedFoodImport,type StoredWeekPrepPreferences,type StoredWeekPrepStatus,type StoredWeeklyInsightSnapshot,
  type StoredWeeklyPlanVersion,type V1Transaction,type V1TransactionRunner,type VersionedFood,
} from "@/lib/persistence/v1-boundary";

/**
 * A full, real (non-stub) in-memory `V1Transaction` used across this test suite wherever a test
 * needs actual persistence behavior rather than a hand-picked mock — originally lived inline in
 * `persistence-v1.test.ts`; pulled out here (Faz 9) so `portability.test.ts` can exercise
 * export/import against the exact same semantics without duplicating ~90 lines of adapter logic.
 */
export class MemoryTx implements V1Transaction {
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
  async listNutritionEvents(s:string){return [...this.events.values()].filter(e=>e.userSubject===s).sort((a,b)=>a.occurredAt.localeCompare(b.occurredAt))}
  async searchFoodVersions(_s:string,query:string,limit:number){const q=query.trim().toLocaleLowerCase("tr-TR");return [...this.foods.values()].filter(f=>f.name.toLocaleLowerCase("tr-TR").includes(q)).slice(0,limit)}
  async findFoodVersionByBarcode(_s:string,barcode:string){return [...this.foods.values()].find(f=>f.barcode===barcode)??null}
  async getFoodVersionByFoodKey(_s:string,foodKey:string){return [...this.foods.values()].find(f=>f.foodKey===foodKey)??null}
  async importVerifiedFoodVersion(food:StoredVerifiedFoodImport){this.foods.set(food.id,{id:food.id,foodKey:food.foodKey,name:food.name,brand:food.brand??undefined,barcode:food.barcode??undefined,isLiquid:food.isLiquid,basisGrams:100,nutrition:{energyKcal:food.energyKcal,proteinG:food.proteinG,carbsG:food.carbsG,fatG:food.fatG,fiberG:food.fiberG??undefined},source:{provider:food.sourceProvider,externalId:food.sourceExternalId,verifiedAt:food.verifiedAt,evidenceUrl:food.sourceEvidenceUrl??undefined},allergenIds:[],allergenDataStatus:"unknown",dietaryConflictRuleIds:[],dietarySafetyDataStatus:"unknown",portionOptions:[]})}
  async insertMealPlanVersionAndSetCurrent(plan:StoredMealPlanVersion,_selectedAt:string){this.mealPlans.set(plan.id,plan);this.currentMealPlan=plan.id}
  async getCurrentMealPlan(_s:string){return this.currentMealPlan?this.mealPlans.get(this.currentMealPlan)??null:null}
  async deleteManualNutritionEvent(s:string,id:string){const v=this.events.get(id);if(!v||v.userSubject!==s)throw new Error("Nutrition event not found");if([...this.outcomes.values()].some(o=>o.resultEventId===id))throw new Error("Cannot delete a nutrition event created by a confirmed AI action");this.events.delete(id)}
  async insertCustomFoodVersion(food:StoredCustomFoodVersion){this.customFoods.set(food.id,food);this.foods.set(food.id,{id:food.id,foodKey:food.foodKey,name:food.name,isLiquid:food.isLiquid,basisGrams:100,nutrition:{energyKcal:food.energyKcal,proteinG:food.proteinG,carbsG:food.carbsG,fatG:food.fatG,fiberG:food.fiberG??undefined},source:{provider:"manual-verified",verifiedAt:food.verifiedAt},allergenIds:food.allergenIds,allergenDataStatus:food.allergenDataStatus,dietaryConflictRuleIds:food.dietaryConflictRuleIds,dietarySafetyDataStatus:food.dietarySafetyDataStatus,portionOptions:food.portions.map(p=>({id:p.id,measure:p.measure as never,label:p.label,gramsPerUnit:p.gramsPerUnit,source:{provider:"manual-verified",verifiedAt:food.verifiedAt}}))})}
  async listCustomFoodVersions(s:string){return [...this.customFoods.values()].filter(f=>f.ownerSubject===s).sort((a,b)=>b.verifiedAt.localeCompare(a.verifiedAt))}
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

export class MemoryRunner implements V1TransactionRunner {
  constructor(readonly tx = new MemoryTx()) {}
  async transaction<T>(work: (tx: V1Transaction) => Promise<T>): Promise<T> { return work(this.tx); }
}
