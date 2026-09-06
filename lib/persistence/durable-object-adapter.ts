import type { AllergenSafetyExclusion, DietarySafetyExclusion } from "@/lib/health-safety/policy";
import type { FoodPortionOption, NutritionSourceProvider, PortionMeasure, PortionSize } from "@/lib/nutrition/types";
import type {
  AuthenticatedUserContext,
  ScientificReferenceSnapshot,
  StoredAssessmentSnapshot,
  StoredBodyMeasurement,
  StoredBodyPhotoSet,
  StoredDecision,
  StoredGoalVersion,
  StoredCustomFoodVersion,
  StoredVerifiedFoodImport,
  StoredMealPlanVersion,
  StoredMemoryFact,
  StoredLabDocument,
  StoredLabResultEntry,
  StoredNutritionEvent,
  StoredOutcome,
  StoredPantryItem,
  StoredPhotoAsset,
  StoredProfile,
  StoredProgressMilestone,
  StoredProgressReportExport,
  StoredProposal,
  StoredRecipe,
  StoredSafetyAcknowledgement,
  StoredShoppingListItem,
  StoredSupplementRecord,
  StoredWeekPrepPreferences,
  StoredWeekPrepStatus,
  StoredWeeklyInsightSnapshot,
  StoredWeeklyPlanVersion,
  V1Transaction,
  V1TransactionRunner,
  VersionedFood,
} from "@/lib/persistence/v1-boundary";

/**
 * Minimal shape of a synchronous SQL storage engine, matching Durable Objects'
 * `ctx.storage.sql` closely enough to be a drop-in production wrapper while
 * staying decoupled for tests. `exec` is synchronous — no `await` inside a
 * `transactionSync` callback, matching the real API's requirement.
 *
 * Note: the real `SqlStorageCursor.one()` throws if the query does not match
 * exactly one row; this interface's `one()` returns `undefined` for zero rows
 * instead, since every call site here targets a unique key. A production
 * wrapper around the real `ctx.storage.sql` needs to adapt that difference
 * (catch-and-return-undefined) — out of scope for this adapter.
 */
export type SyncSqlStorage = {
  exec(query: string, ...bindings: unknown[]): { toArray(): Record<string, unknown>[]; one(): Record<string, unknown> | undefined };
  transactionSync<T>(callback: () => T): T;
};

/** Read-only access to the shared D1 catalog (food_versions, portion_versions, scientific_reference_versions). */
export type D1LikeQuery = (sql: string, params: unknown[]) => Promise<Record<string, unknown>[]>;

function asString(value: unknown): string { return String(value); }
function asNullableString(value: unknown): string | null { return value == null ? null : String(value); }
function asNumber(value: unknown): number { return Number(value); }
function asBool(value: unknown): boolean { return Number(value) === 1; }
function normalizeFoodName(value: string): string { return value.toLocaleLowerCase("tr-TR").trim(); }

