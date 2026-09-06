import { z } from "zod";
import { deriveCalculatedGoal, type MifflinStJeorV1Inputs } from "@/lib/goals/calculator";
import { assertMealEnergyAllocations, type MealEnergyAllocation } from "@/lib/goals/types";
import { assertNoAllergyConflict, assertNoDietaryExclusionConflict, assertNoMedicalOverreach, type AllergenSafetyExclusion, type DietarySafetyExclusion } from "@/lib/health-safety/policy";
import { isKnownSupplementName } from "@/lib/supplements/reference";
import { scaleNutritionForStorage, sumNutrition } from "@/lib/nutrition/calculations";
import { resolvePortionSelection } from "@/lib/nutrition/portions";
import type { Food, NutritionFacts, PortionSelection } from "@/lib/nutrition/types";
import { addLocalDays, assertCanonicalLocalDate, assertCanonicalUtcInstant, previousLocalDate } from "@/lib/time/canonical";

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
export const MealPlanSlotV1 = z.object({ mealType:MealType, items:z.array(ManualMealItem).min(1).max(40) }).strict();
export const MealPlanVersionV1 = z.object({ schemaVersion:z.literal("MealPlanVersionV1"), slots:z.array(MealPlanSlotV1).min(1).max(12) }).strict();

const PortionMeasureZ = z.enum(["piece","slice","teaspoon","tablespoon","tea-glass","water-glass","cup","bowl","handful","palm","serving","package","bottle","can","ladle"]);
const CustomPortionInputV1 = z.object({ measure:PortionMeasureZ, label:z.string().trim().min(1).max(80), gramsPerUnit:z.number().finite().min(0.1).max(100000) }).strict();
export const CustomFoodV1 = z.object({
  schemaVersion:z.literal("CustomFoodV1"),
  name:z.string().trim().min(1).max(120),
  isLiquid:z.boolean().optional(),
  energyKcal:z.number().finite().min(0).max(10000),
  proteinG:z.number().finite().min(0).max(1000),
  carbsG:z.number().finite().min(0).max(1000),
  fatG:z.number().finite().min(0).max(1000),
  fiberG:z.number().finite().min(0).max(1000).optional(),
  portions:z.array(CustomPortionInputV1).min(1).max(10),
}).strict();
/**
 * One externally-verified food (currently: an Open Food Facts product) being imported into the
 * shared catalog for the first time. `sourceExternalId` is always the provider's own product id
 * (for Open Food Facts, the barcode) — `V1MutationService.importVerifiedFood` derives this row's
 * deterministic `food_key` from it (`off-${sourceExternalId}`), so re-importing the same product
 * (a repeat barcode scan, the same item turning up again in a text search) always resolves to the
 * same catalog row instead of creating a duplicate.
 */
export const VerifiedFoodImportV1 = z.object({
  schemaVersion:z.literal("VerifiedFoodImportV1"),
  sourceProvider:z.literal("open-food-facts"),
  sourceExternalId:z.string().trim().min(1).max(200),
  barcode:z.string().trim().min(1).max(64).nullable(),
  name:z.string().trim().min(1).max(120),
  brand:z.string().trim().min(1).max(120).nullable(),
  isLiquid:z.boolean().optional(),
  energyKcal:z.number().finite().min(0).max(10000),
  proteinG:z.number().finite().min(0).max(1000),
  carbsG:z.number().finite().min(0).max(1000),
  fatG:z.number().finite().min(0).max(1000),
  fiberG:z.number().finite().min(0).max(1000).nullable(),
  sourceEvidenceUrl:z.string().trim().min(1).max(500).nullable(),
}).strict();
/** One fact ARVEN keeps between conversations to personalize replies (e.g. "kahvaltıda genelde yumurta tercih ediyor"). Unlike every other input here this is user-deletable at any time — see `V1MutationService.deleteMemoryFact`. */
const MemoryFactInput = z.object({
  factText: z.string().trim().min(1).max(300),
  confidence: z.enum(["high","medium","low"]),
  provenance: z.enum(["user-stated","ai-inferred"]).default("ai-inferred"),
}).strict();
export const MemoryFactRecordV1 = z.object({ schemaVersion:z.literal("MemoryFactRecordV1"), facts:z.array(MemoryFactInput).min(1).max(5) }).strict();

/** Metadata for one privately-stored user photo (Phase 5 vision). The bytes themselves live in `lib/media/storage.ts`, never in this row — see `db/migrations/0005_phase5_vision.sql`. */
const PHOTO_ASSET_KINDS=["meal-photo","menu-photo","product-photo"] as const;
const PHOTO_ASSET_MIME_TYPES=["image/jpeg","image/png","image/webp"] as const;
const PhotoAssetInput = z.object({
  kind: z.enum(PHOTO_ASSET_KINDS),
  mimeType: z.enum(PHOTO_ASSET_MIME_TYPES),
  byteSize: z.number().int().min(1).max(8_000_000),
  storageKey: z.string().trim().min(1).max(300),
}).strict();

// Phase 6: health context. Lab documents reuse the exact same mime-type/size limits as
// photo_assets (Phase 5) — a separate table because that migration is already merged (see
// db/migrations/0006_phase6_health.sql).
const LAB_DOCUMENT_MIME_TYPES=["image/jpeg","image/png","image/webp"] as const;
const LabDocumentInput = z.object({
  mimeType: z.enum(LAB_DOCUMENT_MIME_TYPES),
  byteSize: z.number().int().min(1).max(8_000_000),
  storageKey: z.string().trim().min(1).max(300),
}).strict();
const LAB_RESULT_STATUSES=["extracted","confirmed"] as const;
const LabResultEntryText = z.string().trim().min(1).max(80);
/** Shared shape for one lab reading's transcribed text — used both for an AI extraction candidate and for the user's edits when confirming one. */
const LabExtractedEntryInput = z.object({
  markerName: z.string().trim().min(1).max(160),
  valueText: LabResultEntryText,
  unitText: z.string().trim().min(1).max(40).nullable(),
  referenceRangeText: z.string().trim().min(1).max(80).nullable(),
}).strict();
const LabResultEntryInput = LabExtractedEntryInput.extend({ labDocumentId: Id.nullable() }).strict();
const LabResultEntryUpdate = LabExtractedEntryInput;
// Explicitly NOT a medication registry — no dosage/schedule field exists here on purpose (see
// docs/ROADMAP.md's Phase 6 entry). foodVersionId is optional, pointed at the existing verified
// multi-source food catalog when the user's supplement happens to be found there.
const SupplementRecordInput = z.object({
  foodVersionId: Id.nullable(),
  name: z.string().trim().min(1).max(160),
  note: z.string().trim().max(300).nullable(),
}).strict();

export const RecipeIngredientV1 = MealItemBase.extend({ selection:z.union([HouseholdSelection,CustomGramSelection]) }).strict();
export const RecipeFoodV1 = z.object({
  schemaVersion:z.literal("RecipeFoodV1"),
  name:z.string().trim().min(1).max(120),
  servings:z.number().finite().min(1).max(100),
  servingLabel:z.string().trim().min(1).max(80).optional(),
  ingredients:z.array(RecipeIngredientV1).min(1).max(40),
}).strict();

const CanonicalLocalDate = z.string().superRefine((value, ctx) => {
  try { assertCanonicalLocalDate(value, "birthDate"); }
  catch (error) { ctx.addIssue({ code: "custom", message: error instanceof Error ? error.message : "Invalid local date" }); }
});
const CanonicalWeekStartDate = z.string().superRefine((value, ctx) => {
  try { assertCanonicalLocalDate(value, "weekStartLocalDate"); }
  catch (error) { ctx.addIssue({ code: "custom", message: error instanceof Error ? error.message : "Invalid local date" }); }
});
// Phase 7: weekly planning. `RecipeCreateV1` reuses the existing `RecipeIngredientV1` shape
// (a stable foodVersionId + portion selection per ingredient) but, unlike `RecipeFoodV1`/
// `createRecipeFood` above, is never frozen into a one-off custom food — the ingredient list is
// stored as-is and re-resolved from *current* catalog data by every reader (weekly-plan creation,
// shopping-list generation). Deliberately no update endpoint: editing a recipe means deleting and
// recreating it (see docs/ARCHITECTURE.md's Phase 7 section for the full rationale).
export const RecipeCreateV1 = z.object({
  schemaVersion:z.literal("RecipeCreateV1"),
  name:z.string().trim().min(1).max(160),
  servings:z.number().int().min(1).max(50),
  ingredients:z.array(RecipeIngredientV1).min(1).max(40),
}).strict();

const WeeklyPlanFoodItemV1 = z.object({kind:z.literal("food")}).extend(ManualMealItem.shape).strict();
const WeeklyPlanRecipeItemV1 = z.object({kind:z.literal("recipe"),recipeId:Id,servings:z.number().finite().min(0.25).max(50)}).strict();
const WeeklyPlanItemV1 = z.union([WeeklyPlanFoodItemV1,WeeklyPlanRecipeItemV1]);
const WeeklyPlanSlotV1 = z.object({mealType:MealType,items:z.array(WeeklyPlanItemV1).min(1).max(40)}).strict();
const WeeklyPlanDayV1 = z.object({localDate:CanonicalLocalDate,slots:z.array(WeeklyPlanSlotV1).min(0).max(12)}).strict();
/** A whole week is always replaced together (same all-or-nothing shape as `MealPlanVersionV1`); `days` must contain exactly the 7 local dates starting at `weekStartLocalDate`, checked in `createWeeklyPlanVersion`. */
export const WeeklyPlanVersionV1 = z.object({
  schemaVersion:z.literal("WeeklyPlanVersionV1"),
  weekStartLocalDate:CanonicalWeekStartDate,
  days:z.array(WeeklyPlanDayV1).length(7),
}).strict();

const PantryItemCreateV1 = z.object({
  foodVersionId:Id.nullable(),
  label:z.string().trim().min(1).max(160),
  quantityGrams:z.number().finite().min(0).max(100000).nullable(),
  quantityNote:z.string().trim().min(1).max(80).nullable(),
}).strict();
const PantryItemUpdateV1 = z.object({
  quantityGrams:z.number().finite().min(0).max(100000).nullable(),
  quantityNote:z.string().trim().min(1).max(80).nullable(),
}).strict();

// Deliberately just a stored preference plus a per-week completion flag — NOT a push-notification
// scheduler; no such infrastructure exists anywhere in this app (see docs/ARCHITECTURE.md).
const WeekPrepPreferencesV1 = z.object({
  enabled:z.boolean(),
  prepDayOfWeek:z.number().int().min(0).max(6),
  prepLocalTime:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/,"prepLocalTime must be HH:MM"),
}).strict();

