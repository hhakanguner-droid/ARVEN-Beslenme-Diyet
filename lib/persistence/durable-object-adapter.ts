import type { AllergenSafetyExclusion, DietarySafetyExclusion } from "@/lib/health-safety/policy";
import type { FoodPortionOption, NutritionSourceProvider, PortionMeasure, PortionSize } from "@/lib/nutrition/types";
import type {
  AuthenticatedUserContext,
  ScientificReferenceSnapshot,
  StoredAssessmentSnapshot,
  StoredDecision,
  StoredGoalVersion,
  StoredNutritionEvent,
  StoredOutcome,
  StoredProfile,
  StoredProposal,
  StoredSafetyAcknowledgement,
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
    const portionRows = await this.catalog("SELECT * FROM portion_versions WHERE food_version_id=?", [foodVersionId]);
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
   */
  async purgeAuthenticatedUser(userSubject: string): Promise<void> {
    this.sql.transactionSync(() => {
      this.sql.exec("DELETE FROM ai_action_outcomes WHERE user_subject=?", userSubject);
      this.sql.exec("DELETE FROM ai_action_decisions WHERE user_subject=?", userSubject);
      this.sql.exec("DELETE FROM ai_action_proposals WHERE user_subject=?", userSubject);
      this.sql.exec("DELETE FROM nutrition_events WHERE user_subject=?", userSubject);
      this.sql.exec("DELETE FROM user_current_goal WHERE user_subject=?", userSubject);
      this.sql.exec("DELETE FROM goal_versions WHERE user_subject=?", userSubject);
      this.sql.exec("DELETE FROM user_safety_exclusions WHERE user_subject=?", userSubject);
      this.sql.exec("DELETE FROM assessment_snapshots WHERE user_subject=?", userSubject);
      this.sql.exec("DELETE FROM safety_acknowledgements WHERE user_subject=?", userSubject);
      this.sql.exec("DELETE FROM user_ui_preferences WHERE user_subject=?", userSubject);
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