function mapUserContext(row: Record<string, unknown>): AuthenticatedUserContext {
  return { timezone: asString(row.timezone), nutritionDayStartMinutes: asNumber(row.nutrition_day_start_minutes) };
}
function mapProfile(row: Record<string, unknown>): StoredProfile {
  return {
    userSubject: asString(row.user_subject),
    displayName: asNullableString(row.display_name),
    birthDate: asNullableString(row.birth_date),
    sexAtBirth: asNullableString(row.sex_at_birth) as StoredProfile["sexAtBirth"],
    heightCm: row.height_cm == null ? null : asNumber(row.height_cm),
    activityLevel: asNullableString(row.activity_level) as StoredProfile["activityLevel"],
    updatedAt: asString(row.updated_at),
  };
}
function mapAssessmentSnapshot(row: Record<string, unknown>): StoredAssessmentSnapshot {
  return { id: asString(row.id), userSubject: asString(row.user_subject), completedAt: asString(row.completed_at), payloadJson: asString(row.payload_json), createdAt: asString(row.created_at) };
}
function mapSafetyAcknowledgement(row: Record<string, unknown>): StoredSafetyAcknowledgement {
  return {
    id: asString(row.id),
    userSubject: asString(row.user_subject),
    acknowledgementType: asString(row.acknowledgement_type) as StoredSafetyAcknowledgement["acknowledgementType"],
    policyVersion: asString(row.policy_version),
    acknowledgedAt: asString(row.acknowledged_at),
    createdAt: asString(row.created_at),
  };
}
function mapProposal(row: Record<string, unknown>): StoredProposal {
  return {
    id: asString(row.id),
    userSubject: asString(row.user_subject),
    actionType: asString(row.action_type) as StoredProposal["actionType"],
    schemaVersion: asString(row.schema_version) as StoredProposal["schemaVersion"],
    payloadJson: asString(row.payload_json),
    payloadSha256: asString(row.payload_sha256),
    idempotencyKey: asString(row.idempotency_key),
    createdAt: asString(row.created_at),
  };
}
function mapDecision(row: Record<string, unknown>): StoredDecision {
  return { actionId: asString(row.action_id), userSubject: asString(row.user_subject), decision: asString(row.decision) as StoredDecision["decision"], decidedAt: asString(row.decided_at) };
}
function mapOutcome(row: Record<string, unknown>): StoredOutcome {
  return {
    actionId: asString(row.action_id),
    userSubject: asString(row.user_subject),
    actionType: asString(row.action_type) as StoredOutcome["actionType"],
    confirmationMarker: "confirmed",
    outcome: asString(row.outcome) as StoredOutcome["outcome"],
    resultEventId: asNullableString(row.result_event_id),
    failureCode: asNullableString(row.failure_code),
    recordedAt: asString(row.recorded_at),
  };
}
function mapNutritionEvent(row: Record<string, unknown>): StoredNutritionEvent {
  return { id: asString(row.id), userSubject: asString(row.user_subject), eventType: asString(row.event_type) as StoredNutritionEvent["eventType"], occurredAt: asString(row.occurred_at), localDate: asString(row.local_date), payloadJson: asString(row.payload_json), createdAt: asString(row.created_at) };
}
function mapAllergenExclusion(row: Record<string, unknown>): AllergenSafetyExclusion {
  return { id: asNullableString(row.target_id), label: asString(row.label), resolutionStatus: asString(row.resolution_status) as AllergenSafetyExclusion["resolutionStatus"] };
}
function mapDietaryExclusion(row: Record<string, unknown>): DietarySafetyExclusion {
  return { kind: asString(row.kind) as DietarySafetyExclusion["kind"], id: asNullableString(row.target_id), label: asString(row.label), resolutionStatus: asString(row.resolution_status) as DietarySafetyExclusion["resolutionStatus"] };
}
function mapGoalVersion(row: Record<string, unknown>): StoredGoalVersion {
  return {
    id: asString(row.id),
    userSubject: asString(row.user_subject),
    source: "arven-calculated",
    calculatorId: "mifflin-st-jeor@v1",
    calculatorInputsJson: asString(row.calculator_inputs_json ?? "{}"),
    referenceSnapshotsJson: asString(row.reference_snapshots_json ?? "[]"),
    energyKcal: asNumber(row.energy_kcal),
    proteinG: asNumber(row.protein_g),
    carbsG: asNumber(row.carbs_g),
    fatG: asNumber(row.fat_g),
    fiberG: asNumber(row.fiber_g),
    waterMl: asNumber(row.water_ml),
    mealAllocationsJson: asString(row.meal_allocations_json ?? "[]"),
    createdAt: asString(row.created_at),
  };
}
function mapMealPlanVersion(row: Record<string, unknown>): StoredMealPlanVersion {
  return { id: asString(row.id), userSubject: asString(row.user_subject), slotsJson: asString(row.slots_json), createdAt: asString(row.created_at) };
}
function mapMemoryFact(row: Record<string, unknown>): StoredMemoryFact {
  return { id: asString(row.id), userSubject: asString(row.user_subject), factText: asString(row.fact_text), provenance: asString(row.provenance) as StoredMemoryFact["provenance"], confidence: asString(row.confidence) as StoredMemoryFact["confidence"], createdAt: asString(row.created_at) };
}
function mapWeeklyInsightSnapshot(row: Record<string, unknown>): StoredWeeklyInsightSnapshot {
  return { id: asString(row.id), userSubject: asString(row.user_subject), weekStartLocalDate: asString(row.week_start_local_date), metricsJson: asString(row.metrics_json), narrativeJson: asNullableString(row.narrative_json), createdAt: asString(row.created_at) };
}
function mapPhotoAsset(row: Record<string, unknown>): StoredPhotoAsset {
  return { id: asString(row.id), userSubject: asString(row.user_subject), kind: asString(row.kind) as StoredPhotoAsset["kind"], mimeType: asString(row.mime_type) as StoredPhotoAsset["mimeType"], byteSize: Number(row.byte_size), storageKey: asString(row.storage_key), createdAt: asString(row.created_at) };
}
function mapLabDocument(row: Record<string, unknown>): StoredLabDocument {
  return { id: asString(row.id), userSubject: asString(row.user_subject), mimeType: asString(row.mime_type) as StoredLabDocument["mimeType"], byteSize: Number(row.byte_size), storageKey: asString(row.storage_key), createdAt: asString(row.created_at) };
}
function mapLabResultEntry(row: Record<string, unknown>): StoredLabResultEntry {
  return {
    id: asString(row.id), userSubject: asString(row.user_subject), labDocumentId: asNullableString(row.lab_document_id),
    markerName: asString(row.marker_name), valueText: asString(row.value_text),
    unitText: asNullableString(row.unit_text), referenceRangeText: asNullableString(row.reference_range_text),
    status: asString(row.status) as StoredLabResultEntry["status"], createdAt: asString(row.created_at),
  };
}
function mapSupplementRecord(row: Record<string, unknown>): StoredSupplementRecord {
  return {
    id: asString(row.id), userSubject: asString(row.user_subject), foodVersionId: asNullableString(row.food_version_id),
    name: asString(row.name), note: asNullableString(row.note), isActive: Number(row.is_active) === 1, createdAt: asString(row.created_at),
  };
}
function mapRecipe(row: Record<string, unknown>): StoredRecipe {
  return { id: asString(row.id), userSubject: asString(row.user_subject), name: asString(row.name), servings: Number(row.servings), ingredientsJson: asString(row.ingredients_json), createdAt: asString(row.created_at) };
}
function mapWeeklyPlanVersion(row: Record<string, unknown>): StoredWeeklyPlanVersion {
  return { id: asString(row.id), userSubject: asString(row.user_subject), weekStartLocalDate: asString(row.week_start_local_date), daysJson: asString(row.days_json), createdAt: asString(row.created_at) };
}
function mapPantryItem(row: Record<string, unknown>): StoredPantryItem {
  return {
    id: asString(row.id), userSubject: asString(row.user_subject), foodVersionId: asNullableString(row.food_version_id),
    label: asString(row.label), quantityGrams: row.quantity_grams == null ? null : Number(row.quantity_grams),
    quantityNote: asNullableString(row.quantity_note), createdAt: asString(row.created_at), updatedAt: asString(row.updated_at),
  };
}
function mapShoppingListItem(row: Record<string, unknown>): StoredShoppingListItem {
  return {
    id: asString(row.id), userSubject: asString(row.user_subject), weekStartLocalDate: asString(row.week_start_local_date),
    foodVersionId: asNullableString(row.food_version_id), label: asString(row.label),
    neededGrams: row.needed_grams == null ? null : Number(row.needed_grams), isChecked: Number(row.is_checked) === 1, createdAt: asString(row.created_at),
  };
}
function mapWeekPrepPreferences(row: Record<string, unknown>): StoredWeekPrepPreferences {
  return { userSubject: asString(row.user_subject), enabled: Number(row.enabled) === 1, prepDayOfWeek: Number(row.prep_day_of_week), prepLocalTime: asString(row.prep_local_time), updatedAt: asString(row.updated_at) };
}
function mapWeekPrepStatus(row: Record<string, unknown>): StoredWeekPrepStatus {
  return { userSubject: asString(row.user_subject), weekStartLocalDate: asString(row.week_start_local_date), isCompleted: Number(row.is_completed) === 1, updatedAt: asString(row.updated_at) };
}
function mapBodyMeasurement(row: Record<string, unknown>): StoredBodyMeasurement {
  return {
    id: asString(row.id), userSubject: asString(row.user_subject), localDate: asString(row.local_date),
    weightKg: row.weight_kg == null ? null : Number(row.weight_kg),
    bodyFatPercent: row.body_fat_percent == null ? null : Number(row.body_fat_percent),
    waistCm: row.waist_cm == null ? null : Number(row.waist_cm),
    hipCm: row.hip_cm == null ? null : Number(row.hip_cm),
    chestCm: row.chest_cm == null ? null : Number(row.chest_cm),
    note: asNullableString(row.note), createdAt: asString(row.created_at),
  };
}
function mapBodyPhotoSet(row: Record<string, unknown>): StoredBodyPhotoSet {
  return {
    id: asString(row.id), userSubject: asString(row.user_subject), localDate: asString(row.local_date),
    angle: asNullableString(row.angle) as StoredBodyPhotoSet["angle"],
    mimeType: asString(row.mime_type) as StoredBodyPhotoSet["mimeType"], byteSize: Number(row.byte_size),
    storageKey: asString(row.storage_key), createdAt: asString(row.created_at),
  };
}
function mapProgressMilestone(row: Record<string, unknown>): StoredProgressMilestone {
  return { id: asString(row.id), userSubject: asString(row.user_subject), milestoneKey: asString(row.milestone_key), achievedAt: asString(row.achieved_at) };
}
function mapProgressReportExport(row: Record<string, unknown>): StoredProgressReportExport {
  return {
    id: asString(row.id), userSubject: asString(row.user_subject),
    reportType: asString(row.report_type) as StoredProgressReportExport["reportType"],
    periodLocalDate: asString(row.period_local_date), mimeType: "application/pdf",
    byteSize: Number(row.byte_size), storageKey: asString(row.storage_key), createdAt: asString(row.created_at),
  };
}
/** Keeps one row per `food_key` (the most recently verified), preserving first-seen order otherwise. */
function dedupeByFoodKey(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  const byKey = new Map<string, Record<string, unknown>>();
  const order: string[] = [];
  for (const row of rows) {
    const key = asString(row.food_key);
    const existing = byKey.get(key);
    if (!existing) order.push(key);
    if (!existing || asString(row.verified_at) > asString(existing.verified_at)) byKey.set(key, row);
  }
  return order.map((key) => byKey.get(key)!);
}

function mapScientificReference(row: Record<string, unknown>): ScientificReferenceSnapshot {
  const snapshot: ScientificReferenceSnapshot = { id: asString(row.id), title: asString(row.title), citation: asString(row.citation) };
  if (row.evidence_url != null) snapshot.evidenceUrl = asString(row.evidence_url);
  if (row.published_year != null) snapshot.publishedYear = asNumber(row.published_year);
  return snapshot;
}

/**
 * Implements `V1Transaction` against one authenticated user's Durable Object
 * SQLite storage. Every method here targets tables owned by that single user
 * (see db/migrations/*.sql) except `getFoodVersion` and
 * `getScientificReferenceSnapshots`, which read the shared D1 catalog via the
 * injected `catalog` query — pure reads, no atomicity requirement, so a real
 * cross-service call is fine there.
 */
export class DurableObjectV1Transaction implements V1Transaction {
  constructor(private readonly sql: SyncSqlStorage, private readonly catalog: D1LikeQuery) {}

