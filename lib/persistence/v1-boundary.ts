import { z } from "zod";
import { deriveCalculatedGoal, type MifflinStJeorV1Inputs } from "@/lib/goals/calculator";
import { assertMealEnergyAllocations, type MealEnergyAllocation } from "@/lib/goals/types";
import { assertNoAllergyConflict, assertNoDietaryExclusionConflict, type AllergenSafetyExclusion, type DietarySafetyExclusion } from "@/lib/health-safety/policy";
import { scaleNutritionForStorage } from "@/lib/nutrition/calculations";
import { resolvePortionSelection } from "@/lib/nutrition/portions";
import type { Food, NutritionFacts, PortionSelection } from "@/lib/nutrition/types";
import { assertCanonicalUtcInstant } from "@/lib/time/canonical";

export const NUTRITION_CALCULATION_VERSION = "nutrition-v1" as const;
const Id = z.string().trim().min(1).max(200);
const MealType = z.enum(["breakfast","morning-snack","lunch","afternoon-snack","dinner","snack","custom"]);
const CanonicalInstant = z.string().superRefine((value, ctx) => {
  try { assertCanonicalUtcInstant(value, "occurredAt"); }
  catch (error) { ctx.addIssue({ code: "custom", message: error instanceof Error ? error.message : "Invalid UTC instant" }); }
});
const PortionQuantity = z.number().finite().min(0.01).max(20).refine(
  (value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-9,
  "portion quantity must use at most two decimal places",
);
const HouseholdSelection = z.object({ kind:z.literal("household"), portionVersionId:Id, quantity:PortionQuantity }).strict();
const CustomGramSelection = z.object({ kind:z.literal("custom-grams"), grams:z.number().finite().min(0.1).max(100000) }).strict();
const MealItemBase = z.object({ foodVersionId:Id, calculationVersion:z.literal(NUTRITION_CALCULATION_VERSION) });
export const MealLogActionV1 = z.object({ schemaVersion:z.literal("MealLogActionV1"), occurredAt:CanonicalInstant, mealType:MealType, items:z.array(MealItemBase.extend({selection:HouseholdSelection}).strict()).min(1).max(40) }).strict();
export const WaterLogActionV1 = z.object({ schemaVersion:z.literal("WaterLogActionV1"), occurredAt:CanonicalInstant, milliliters:z.number().finite().min(1).max(10000) }).strict();
const ManualMealItem = MealItemBase.extend({ selection:z.union([HouseholdSelection,CustomGramSelection]) }).strict();

export type AiActionType="meal-log"|"water-log";
export type AiDecision="confirmed"|"rejected";
export type StoredProposal={id:string;userSubject:string;actionType:AiActionType;schemaVersion:"MealLogActionV1"|"WaterLogActionV1";payloadJson:string;payloadSha256:string;idempotencyKey:string;createdAt:string};
export type StoredDecision={actionId:string;userSubject:string;decision:AiDecision;decidedAt:string};
export type StoredOutcome={actionId:string;userSubject:string;actionType:AiActionType;confirmationMarker:"confirmed";outcome:"applied"|"failed";resultEventId:string|null;failureCode:string|null;recordedAt:string};
export type StoredNutritionEvent={id:string;userSubject:string;eventType:AiActionType;occurredAt:string;localDate:string;payloadJson:string;createdAt:string};
export type ScientificReferenceSnapshot={id:string;title:string;citation:string;evidenceUrl?:string;publishedYear?:number};
export type StoredGoalVersion={id:string;userSubject:string;source:"arven-calculated";calculatorId:"mifflin-st-jeor@v1";calculatorInputsJson:string;referenceSnapshotsJson:string;energyKcal:number;proteinG:number;carbsG:number;fatG:number;fiberG:number;waterMl:number;mealAllocationsJson:string;createdAt:string};
export type AuthenticatedUserContext={timezone:string;nutritionDayStartMinutes:number};
export type VersionedFood=Food & {foodKey:string};

export interface V1Transaction {
  getUserContext(userSubject:string):Promise<AuthenticatedUserContext>;
  getProposal(userSubject:string,actionId:string):Promise<StoredProposal|null>;
  /**
   * Atomically bind (userSubject,idempotencyKey) to one immutable proposal.
   * The adapter must use insert-on-conflict/read semantics and return either the
   * inserted proposal or the already-bound proposal; it must never surface a
   * normal uniqueness race to the service.
   */
  insertProposalIfAbsent(proposal:StoredProposal):Promise<StoredProposal>;
  getDecision(userSubject:string,actionId:string):Promise<StoredDecision|null>;
  insertDecision(decision:StoredDecision):Promise<void>;
  getOutcome(userSubject:string,actionId:string):Promise<StoredOutcome|null>;
  insertOutcome(outcome:StoredOutcome):Promise<void>;
  getNutritionEvent(userSubject:string,eventId:string):Promise<StoredNutritionEvent|null>;
  insertNutritionEvent(event:StoredNutritionEvent):Promise<void>;
  getFoodVersion(userSubject:string,foodVersionId:string):Promise<VersionedFood|null>;
  /** Return every active allergen exclusion, including unresolved rows with null ids. */
  getActiveAllergenExclusions(userSubject:string):Promise<AllergenSafetyExclusion[]>;
  getActiveDietaryExclusions(userSubject:string):Promise<DietarySafetyExclusion[]>;
  getScientificReferenceSnapshots(referenceIds:string[]):Promise<ScientificReferenceSnapshot[]>;
  insertGoalVersion(goal:StoredGoalVersion):Promise<void>;
  setCurrentGoal(userSubject:string,goalVersionId:string,selectedAt:string):Promise<void>;
  /** Delete the authenticated account and all dependent lifecycle rows in one transaction, in dependency-safe order. */
  purgeAuthenticatedUser(userSubject:string):Promise<void>;
}
export interface V1TransactionRunner{transaction<T>(work:(tx:V1Transaction)=>Promise<T>):Promise<T>}
export type ServiceClock={now():Date}; export type IdFactory=()=>string;

class ApplicationRejectedError extends Error {
  constructor(readonly code:string,message:string){super(message);this.name="ApplicationRejectedError";}
}
function rejectApplication(code:string,error:unknown):never{
  const message=error instanceof Error?error.message:String(error);
  throw new ApplicationRejectedError(code,message);
}
function canonicalJson(value:unknown):string{
  function normalize(current:unknown,inArray:boolean):unknown {
    if(current===undefined||typeof current==="function"||typeof current==="symbol")return inArray?null:undefined;
    if(current===null||typeof current!=="object")return current;
    if(Array.isArray(current))return current.map((item)=>normalize(item,true));
    const source=current as Record<string,unknown>;
    const target:Record<string,unknown>={};
    for(const key of Object.keys(source).sort()){
      const normalized=normalize(source[key],false);
      if(normalized!==undefined)target[key]=normalized;
    }
    return target;
  }
  const encoded=JSON.stringify(normalize(value,false));
  if(encoded===undefined)throw new Error("Value cannot be represented as canonical JSON");
  return encoded;
}
async function sha256(value:string):Promise<string>{const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));return[...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,"0")).join("");}
function instant(date:Date):string{if(!Number.isFinite(date.getTime()))throw new Error("Invalid service clock instant");return date.toISOString();}
function previousDate(localDate:string):string{const[y,m,d]=localDate.split("-").map(Number);return new Date(Date.UTC(y,m-1,d-1)).toISOString().slice(0,10);}
export function deriveNutritionLocalDate(occurredAt:string,timezone:string,dayStart:number):string{assertCanonicalUtcInstant(occurredAt,"occurredAt");if(!Number.isInteger(dayStart)||dayStart<0||dayStart>1439)throw new Error("nutritionDayStartMinutes must be 0..1439");let f:Intl.DateTimeFormat;try{f=new Intl.DateTimeFormat("en-CA",{timeZone:timezone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"});}catch{throw new Error("Authenticated profile contains an invalid IANA timezone");}const p=Object.fromEntries(f.formatToParts(new Date(occurredAt)).filter(x=>x.type!=="literal").map(x=>[x.type,x.value]));const date=`${p.year}-${p.month}-${p.day}`;const mins=Number(p.hour)*60+Number(p.minute);if(!Number.isInteger(mins))throw new Error("Unable to derive local nutrition time");return mins<dayStart?previousDate(date):date;}
function safety(food:VersionedFood){return{allergens:[{foodId:food.foodKey,foodName:food.name,allergenDataStatus:food.allergenDataStatus??"unknown" as const,allergenIds:food.allergenIds??[]}],dietary:[{foodId:food.foodKey,foodName:food.name,dietarySafetyDataStatus:food.dietarySafetyDataStatus??"unknown" as const,dietaryConflictRuleIds:food.dietaryConflictRuleIds??[]}]};}
async function mealPayload(tx:V1Transaction,subject:string,mealType:z.infer<typeof MealType>,items:Array<z.infer<typeof ManualMealItem>>):Promise<Record<string,unknown>>{
  const snapshots:Array<Record<string,unknown>>=[];
  const resolvedFoods:VersionedFood[]=[];
  for(const item of items){
    const food=await tx.getFoodVersion(subject,item.foodVersionId);
    if(!food)throw new ApplicationRejectedError("food-version-unavailable",`Verified food version ${item.foodVersionId} is unavailable to this user`);
    resolvedFoods.push(food);
    let portion;
    try{const selection:PortionSelection=item.selection.kind==="household"?{kind:"household",portionOptionId:item.selection.portionVersionId,quantity:item.selection.quantity}:{kind:"custom-grams",grams:item.selection.grams};portion=resolvePortionSelection(food,selection);}catch(error){rejectApplication("portion-resolution-failed",error);}
    let nutrition:NutritionFacts;
    try{nutrition=scaleNutritionForStorage(portion);}catch(error){rejectApplication("nutrition-calculation-failed",error);}
    snapshots.push({foodVersionId:food.id,foodKey:food.foodKey,foodName:food.name,calculationVersion:item.calculationVersion,grams:portion.grams,portion:portion.display??null,nutrition});
  }
  const allergens=await tx.getActiveAllergenExclusions(subject);
  const exclusions=await tx.getActiveDietaryExclusions(subject);
  const allergenCandidates=resolvedFoods.flatMap((food)=>safety(food).allergens);
  const dietaryCandidates=resolvedFoods.flatMap((food)=>safety(food).dietary);
  try{assertNoAllergyConflict(allergenCandidates,allergens);assertNoDietaryExclusionConflict(dietaryCandidates,exclusions);}catch(error){rejectApplication("safety-conflict",error);}
  return{schemaVersion:"MealEventV1",mealType,items:snapshots};
}
function canonicalReferenceIds(ids:string[]):string[]{const result=ids.map(id=>id.trim());if(result.length===0||result.some(id=>!id))throw new Error("At least one scientific reference is required");if(new Set(result).size!==result.length)throw new Error("Scientific reference ids must be unique");return result;}
function assertSameImmutableProposal(stored:StoredProposal,candidate:StoredProposal):StoredProposal{
  if(stored.userSubject!==candidate.userSubject||stored.idempotencyKey!==candidate.idempotencyKey)throw new Error("Persistence returned a proposal outside the authenticated idempotency scope");
  if(stored.actionType!==candidate.actionType||stored.schemaVersion!==candidate.schemaVersion||stored.payloadSha256!==candidate.payloadSha256||stored.payloadJson!==candidate.payloadJson)throw new Error("Idempotency key is already bound to a different immutable proposal");
  return stored;
}
async function readAppliedOutcomeEvent(tx:V1Transaction,subject:string,actionId:string):Promise<StoredNutritionEvent|null>{
  const outcome=await tx.getOutcome(subject,actionId);
  if(!outcome)return null;
  if(outcome.outcome==="failed")throw new Error("Failed AI action cannot later be applied");
  if(!outcome.resultEventId)throw new Error("Applied outcome is missing its result event id");
  const event=await tx.getNutritionEvent(subject,outcome.resultEventId);
  if(!event)throw new Error("Applied outcome references a missing nutrition event");
  if(event.eventType!==outcome.actionType)throw new Error("Applied outcome references the wrong nutrition event type");
  return event;
}

export class V1MutationService{
  constructor(private readonly subject:string,private readonly runner:V1TransactionRunner,private readonly idFactory:IdFactory=()=>crypto.randomUUID(),private readonly clock:ServiceClock={now:()=>new Date()}){if(!subject.trim())throw new Error("Authenticated subject is required");}
  async createAiProposal(type:AiActionType,input:unknown,idempotencyKey:string):Promise<StoredProposal>{const key=idempotencyKey.trim();if(!key)throw new Error("idempotencyKey is required");const parsed=type==="meal-log"?MealLogActionV1.parse(input):WaterLogActionV1.parse(input);const payloadJson=canonicalJson(parsed);const hash=await sha256(payloadJson);const candidate:StoredProposal={id:this.idFactory(),userSubject:this.subject,actionType:type,schemaVersion:parsed.schemaVersion,payloadJson,payloadSha256:hash,idempotencyKey:key,createdAt:instant(this.clock.now())};return this.runner.transaction(async tx=>assertSameImmutableProposal(await tx.insertProposalIfAbsent(candidate),candidate));}
  async decideAiAction(actionId:string,decision:AiDecision):Promise<StoredDecision>{
    try{
      return await this.runner.transaction(async tx=>{
        const p=await tx.getProposal(this.subject,actionId);
        if(!p)throw new Error("AI proposal not found in authenticated scope");
        const old=await tx.getDecision(this.subject,actionId);
        if(old){if(old.decision!==decision)throw new Error("AI decision is immutable once recorded");return old;}
        const d={actionId,userSubject:this.subject,decision,decidedAt:instant(this.clock.now())};
        await tx.insertDecision(d);
        return d;
      });
    }catch(error){
      const winner=await this.runner.transaction(async tx=>tx.getDecision(this.subject,actionId));
      if(winner){
        if(winner.decision!==decision)throw new Error("AI decision is immutable once recorded");
        return winner;
      }
      throw error;
    }
  }
  async applyConfirmedAiAction(actionId:string):Promise<StoredNutritionEvent>{
    let result:{kind:"applied";event:StoredNutritionEvent}|{kind:"failed";outcome:StoredOutcome;message:string};
    try{
      result=await this.runner.transaction(async tx=>{
        const oldEvent=await readAppliedOutcomeEvent(tx,this.subject,actionId);
        if(oldEvent)return{kind:"applied" as const,event:oldEvent};
        const p=await tx.getProposal(this.subject,actionId);const d=await tx.getDecision(this.subject,actionId);if(!p||!d||d.decision!=="confirmed")throw new Error("Explicit confirmation is required before application");
        const now=instant(this.clock.now());
        try{
          const c=await tx.getUserContext(this.subject);
          let e:StoredNutritionEvent;
          if(p.actionType==="water-log"){
            let x:z.infer<typeof WaterLogActionV1>;try{x=WaterLogActionV1.parse(JSON.parse(p.payloadJson));}catch(error){rejectApplication("invalid-stored-payload",error);}
            let localDate:string;try{localDate=deriveNutritionLocalDate(x.occurredAt,c.timezone,c.nutritionDayStartMinutes);}catch(error){rejectApplication("local-date-derivation-failed",error);}
            e={id:this.idFactory(),userSubject:this.subject,eventType:"water-log",occurredAt:x.occurredAt,localDate,payloadJson:canonicalJson({schemaVersion:"WaterEventV1",milliliters:x.milliliters}),createdAt:now};
          }else{
            let x:z.infer<typeof MealLogActionV1>;try{x=MealLogActionV1.parse(JSON.parse(p.payloadJson));}catch(error){rejectApplication("invalid-stored-payload",error);}
            let localDate:string;try{localDate=deriveNutritionLocalDate(x.occurredAt,c.timezone,c.nutritionDayStartMinutes);}catch(error){rejectApplication("local-date-derivation-failed",error);}
            const payload=await mealPayload(tx,this.subject,x.mealType,x.items);
            e={id:this.idFactory(),userSubject:this.subject,eventType:"meal-log",occurredAt:x.occurredAt,localDate,payloadJson:canonicalJson(payload),createdAt:now};
          }
          await tx.insertNutritionEvent(e);
          await tx.insertOutcome({actionId:p.id,userSubject:this.subject,actionType:p.actionType,confirmationMarker:"confirmed",outcome:"applied",resultEventId:e.id,failureCode:null,recordedAt:now});
          return{kind:"applied" as const,event:e};
        }catch(error){
          if(!(error instanceof ApplicationRejectedError))throw error;
          const outcome:StoredOutcome={actionId:p.id,userSubject:this.subject,actionType:p.actionType,confirmationMarker:"confirmed",outcome:"failed",resultEventId:null,failureCode:error.code,recordedAt:now};
          await tx.insertOutcome(outcome);
          return{kind:"failed" as const,outcome,message:error.message};
        }
      });
    }catch(error){
      const winner=await this.runner.transaction(async tx=>readAppliedOutcomeEvent(tx,this.subject,actionId));
      if(winner)return winner;
      throw error;
    }
    if(result.kind==="failed")throw new Error(`AI action application failed permanently (${result.outcome.failureCode}): ${result.message}`);
    return result.event;
  }
  async recordConfirmedFailure(actionId:string,failureCode:string):Promise<StoredOutcome>{const code=failureCode.trim();if(!code)throw new Error("failureCode is required");return this.runner.transaction(async tx=>{const old=await tx.getOutcome(this.subject,actionId);if(old){if(old.outcome==="applied")throw new Error("Applied AI action cannot be reclassified as failed");return old;}const p=await tx.getProposal(this.subject,actionId);const d=await tx.getDecision(this.subject,actionId);if(!p||!d||d.decision!=="confirmed")throw new Error("Only a confirmed proposal may record application failure");const o:StoredOutcome={actionId,userSubject:this.subject,actionType:p.actionType,confirmationMarker:"confirmed",outcome:"failed",resultEventId:null,failureCode:code,recordedAt:instant(this.clock.now())};await tx.insertOutcome(o);return o;});}
  async appendManualWater(occurredAt:string,milliliters:number):Promise<StoredNutritionEvent>{const x=WaterLogActionV1.omit({schemaVersion:true}).parse({occurredAt,milliliters});return this.runner.transaction(async tx=>{const c=await tx.getUserContext(this.subject);const e={id:this.idFactory(),userSubject:this.subject,eventType:"water-log" as const,occurredAt:x.occurredAt,localDate:deriveNutritionLocalDate(x.occurredAt,c.timezone,c.nutritionDayStartMinutes),payloadJson:canonicalJson({schemaVersion:"WaterEventV1",milliliters:x.milliliters}),createdAt:instant(this.clock.now())};await tx.insertNutritionEvent(e);return e;});}
  async appendManualMeal(input:{occurredAt:string;mealType:z.infer<typeof MealType>;items:unknown[]}):Promise<StoredNutritionEvent>{const x=z.object({occurredAt:CanonicalInstant,mealType:MealType,items:z.array(ManualMealItem).min(1).max(40)}).strict().parse(input);return this.runner.transaction(async tx=>{const c=await tx.getUserContext(this.subject);const localDate=deriveNutritionLocalDate(x.occurredAt,c.timezone,c.nutritionDayStartMinutes);const payload=await mealPayload(tx,this.subject,x.mealType,x.items);const e={id:this.idFactory(),userSubject:this.subject,eventType:"meal-log" as const,occurredAt:x.occurredAt,localDate,payloadJson:canonicalJson(payload),createdAt:instant(this.clock.now())};await tx.insertNutritionEvent(e);return e;});}
  async createCalculatedGoalVersion(inputs:MifflinStJeorV1Inputs,referenceIds:string[],allocations:MealEnergyAllocation[]):Promise<StoredGoalVersion>{const inputSnapshot={...inputs};const allocationSnapshot=allocations.map((allocation)=>({...allocation}));assertMealEnergyAllocations(allocationSnapshot);const ids=canonicalReferenceIds(referenceIds);const targets=deriveCalculatedGoal({method:"mifflin-st-jeor",version:"v1",inputs:inputSnapshot,referenceIds:ids});return this.runner.transaction(async tx=>{const refs=await tx.getScientificReferenceSnapshots(ids);const byId=new Map(refs.map(ref=>[ref.id,ref]));if(byId.size!==ids.length||ids.some(id=>!byId.has(id)))throw new Error("Every scientific reference must resolve to a versioned snapshot");const ordered=ids.map(id=>byId.get(id)!);const now=instant(this.clock.now());const goal:StoredGoalVersion={id:this.idFactory(),userSubject:this.subject,source:"arven-calculated",calculatorId:"mifflin-st-jeor@v1",calculatorInputsJson:canonicalJson(inputSnapshot),referenceSnapshotsJson:canonicalJson(ordered),energyKcal:targets.energyKcal,proteinG:targets.proteinG,carbsG:targets.carbsG,fatG:targets.fatG,fiberG:targets.fiberG,waterMl:targets.waterMl,mealAllocationsJson:canonicalJson(allocationSnapshot),createdAt:now};await tx.insertGoalVersion(goal);await tx.setCurrentGoal(this.subject,goal.id,now);return goal;});}
  async deleteAccount():Promise<void>{await this.runner.transaction(async tx=>{await tx.purgeAuthenticatedUser(this.subject);});}
}