// Phase 8: progress and reports. Keys are required-but-nullable (same convention as
// `ProfileUpsertV1`) rather than optional, so a client always states its intent explicitly; the
// refine below rejects an all-null submission, since an empty measurement carries no information.
const BodyMeasurementCreateV1 = z.object({
  schemaVersion:z.literal("BodyMeasurementCreateV1"),
  localDate:CanonicalLocalDate,
  weightKg:z.number().finite().min(20).max(400).nullable(),
  bodyFatPercent:z.number().finite().min(1).max(75).nullable(),
  waistCm:z.number().finite().min(20).max(300).nullable(),
  hipCm:z.number().finite().min(20).max(300).nullable(),
  chestCm:z.number().finite().min(20).max(300).nullable(),
  note:z.string().trim().max(300).nullable(),
}).strict().refine(
  (x)=>x.weightKg!=null||x.bodyFatPercent!=null||x.waistCm!=null||x.hipCm!=null||x.chestCm!=null,
  {message:"At least one measurement value is required",path:["weightKg"]},
);
const BODY_PHOTO_ANGLES=["front","side","back"] as const;
const BodyPhotoSetInput = z.object({
  localDate:CanonicalLocalDate,
  angle:z.enum(BODY_PHOTO_ANGLES).nullable(),
  mimeType:z.enum(PHOTO_ASSET_MIME_TYPES),
  byteSize:z.number().int().min(1).max(8_000_000),
  storageKey:z.string().trim().min(1).max(300),
}).strict();
const PROGRESS_REPORT_TYPES=["daily","weekly"] as const;
/** `periodLocalDate` is the report's single anchor date: the day itself for a daily report, or that week's `weekStartLocalDate` for a weekly one — both are plain canonical local dates, so one schema covers both. */
const ProgressReportExportInput = z.object({
  reportType:z.enum(PROGRESS_REPORT_TYPES),
  periodLocalDate:CanonicalLocalDate,
  byteSize:z.number().int().min(1).max(8_000_000),
  storageKey:z.string().trim().min(1).max(300),
}).strict();

const SexAtBirth = z.enum(["male","female"]);
const ActivityLevel = z.enum(["sedentary","light","moderate","active","very-active"]);
export const ProfileUpsertV1 = z.object({
  schemaVersion:z.literal("ProfileUpsertV1"),
  displayName:z.string().trim().min(1).max(120).nullable(),
  birthDate:CanonicalLocalDate.nullable(),
  sexAtBirth:SexAtBirth.nullable(),
  heightCm:z.number().finite().min(100).max(260).nullable(),
  activityLevel:ActivityLevel.nullable(),
}).strict();

const AssessmentAnswerValue = z.union([z.number().finite(),z.string(),z.boolean(),z.null()]);
export const AssessmentSnapshotPayloadV1 = z.object({
  schemaVersion:z.literal("AssessmentSnapshotPayloadV1"),
  answers:z.record(z.string().trim().min(1),AssessmentAnswerValue).refine((a)=>Object.keys(a).length>0,"answers must include at least one entry"),
}).strict();

export const SAFETY_ACKNOWLEDGEMENT_TYPES=["non-diagnostic-health-boundary","data-processing-consent"] as const;
export const SafetyAcknowledgementV1 = z.object({
  schemaVersion:z.literal("SafetyAcknowledgementV1"),
  acknowledgementType:z.enum(SAFETY_ACKNOWLEDGEMENT_TYPES),
  policyVersion:z.string().trim().min(1).max(40),
}).strict();

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
export type StoredProfile={userSubject:string;displayName:string|null;birthDate:string|null;sexAtBirth:"male"|"female"|null;heightCm:number|null;activityLevel:"sedentary"|"light"|"moderate"|"active"|"very-active"|null;updatedAt:string};
export type StoredAssessmentSnapshot={id:string;userSubject:string;completedAt:string;payloadJson:string;createdAt:string};
export type StoredSafetyAcknowledgement={id:string;userSubject:string;acknowledgementType:typeof SAFETY_ACKNOWLEDGEMENT_TYPES[number];policyVersion:string;acknowledgedAt:string;createdAt:string};
export type StoredMealPlanVersion={id:string;userSubject:string;slotsJson:string;createdAt:string};
export type StoredCustomPortion={id:string;measure:string;label:string;gramsPerUnit:number};
export type StoredCustomFoodVersion={
  id:string;foodKey:string;ownerSubject:string;name:string;isLiquid:boolean;
  energyKcal:number;proteinG:number;carbsG:number;fatG:number;fiberG:number|null;
  allergenDataStatus:"verified"|"unknown"|"not-applicable";allergenIds:string[];
  dietarySafetyDataStatus:"verified"|"unknown"|"not-applicable";dietaryConflictRuleIds:string[];
  verifiedAt:string;createdAt:string;portions:StoredCustomPortion[];
};
/** A new global (unowned) catalog row imported from an external verified source. No household portions are attached — the app logs these by exact grams. */
export type StoredVerifiedFoodImport={
  id:string;foodKey:string;name:string;brand:string|null;barcode:string|null;isLiquid:boolean;
  energyKcal:number;proteinG:number;carbsG:number;fatG:number;fiberG:number|null;
  sourceProvider:"open-food-facts";sourceExternalId:string;sourceEvidenceUrl:string|null;
  verifiedAt:string;createdAt:string;
};
export type MemoryFactProvenance="user-stated"|"ai-inferred";
export type MemoryFactConfidence="high"|"medium"|"low";
export type StoredMemoryFact={id:string;userSubject:string;factText:string;provenance:MemoryFactProvenance;confidence:MemoryFactConfidence;createdAt:string};
/** `narrative` is null until a provider has actually produced a validated `WeeklyInsightV1` for this week — deterministic `metrics` are always available immediately. */
export type StoredWeeklyInsightSnapshot={id:string;userSubject:string;weekStartLocalDate:string;metricsJson:string;narrativeJson:string|null;createdAt:string};
export type PhotoAssetKind=typeof PHOTO_ASSET_KINDS[number];
export type PhotoAssetMimeType=typeof PHOTO_ASSET_MIME_TYPES[number];
export type StoredPhotoAsset={id:string;userSubject:string;kind:PhotoAssetKind;mimeType:PhotoAssetMimeType;byteSize:number;storageKey:string;createdAt:string};
export type LabDocumentMimeType=typeof LAB_DOCUMENT_MIME_TYPES[number];
export type StoredLabDocument={id:string;userSubject:string;mimeType:LabDocumentMimeType;byteSize:number;storageKey:string;createdAt:string};
export type LabResultEntryStatus=typeof LAB_RESULT_STATUSES[number];
export type StoredLabResultEntry={id:string;userSubject:string;labDocumentId:string|null;markerName:string;valueText:string;unitText:string|null;referenceRangeText:string|null;status:LabResultEntryStatus;createdAt:string};
export type StoredSupplementRecord={id:string;userSubject:string;foodVersionId:string|null;name:string;note:string|null;isActive:boolean;createdAt:string};
export type StoredRecipe={id:string;userSubject:string;name:string;servings:number;ingredientsJson:string;createdAt:string};
export type StoredWeeklyPlanVersion={id:string;userSubject:string;weekStartLocalDate:string;daysJson:string;createdAt:string};
export type StoredPantryItem={id:string;userSubject:string;foodVersionId:string|null;label:string;quantityGrams:number|null;quantityNote:string|null;createdAt:string;updatedAt:string};
export type StoredShoppingListItem={id:string;userSubject:string;weekStartLocalDate:string;foodVersionId:string|null;label:string;neededGrams:number|null;isChecked:boolean;createdAt:string};
export type StoredWeekPrepPreferences={userSubject:string;enabled:boolean;prepDayOfWeek:number;prepLocalTime:string;updatedAt:string};
export type StoredWeekPrepStatus={userSubject:string;weekStartLocalDate:string;isCompleted:boolean;updatedAt:string};
export type StoredBodyMeasurement={id:string;userSubject:string;localDate:string;weightKg:number|null;bodyFatPercent:number|null;waistCm:number|null;hipCm:number|null;chestCm:number|null;note:string|null;createdAt:string};
export type BodyPhotoAngle=typeof BODY_PHOTO_ANGLES[number];
export type StoredBodyPhotoSet={id:string;userSubject:string;localDate:string;angle:BodyPhotoAngle|null;mimeType:PhotoAssetMimeType;byteSize:number;storageKey:string;createdAt:string};
export type StoredProgressMilestone={id:string;userSubject:string;milestoneKey:string;achievedAt:string};
export type ProgressReportType=typeof PROGRESS_REPORT_TYPES[number];
export type StoredProgressReportExport={id:string;userSubject:string;reportType:ProgressReportType;periodLocalDate:string;mimeType:"application/pdf";byteSize:number;storageKey:string;createdAt:string};