  async getUserContext(userSubject: string): Promise<AuthenticatedUserContext> {
    const row = this.sql.exec("SELECT timezone, nutrition_day_start_minutes FROM users WHERE subject=?", userSubject).one();
    if (!row) throw new Error(`No user context for authenticated subject ${userSubject}; getOrCreateUser must run first`);
    return mapUserContext(row);
  }

  async getOrCreateUser(userSubject: string, defaults: { timezone: string; locale: string }): Promise<AuthenticatedUserContext> {
    const existing = this.sql.exec("SELECT timezone, nutrition_day_start_minutes FROM users WHERE subject=?", userSubject).one();
    if (existing) return mapUserContext(existing);
    const now = new Date().toISOString();
    this.sql.exec(
      "INSERT INTO users (subject, timezone, nutrition_day_start_minutes, locale, created_at, updated_at) VALUES (?,?,0,?,?,?)",
      userSubject, defaults.timezone, defaults.locale, now, now,
    );
    return { timezone: defaults.timezone, nutritionDayStartMinutes: 0 };
  }

  async getProfile(userSubject: string): Promise<StoredProfile | null> {
    const row = this.sql.exec("SELECT * FROM profiles WHERE user_subject=?", userSubject).one();
    return row ? mapProfile(row) : null;
  }

  async upsertProfile(profile: StoredProfile): Promise<void> {
    this.sql.exec(
      `INSERT INTO profiles (user_subject, display_name, birth_date, sex_at_birth, height_cm, activity_level, updated_at)
       VALUES (?,?,?,?,?,?,?)
       ON CONFLICT(user_subject) DO UPDATE SET display_name=excluded.display_name, birth_date=excluded.birth_date,
         sex_at_birth=excluded.sex_at_birth, height_cm=excluded.height_cm, activity_level=excluded.activity_level, updated_at=excluded.updated_at`,
      profile.userSubject, profile.displayName, profile.birthDate, profile.sexAtBirth, profile.heightCm, profile.activityLevel, profile.updatedAt,
    );
  }

  async insertAssessmentSnapshot(snapshot: StoredAssessmentSnapshot): Promise<void> {
    this.sql.exec(
      "INSERT INTO assessment_snapshots (id, user_subject, completed_at, payload_json, created_at) VALUES (?,?,?,?,?)",
      snapshot.id, snapshot.userSubject, snapshot.completedAt, snapshot.payloadJson, snapshot.createdAt,
    );
  }

  async getAssessmentSnapshots(userSubject: string): Promise<StoredAssessmentSnapshot[]> {
    return this.sql.exec("SELECT * FROM assessment_snapshots WHERE user_subject=? ORDER BY completed_at", userSubject).toArray().map(mapAssessmentSnapshot);
  }

  async insertSafetyAcknowledgement(acknowledgement: StoredSafetyAcknowledgement): Promise<void> {
    this.sql.exec(
      "INSERT INTO safety_acknowledgements (id, user_subject, acknowledgement_type, policy_version, acknowledged_at, created_at) VALUES (?,?,?,?,?,?)",
      acknowledgement.id, acknowledgement.userSubject, acknowledgement.acknowledgementType, acknowledgement.policyVersion, acknowledgement.acknowledgedAt, acknowledgement.createdAt,
    );
  }

  async getSafetyAcknowledgements(userSubject: string): Promise<StoredSafetyAcknowledgement[]> {
    return this.sql.exec("SELECT * FROM safety_acknowledgements WHERE user_subject=? ORDER BY acknowledged_at", userSubject).toArray().map(mapSafetyAcknowledgement);
  }

  async getProposal(userSubject: string, actionId: string): Promise<StoredProposal | null> {
    const row = this.sql.exec("SELECT * FROM ai_action_proposals WHERE id=? AND user_subject=?", actionId, userSubject).one();
    return row ? mapProposal(row) : null;
  }

  async insertProposalIfAbsent(proposal: StoredProposal): Promise<StoredProposal> {
    const inserted = this.sql.exec(
      `INSERT INTO ai_action_proposals (id, user_subject, action_type, schema_version, payload_json, payload_sha256, idempotency_key, created_at)
       VALUES (?,?,?,?,?,?,?,?)
       ON CONFLICT(user_subject, idempotency_key) DO NOTHING
       RETURNING *`,
      proposal.id, proposal.userSubject, proposal.actionType, proposal.schemaVersion, proposal.payloadJson, proposal.payloadSha256, proposal.idempotencyKey, proposal.createdAt,
    ).one();
    if (inserted) return mapProposal(inserted);
    const existing = this.sql.exec("SELECT * FROM ai_action_proposals WHERE user_subject=? AND idempotency_key=?", proposal.userSubject, proposal.idempotencyKey).one();
    if (!existing) throw new Error("Proposal insert conflicted but no existing row was found");
    return mapProposal(existing);
  }

  async getDecision(userSubject: string, actionId: string): Promise<StoredDecision | null> {
    const row = this.sql.exec("SELECT * FROM ai_action_decisions WHERE action_id=? AND user_subject=?", actionId, userSubject).one();
    return row ? mapDecision(row) : null;
  }

  async insertDecision(decision: StoredDecision): Promise<void> {
    this.sql.exec("INSERT INTO ai_action_decisions (action_id, user_subject, decision, decided_at) VALUES (?,?,?,?)", decision.actionId, decision.userSubject, decision.decision, decision.decidedAt);
  }

  async getOutcome(userSubject: string, actionId: string): Promise<StoredOutcome | null> {
    const row = this.sql.exec("SELECT * FROM ai_action_outcomes WHERE action_id=? AND user_subject=?", actionId, userSubject).one();
    return row ? mapOutcome(row) : null;
  }

  async insertOutcome(outcome: StoredOutcome): Promise<void> {
    this.sql.exec(
      "INSERT INTO ai_action_outcomes (action_id, user_subject, action_type, confirmation_marker, outcome, result_event_id, failure_code, recorded_at) VALUES (?,?,?,'confirmed',?,?,?,?)",
      outcome.actionId, outcome.userSubject, outcome.actionType, outcome.outcome, outcome.resultEventId, outcome.failureCode, outcome.recordedAt,
    );
  }

  async getNutritionEvent(userSubject: string, eventId: string): Promise<StoredNutritionEvent | null> {
    const row = this.sql.exec("SELECT * FROM nutrition_events WHERE id=? AND user_subject=?", eventId, userSubject).one();
    return row ? mapNutritionEvent(row) : null;
  }

  async insertNutritionEvent(event: StoredNutritionEvent): Promise<void> {
    this.sql.exec(
      "INSERT INTO nutrition_events (id, user_subject, event_type, occurred_at, local_date, payload_json, created_at) VALUES (?,?,?,?,?,?,?)",
      event.id, event.userSubject, event.eventType, event.occurredAt, event.localDate, event.payloadJson, event.createdAt,
    );
  }

  async insertNutritionEventWithOutcome(event: StoredNutritionEvent, outcome: StoredOutcome): Promise<void> {
    this.sql.transactionSync(() => {
      this.sql.exec(
        "INSERT INTO nutrition_events (id, user_subject, event_type, occurred_at, local_date, payload_json, created_at) VALUES (?,?,?,?,?,?,?)",
        event.id, event.userSubject, event.eventType, event.occurredAt, event.localDate, event.payloadJson, event.createdAt,
      );
      this.sql.exec(
        "INSERT INTO ai_action_outcomes (action_id, user_subject, action_type, confirmation_marker, outcome, result_event_id, failure_code, recorded_at) VALUES (?,?,?,'confirmed',?,?,?,?)",
        outcome.actionId, outcome.userSubject, outcome.actionType, outcome.outcome, outcome.resultEventId, outcome.failureCode, outcome.recordedAt,
      );
    });
  }

  async getFoodVersion(userSubject: string, foodVersionId: string): Promise<VersionedFood | null> {
    // `owner_subject` is NULL for the shared verified catalog and set for a user's own custom
    // foods (see db/migrations/0001_initial.sql). Without this check, any authenticated subject
    // could resolve another user's private custom food by guessing/enumerating its id.
    const foodRows = await this.catalog(
      "SELECT * FROM food_versions WHERE id=? AND (owner_subject IS NULL OR owner_subject=?)",
      [foodVersionId, userSubject],
    );
    const food = foodRows[0];
    if (!food) return null;
    return this.hydrateFoodVersion(food);
  }

  /** Shared row->VersionedFood hydration (fetches this food's portions from the catalog too). Used by every catalog read path. */
  private async hydrateFoodVersion(food: Record<string, unknown>): Promise<VersionedFood> {
    const portionRows = await this.catalog("SELECT * FROM portion_versions WHERE food_version_id=?", [asString(food.id)]);
    return {
      id: asString(food.id),
      foodKey: asString(food.food_key),
      name: asString(food.name),
      brand: asNullableString(food.brand) ?? undefined,
      barcode: asNullableString(food.barcode) ?? undefined,
      isLiquid: asBool(food.is_liquid),
      basisGrams: 100,
      nutrition: {
        energyKcal: asNumber(food.energy_kcal_100g),
        proteinG: asNumber(food.protein_g_100g),
        carbsG: asNumber(food.carbs_g_100g),
        fatG: asNumber(food.fat_g_100g),
        fiberG: food.fiber_g_100g == null ? undefined : asNumber(food.fiber_g_100g),
        extended: JSON.parse(asString(food.extended_nutrition_json ?? "{}")),
      },
      source: {
        provider: asString(food.source_provider) as NutritionSourceProvider,
        externalId: asNullableString(food.source_external_id) ?? undefined,
        verifiedAt: asString(food.verified_at),
        evidenceUrl: asNullableString(food.source_evidence_url) ?? undefined,
        licenseId: asNullableString(food.source_license_id) ?? undefined,
      },
      portionOptions: portionRows.map((p): FoodPortionOption => ({
        id: asString(p.id),
        measure: asString(p.measure) as PortionMeasure,
        size: (asNullableString(p.size) ?? undefined) as PortionSize | undefined,
        label: asString(p.label),
        gramsPerUnit: asNumber(p.grams_per_unit),
        source: {
          provider: asString(p.source_provider) as NutritionSourceProvider,
          externalId: asNullableString(p.source_external_id) ?? undefined,
          verifiedAt: asString(p.verified_at),
          evidenceUrl: asNullableString(p.source_evidence_url) ?? undefined,
          licenseId: asNullableString(p.source_license_id) ?? undefined,
        },
      })),
      allergenIds: JSON.parse(asString(food.allergen_ids_json ?? "[]")),
      allergenDataStatus: asString(food.allergen_data_status) as VersionedFood["allergenDataStatus"],
      dietaryConflictRuleIds: JSON.parse(asString(food.dietary_conflict_rule_ids_json ?? "[]")),
      dietarySafetyDataStatus: asString(food.dietary_safety_data_status) as VersionedFood["dietarySafetyDataStatus"],
    };
  }

  async getActiveAllergenExclusions(userSubject: string): Promise<AllergenSafetyExclusion[]> {
    return this.sql.exec("SELECT * FROM user_safety_exclusions WHERE user_subject=? AND kind='allergen' AND active=1", userSubject).toArray().map(mapAllergenExclusion);
  }

  async getActiveDietaryExclusions(userSubject: string): Promise<DietarySafetyExclusion[]> {
    return this.sql.exec("SELECT * FROM user_safety_exclusions WHERE user_subject=? AND kind IN ('food','dietary-rule') AND active=1", userSubject).toArray().map(mapDietaryExclusion);
  }

  async getScientificReferenceSnapshots(referenceIds: string[]): Promise<ScientificReferenceSnapshot[]> {
    if (referenceIds.length === 0) return [];
    const placeholders = referenceIds.map(() => "?").join(",");
    const rows = await this.catalog(`SELECT * FROM scientific_reference_versions WHERE id IN (${placeholders})`, referenceIds);
    return rows.map(mapScientificReference);
  }

  async insertGoalVersion(goal: StoredGoalVersion): Promise<void> {
    this.sql.exec(
      `INSERT INTO goal_versions (id, user_subject, source, calculator_id, calculator_inputs_json, reference_snapshots_json, energy_kcal, protein_g, carbs_g, fat_g, fiber_g, water_ml, meal_allocations_json, created_at)
       VALUES (?,?,'arven-calculated','mifflin-st-jeor@v1',?,?,?,?,?,?,?,?,?,?)`,
      goal.id, goal.userSubject, goal.calculatorInputsJson, goal.referenceSnapshotsJson, goal.energyKcal, goal.proteinG, goal.carbsG, goal.fatG, goal.fiberG, goal.waterMl, goal.mealAllocationsJson, goal.createdAt,
    );
  }

  async setCurrentGoal(userSubject: string, goalVersionId: string, selectedAt: string): Promise<void> {
    this.sql.exec(
      `INSERT INTO user_current_goal (user_subject, goal_version_id, selected_at) VALUES (?,?,?)
       ON CONFLICT(user_subject) DO UPDATE SET goal_version_id=excluded.goal_version_id, selected_at=excluded.selected_at`,
      userSubject, goalVersionId, selectedAt,
    );
  }

  async insertGoalVersionAndSetCurrent(goal: StoredGoalVersion, selectedAt: string): Promise<void> {
    this.sql.transactionSync(() => {
      this.sql.exec(
        `INSERT INTO goal_versions (id, user_subject, source, calculator_id, calculator_inputs_json, reference_snapshots_json, energy_kcal, protein_g, carbs_g, fat_g, fiber_g, water_ml, meal_allocations_json, created_at)
         VALUES (?,?,'arven-calculated','mifflin-st-jeor@v1',?,?,?,?,?,?,?,?,?,?)`,
        goal.id, goal.userSubject, goal.calculatorInputsJson, goal.referenceSnapshotsJson, goal.energyKcal, goal.proteinG, goal.carbsG, goal.fatG, goal.fiberG, goal.waterMl, goal.mealAllocationsJson, goal.createdAt,
      );
      this.sql.exec(
        `INSERT INTO user_current_goal (user_subject, goal_version_id, selected_at) VALUES (?,?,?)
         ON CONFLICT(user_subject) DO UPDATE SET goal_version_id=excluded.goal_version_id, selected_at=excluded.selected_at`,
        goal.userSubject, goal.id, selectedAt,
      );
    });
  }

  async getCurrentGoalVersion(userSubject: string): Promise<StoredGoalVersion | null> {
    const row = this.sql.exec(
      `SELECT g.* FROM user_current_goal c JOIN goal_versions g ON g.id = c.goal_version_id AND g.user_subject = c.user_subject WHERE c.user_subject=?`,
      userSubject,
    ).one();
    return row ? mapGoalVersion(row) : null;
  }

  async listNutritionEventsForLocalDate(userSubject: string, localDate: string): Promise<StoredNutritionEvent[]> {
    return this.sql.exec(
      "SELECT * FROM nutrition_events WHERE user_subject=? AND local_date=? ORDER BY occurred_at",
      userSubject, localDate,
    ).toArray().map(mapNutritionEvent);
  }