export interface V1Transaction {
  getUserContext(userSubject:string):Promise<AuthenticatedUserContext>;
  /** Lazily binds the authenticated subject to its `users` row on first request; idempotent. */
  getOrCreateUser(userSubject:string,defaults:{timezone:string;locale:string}):Promise<AuthenticatedUserContext>;
  getProfile(userSubject:string):Promise<StoredProfile|null>;
  upsertProfile(profile:StoredProfile):Promise<void>;
  insertAssessmentSnapshot(snapshot:StoredAssessmentSnapshot):Promise<void>;
  getAssessmentSnapshots(userSubject:string):Promise<StoredAssessmentSnapshot[]>;
  insertSafetyAcknowledgement(acknowledgement:StoredSafetyAcknowledgement):Promise<void>;
  getSafetyAcknowledgements(userSubject:string):Promise<StoredSafetyAcknowledgement[]>;
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
  /** Atomically writes both rows together — an adapter backed by real storage must not leave one without the other. */
  insertNutritionEventWithOutcome(event:StoredNutritionEvent,outcome:StoredOutcome):Promise<void>;
  getFoodVersion(userSubject:string,foodVersionId:string):Promise<VersionedFood|null>;
  /** Return every active allergen exclusion, including unresolved rows with null ids. */
  getActiveAllergenExclusions(userSubject:string):Promise<AllergenSafetyExclusion[]>;
  getActiveDietaryExclusions(userSubject:string):Promise<DietarySafetyExclusion[]>;
  getScientificReferenceSnapshots(referenceIds:string[]):Promise<ScientificReferenceSnapshot[]>;
  insertGoalVersion(goal:StoredGoalVersion):Promise<void>;
  setCurrentGoal(userSubject:string,goalVersionId:string,selectedAt:string):Promise<void>;
  /** Atomically inserts the goal version and selects it as current in one write. */
  insertGoalVersionAndSetCurrent(goal:StoredGoalVersion,selectedAt:string):Promise<void>;
  /** The authenticated subject's currently-selected goal version, or null before one has ever been set. */
  getCurrentGoalVersion(userSubject:string):Promise<StoredGoalVersion|null>;
  /** Every nutrition event recorded for one authenticated local calendar day (read-only; `Bugün`'s daily snapshot). */
  listNutritionEventsForLocalDate(userSubject:string,localDate:string):Promise<StoredNutritionEvent[]>;
  /** Verified-catalog text search by normalized name, scoped to global rows plus this subject's own custom foods. */
  searchFoodVersions(userSubject:string,query:string,limit:number):Promise<VersionedFood[]>;
  /** Verified-catalog barcode lookup, scoped the same way as `searchFoodVersions`. */
  findFoodVersionByBarcode(userSubject:string,barcode:string):Promise<VersionedFood|null>;
  /** Verified-catalog lookup by deterministic `food_key` (e.g. `off-3017620422003`), used to make external-source imports idempotent. */
  getFoodVersionByFoodKey(userSubject:string,foodKey:string):Promise<VersionedFood|null>;
  /** Inserts one externally-verified food as a new global (unowned) catalog row. Callers must pre-check `getFoodVersionByFoodKey` themselves — this does not deduplicate. */
  importVerifiedFoodVersion(food:StoredVerifiedFoodImport):Promise<void>;
  /** Atomically inserts a new meal-plan version and selects it as current in one write. */
  insertMealPlanVersionAndSetCurrent(plan:StoredMealPlanVersion,selectedAt:string):Promise<void>;
  /** The authenticated subject's currently-selected meal plan ("Planım"), or null before one has ever been created. */
  getCurrentMealPlan(userSubject:string):Promise<StoredMealPlanVersion|null>;
  /**
   * Deletes one manually-logged nutrition event, for a correction ("yanlış eklemişim") or an
   * explicit "yemedim" undo. Must refuse (throw) when the event is the immutable result of a
   * confirmed AI action — production enforces this at the storage layer via the
   * `ai_action_outcomes.result_event_id` foreign key (`ON DELETE RESTRICT`), so a correct adapter
   * only needs to translate that failure into a clear error, not duplicate the check itself.
   */
  deleteManualNutritionEvent(userSubject:string,eventId:string):Promise<void>;
  /** Writes a new user-owned custom food (plain manual entry or a summed recipe) into the shared catalog, scoped by owner_subject exactly like every other private row there. */
  insertCustomFoodVersion(food:StoredCustomFoodVersion):Promise<void>;
  /** Delete the authenticated account and all dependent lifecycle rows in one transaction, in dependency-safe order. */
  purgeAuthenticatedUser(userSubject:string):Promise<void>;
  /** Appends one ARVEN memory fact. Never deduplicated by the adapter — the service decides what's worth remembering. */
  insertMemoryFact(fact:StoredMemoryFact):Promise<void>;
  /** Every memory fact for this subject, most recent first — the exact list the user sees (and can delete from) in "ARVEN hafızası". */
  listMemoryFacts(userSubject:string):Promise<StoredMemoryFact[]>;
  /** User-initiated forget: unlike every other ledger table here, a memory fact is genuinely deleted, not superseded. Silently succeeds if the id is already gone or belongs to another subject. */
  deleteMemoryFact(userSubject:string,id:string):Promise<void>;
  /** Appends one weekly insight snapshot (deterministic metrics, plus a narrative once a provider has generated one). */
  insertWeeklyInsightSnapshot(snapshot:StoredWeeklyInsightSnapshot):Promise<void>;
  /** The most recently generated snapshot for this exact week, or null if none exists yet. */
  getLatestWeeklyInsightSnapshot(userSubject:string,weekStartLocalDate:string):Promise<StoredWeeklyInsightSnapshot|null>;
  /** Records metadata for one already-stored photo (see `lib/media/storage.ts`); the adapter never touches the bytes themselves. */
  insertPhotoAsset(asset:StoredPhotoAsset):Promise<void>;
  getPhotoAsset(userSubject:string,id:string):Promise<StoredPhotoAsset|null>;
  /** Every photo for this subject, most recent first. */
  listPhotoAssets(userSubject:string):Promise<StoredPhotoAsset[]>;
  /** User-initiated forget, same semantics as `deleteMemoryFact`: genuinely deleted, silently a no-op if already gone or owned by another subject. Callers are responsible for also deleting the underlying bytes via `lib/media/storage.ts`. */
  deletePhotoAsset(userSubject:string,id:string):Promise<void>;
  /** Records metadata for one already-stored lab document (see `lib/media/storage.ts`); the adapter never touches the bytes themselves. */
  insertLabDocument(document:StoredLabDocument):Promise<void>;
  getLabDocument(userSubject:string,id:string):Promise<StoredLabDocument|null>;
  /** Every lab document for this subject, most recent first. */
  listLabDocuments(userSubject:string):Promise<StoredLabDocument[]>;
  /** User-initiated forget. Callers are responsible for also deleting the underlying bytes via `lib/media/storage.ts`; the schema sets any referencing `lab_result_entries.lab_document_id` to NULL rather than deleting those rows, so a confirmed reading survives its source photo being removed. */
  deleteLabDocument(userSubject:string,id:string):Promise<void>;
  /** Appends one 'extracted' (unreviewed) or user-entered lab result row. */
  insertLabResultEntry(entry:StoredLabResultEntry):Promise<void>;
  /** Every lab result entry for this subject, most recent first. */
  listLabResultEntries(userSubject:string):Promise<StoredLabResultEntry[]>;
  /** Edits an entry's transcribed text and marks it 'confirmed' in one write — the only supported transition, since a confirmed entry going back to 'extracted' has no product meaning. Must throw if the row does not exist or belongs to another subject. */
  confirmLabResultEntry(userSubject:string,id:string,edited:{markerName:string;valueText:string;unitText:string|null;referenceRangeText:string|null}):Promise<StoredLabResultEntry>;
  /** User-initiated forget: rejecting an unreviewed extraction, or removing a confirmed entry later. Silently a no-op if already gone or owned by another subject. */
  deleteLabResultEntry(userSubject:string,id:string):Promise<void>;
  /** Adds one supplement record ("the user takes this") — no dosage/schedule, see the type's doc comment. */
  insertSupplementRecord(record:StoredSupplementRecord):Promise<void>;
  /** Every supplement record for this subject, most recent first (active and inactive alike — the client decides what to show). */
  listSupplementRecords(userSubject:string):Promise<StoredSupplementRecord[]>;
  /** Toggles active/inactive (e.g. "stopped taking this") without losing the record. Must throw if the row does not exist or belongs to another subject. */
  setSupplementRecordActive(userSubject:string,id:string,isActive:boolean):Promise<void>;
  /** User-initiated forget, same semantics as `deleteMemoryFact`. */
  deleteSupplementRecord(userSubject:string,id:string):Promise<void>;
  /** Adds one Phase 7 recipe (stable ingredient references — see `RecipeCreateV1`'s doc comment). */
  insertRecipe(recipe:StoredRecipe):Promise<void>;
  /** Every recipe for this subject, most recent first. */
  listRecipes(userSubject:string):Promise<StoredRecipe[]>;
  getRecipe(userSubject:string,id:string):Promise<StoredRecipe|null>;
  /** User-initiated forget, same semantics as `deleteMemoryFact`. */
  deleteRecipe(userSubject:string,id:string):Promise<void>;
  /** Atomically inserts a new weekly-plan version and selects it as current for that specific week in one write. */
  insertWeeklyPlanVersionAndSetCurrent(plan:StoredWeeklyPlanVersion,selectedAt:string):Promise<void>;
  /** The authenticated subject's currently-selected weekly plan for this exact week, or null before one has ever been created. */
  getCurrentWeeklyPlan(userSubject:string,weekStartLocalDate:string):Promise<StoredWeeklyPlanVersion|null>;
  /** Adds one pantry item ("Kilerim"), optionally linked to a verified food for automatic shopping-list matching. */
  insertPantryItem(item:StoredPantryItem):Promise<void>;
  /** Every pantry item for this subject, most recent first. */
  listPantryItems(userSubject:string):Promise<StoredPantryItem[]>;
  /** Edits only the quantity of an existing pantry item. Must throw if the row does not exist or belongs to another subject. */
  updatePantryItem(userSubject:string,id:string,edit:{quantityGrams:number|null;quantityNote:string|null}):Promise<StoredPantryItem>;
  /** User-initiated forget, same semantics as `deleteMemoryFact`. */
  deletePantryItem(userSubject:string,id:string):Promise<void>;
  /** Fully replaces this subject's shopping list for one week in a single write (regenerating always starts clean — no partial-edit history). */
  replaceShoppingListItems(userSubject:string,weekStartLocalDate:string,items:StoredShoppingListItem[]):Promise<void>;
  /** Every shopping-list item for this subject and week, most recently generated first. */
  listShoppingListItems(userSubject:string,weekStartLocalDate:string):Promise<StoredShoppingListItem[]>;
  /** Toggles one shopping-list item checked/unchecked. Must throw if the row does not exist or belongs to another subject. */
  setShoppingListItemChecked(userSubject:string,id:string,isChecked:boolean):Promise<void>;
  /** The authenticated subject's week-prep reminder preference, or null before one has ever been set. */
  getWeekPrepPreferences(userSubject:string):Promise<StoredWeekPrepPreferences|null>;
  /** Upserts the authenticated subject's single week-prep reminder preference row. */
  upsertWeekPrepPreferences(preferences:StoredWeekPrepPreferences):Promise<void>;
  /** Whether this subject has marked week-prep complete for this specific week, or null before it has ever been set (treat as not completed). */
  getWeekPrepStatus(userSubject:string,weekStartLocalDate:string):Promise<StoredWeekPrepStatus|null>;
  /** Upserts this subject's week-prep completion flag for one week. */
  upsertWeekPrepStatus(status:StoredWeekPrepStatus):Promise<void>;
  /** Adds one body-measurement row ("Gelişim", Faz 8). */
  insertBodyMeasurement(measurement:StoredBodyMeasurement):Promise<void>;
  /** Every measurement for this subject, in no particular order — callers sort as needed (see `V1MutationService.recordBodyMeasurement`). */
  listBodyMeasurements(userSubject:string):Promise<StoredBodyMeasurement[]>;
  /** User-initiated forget, same semantics as `deleteMemoryFact`. Does not retract any milestone the deleted measurement helped earn — see `StoredProgressMilestone`'s doc comment. */
  deleteBodyMeasurement(userSubject:string,id:string):Promise<void>;
  /** Records metadata for a body-progress photo the caller has already written to `lib/media/storage.ts`; the adapter never touches the bytes themselves. */
  insertBodyPhotoSet(photo:StoredBodyPhotoSet):Promise<void>;
  getBodyPhotoSet(userSubject:string,id:string):Promise<StoredBodyPhotoSet|null>;
  /** Every body-progress photo for this subject, most recent first. */
  listBodyPhotoSets(userSubject:string):Promise<StoredBodyPhotoSet[]>;
  /** User-initiated forget, same semantics as `deleteMemoryFact`. Callers are responsible for also deleting the underlying bytes via `lib/media/storage.ts`. */
  deleteBodyPhotoSet(userSubject:string,id:string):Promise<void>;
  /** Whether this (userSubject, milestoneKey) pair has already been earned — checked by `V1MutationService.recordBodyMeasurement` before inserting, so a milestone is never earned twice. */
  hasProgressMilestone(userSubject:string,milestoneKey:string):Promise<boolean>;
  /** Appends one newly-earned milestone. Callers must check `hasProgressMilestone` first; the schema's unique index is only a defense-in-depth backstop, not the primary race-avoidance mechanism (unlike `insertProposalIfAbsent`). */
  insertProgressMilestone(milestone:StoredProgressMilestone):Promise<void>;
  /** Every milestone this subject has earned, most recently first. */
  listProgressMilestones(userSubject:string):Promise<StoredProgressMilestone[]>;
  /** Records metadata for a report PDF the caller has already generated (see `lib/progress/pdf.ts`) and written to `lib/media/storage.ts`. */
  insertProgressReportExport(report:StoredProgressReportExport):Promise<void>;
  getProgressReportExport(userSubject:string,id:string):Promise<StoredProgressReportExport|null>;
  /** Every report export for this subject, most recently generated first. */
  listProgressReportExports(userSubject:string):Promise<StoredProgressReportExport[]>;
  /** User-initiated forget, same semantics as `deleteMemoryFact`. Callers are responsible for also deleting the underlying bytes via `lib/media/storage.ts`. */
  deleteProgressReportExport(userSubject:string,id:string):Promise<void>;
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
async function assertProposalIntegrity(proposal:StoredProposal):Promise<void>{const actual=await sha256(proposal.payloadJson);if(actual!==proposal.payloadSha256)throw new ApplicationRejectedError("proposal-integrity-failed","Stored proposal payload no longer matches its immutable hash");}
function instant(date:Date):string{if(!Number.isFinite(date.getTime()))throw new Error("Invalid service clock instant");return date.toISOString();}
export function deriveNutritionLocalDate(occurredAt:string,timezone:string,dayStart:number):string{assertCanonicalUtcInstant(occurredAt,"occurredAt");if(!Number.isInteger(dayStart)||dayStart<0||dayStart>1439)throw new Error("nutritionDayStartMinutes must be 0..1439");let f:Intl.DateTimeFormat;try{f=new Intl.DateTimeFormat("en-CA",{timeZone:timezone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"});}catch{throw new Error("Authenticated profile contains an invalid IANA timezone");}const p=Object.fromEntries(f.formatToParts(new Date(occurredAt)).filter(x=>x.type!=="literal").map(x=>[x.type,x.value]));const date=`${p.year}-${p.month}-${p.day}`;const mins=Number(p.hour)*60+Number(p.minute);if(!Number.isInteger(mins))throw new Error("Unable to derive local nutrition time");return mins<dayStart?previousLocalDate(date):date;}
function safety(food:VersionedFood){return{allergens:[{foodId:food.foodKey,foodName:food.name,allergenDataStatus:food.allergenDataStatus??"unknown" as const,allergenIds:food.allergenIds??[]}],dietary:[{foodId:food.foodKey,foodName:food.name,dietarySafetyDataStatus:food.dietarySafetyDataStatus??"unknown" as const,dietaryConflictRuleIds:food.dietaryConflictRuleIds??[]}]};}
function round6(value:number):number{return Math.round((value+Number.EPSILON)*1e6)/1e6;}
/** A recipe/custom food inherits its ingredients' allergen and dietary-conflict ids so later logging still safety-checks correctly; status is only "verified" when every ingredient's own data was. */
function aggregateIngredientSafety(foods:VersionedFood[]):{allergenDataStatus:"verified"|"unknown"|"not-applicable";allergenIds:string[];dietarySafetyDataStatus:"verified"|"unknown"|"not-applicable";dietaryConflictRuleIds:string[]}{
  const isSafe=(status:string|undefined)=>status==="verified"||status==="not-applicable";
  return{
    allergenDataStatus:foods.every(f=>isSafe(f.allergenDataStatus))?"verified":"unknown",
    allergenIds:Array.from(new Set(foods.flatMap(f=>f.allergenIds??[]))),
    dietarySafetyDataStatus:foods.every(f=>isSafe(f.dietarySafetyDataStatus))?"verified":"unknown",
    dietaryConflictRuleIds:Array.from(new Set(foods.flatMap(f=>f.dietaryConflictRuleIds??[]))),
  };
}
async function mealPayload(tx:V1Transaction,subject:string,mealType:z.infer<typeof MealType>,items:Array<z.infer<typeof ManualMealItem>>):Promise<Record<string,unknown>>{
  const resolvedFoods:VersionedFood[]=await Promise.all(items.map(async(item)=>{
    const food=await tx.getFoodVersion(subject,item.foodVersionId);
    if(!food)throw new ApplicationRejectedError("food-version-unavailable",`Verified food version ${item.foodVersionId} is unavailable to this user`);
    return food;
  }));
  const snapshots:Array<Record<string,unknown>>=[];
  for(const [index,item] of items.entries()){
    const food=resolvedFoods[index];
    let portion;
    try{const selection:PortionSelection=item.selection.kind==="household"?{kind:"household",portionOptionId:item.selection.portionVersionId,quantity:item.selection.quantity}:{kind:"custom-grams",grams:item.selection.grams};portion=resolvePortionSelection(food,selection);}catch(error){rejectApplication("portion-resolution-failed",error);}
    let nutrition:NutritionFacts;
    try{nutrition=scaleNutritionForStorage(portion);}catch(error){rejectApplication("nutrition-calculation-failed",error);}
    snapshots.push({foodVersionId:food.id,foodKey:food.foodKey,foodName:food.name,calculationVersion:item.calculationVersion,grams:portion.grams,portion:portion.display??null,nutrition});
  }
  const [allergens,exclusions]=await Promise.all([tx.getActiveAllergenExclusions(subject),tx.getActiveDietaryExclusions(subject)]);
  const allergenCandidates=resolvedFoods.flatMap((food)=>safety(food).allergens);
  const dietaryCandidates=resolvedFoods.flatMap((food)=>safety(food).dietary);
  try{assertNoAllergyConflict(allergenCandidates,allergens);assertNoDietaryExclusionConflict(dietaryCandidates,exclusions);}catch(error){rejectApplication("safety-conflict",error);}
  return{schemaVersion:"MealEventV1",mealType,items:snapshots};
}
/**
 * Resolves one weekly-plan slot's items (a mix of direct foods and recipe references) into
 * storable snapshots plus the flat list of foods to safety-check, mirroring `mealPayload` above.
 * A recipe item is expanded into its *current* ingredients purely to compute a total (nutrition
 * scaled by `servings / recipe.servings`) and to safety-check every ingredient food, then
 * collapsed into a single `{kind:"recipe",...}` snapshot line — `generateShoppingList` is what
 * later re-walks the recipe by its stable id for per-ingredient shopping quantities.
 */
async function resolveWeeklyPlanItems(tx:V1Transaction,subject:string,items:Array<z.infer<typeof WeeklyPlanItemV1>>):Promise<{snapshots:Array<Record<string,unknown>>;safetyFoods:VersionedFood[]}>{
  const snapshots:Array<Record<string,unknown>>=[];
  const safetyFoods:VersionedFood[]=[];
  for(const item of items){
    if(item.kind==="food"){
      const food=await tx.getFoodVersion(subject,item.foodVersionId);
      if(!food)throw new ApplicationRejectedError("food-version-unavailable",`Verified food version ${item.foodVersionId} is unavailable to this user`);
      const selection:PortionSelection=item.selection.kind==="household"?{kind:"household",portionOptionId:item.selection.portionVersionId,quantity:item.selection.quantity}:{kind:"custom-grams",grams:item.selection.grams};
      let portion;try{portion=resolvePortionSelection(food,selection);}catch(error){rejectApplication("portion-resolution-failed",error);}
      let nutrition:NutritionFacts;try{nutrition=scaleNutritionForStorage(portion);}catch(error){rejectApplication("nutrition-calculation-failed",error);}
      safetyFoods.push(food);
      snapshots.push({kind:"food",foodVersionId:food.id,foodKey:food.foodKey,foodName:food.name,calculationVersion:item.calculationVersion,grams:portion.grams,portion:portion.display??null,nutrition});
    }else{
      const recipe=await tx.getRecipe(subject,item.recipeId);
      if(!recipe)throw new ApplicationRejectedError("recipe-unavailable",`Recipe ${item.recipeId} is unavailable to this user`);
      const ingredients=JSON.parse(recipe.ingredientsJson) as Array<z.infer<typeof RecipeIngredientV1>>;
      const resolvedIngredients=await Promise.all(ingredients.map(async(ingredient)=>{
        const food=await tx.getFoodVersion(subject,ingredient.foodVersionId);
        if(!food)throw new ApplicationRejectedError("food-version-unavailable",`Verified food version ${ingredient.foodVersionId} is unavailable to this user`);
        const selection:PortionSelection=ingredient.selection.kind==="household"?{kind:"household",portionOptionId:ingredient.selection.portionVersionId,quantity:ingredient.selection.quantity}:{kind:"custom-grams",grams:ingredient.selection.grams};
        let portion;try{portion=resolvePortionSelection(food,selection);}catch(error){rejectApplication("portion-resolution-failed",error);}
        let nutrition:NutritionFacts;try{nutrition=scaleNutritionForStorage(portion);}catch(error){rejectApplication("nutrition-calculation-failed",error);}
        return{food,grams:portion.grams,nutrition};
      }));
      for(const resolved of resolvedIngredients) safetyFoods.push(resolved.food);
      const totals=sumNutrition(resolvedIngredients.map((resolved)=>resolved.nutrition));
      const totalGrams=resolvedIngredients.reduce((sum,resolved)=>sum+resolved.grams,0);
      const ratio=item.servings/recipe.servings;
      snapshots.push({
        kind:"recipe",recipeId:recipe.id,recipeName:recipe.name,servings:item.servings,
        grams:round6(totalGrams*ratio),
        nutrition:{energyKcal:round6(totals.energyKcal*ratio),proteinG:round6(totals.proteinG*ratio),carbsG:round6(totals.carbsG*ratio),fatG:round6(totals.fatG*ratio),fiberG:totals.fiberG==null?null:round6(totals.fiberG*ratio)},
      });
    }
  }
  return{snapshots,safetyFoods};
}
/**
 * Deterministic milestone evaluation for "Gelişim" (Faz 8): purely a function of the subject's own
 * measurement history (already including the just-inserted one, sorted ascending by localDate then
 * createdAt) — never AI, never a goal the app doesn't actually track (this app's goals are
 * macro/energy targets, not a target body weight; see docs/ROADMAP.md's Phase 8 entry). Returns the
 * set of milestone keys the history currently qualifies for; `recordBodyMeasurement` is what filters
 * out ones already earned before inserting.
 */
function evaluateBodyMeasurementMilestones(history:StoredBodyMeasurement[]):string[]{
  const earned:string[]=[];
  if(history.length>=1)earned.push("first-measurement-logged");
  if(history.length>=5)earned.push("five-measurements-logged");
  if(history.length>=20)earned.push("twenty-measurements-logged");
  const withWeight=history.filter((m)=>m.weightKg!=null);
  if(withWeight.length>=2){
    const change=Math.abs(withWeight[withWeight.length-1].weightKg!-withWeight[0].weightKg!);
    if(change>=1)earned.push("weight-change-1kg-observed");
    if(change>=5)earned.push("weight-change-5kg-observed");
  }
  return earned;
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
  /**
   * Runs `primary` and, only if it throws (e.g. a unique-constraint race from a concurrent
   * caller), re-queries under `requery` for the row the race actually produced. If that row is
   * found it wins (after any consistency check `requery` itself performs); otherwise the
   * original error is rethrown. Centralizes the idempotent-race-retry shape shared by
   * decideAiAction, applyConfirmedAiAction, and recordConfirmedFailure.
   */
  private async withRaceRetry<T>(primary:()=>Promise<T>,requery:(tx:V1Transaction)=>Promise<T|null>):Promise<T>{
    try{
      return await primary();
    }catch(error){
      const winner=await this.runner.transaction(requery);
      if(winner!==null)return winner;
      throw error;
    }
  }
  async createAiProposal(type:AiActionType,input:unknown,idempotencyKey:string):Promise<StoredProposal>{const key=idempotencyKey.trim();if(!key)throw new Error("idempotencyKey is required");const parsed=type==="meal-log"?MealLogActionV1.parse(input):WaterLogActionV1.parse(input);const payloadJson=canonicalJson(parsed);const hash=await sha256(payloadJson);const candidate:StoredProposal={id:this.idFactory(),userSubject:this.subject,actionType:type,schemaVersion:parsed.schemaVersion,payloadJson,payloadSha256:hash,idempotencyKey:key,createdAt:instant(this.clock.now())};return this.runner.transaction(async tx=>assertSameImmutableProposal(await tx.insertProposalIfAbsent(candidate),candidate));}
  async decideAiAction(actionId:string,decision:AiDecision):Promise<StoredDecision>{
    return this.withRaceRetry(
      ()=>this.runner.transaction(async tx=>{
        const p=await tx.getProposal(this.subject,actionId);
        if(!p)throw new Error("AI proposal not found in authenticated scope");
        const old=await tx.getDecision(this.subject,actionId);
        if(old){if(old.decision!==decision)throw new Error("AI decision is immutable once recorded");return old;}
        const d={actionId,userSubject:this.subject,decision,decidedAt:instant(this.clock.now())};
        await tx.insertDecision(d);
        return d;
      }),
      async tx=>{
        const winner=await tx.getDecision(this.subject,actionId);
        if(winner&&winner.decision!==decision)throw new Error("AI decision is immutable once recorded");
        return winner;
      },
    );
  }
  async applyConfirmedAiAction(actionId:string):Promise<StoredNutritionEvent>{
    const result=await this.withRaceRetry(
      ()=>this.runner.transaction(async tx=>{
        const oldEvent=await readAppliedOutcomeEvent(tx,this.subject,actionId);
        if(oldEvent)return{kind:"applied" as const,event:oldEvent};
        const p=await tx.getProposal(this.subject,actionId);const d=await tx.getDecision(this.subject,actionId);if(!p||!d||d.decision!=="confirmed")throw new Error("Explicit confirmation is required before application");
        const now=instant(this.clock.now());
        try{
          let decoded:unknown;
          try{decoded=JSON.parse(p.payloadJson);}catch(error){rejectApplication("invalid-stored-payload",error);}
          await assertProposalIntegrity(p);
          const c=await tx.getUserContext(this.subject);
          let e:StoredNutritionEvent;
          if(p.actionType==="water-log"){
            let x:z.infer<typeof WaterLogActionV1>;try{x=WaterLogActionV1.parse(decoded);}catch(error){rejectApplication("invalid-stored-payload",error);}
            let localDate:string;try{localDate=deriveNutritionLocalDate(x.occurredAt,c.timezone,c.nutritionDayStartMinutes);}catch(error){rejectApplication("local-date-derivation-failed",error);}
            e={id:this.idFactory(),userSubject:this.subject,eventType:"water-log",occurredAt:x.occurredAt,localDate,payloadJson:canonicalJson({schemaVersion:"WaterEventV1",milliliters:x.milliliters}),createdAt:now};
          }else{
            let x:z.infer<typeof MealLogActionV1>;try{x=MealLogActionV1.parse(decoded);}catch(error){rejectApplication("invalid-stored-payload",error);}
            let localDate:string;try{localDate=deriveNutritionLocalDate(x.occurredAt,c.timezone,c.nutritionDayStartMinutes);}catch(error){rejectApplication("local-date-derivation-failed",error);}
            const payload=await mealPayload(tx,this.subject,x.mealType,x.items);
            e={id:this.idFactory(),userSubject:this.subject,eventType:"meal-log",occurredAt:x.occurredAt,localDate,payloadJson:canonicalJson(payload),createdAt:now};
          }
          await tx.insertNutritionEventWithOutcome(e,{actionId:p.id,userSubject:this.subject,actionType:p.actionType,confirmationMarker:"confirmed",outcome:"applied",resultEventId:e.id,failureCode:null,recordedAt:now});
          return{kind:"applied" as const,event:e};
        }catch(error){
          if(!(error instanceof ApplicationRejectedError))throw error;
          const outcome:StoredOutcome={actionId:p.id,userSubject:this.subject,actionType:p.actionType,confirmationMarker:"confirmed",outcome:"failed",resultEventId:null,failureCode:error.code,recordedAt:now};
          await tx.insertOutcome(outcome);
          return{kind:"failed" as const,outcome,message:error.message};
        }
      }),
      async tx=>{
        const winner=await readAppliedOutcomeEvent(tx,this.subject,actionId);
        return winner?{kind:"applied" as const,event:winner}:null;
      },
    );
    if(result.kind==="failed")throw new Error(`AI action application failed permanently (${result.outcome.failureCode}): ${result.message}`);
    return result.event;
  }
  async recordConfirmedFailure(actionId:string,failureCode:string):Promise<StoredOutcome>{
    const code=failureCode.trim();if(!code)throw new Error("failureCode is required");
    return this.withRaceRetry(
      ()=>this.runner.transaction(async tx=>{
        const old=await tx.getOutcome(this.subject,actionId);if(old){if(old.outcome==="applied")throw new Error("Applied AI action cannot be reclassified as failed");return old;}
        const p=await tx.getProposal(this.subject,actionId);const d=await tx.getDecision(this.subject,actionId);if(!p||!d||d.decision!=="confirmed")throw new Error("Only a confirmed proposal may record application failure");
        const o:StoredOutcome={actionId,userSubject:this.subject,actionType:p.actionType,confirmationMarker:"confirmed",outcome:"failed",resultEventId:null,failureCode:code,recordedAt:instant(this.clock.now())};await tx.insertOutcome(o);return o;
      }),
      async tx=>{
        const winner=await tx.getOutcome(this.subject,actionId);
        if(winner&&winner.outcome==="applied")throw new Error("Applied AI action cannot be reclassified as failed");
        return winner;
      },
    );
  }
  async appendManualWater(occurredAt:string,milliliters:number):Promise<StoredNutritionEvent>{const x=WaterLogActionV1.omit({schemaVersion:true}).parse({occurredAt,milliliters});return this.runner.transaction(async tx=>{const c=await tx.getUserContext(this.subject);let localDate:string;try{localDate=deriveNutritionLocalDate(x.occurredAt,c.timezone,c.nutritionDayStartMinutes);}catch(error){rejectApplication("local-date-derivation-failed",error);}const e={id:this.idFactory(),userSubject:this.subject,eventType:"water-log" as const,occurredAt:x.occurredAt,localDate,payloadJson:canonicalJson({schemaVersion:"WaterEventV1",milliliters:x.milliliters}),createdAt:instant(this.clock.now())};await tx.insertNutritionEvent(e);return e;});}
  async appendManualMeal(input:{occurredAt:string;mealType:z.infer<typeof MealType>;items:unknown[]}):Promise<StoredNutritionEvent>{const x=z.object({occurredAt:CanonicalInstant,mealType:MealType,items:z.array(ManualMealItem).min(1).max(40)}).strict().parse(input);return this.runner.transaction(async tx=>{const c=await tx.getUserContext(this.subject);let localDate:string;try{localDate=deriveNutritionLocalDate(x.occurredAt,c.timezone,c.nutritionDayStartMinutes);}catch(error){rejectApplication("local-date-derivation-failed",error);}const payload=await mealPayload(tx,this.subject,x.mealType,x.items);const e={id:this.idFactory(),userSubject:this.subject,eventType:"meal-log" as const,occurredAt:x.occurredAt,localDate,payloadJson:canonicalJson(payload),createdAt:instant(this.clock.now())};await tx.insertNutritionEvent(e);return e;});}
  async createCalculatedGoalVersion(inputs:MifflinStJeorV1Inputs,referenceIds:string[],allocations:MealEnergyAllocation[]):Promise<StoredGoalVersion>{const inputSnapshot={...inputs};const allocationSnapshot=allocations.map((allocation)=>({...allocation}));assertMealEnergyAllocations(allocationSnapshot);const ids=canonicalReferenceIds(referenceIds);const targets=deriveCalculatedGoal({method:"mifflin-st-jeor",version:"v1",inputs:inputSnapshot,referenceIds:ids});return this.runner.transaction(async tx=>{const refs=await tx.getScientificReferenceSnapshots(ids);const byId=new Map(refs.map(ref=>[ref.id,ref]));if(byId.size!==ids.length||ids.some(id=>!byId.has(id)))throw new Error("Every scientific reference must resolve to a versioned snapshot");const ordered=ids.map(id=>byId.get(id)!);const now=instant(this.clock.now());const goal:StoredGoalVersion={id:this.idFactory(),userSubject:this.subject,source:"arven-calculated",calculatorId:"mifflin-st-jeor@v1",calculatorInputsJson:canonicalJson(inputSnapshot),referenceSnapshotsJson:canonicalJson(ordered),energyKcal:targets.energyKcal,proteinG:targets.proteinG,carbsG:targets.carbsG,fatG:targets.fatG,fiberG:targets.fiberG,waterMl:targets.waterMl,mealAllocationsJson:canonicalJson(allocationSnapshot),createdAt:now};await tx.insertGoalVersionAndSetCurrent(goal,now);return goal;});}
  /**
   * "Planım": stores a new versioned day plan (one or more meal slots) and makes it current.
   * Each slot's items are resolved and safety-checked exactly like a manual meal log (same
   * `mealPayload` helper), so a plan can never be created around a food a user is not allowed
   * to eat — it just never becomes a `nutrition_events` row until the user actually logs it.
   */
  async createMealPlanVersion(input:unknown):Promise<StoredMealPlanVersion>{
    const x=MealPlanVersionV1.parse(input);
    return this.runner.transaction(async tx=>{
      const resolvedSlots=[];
      for(const slot of x.slots){
        const payload=await mealPayload(tx,this.subject,slot.mealType,slot.items);
        resolvedSlots.push({mealType:slot.mealType,items:(payload as {items:unknown[]}).items});
      }
      const now=instant(this.clock.now());
      const plan:StoredMealPlanVersion={id:this.idFactory(),userSubject:this.subject,slotsJson:canonicalJson(resolvedSlots),createdAt:now};
      await tx.insertMealPlanVersionAndSetCurrent(plan,now);
      return plan;
    });
  }
  async getCurrentMealPlan():Promise<StoredMealPlanVersion|null>{return this.runner.transaction(async tx=>tx.getCurrentMealPlan(this.subject));}
  /**
   * Undo/correction for a manually-logged meal or water entry ("yemedim" / yanlış su ekledim).
   * Refuses to delete an event that is the immutable result of a confirmed AI action — the adapter
   * enforces this itself (see `V1Transaction.deleteManualNutritionEvent`'s doc comment).
   */
  async deleteManualNutritionEvent(eventId:string):Promise<void>{
    const id=Id.parse(eventId);
    await this.runner.transaction(async tx=>{
      try{await tx.deleteManualNutritionEvent(this.subject,id);}
      catch(error){rejectApplication("nutrition-event-delete-failed",error);}
    });
  }
  /** "Kendi yemeğini oluştur": a plain manually-entered food, private to this user, usable everywhere a verified food is (search, meal log, plan). */
  async createCustomFood(input:unknown):Promise<VersionedFood>{
    const x=CustomFoodV1.parse(input);
    const now=instant(this.clock.now());
    const id=this.idFactory();
    const food:StoredCustomFoodVersion={
      id,foodKey:`custom-${id}`,ownerSubject:this.subject,name:x.name,isLiquid:!!x.isLiquid,
      energyKcal:x.energyKcal,proteinG:x.proteinG,carbsG:x.carbsG,fatG:x.fatG,fiberG:x.fiberG??null,
      allergenDataStatus:"unknown",allergenIds:[],dietarySafetyDataStatus:"unknown",dietaryConflictRuleIds:[],
      verifiedAt:now,createdAt:now,
      portions:x.portions.map((p)=>({id:this.idFactory(),measure:p.measure,label:p.label,gramsPerUnit:p.gramsPerUnit})),
    };
    return this.runner.transaction(async tx=>{
      await tx.insertCustomFoodVersion(food);
      const stored=await tx.getFoodVersion(this.subject,id);
      if(!stored)throw new Error("Custom food insert did not become visible");
      return stored;
    });
  }
  /** "Tarif oluşturucu": sums verified ingredients (each resolved/safety-scaled exactly like a meal log) into one new reusable custom food, per serving. */
  async createRecipeFood(input:unknown):Promise<VersionedFood>{
    const x=RecipeFoodV1.parse(input);
    return this.runner.transaction(async tx=>{
      const resolved=await Promise.all(x.ingredients.map(async(item)=>{
        const food=await tx.getFoodVersion(this.subject,item.foodVersionId);
        if(!food)throw new ApplicationRejectedError("food-version-unavailable",`Verified food version ${item.foodVersionId} is unavailable to this user`);
        const selection:PortionSelection=item.selection.kind==="household"?{kind:"household",portionOptionId:item.selection.portionVersionId,quantity:item.selection.quantity}:{kind:"custom-grams",grams:item.selection.grams};
        let portion;
        try{portion=resolvePortionSelection(food,selection);}catch(error){rejectApplication("portion-resolution-failed",error);}
        let nutrition:NutritionFacts;
        try{nutrition=scaleNutritionForStorage(portion);}catch(error){rejectApplication("nutrition-calculation-failed",error);}
        return{food,grams:portion.grams,nutrition};
      }));
      const totalGrams=resolved.reduce((sum,r)=>sum+r.grams,0);
      if(totalGrams<=0)throw new ApplicationRejectedError("recipe-empty","Recipe must resolve to a positive total weight");
      const totals=sumNutrition(resolved.map((r)=>r.nutrition));
      const ratio=100/totalGrams;
      const ingredientSafety=aggregateIngredientSafety(resolved.map((r)=>r.food));
      const now=instant(this.clock.now());
      const id=this.idFactory();
      const servingGrams=Math.round((totalGrams/x.servings)*10)/10;
      const food:StoredCustomFoodVersion={
        id,foodKey:`recipe-${id}`,ownerSubject:this.subject,name:x.name,isLiquid:false,
        energyKcal:round6(totals.energyKcal*ratio),proteinG:round6(totals.proteinG*ratio),carbsG:round6(totals.carbsG*ratio),fatG:round6(totals.fatG*ratio),
        fiberG:totals.fiberG==null?null:round6(totals.fiberG*ratio),
        ...ingredientSafety,
        verifiedAt:now,createdAt:now,
        portions:[{id:this.idFactory(),measure:"serving",label:x.servingLabel??"1 porsiyon",gramsPerUnit:servingGrams}],
      };
      await tx.insertCustomFoodVersion(food);
      const stored=await tx.getFoodVersion(this.subject,id);
      if(!stored)throw new Error("Recipe food insert did not become visible");
      return stored;
    });
  }
  /**
   * "Doğrulanmış kaynaktan yemek ekle": imports one externally-verified product (currently only
   * Open Food Facts) into the shared catalog, e.g. after a barcode scan or a text search misses
   * the local catalog. Idempotent by design: the food_key is derived from the source's own
   * external id, so a repeat import of the same product (another scan, the same result turning up
   * again) always resolves to the one existing row instead of creating a duplicate — including
   * under a race between two concurrent imports of the same product.
   */
  async importVerifiedFood(input:unknown):Promise<VersionedFood>{
    const x=VerifiedFoodImportV1.parse(input);
    const foodKey=`off-${x.sourceExternalId}`;
    return this.runner.transaction(async tx=>{
      const existing=await tx.getFoodVersionByFoodKey(this.subject,foodKey);
      if(existing)return existing;
      const now=instant(this.clock.now());
      const food:StoredVerifiedFoodImport={
        id:this.idFactory(),foodKey,name:x.name,brand:x.brand,barcode:x.barcode,isLiquid:!!x.isLiquid,
        energyKcal:x.energyKcal,proteinG:x.proteinG,carbsG:x.carbsG,fatG:x.fatG,fiberG:x.fiberG,
        sourceProvider:x.sourceProvider,sourceExternalId:x.sourceExternalId,sourceEvidenceUrl:x.sourceEvidenceUrl,
        verifiedAt:now,createdAt:now,
      };
      try{
        await tx.importVerifiedFoodVersion(food);
      }catch(error){
        // Race: another request imported the same food_key between our check and this insert.
        const winner=await tx.getFoodVersionByFoodKey(this.subject,foodKey);
        if(winner)return winner;
        throw error;
      }
      const stored=await tx.getFoodVersionByFoodKey(this.subject,foodKey);
      if(!stored)throw new Error("Verified food import did not become visible");
      return stored;
    });
  }
  /** Records one or more ARVEN memory facts in a single write (e.g. after a chat turn the provider judged worth remembering). */
  async recordMemoryFacts(input:unknown):Promise<StoredMemoryFact[]>{
    const x=MemoryFactRecordV1.parse(input);
    const now=instant(this.clock.now());
    const facts:StoredMemoryFact[]=x.facts.map((fact)=>({id:this.idFactory(),userSubject:this.subject,factText:fact.factText,provenance:fact.provenance,confidence:fact.confidence,createdAt:now}));
    return this.runner.transaction(async tx=>{
      for(const fact of facts) await tx.insertMemoryFact(fact);
      return facts;
    });
  }
  async listMemoryFacts():Promise<StoredMemoryFact[]>{return this.runner.transaction(async tx=>tx.listMemoryFacts(this.subject));}
  /** User-initiated forget — see `V1Transaction.deleteMemoryFact`'s doc comment. */
  async deleteMemoryFact(id:string):Promise<void>{const parsed=Id.parse(id);await this.runner.transaction(async tx=>{await tx.deleteMemoryFact(this.subject,parsed);});}
  /** Persists one weekly insight snapshot: the deterministic metrics it was grounded in, and — once a provider has produced one — the validated narrative-only `WeeklyInsightV1` output. `metrics`/`narrative` are stored verbatim as canonical JSON; callers own their own shape/validation (deterministic weekly-metrics service, `lib/ai/contracts.ts`'s `parseWeeklyInsight`). */
  async recordWeeklyInsightSnapshot(weekStartLocalDate:string,metrics:unknown,narrative:unknown|null):Promise<StoredWeeklyInsightSnapshot>{
    const parsedDate=CanonicalWeekStartDate.parse(weekStartLocalDate);
    const snapshot:StoredWeeklyInsightSnapshot={id:this.idFactory(),userSubject:this.subject,weekStartLocalDate:parsedDate,metricsJson:canonicalJson(metrics),narrativeJson:narrative==null?null:canonicalJson(narrative),createdAt:instant(this.clock.now())};
    return this.runner.transaction(async tx=>{await tx.insertWeeklyInsightSnapshot(snapshot);return snapshot;});
  }
  async getWeeklyInsightSnapshot(weekStartLocalDate:string):Promise<StoredWeeklyInsightSnapshot|null>{
    const parsedDate=CanonicalWeekStartDate.parse(weekStartLocalDate);
    return this.runner.transaction(async tx=>tx.getLatestWeeklyInsightSnapshot(this.subject,parsedDate));
  }
  /** Records metadata for a photo the caller has already written to `lib/media/storage.ts`. This service never sees the bytes. */
  async recordPhotoAsset(input:unknown):Promise<StoredPhotoAsset>{
    const x=PhotoAssetInput.parse(input);
    const asset:StoredPhotoAsset={id:this.idFactory(),userSubject:this.subject,kind:x.kind,mimeType:x.mimeType,byteSize:x.byteSize,storageKey:x.storageKey,createdAt:instant(this.clock.now())};
    return this.runner.transaction(async tx=>{await tx.insertPhotoAsset(asset);return asset;});
  }
  async getPhotoAsset(id:string):Promise<StoredPhotoAsset|null>{const parsed=Id.parse(id);return this.runner.transaction(async tx=>tx.getPhotoAsset(this.subject,parsed));}
  async listPhotoAssets():Promise<StoredPhotoAsset[]>{return this.runner.transaction(async tx=>tx.listPhotoAssets(this.subject));}
  /** User-initiated forget — see `V1Transaction.deletePhotoAsset`'s doc comment. Callers are responsible for also deleting the underlying bytes via `lib/media/storage.ts`. */
  async deletePhotoAsset(id:string):Promise<void>{const parsed=Id.parse(id);await this.runner.transaction(async tx=>{await tx.deletePhotoAsset(this.subject,parsed);});}
  async deleteAccount():Promise<void>{await this.runner.transaction(async tx=>{await tx.purgeAuthenticatedUser(this.subject);});}
  async getOrCreateAuthenticatedUser(defaults:{timezone:string;locale:string}):Promise<AuthenticatedUserContext>{return this.runner.transaction(async tx=>tx.getOrCreateUser(this.subject,defaults));}
  async upsertProfile(input:unknown):Promise<StoredProfile>{const x=ProfileUpsertV1.parse(input);const profile:StoredProfile={userSubject:this.subject,displayName:x.displayName,birthDate:x.birthDate,sexAtBirth:x.sexAtBirth,heightCm:x.heightCm,activityLevel:x.activityLevel,updatedAt:instant(this.clock.now())};return this.runner.transaction(async tx=>{await tx.upsertProfile(profile);return profile;});}
  async recordAssessmentSnapshot(input:unknown):Promise<StoredAssessmentSnapshot>{const x=AssessmentSnapshotPayloadV1.parse(input);const now=instant(this.clock.now());const snapshot:StoredAssessmentSnapshot={id:this.idFactory(),userSubject:this.subject,completedAt:now,payloadJson:canonicalJson(x),createdAt:now};return this.runner.transaction(async tx=>{await tx.insertAssessmentSnapshot(snapshot);return snapshot;});}
  async recordSafetyAcknowledgement(input:unknown):Promise<StoredSafetyAcknowledgement>{const x=SafetyAcknowledgementV1.parse(input);const now=instant(this.clock.now());const acknowledgement:StoredSafetyAcknowledgement={id:this.idFactory(),userSubject:this.subject,acknowledgementType:x.acknowledgementType,policyVersion:x.policyVersion,acknowledgedAt:now,createdAt:now};return this.runner.transaction(async tx=>{await tx.insertSafetyAcknowledgement(acknowledgement);return acknowledgement;});}

  /** Records metadata for a lab document the caller has already written to `lib/media/storage.ts`. This service never sees the bytes. */
  async recordLabDocument(input:unknown):Promise<StoredLabDocument>{
    const x=LabDocumentInput.parse(input);
    const document:StoredLabDocument={id:this.idFactory(),userSubject:this.subject,mimeType:x.mimeType,byteSize:x.byteSize,storageKey:x.storageKey,createdAt:instant(this.clock.now())};
    return this.runner.transaction(async tx=>{await tx.insertLabDocument(document);return document;});
  }
  async getLabDocument(id:string):Promise<StoredLabDocument|null>{const parsed=Id.parse(id);return this.runner.transaction(async tx=>tx.getLabDocument(this.subject,parsed));}
  async listLabDocuments():Promise<StoredLabDocument[]>{return this.runner.transaction(async tx=>tx.listLabDocuments(this.subject));}
  /** User-initiated forget — see `V1Transaction.deleteLabDocument`'s doc comment. Callers are responsible for also deleting the underlying bytes via `lib/media/storage.ts`. */
  async deleteLabDocument(id:string):Promise<void>{const parsed=Id.parse(id);await this.runner.transaction(async tx=>{await tx.deleteLabDocument(this.subject,parsed);});}

  /** Records one or more AI-extracted (unreviewed) lab result rows in a single write. */
  async recordLabResultEntries(labDocumentId:string|null,entries:unknown[]):Promise<StoredLabResultEntry[]>{
    const parsedDocumentId=labDocumentId==null?null:Id.parse(labDocumentId);
    const now=instant(this.clock.now());
    const rows:StoredLabResultEntry[]=entries.map((entry)=>{
      const x=LabExtractedEntryInput.parse(entry);
      for(const value of [x.markerName,x.valueText,x.unitText,x.referenceRangeText]){if(value!=null)assertNoMedicalOverreach(value);}
      assertNoMedicalOverreach([x.markerName,x.valueText,x.unitText,x.referenceRangeText].filter((value): value is string => value!=null).join(" "));
      return {id:this.idFactory(),userSubject:this.subject,labDocumentId:parsedDocumentId,markerName:x.markerName,valueText:x.valueText,unitText:x.unitText,referenceRangeText:x.referenceRangeText,status:"extracted" as const,createdAt:now};
    });
    return this.runner.transaction(async tx=>{for(const row of rows) await tx.insertLabResultEntry(row);return rows;});
  }
  /** Records one manually-entered lab result row, already confirmed (the user typed it themselves — there is nothing to review). */
  async recordManualLabResultEntry(input:unknown):Promise<StoredLabResultEntry>{
    const x=LabResultEntryInput.parse(input);
    const row:StoredLabResultEntry={id:this.idFactory(),userSubject:this.subject,labDocumentId:x.labDocumentId,markerName:x.markerName,valueText:x.valueText,unitText:x.unitText,referenceRangeText:x.referenceRangeText,status:"confirmed",createdAt:instant(this.clock.now())};
    return this.runner.transaction(async tx=>{await tx.insertLabResultEntry(row);return row;});
  }
  async listLabResultEntries():Promise<StoredLabResultEntry[]>{return this.runner.transaction(async tx=>tx.listLabResultEntries(this.subject));}
  /** Reviews and confirms an 'extracted' row, optionally with the user's own corrections to the transcribed text. */
  async confirmLabResultEntry(id:string,edits:unknown):Promise<StoredLabResultEntry>{
    const parsed=Id.parse(id);
    const x=LabResultEntryUpdate.parse(edits);
    return this.runner.transaction(async tx=>tx.confirmLabResultEntry(this.subject,parsed,x));
  }
  /** User-initiated forget — see `V1Transaction.deleteLabResultEntry`'s doc comment. */
  async deleteLabResultEntry(id:string):Promise<void>{const parsed=Id.parse(id);await this.runner.transaction(async tx=>{await tx.deleteLabResultEntry(this.subject,parsed);});}

  /** Adds one supplement record. Not a medication registry — see `StoredSupplementRecord`'s doc comment. */
  async recordSupplement(input:unknown):Promise<StoredSupplementRecord>{
    const x=SupplementRecordInput.parse(input);
    if(!isKnownSupplementName(x.name))throw new ApplicationRejectedError("unverified-supplement-name","Supplement name is not in the curated supplement reference");
    if(x.note!==null)throw new ApplicationRejectedError("supplement-note-not-supported","Free-text supplement notes are disabled so this feature cannot become medication/dose/schedule storage");
    const record:StoredSupplementRecord={id:this.idFactory(),userSubject:this.subject,foodVersionId:x.foodVersionId,name:x.name,note:null,isActive:true,createdAt:instant(this.clock.now())};
    return this.runner.transaction(async tx=>{await tx.insertSupplementRecord(record);return record;});
  }
  async listSupplements():Promise<StoredSupplementRecord[]>{return this.runner.transaction(async tx=>tx.listSupplementRecords(this.subject));}
  /** Marks a supplement active/inactive (e.g. "stopped taking this") without losing the record. */
  async setSupplementActive(id:string,isActive:boolean):Promise<void>{const parsed=Id.parse(id);await this.runner.transaction(async tx=>{await tx.setSupplementRecordActive(this.subject,parsed,isActive);});}
  /** User-initiated forget — see `V1Transaction.deleteSupplementRecord`'s doc comment. */
  async deleteSupplement(id:string):Promise<void>{const parsed=Id.parse(id);await this.runner.transaction(async tx=>{await tx.deleteSupplementRecord(this.subject,parsed);});}

  /** "Tarif oluştur" (Faz 7) — see `RecipeCreateV1`'s doc comment for how this differs from `createRecipeFood` above. */
  async createRecipe(input:unknown):Promise<StoredRecipe>{
    const x=RecipeCreateV1.parse(input);
    return this.runner.transaction(async tx=>{
      for(const ingredient of x.ingredients){
        const food=await tx.getFoodVersion(this.subject,ingredient.foodVersionId);
        if(!food)throw new ApplicationRejectedError("food-version-unavailable",`Verified food version ${ingredient.foodVersionId} is unavailable to this user`);
      }
      const recipe:StoredRecipe={id:this.idFactory(),userSubject:this.subject,name:x.name,servings:x.servings,ingredientsJson:canonicalJson(x.ingredients),createdAt:instant(this.clock.now())};
      await tx.insertRecipe(recipe);
      return recipe;
    });
  }
  async listRecipes():Promise<StoredRecipe[]>{return this.runner.transaction(async tx=>tx.listRecipes(this.subject));}
  async getRecipe(id:string):Promise<StoredRecipe|null>{const parsed=Id.parse(id);return this.runner.transaction(async tx=>tx.getRecipe(this.subject,parsed));}
  /** User-initiated forget — see `V1Transaction.deleteRecipe`'s doc comment. A weekly plan that already referenced this recipe keeps its frozen display snapshot; only a later shopping-list generation would notice the recipe is gone (and simply skips it — see `generateShoppingList`). */
  async deleteRecipe(id:string):Promise<void>{const parsed=Id.parse(id);await this.runner.transaction(async tx=>{await tx.deleteRecipe(this.subject,parsed);});}

  /**
   * "Haftalık planım" (Faz 7): a date-scoped, versioned weekly plan — the same
   * versioned-plus-current-pointer pattern as `createMealPlanVersion`, but keyed to a specific
   * `weekStartLocalDate` so every week keeps its own current version. See
   * `resolveWeeklyPlanItems`'s doc comment for how food and recipe items are handled.
   */
  async createWeeklyPlanVersion(input:unknown):Promise<StoredWeeklyPlanVersion>{
    const x=WeeklyPlanVersionV1.parse(input);
    for(const [index,day] of x.days.entries()){
      const expected=addLocalDays(x.weekStartLocalDate,index,"weekStartLocalDate");
      if(day.localDate!==expected)throw new Error(`days[${index}].localDate must equal weekStartLocalDate + ${index} day(s)`);
    }
    return this.runner.transaction(async tx=>{
      const [allergens,exclusions]=await Promise.all([tx.getActiveAllergenExclusions(this.subject),tx.getActiveDietaryExclusions(this.subject)]);
      const resolvedDays=[];
      for(const day of x.days){
        const resolvedSlots=[];
        for(const slot of day.slots){
          const{snapshots,safetyFoods}=await resolveWeeklyPlanItems(tx,this.subject,slot.items);
          const allergenCandidates=safetyFoods.flatMap((food)=>safety(food).allergens);
          const dietaryCandidates=safetyFoods.flatMap((food)=>safety(food).dietary);
          try{assertNoAllergyConflict(allergenCandidates,allergens);assertNoDietaryExclusionConflict(dietaryCandidates,exclusions);}catch(error){rejectApplication("safety-conflict",error);}
          resolvedSlots.push({mealType:slot.mealType,items:snapshots});
        }
        resolvedDays.push({localDate:day.localDate,slots:resolvedSlots});
      }
      const now=instant(this.clock.now());
      const plan:StoredWeeklyPlanVersion={id:this.idFactory(),userSubject:this.subject,weekStartLocalDate:x.weekStartLocalDate,daysJson:canonicalJson(resolvedDays),createdAt:now};
      await tx.insertWeeklyPlanVersionAndSetCurrent(plan,now);
      return plan;
    });
  }
  async getCurrentWeeklyPlan(weekStartLocalDate:string):Promise<StoredWeeklyPlanVersion|null>{
    const parsedDate=CanonicalWeekStartDate.parse(weekStartLocalDate);
    return this.runner.transaction(async tx=>tx.getCurrentWeeklyPlan(this.subject,parsedDate));
  }

  /** "Kilerim" (Faz 7): simple stock tracking, optionally linked to a verified food for automatic shopping-list matching. */
  async addPantryItem(input:unknown):Promise<StoredPantryItem>{
    const x=PantryItemCreateV1.parse(input);
    return this.runner.transaction(async tx=>{
      if(x.foodVersionId){const food=await tx.getFoodVersion(this.subject,x.foodVersionId);if(!food)throw new ApplicationRejectedError("food-version-unavailable",`Verified food version ${x.foodVersionId} is unavailable to this user`);}
      const now=instant(this.clock.now());
      const item:StoredPantryItem={id:this.idFactory(),userSubject:this.subject,foodVersionId:x.foodVersionId,label:x.label,quantityGrams:x.quantityGrams,quantityNote:x.quantityNote,createdAt:now,updatedAt:now};
      await tx.insertPantryItem(item);
      return item;
    });
  }
  async listPantryItems():Promise<StoredPantryItem[]>{return this.runner.transaction(async tx=>tx.listPantryItems(this.subject));}
  /** Edits only the quantity of an existing pantry item — see `V1Transaction.updatePantryItem`'s doc comment. */
  async updatePantryItem(id:string,input:unknown):Promise<StoredPantryItem>{
    const parsed=Id.parse(id);
    const x=PantryItemUpdateV1.parse(input);
    return this.runner.transaction(async tx=>tx.updatePantryItem(this.subject,parsed,x));
  }
  /** User-initiated forget — see `V1Transaction.deletePantryItem`'s doc comment. */
  async deletePantryItem(id:string):Promise<void>{const parsed=Id.parse(id);await this.runner.transaction(async tx=>{await tx.deletePantryItem(this.subject,parsed);});}

  /**
   * "Alışveriş listesi" (Faz 7): resolves the given week's *current* plan against *live* recipe
   * and food-catalog data (stable `foodVersionId` references, not the plan's frozen display
   * snapshot) and subtracts pantry stock matched by `foodVersionId`. Free-text pantry items (no
   * `foodVersionId`) are never auto-subtracted (see docs/ARCHITECTURE.md). Regenerating a week's
   * list always fully replaces it, same as `createMealPlanVersion`.
   */
  async generateShoppingList(weekStartLocalDate:string):Promise<StoredShoppingListItem[]>{
    const parsedDate=CanonicalWeekStartDate.parse(weekStartLocalDate);
    return this.runner.transaction(async tx=>{
      const plan=await tx.getCurrentWeeklyPlan(this.subject,parsedDate);
      if(!plan)throw new ApplicationRejectedError("weekly-plan-unavailable",`No weekly plan exists yet for ${parsedDate}`);
      const days=JSON.parse(plan.daysJson) as Array<{localDate:string;slots:Array<{mealType:string;items:Array<Record<string,unknown>>}>}>;
      const needed=new Map<string,{label:string;grams:number}>();
      for(const day of days){
        for(const slot of day.slots){
          for(const item of slot.items){
            if(item.kind==="food"){
              const foodVersionId=String(item.foodVersionId);
              const grams=Number(item.grams)||0;
              const entry=needed.get(foodVersionId)??{label:String(item.foodName),grams:0};
              entry.grams+=grams;
              needed.set(foodVersionId,entry);
            }else if(item.kind==="recipe"){
              const recipe=await tx.getRecipe(this.subject,String(item.recipeId));
              if(!recipe)continue; // Recipe deleted since the plan was created — skip (see `deleteRecipe`'s doc comment).
              const ingredients=JSON.parse(recipe.ingredientsJson) as Array<z.infer<typeof RecipeIngredientV1>>;
              const ratio=Number(item.servings)/recipe.servings;
              for(const ingredient of ingredients){
                const food=await tx.getFoodVersion(this.subject,ingredient.foodVersionId);
                if(!food)continue;
                const selection:PortionSelection=ingredient.selection.kind==="household"?{kind:"household",portionOptionId:ingredient.selection.portionVersionId,quantity:ingredient.selection.quantity}:{kind:"custom-grams",grams:ingredient.selection.grams};
                let portion;try{portion=resolvePortionSelection(food,selection);}catch{continue;}
                const entry=needed.get(food.id)??{label:food.name,grams:0};
                entry.grams+=portion.grams*ratio;
                needed.set(food.id,entry);
              }
            }
          }
        }
      }
      const pantry=await tx.listPantryItems(this.subject);
      for(const pantryItem of pantry){
        if(!pantryItem.foodVersionId||pantryItem.quantityGrams==null)continue;
        const entry=needed.get(pantryItem.foodVersionId);
        if(!entry)continue;
        entry.grams=Math.max(0,entry.grams-pantryItem.quantityGrams);
      }
      const now=instant(this.clock.now());
      const items:StoredShoppingListItem[]=[...needed.entries()]
        .filter(([,entry])=>entry.grams>0.1)
        .map(([foodVersionId,entry])=>({id:this.idFactory(),userSubject:this.subject,weekStartLocalDate:parsedDate,foodVersionId,label:entry.label,neededGrams:round6(entry.grams),isChecked:false,createdAt:now}));
      await tx.replaceShoppingListItems(this.subject,parsedDate,items);
      return items;
    });
  }
  async listShoppingListItems(weekStartLocalDate:string):Promise<StoredShoppingListItem[]>{
    const parsedDate=CanonicalWeekStartDate.parse(weekStartLocalDate);
    return this.runner.transaction(async tx=>tx.listShoppingListItems(this.subject,parsedDate));
  }
  async setShoppingListItemChecked(id:string,isChecked:boolean):Promise<void>{const parsed=Id.parse(id);await this.runner.transaction(async tx=>{await tx.setShoppingListItemChecked(this.subject,parsed,isChecked);});}

  /**
   * "Hafta hazırlığı ve hatırlatmalar" (Faz 7): a stored preference plus a per-week completion
   * flag only — deliberately NOT a push-notification scheduler; no such infrastructure exists
   * anywhere in this app (see docs/ARCHITECTURE.md). The reminder surfaces in-app from this
   * preference; there is no background delivery.
   */
  async getWeekPrepPreferences():Promise<StoredWeekPrepPreferences|null>{return this.runner.transaction(async tx=>tx.getWeekPrepPreferences(this.subject));}
  async upsertWeekPrepPreferences(input:unknown):Promise<StoredWeekPrepPreferences>{
    const x=WeekPrepPreferencesV1.parse(input);
    const preferences:StoredWeekPrepPreferences={userSubject:this.subject,enabled:x.enabled,prepDayOfWeek:x.prepDayOfWeek,prepLocalTime:x.prepLocalTime,updatedAt:instant(this.clock.now())};
    return this.runner.transaction(async tx=>{await tx.upsertWeekPrepPreferences(preferences);return preferences;});
  }
  async getWeekPrepStatus(weekStartLocalDate:string):Promise<StoredWeekPrepStatus|null>{
    const parsedDate=CanonicalWeekStartDate.parse(weekStartLocalDate);
    return this.runner.transaction(async tx=>tx.getWeekPrepStatus(this.subject,parsedDate));
  }
  async setWeekPrepStatus(weekStartLocalDate:string,isCompleted:boolean):Promise<StoredWeekPrepStatus>{
    const parsedDate=CanonicalWeekStartDate.parse(weekStartLocalDate);
    const status:StoredWeekPrepStatus={userSubject:this.subject,weekStartLocalDate:parsedDate,isCompleted,updatedAt:instant(this.clock.now())};
    return this.runner.transaction(async tx=>{await tx.upsertWeekPrepStatus(status);return status;});
  }

  /**
   * "Gelişim" (Faz 8): logs one body measurement and, in the same transaction, evaluates
   * deterministic milestones purely from this subject's own measurement history (see
   * `evaluateBodyMeasurementMilestones`) — no AI, no goal beyond what the numbers themselves show.
   */
  async recordBodyMeasurement(input:unknown):Promise<{measurement:StoredBodyMeasurement;newMilestones:StoredProgressMilestone[]}>{
    const x=BodyMeasurementCreateV1.parse(input);
    const now=instant(this.clock.now());
    const measurement:StoredBodyMeasurement={id:this.idFactory(),userSubject:this.subject,localDate:x.localDate,weightKg:x.weightKg,bodyFatPercent:x.bodyFatPercent,waistCm:x.waistCm,hipCm:x.hipCm,chestCm:x.chestCm,note:x.note,createdAt:now};
    return this.runner.transaction(async tx=>{
      await tx.insertBodyMeasurement(measurement);
      const history=(await tx.listBodyMeasurements(this.subject)).slice().sort((a,b)=>a.localDate===b.localDate?a.createdAt.localeCompare(b.createdAt):a.localDate.localeCompare(b.localDate));
      const newMilestones:StoredProgressMilestone[]=[];
      for(const key of evaluateBodyMeasurementMilestones(history)){
        if(await tx.hasProgressMilestone(this.subject,key))continue;
        const milestone:StoredProgressMilestone={id:this.idFactory(),userSubject:this.subject,milestoneKey:key,achievedAt:now};
        await tx.insertProgressMilestone(milestone);
        newMilestones.push(milestone);
      }
      return{measurement,newMilestones};
    });
  }
  async listBodyMeasurements():Promise<StoredBodyMeasurement[]>{return this.runner.transaction(async tx=>tx.listBodyMeasurements(this.subject));}
  /** User-initiated forget — see `V1Transaction.deleteBodyMeasurement`'s doc comment. */
  async deleteBodyMeasurement(id:string):Promise<void>{const parsed=Id.parse(id);await this.runner.transaction(async tx=>{await tx.deleteBodyMeasurement(this.subject,parsed);});}

  /** Records metadata for a body-progress photo the caller has already written to `lib/media/storage.ts`. This service never sees the bytes. */
  async recordBodyPhotoSet(input:unknown):Promise<StoredBodyPhotoSet>{
    const x=BodyPhotoSetInput.parse(input);
    const photo:StoredBodyPhotoSet={id:this.idFactory(),userSubject:this.subject,localDate:x.localDate,angle:x.angle,mimeType:x.mimeType,byteSize:x.byteSize,storageKey:x.storageKey,createdAt:instant(this.clock.now())};
    return this.runner.transaction(async tx=>{await tx.insertBodyPhotoSet(photo);return photo;});
  }
  async getBodyPhotoSet(id:string):Promise<StoredBodyPhotoSet|null>{const parsed=Id.parse(id);return this.runner.transaction(async tx=>tx.getBodyPhotoSet(this.subject,parsed));}
  async listBodyPhotoSets():Promise<StoredBodyPhotoSet[]>{return this.runner.transaction(async tx=>tx.listBodyPhotoSets(this.subject));}
  /** User-initiated forget — see `V1Transaction.deleteBodyPhotoSet`'s doc comment. */
  async deleteBodyPhotoSet(id:string):Promise<void>{const parsed=Id.parse(id);await this.runner.transaction(async tx=>{await tx.deleteBodyPhotoSet(this.subject,parsed);});}

  async listProgressMilestones():Promise<StoredProgressMilestone[]>{return this.runner.transaction(async tx=>tx.listProgressMilestones(this.subject));}

  /** Records metadata for a report PDF the caller has already generated (see `lib/progress/pdf.ts` and `lib/progress/reports.ts`) and written to `lib/media/storage.ts`. This service never sees the bytes. */
  async recordProgressReportExport(input:unknown):Promise<StoredProgressReportExport>{
    const x=ProgressReportExportInput.parse(input);
    const report:StoredProgressReportExport={id:this.idFactory(),userSubject:this.subject,reportType:x.reportType,periodLocalDate:x.periodLocalDate,mimeType:"application/pdf",byteSize:x.byteSize,storageKey:x.storageKey,createdAt:instant(this.clock.now())};
    return this.runner.transaction(async tx=>{await tx.insertProgressReportExport(report);return report;});
  }
  async getProgressReportExport(id:string):Promise<StoredProgressReportExport|null>{const parsed=Id.parse(id);return this.runner.transaction(async tx=>tx.getProgressReportExport(this.subject,parsed));}
  async listProgressReportExports():Promise<StoredProgressReportExport[]>{return this.runner.transaction(async tx=>tx.listProgressReportExports(this.subject));}
  /** User-initiated forget — see `V1Transaction.deleteProgressReportExport`'s doc comment. */
  async deleteProgressReportExport(id:string):Promise<void>{const parsed=Id.parse(id);await this.runner.transaction(async tx=>{await tx.deleteProgressReportExport(this.subject,parsed);});}
}