  async searchFoodVersions(userSubject: string, query: string, limit: number): Promise<VersionedFood[]> {
    const normalized = `%${query.trim().toLocaleLowerCase("tr-TR")}%`;
    // Multiple verified sources (Open Food Facts, USDA, TürKomp, a user's own custom entry, …) can each
    // contribute a row sharing the same `food_key` — fetch a wider pool than `limit` so deduping down to
    // one row per food_key (the most recently verified) still leaves enough distinct foods to fill a page.
    const rows = await this.catalog(
      "SELECT * FROM food_versions WHERE (owner_subject IS NULL OR owner_subject=?) AND normalized_name LIKE ? ORDER BY name LIMIT ?",
      [userSubject, normalized, limit * 5],
    );
    const deduped = dedupeByFoodKey(rows).slice(0, limit);
    return Promise.all(deduped.map((row) => this.hydrateFoodVersion(row)));
  }

  async findFoodVersionByBarcode(userSubject: string, barcode: string): Promise<VersionedFood | null> {
    const rows = await this.catalog(
      "SELECT * FROM food_versions WHERE (owner_subject IS NULL OR owner_subject=?) AND barcode=? LIMIT 1",
      [userSubject, barcode],
    );
    const row = rows[0];
    return row ? this.hydrateFoodVersion(row) : null;
  }

  async getFoodVersionByFoodKey(userSubject: string, foodKey: string): Promise<VersionedFood | null> {
    const rows = await this.catalog(
      "SELECT * FROM food_versions WHERE food_key=? AND (owner_subject IS NULL OR owner_subject=?) ORDER BY verified_at DESC LIMIT 1",
      [foodKey, userSubject],
    );
    const row = rows[0];
    return row ? this.hydrateFoodVersion(row) : null;
  }

  /**
   * Inserts one externally-verified food (e.g. an Open Food Facts product) as a new global
   * (unowned) catalog row — no household portions, since the app logs these by exact grams
   * instead. Allergen/dietary status is always "unknown": OFF's raw allergen/category tags are not
   * yet mapped to this app's internal allergen/dietary-rule ids (future work, same as noted in
   * `lib/nutrition/providers/open-food-facts.ts`). Callers must pre-check `getFoodVersionByFoodKey`
   * themselves — this does not deduplicate.
   */
  async importVerifiedFoodVersion(food: StoredVerifiedFoodImport): Promise<void> {
    await this.catalog(
      `INSERT INTO food_versions (id, food_key, version, owner_subject, name, normalized_name, brand, barcode, is_liquid, energy_kcal_100g, protein_g_100g, carbs_g_100g, fat_g_100g, fiber_g_100g, extended_nutrition_json, allergen_data_status, allergen_ids_json, dietary_safety_data_status, dietary_conflict_rule_ids_json, source_provider, source_external_id, source_evidence_url, source_license_id, verified_at, created_at)
       VALUES (?,?,1,NULL,?,?,?,?,?,?,?,?,?,?,'{}','unknown','[]','unknown','[]',?,?,?,NULL,?,?)`,
      [
        food.id, food.foodKey, food.name, normalizeFoodName(food.name), food.brand, food.barcode, food.isLiquid ? 1 : 0,
        food.energyKcal, food.proteinG, food.carbsG, food.fatG, food.fiberG,
        food.sourceProvider, food.sourceExternalId, food.sourceEvidenceUrl,
        food.verifiedAt, food.createdAt,
      ],
    );
  }

  async insertMealPlanVersionAndSetCurrent(plan: StoredMealPlanVersion, selectedAt: string): Promise<void> {
    this.sql.transactionSync(() => {
      this.sql.exec(
        "INSERT INTO meal_plan_versions (id, user_subject, slots_json, created_at) VALUES (?,?,?,?)",
        plan.id, plan.userSubject, plan.slotsJson, plan.createdAt,
      );
      this.sql.exec(
        `INSERT INTO user_current_meal_plan (user_subject, meal_plan_version_id, selected_at) VALUES (?,?,?)
         ON CONFLICT(user_subject) DO UPDATE SET meal_plan_version_id=excluded.meal_plan_version_id, selected_at=excluded.selected_at`,
        plan.userSubject, plan.id, selectedAt,
      );
    });
  }

  async getCurrentMealPlan(userSubject: string): Promise<StoredMealPlanVersion | null> {
    const row = this.sql.exec(
      `SELECT p.* FROM user_current_meal_plan c JOIN meal_plan_versions p ON p.id = c.meal_plan_version_id AND p.user_subject = c.user_subject WHERE c.user_subject=?`,
      userSubject,
    ).one();
    return row ? mapMealPlanVersion(row) : null;
  }

  async deleteManualNutritionEvent(userSubject: string, eventId: string): Promise<void> {
    const existing = this.sql.exec("SELECT id FROM nutrition_events WHERE id=? AND user_subject=?", eventId, userSubject).one();
    if (!existing) throw new Error("Nutrition event not found");
    try {
      this.sql.exec("DELETE FROM nutrition_events WHERE id=? AND user_subject=?", eventId, userSubject);
    } catch {
      // The `ai_action_outcomes.result_event_id` foreign key (`ON DELETE RESTRICT`) is what actually
      // protects a confirmed AI action's history — this just turns that low-level failure into a
      // message the mutation service/route layer can surface as a normal 400.
      throw new Error("Cannot delete a nutrition event created by a confirmed AI action");
    }
  }

  async insertCustomFoodVersion(food: StoredCustomFoodVersion): Promise<void> {
    await this.catalog(
      `INSERT INTO food_versions (id, food_key, version, owner_subject, name, normalized_name, brand, barcode, is_liquid, energy_kcal_100g, protein_g_100g, carbs_g_100g, fat_g_100g, fiber_g_100g, extended_nutrition_json, allergen_data_status, allergen_ids_json, dietary_safety_data_status, dietary_conflict_rule_ids_json, source_provider, source_external_id, source_evidence_url, source_license_id, verified_at, created_at)
       VALUES (?,?,1,?,?,?,NULL,NULL,?,?,?,?,?,?,'{}',?,?,?,?,'manual-verified',NULL,NULL,NULL,?,?)`,
      [
        food.id, food.foodKey, food.ownerSubject, food.name, normalizeFoodName(food.name), food.isLiquid ? 1 : 0,
        food.energyKcal, food.proteinG, food.carbsG, food.fatG, food.fiberG,
        food.allergenDataStatus, JSON.stringify(food.allergenIds), food.dietarySafetyDataStatus, JSON.stringify(food.dietaryConflictRuleIds),
        food.verifiedAt, food.createdAt,
      ],
    );
    for (const portion of food.portions) {
      await this.catalog(
        `INSERT INTO portion_versions (id, portion_key, version, food_version_id, measure, size, label, grams_per_unit, source_provider, source_external_id, source_evidence_url, source_license_id, verified_at, created_at)
         VALUES (?,?,1,?,?,NULL,?,?,'manual-verified',NULL,NULL,NULL,?,?)`,
        [portion.id, portion.id, food.id, portion.measure, portion.label, portion.gramsPerUnit, food.verifiedAt, food.createdAt],
      );
    }
  }

  async insertMemoryFact(fact: StoredMemoryFact): Promise<void> {
    this.sql.exec(
      "INSERT INTO ai_memory_facts (id, user_subject, fact_text, provenance, confidence, created_at) VALUES (?,?,?,?,?,?)",
      fact.id, fact.userSubject, fact.factText, fact.provenance, fact.confidence, fact.createdAt,
    );
  }

  async listMemoryFacts(userSubject: string): Promise<StoredMemoryFact[]> {
    return this.sql.exec("SELECT * FROM ai_memory_facts WHERE user_subject=? ORDER BY created_at DESC", userSubject).toArray().map(mapMemoryFact);
  }

  async deleteMemoryFact(userSubject: string, id: string): Promise<void> {
    this.sql.exec("DELETE FROM ai_memory_facts WHERE id=? AND user_subject=?", id, userSubject);
  }

  async insertWeeklyInsightSnapshot(snapshot: StoredWeeklyInsightSnapshot): Promise<void> {
    this.sql.exec(
      "INSERT INTO weekly_insight_snapshots (id, user_subject, week_start_local_date, metrics_json, narrative_json, created_at) VALUES (?,?,?,?,?,?)",
      snapshot.id, snapshot.userSubject, snapshot.weekStartLocalDate, snapshot.metricsJson, snapshot.narrativeJson, snapshot.createdAt,
    );
  }

  async getLatestWeeklyInsightSnapshot(userSubject: string, weekStartLocalDate: string): Promise<StoredWeeklyInsightSnapshot | null> {
    const row = this.sql.exec(
      "SELECT * FROM weekly_insight_snapshots WHERE user_subject=? AND week_start_local_date=? ORDER BY created_at DESC LIMIT 1",
      userSubject, weekStartLocalDate,
    ).one();
    return row ? mapWeeklyInsightSnapshot(row) : null;
  }

  async insertPhotoAsset(asset: StoredPhotoAsset): Promise<void> {
    this.sql.exec(
      "INSERT INTO photo_assets (id, user_subject, kind, mime_type, byte_size, storage_key, created_at) VALUES (?,?,?,?,?,?,?)",
      asset.id, asset.userSubject, asset.kind, asset.mimeType, asset.byteSize, asset.storageKey, asset.createdAt,
    );
  }

  async getPhotoAsset(userSubject: string, id: string): Promise<StoredPhotoAsset | null> {
    const row = this.sql.exec("SELECT * FROM photo_assets WHERE id=? AND user_subject=?", id, userSubject).one();
    return row ? mapPhotoAsset(row) : null;
  }

  async listPhotoAssets(userSubject: string): Promise<StoredPhotoAsset[]> {
    return this.sql.exec("SELECT * FROM photo_assets WHERE user_subject=? ORDER BY created_at DESC", userSubject).toArray().map(mapPhotoAsset);
  }

  async deletePhotoAsset(userSubject: string, id: string): Promise<void> {
    this.sql.exec("DELETE FROM photo_assets WHERE id=? AND user_subject=?", id, userSubject);
  }

  async insertLabDocument(document: StoredLabDocument): Promise<void> {
    this.sql.exec(
      "INSERT INTO lab_documents (id, user_subject, mime_type, byte_size, storage_key, created_at) VALUES (?,?,?,?,?,?)",
      document.id, document.userSubject, document.mimeType, document.byteSize, document.storageKey, document.createdAt,
    );
  }

  async getLabDocument(userSubject: string, id: string): Promise<StoredLabDocument | null> {
    const row = this.sql.exec("SELECT * FROM lab_documents WHERE id=? AND user_subject=?", id, userSubject).one();
    return row ? mapLabDocument(row) : null;
  }

  async listLabDocuments(userSubject: string): Promise<StoredLabDocument[]> {
    return this.sql.exec("SELECT * FROM lab_documents WHERE user_subject=? ORDER BY created_at DESC", userSubject).toArray().map(mapLabDocument);
  }

  async deleteLabDocument(userSubject: string, id: string): Promise<void> {
    this.sql.exec("DELETE FROM lab_documents WHERE id=? AND user_subject=?", id, userSubject);
  }

  async insertLabResultEntry(entry: StoredLabResultEntry): Promise<void> {
    this.sql.exec(
      "INSERT INTO lab_result_entries (id, user_subject, lab_document_id, marker_name, value_text, unit_text, reference_range_text, status, created_at) VALUES (?,?,?,?,?,?,?,?,?)",
      entry.id, entry.userSubject, entry.labDocumentId, entry.markerName, entry.valueText, entry.unitText, entry.referenceRangeText, entry.status, entry.createdAt,
    );
  }

  async listLabResultEntries(userSubject: string): Promise<StoredLabResultEntry[]> {
    return this.sql.exec("SELECT * FROM lab_result_entries WHERE user_subject=? ORDER BY created_at DESC", userSubject).toArray().map(mapLabResultEntry);
  }

  async confirmLabResultEntry(userSubject: string, id: string, edited: { markerName: string; valueText: string; unitText: string | null; referenceRangeText: string | null }): Promise<StoredLabResultEntry> {
    const existingRow = this.sql.exec("SELECT * FROM lab_result_entries WHERE id=? AND user_subject=?", id, userSubject).one();
    if (!existingRow) throw new Error("Lab result entry not found");
    const existing = mapLabResultEntry(existingRow);
    if (existing.status === "confirmed") {
      const identical = existing.markerName === edited.markerName && existing.valueText === edited.valueText && existing.unitText === edited.unitText && existing.referenceRangeText === edited.referenceRangeText;
      if (identical) return existing;
      throw new Error("Confirmed lab result entries are immutable; create a new correction instead");
    }
    this.sql.exec(
      "UPDATE lab_result_entries SET marker_name=?, value_text=?, unit_text=?, reference_range_text=?, status='confirmed' WHERE id=? AND user_subject=?",
      edited.markerName, edited.valueText, edited.unitText, edited.referenceRangeText, id, userSubject,
    );
    const row = this.sql.exec("SELECT * FROM lab_result_entries WHERE id=? AND user_subject=?", id, userSubject).one();
    if (!row) throw new Error("Lab result entry not found");
    return mapLabResultEntry(row);
  }

  async deleteLabResultEntry(userSubject: string, id: string): Promise<void> {
    this.sql.exec("DELETE FROM lab_result_entries WHERE id=? AND user_subject=?", id, userSubject);
  }

  async insertSupplementRecord(record: StoredSupplementRecord): Promise<void> {
    this.sql.exec(
      "INSERT INTO supplement_records (id, user_subject, food_version_id, name, note, is_active, created_at) VALUES (?,?,?,?,?,?,?)",
      record.id, record.userSubject, record.foodVersionId, record.name, record.note, record.isActive ? 1 : 0, record.createdAt,
    );
  }

  async listSupplementRecords(userSubject: string): Promise<StoredSupplementRecord[]> {
    return this.sql.exec("SELECT * FROM supplement_records WHERE user_subject=? ORDER BY created_at DESC", userSubject).toArray().map(mapSupplementRecord);
  }

  async setSupplementRecordActive(userSubject: string, id: string, isActive: boolean): Promise<void> {
    this.sql.exec("UPDATE supplement_records SET is_active=? WHERE id=? AND user_subject=?", isActive ? 1 : 0, id, userSubject);
    const row = this.sql.exec("SELECT id FROM supplement_records WHERE id=? AND user_subject=?", id, userSubject).one();
    if (!row) throw new Error("Supplement record not found");
  }

  async deleteSupplementRecord(userSubject: string, id: string): Promise<void> {
    this.sql.exec("DELETE FROM supplement_records WHERE id=? AND user_subject=?", id, userSubject);
  }

  async insertRecipe(recipe: StoredRecipe): Promise<void> {
    this.sql.exec(
      "INSERT INTO recipes (id, user_subject, name, servings, ingredients_json, created_at) VALUES (?,?,?,?,?,?)",
      recipe.id, recipe.userSubject, recipe.name, recipe.servings, recipe.ingredientsJson, recipe.createdAt,
    );
  }
  async listRecipes(userSubject: string): Promise<StoredRecipe[]> {
    return this.sql.exec("SELECT * FROM recipes WHERE user_subject=? ORDER BY created_at DESC", userSubject).toArray().map(mapRecipe);
  }
  async getRecipe(userSubject: string, id: string): Promise<StoredRecipe | null> {
    const row = this.sql.exec("SELECT * FROM recipes WHERE id=? AND user_subject=?", id, userSubject).one();
    return row ? mapRecipe(row) : null;
  }
  async deleteRecipe(userSubject: string, id: string): Promise<void> {
    this.sql.exec("DELETE FROM recipes WHERE id=? AND user_subject=?", id, userSubject);
  }

  async insertWeeklyPlanVersionAndSetCurrent(plan: StoredWeeklyPlanVersion, selectedAt: string): Promise<void> {
    this.sql.transactionSync(() => {
      this.sql.exec(
        "INSERT INTO weekly_plan_versions (id, user_subject, week_start_local_date, days_json, created_at) VALUES (?,?,?,?,?)",
        plan.id, plan.userSubject, plan.weekStartLocalDate, plan.daysJson, plan.createdAt,
      );
      this.sql.exec(
        `INSERT INTO user_current_weekly_plan (user_subject, week_start_local_date, weekly_plan_version_id, selected_at) VALUES (?,?,?,?)
         ON CONFLICT(user_subject, week_start_local_date) DO UPDATE SET weekly_plan_version_id=excluded.weekly_plan_version_id, selected_at=excluded.selected_at`,
        plan.userSubject, plan.weekStartLocalDate, plan.id, selectedAt,
      );
    });
  }
  async getCurrentWeeklyPlan(userSubject: string, weekStartLocalDate: string): Promise<StoredWeeklyPlanVersion | null> {
    const row = this.sql.exec(
      `SELECT p.* FROM user_current_weekly_plan c JOIN weekly_plan_versions p ON p.id = c.weekly_plan_version_id AND p.user_subject = c.user_subject WHERE c.user_subject=? AND c.week_start_local_date=?`,
      userSubject, weekStartLocalDate,
    ).one();
    return row ? mapWeeklyPlanVersion(row) : null;
  }

  async insertPantryItem(item: StoredPantryItem): Promise<void> {
    this.sql.exec(
      "INSERT INTO pantry_items (id, user_subject, food_version_id, label, quantity_grams, quantity_note, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)",
      item.id, item.userSubject, item.foodVersionId, item.label, item.quantityGrams, item.quantityNote, item.createdAt, item.updatedAt,
    );
  }
  async listPantryItems(userSubject: string): Promise<StoredPantryItem[]> {
    return this.sql.exec("SELECT * FROM pantry_items WHERE user_subject=? ORDER BY created_at DESC", userSubject).toArray().map(mapPantryItem);
  }
  async updatePantryItem(userSubject: string, id: string, edit: { quantityGrams: number | null; quantityNote: string | null }): Promise<StoredPantryItem> {
    const updatedAt = new Date().toISOString();
    this.sql.exec("UPDATE pantry_items SET quantity_grams=?, quantity_note=?, updated_at=? WHERE id=? AND user_subject=?", edit.quantityGrams, edit.quantityNote, updatedAt, id, userSubject);
    const row = this.sql.exec("SELECT * FROM pantry_items WHERE id=? AND user_subject=?", id, userSubject).one();
    if (!row) throw new Error("Pantry item not found");
    return mapPantryItem(row);
  }
  async deletePantryItem(userSubject: string, id: string): Promise<void> {
    this.sql.exec("DELETE FROM pantry_items WHERE id=? AND user_subject=?", id, userSubject);
  }

  async replaceShoppingListItems(userSubject: string, weekStartLocalDate: string, items: StoredShoppingListItem[]): Promise<void> {
    this.sql.transactionSync(() => {
      this.sql.exec("DELETE FROM shopping_list_items WHERE user_subject=? AND week_start_local_date=?", userSubject, weekStartLocalDate);
      for (const item of items) {
        this.sql.exec(
          "INSERT INTO shopping_list_items (id, user_subject, week_start_local_date, food_version_id, label, needed_grams, is_checked, created_at) VALUES (?,?,?,?,?,?,?,?)",
          item.id, item.userSubject, item.weekStartLocalDate, item.foodVersionId, item.label, item.neededGrams, item.isChecked ? 1 : 0, item.createdAt,
        );
      }
    });
  }
  async listShoppingListItems(userSubject: string, weekStartLocalDate: string): Promise<StoredShoppingListItem[]> {
    return this.sql.exec("SELECT * FROM shopping_list_items WHERE user_subject=? AND week_start_local_date=? ORDER BY created_at DESC", userSubject, weekStartLocalDate).toArray().map(mapShoppingListItem);
  }
  async setShoppingListItemChecked(userSubject: string, id: string, isChecked: boolean): Promise<void> {
    this.sql.exec("UPDATE shopping_list_items SET is_checked=? WHERE id=? AND user_subject=?", isChecked ? 1 : 0, id, userSubject);
    const row = this.sql.exec("SELECT id FROM shopping_list_items WHERE id=? AND user_subject=?", id, userSubject).one();
    if (!row) throw new Error("Shopping list item not found");
  }
  async getWeekPrepPreferences(userSubject: string): Promise<StoredWeekPrepPreferences | null> {
    const row = this.sql.exec("SELECT * FROM week_prep_preferences WHERE user_subject=?", userSubject).one();
    return row ? mapWeekPrepPreferences(row) : null;
  }
  async upsertWeekPrepPreferences(preferences: StoredWeekPrepPreferences): Promise<void> {
    this.sql.exec(
      `INSERT INTO week_prep_preferences (user_subject, enabled, prep_day_of_week, prep_local_time, updated_at) VALUES (?,?,?,?,?)
       ON CONFLICT(user_subject) DO UPDATE SET enabled=excluded.enabled, prep_day_of_week=excluded.prep_day_of_week, prep_local_time=excluded.prep_local_time, updated_at=excluded.updated_at`,
      preferences.userSubject, preferences.enabled ? 1 : 0, preferences.prepDayOfWeek, preferences.prepLocalTime, preferences.updatedAt,
    );
  }
  async getWeekPrepStatus(userSubject: string, weekStartLocalDate: string): Promise<StoredWeekPrepStatus | null> {
    const row = this.sql.exec("SELECT * FROM week_prep_status WHERE user_subject=? AND week_start_local_date=?", userSubject, weekStartLocalDate).one();
    return row ? mapWeekPrepStatus(row) : null;
  }
  async upsertWeekPrepStatus(status: StoredWeekPrepStatus): Promise<void> {
    this.sql.exec(
      `INSERT INTO week_prep_status (user_subject, week_start_local_date, is_completed, updated_at) VALUES (?,?,?,?)
       ON CONFLICT(user_subject, week_start_local_date) DO UPDATE SET is_completed=excluded.is_completed, updated_at=excluded.updated_at`,
      status.userSubject, status.weekStartLocalDate, status.isCompleted ? 1 : 0, status.updatedAt,
    );
  }

  async insertBodyMeasurement(measurement: StoredBodyMeasurement): Promise<void> {
    this.sql.exec(
      "INSERT INTO body_measurements (id, user_subject, local_date, weight_kg, body_fat_percent, waist_cm, hip_cm, chest_cm, note, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
      measurement.id, measurement.userSubject, measurement.localDate, measurement.weightKg, measurement.bodyFatPercent, measurement.waistCm, measurement.hipCm, measurement.chestCm, measurement.note, measurement.createdAt,
    );
  }
  async listBodyMeasurements(userSubject: string): Promise<StoredBodyMeasurement[]> {
    return this.sql.exec("SELECT * FROM body_measurements WHERE user_subject=? ORDER BY local_date, created_at", userSubject).toArray().map(mapBodyMeasurement);
  }
  async deleteBodyMeasurement(userSubject: string, id: string): Promise<void> {
    this.sql.exec("DELETE FROM body_measurements WHERE id=? AND user_subject=?", id, userSubject);
  }

  async insertBodyPhotoSet(photo: StoredBodyPhotoSet): Promise<void> {
    this.sql.exec(
      "INSERT INTO body_photo_sets (id, user_subject, local_date, angle, mime_type, byte_size, storage_key, created_at) VALUES (?,?,?,?,?,?,?,?)",
      photo.id, photo.userSubject, photo.localDate, photo.angle, photo.mimeType, photo.byteSize, photo.storageKey, photo.createdAt,
    );
  }
  async getBodyPhotoSet(userSubject: string, id: string): Promise<StoredBodyPhotoSet | null> {
    const row = this.sql.exec("SELECT * FROM body_photo_sets WHERE id=? AND user_subject=?", id, userSubject).one();
    return row ? mapBodyPhotoSet(row) : null;
  }
  async listBodyPhotoSets(userSubject: string): Promise<StoredBodyPhotoSet[]> {
    return this.sql.exec("SELECT * FROM body_photo_sets WHERE user_subject=? ORDER BY created_at DESC", userSubject).toArray().map(mapBodyPhotoSet);
  }
  async deleteBodyPhotoSet(userSubject: string, id: string): Promise<void> {
    this.sql.exec("DELETE FROM body_photo_sets WHERE id=? AND user_subject=?", id, userSubject);
  }

  async hasProgressMilestone(userSubject: string, milestoneKey: string): Promise<boolean> {
    return this.sql.exec("SELECT 1 FROM progress_milestones WHERE user_subject=? AND milestone_key=?", userSubject, milestoneKey).one() != null;
  }
  async insertProgressMilestone(milestone: StoredProgressMilestone): Promise<void> {
    this.sql.exec(
      "INSERT INTO progress_milestones (id, user_subject, milestone_key, achieved_at) VALUES (?,?,?,?)",
      milestone.id, milestone.userSubject, milestone.milestoneKey, milestone.achievedAt,
    );
  }
  async listProgressMilestones(userSubject: string): Promise<StoredProgressMilestone[]> {
    return this.sql.exec("SELECT * FROM progress_milestones WHERE user_subject=? ORDER BY achieved_at DESC", userSubject).toArray().map(mapProgressMilestone);
  }

  async insertProgressReportExport(report: StoredProgressReportExport): Promise<void> {
    this.sql.exec(
      "INSERT INTO progress_report_exports (id, user_subject, report_type, period_local_date, mime_type, byte_size, storage_key, created_at) VALUES (?,?,?,?,'application/pdf',?,?,?)",
      report.id, report.userSubject, report.reportType, report.periodLocalDate, report.byteSize, report.storageKey, report.createdAt,
    );
  }
  async getProgressReportExport(userSubject: string, id: string): Promise<StoredProgressReportExport | null> {
    const row = this.sql.exec("SELECT * FROM progress_report_exports WHERE id=? AND user_subject=?", id, userSubject).one();
    return row ? mapProgressReportExport(row) : null;
  }
  async listProgressReportExports(userSubject: string): Promise<StoredProgressReportExport[]> {
    return this.sql.exec("SELECT * FROM progress_report_exports WHERE user_subject=? ORDER BY created_at DESC", userSubject).toArray().map(mapProgressReportExport);
  }
  async deleteProgressReportExport(userSubject: string, id: string): Promise<void> {
    this.sql.exec("DELETE FROM progress_report_exports WHERE id=? AND user_subject=?", id, userSubject);
  }

  /**
   * Ordered deletes respecting the schema's mixed CASCADE/RESTRICT foreign keys
   * — see db/migrations/*.sql. Only touches this user's own Durable Object
   * storage. `food_versions`/`portion_versions` (including any custom foods
   * this user owns, `owner_subject`) live in the shared D1 catalog, not here
   * — purging those is D1-side write tooling, explicitly out of scope for
   * this adapter (see plan's "explicitly deferred" section).
   *
   * Known follow-up: `food_versions.owner_subject` currently declares
   * `REFERENCES users(subject) ON DELETE CASCADE` in the shared migration
   * files. That's only enforceable while both tables sit in one SQLite
   * connection (as in this adapter's tests); once D1 and a per-user Durable
   * Object are genuinely separate database instances, SQLite cannot enforce
   * a foreign key across them at all. Whoever splits the migrations for the
   * real D1/DO topology needs to revisit that constraint (drop it, or track
   * ownership without a DB-level FK) — not addressed here.
   *
   * Known follow-up: this also deletes `photo_assets`/`lab_documents` metadata rows, but not the
   * bytes those rows pointed at in `lib/media/storage.ts` (R2/local file) — no account-delete flow
   * exists yet to wire that up (that's Phase 9 scope), so a full delete-account implementation
   * will need to list a user's photo/lab documents and delete their underlying objects first.
   */
  async purgeAuthenticatedUser(userSubject: string): Promise<void> {
    this.sql.transactionSync(() => {
      this.sql.exec("DELETE FROM ai_action_outcomes WHERE user_subject=?", userSubject);
      this.sql.exec("DELETE FROM ai_action_decisions WHERE user_subject=?", userSubject);
      this.sql.exec("DELETE FROM ai_action_proposals WHERE user_subject=?", userSubject);
      this.sql.exec("DELETE FROM nutrition_events WHERE user_subject=?", userSubject);
      this.sql.exec("DELETE FROM user_current_meal_plan WHERE user_subject=?", userSubject);
      this.sql.exec("DELETE FROM meal_plan_versions WHERE user_subject=?", userSubject);
      this.sql.exec("DELETE FROM user_current_goal WHERE user_subject=?", userSubject);
      this.sql.exec("DELETE FROM goal_versions WHERE user_subject=?", userSubject);
      this.sql.exec("DELETE FROM user_safety_exclusions WHERE user_subject=?", userSubject);
      this.sql.exec("DELETE FROM assessment_snapshots WHERE user_subject=?", userSubject);
      this.sql.exec("DELETE FROM safety_acknowledgements WHERE user_subject=?", userSubject);
      this.sql.exec("DELETE FROM user_ui_preferences WHERE user_subject=?", userSubject);
      this.sql.exec("DELETE FROM weekly_insight_snapshots WHERE user_subject=?", userSubject);
      this.sql.exec("DELETE FROM ai_memory_facts WHERE user_subject=?", userSubject);
      this.sql.exec("DELETE FROM photo_assets WHERE user_subject=?", userSubject);
      this.sql.exec("DELETE FROM lab_result_entries WHERE user_subject=?", userSubject);
      this.sql.exec("DELETE FROM lab_documents WHERE user_subject=?", userSubject);
      this.sql.exec("DELETE FROM supplement_records WHERE user_subject=?", userSubject);
      this.sql.exec("DELETE FROM shopping_list_items WHERE user_subject=?", userSubject);
      this.sql.exec("DELETE FROM week_prep_status WHERE user_subject=?", userSubject);
      this.sql.exec("DELETE FROM week_prep_preferences WHERE user_subject=?", userSubject);
      this.sql.exec("DELETE FROM pantry_items WHERE user_subject=?", userSubject);
      this.sql.exec("DELETE FROM user_current_weekly_plan WHERE user_subject=?", userSubject);
      this.sql.exec("DELETE FROM weekly_plan_versions WHERE user_subject=?", userSubject);
      this.sql.exec("DELETE FROM recipes WHERE user_subject=?", userSubject);
      this.sql.exec("DELETE FROM progress_report_exports WHERE user_subject=?", userSubject);
      this.sql.exec("DELETE FROM progress_milestones WHERE user_subject=?", userSubject);
      this.sql.exec("DELETE FROM body_photo_sets WHERE user_subject=?", userSubject);
      this.sql.exec("DELETE FROM body_measurements WHERE user_subject=?", userSubject);
      this.sql.exec("DELETE FROM profiles WHERE user_subject=?", userSubject);
      this.sql.exec("DELETE FROM users WHERE subject=?", userSubject);
    });
  }
}

export class DurableObjectV1TransactionRunner implements V1TransactionRunner {
  constructor(private readonly tx: DurableObjectV1Transaction) {}
  async transaction<T>(work: (tx: V1Transaction) => Promise<T>): Promise<T> {
    return work(this.tx);
  }
}
