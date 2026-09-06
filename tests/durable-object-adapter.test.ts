import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { DurableObjectV1Transaction, type D1LikeQuery, type SyncSqlStorage } from "../lib/persistence/durable-object-adapter";
import type { StoredCustomFoodVersion, StoredGoalVersion, StoredLabDocument, StoredLabResultEntry, StoredMemoryFact, StoredNutritionEvent, StoredOutcome, StoredPhotoAsset, StoredProposal, StoredSupplementRecord, StoredVerifiedFoodImport, StoredWeeklyInsightSnapshot } from "../lib/persistence/v1-boundary";

const MIGRATIONS = ["0001_initial.sql", "0002_phase2_identity.sql", "0003_phase3_planning.sql", "0004_phase4_ai.sql", "0005_phase5_vision.sql", "0006_phase6_health.sql", "0007_phase6_health_hardening.sql", "0008_phase7_planning.sql"].map(
  (name) => fileURLToPath(new URL(`../db/migrations/${name}`, import.meta.url)),
);

/** Wraps a real, local `node:sqlite` connection to satisfy `SyncSqlStorage` — gives the adapter's SQL
 * genuine STRICT/CHECK/FOREIGN KEY/json_valid() enforcement in tests, not a hand-rolled fake that
 * couldn't catch a dialect or constraint bug. */
function wrapDatabase(db: DatabaseSync): SyncSqlStorage {
  return {
    exec(query: string, ...bindings: unknown[]) {
      // Cast bridges to node:sqlite's own bound-parameter type, which this adapter stays decoupled from.
      const rows = db.prepare(query).all(...(bindings as any[])) as Record<string, unknown>[];
      return { toArray: () => rows, one: () => rows[0] };
    },
    transactionSync<T>(callback: () => T): T {
      db.exec("BEGIN");
      try {
        const result = callback();
        db.exec("COMMIT");
        return result;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
  };
}

function freshDatabase(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  for (const path of MIGRATIONS) db.exec(readFileSync(path, "utf-8"));
  return db;
}

function insertUser(db: DatabaseSync, subject: string): void {
  const now = "2026-09-04T00:00:00.000Z";
  db.prepare("INSERT INTO users (subject, timezone, nutrition_day_start_minutes, locale, created_at, updated_at) VALUES (?,?,0,?,?,?)")
    .run(subject, "Europe/Istanbul", "tr-TR", now, now);
}

const emptyCatalog: D1LikeQuery = async () => [];

test("getOrCreateUser creates once and returns the same row on a second call", async () => {
  const db = freshDatabase();
  const tx = new DurableObjectV1Transaction(wrapDatabase(db), emptyCatalog);
  const first = await tx.getOrCreateUser("u1", { timezone: "Europe/Istanbul", locale: "tr-TR" });
  assert.equal(first.timezone, "Europe/Istanbul");
  db.prepare("UPDATE users SET timezone=? WHERE subject=?").run("America/New_York", "u1");
  const second = await tx.getOrCreateUser("u1", { timezone: "Europe/Istanbul", locale: "tr-TR" });
  assert.equal(second.timezone, "America/New_York");
  assert.equal(db.prepare("SELECT count(*) as n FROM users").get()?.n, 1);
});

test("upsertProfile overwrites the same row instead of duplicating", async () => {
  const db = freshDatabase();
  insertUser(db, "u1");
  const tx = new DurableObjectV1Transaction(wrapDatabase(db), emptyCatalog);
  await tx.upsertProfile({ userSubject: "u1", displayName: "Ayşe", birthDate: "1990-05-01", sexAtBirth: "female", heightCm: 165, activityLevel: "light", updatedAt: "2026-09-04T00:00:00.000Z" });
  await tx.upsertProfile({ userSubject: "u1", displayName: "Ayşe Yılmaz", birthDate: "1990-05-01", sexAtBirth: "female", heightCm: 165, activityLevel: "active", updatedAt: "2026-09-04T00:01:00.000Z" });
  const stored = await tx.getProfile("u1");
  assert.equal(stored?.displayName, "Ayşe Yılmaz");
  assert.equal(stored?.activityLevel, "active");
  assert.equal(db.prepare("SELECT count(*) as n FROM profiles").get()?.n, 1);
});

test("insertProposalIfAbsent returns the original row on a conflicting idempotency key", async () => {
  const db = freshDatabase();
  insertUser(db, "u1");
  const tx = new DurableObjectV1Transaction(wrapDatabase(db), emptyCatalog);
  const proposal: StoredProposal = { id: "p1", userSubject: "u1", actionType: "water-log", schemaVersion: "WaterLogActionV1", payloadJson: "{}", payloadSha256: "a".repeat(64), idempotencyKey: "k1", createdAt: "2026-09-04T00:00:00.000Z" };
  const first = await tx.insertProposalIfAbsent(proposal);
  assert.equal(first.id, "p1");
  const conflicting: StoredProposal = { ...proposal, id: "p2", payloadJson: "{\"different\":true}" };
  const winner = await tx.insertProposalIfAbsent(conflicting);
  assert.equal(winner.id, "p1", "the already-stored proposal must win, not the new candidate");
  assert.equal(db.prepare("SELECT count(*) as n FROM ai_action_proposals").get()?.n, 1);
});

test("ai_action_outcomes CHECK constraint rejects an applied outcome carrying a failure code", async () => {
  const db = freshDatabase();
  insertUser(db, "u1");
  // Satisfy the FK graph first so the CHECK constraint — not a missing foreign key — is what actually fires.
  db.prepare("INSERT INTO ai_action_proposals (id, user_subject, action_type, schema_version, payload_json, payload_sha256, idempotency_key, created_at) VALUES ('a1','u1','water-log','WaterLogActionV1','{}',?,'k1','2026-09-04T00:00:00.000Z')").run("a".repeat(64));
  db.prepare("INSERT INTO ai_action_decisions (action_id, user_subject, decision, decided_at) VALUES ('a1','u1','confirmed','2026-09-04T00:00:00.000Z')").run();
  db.prepare("INSERT INTO nutrition_events (id, user_subject, event_type, occurred_at, local_date, payload_json, created_at) VALUES ('e1','u1','water-log','2026-09-04T00:00:00.000Z','2026-09-04','{}','2026-09-04T00:00:00.000Z')").run();
  const tx = new DurableObjectV1Transaction(wrapDatabase(db), emptyCatalog);
  const badOutcome: StoredOutcome = { actionId: "a1", userSubject: "u1", actionType: "water-log", confirmationMarker: "confirmed", outcome: "applied", resultEventId: "e1", failureCode: "not-allowed-here", recordedAt: "2026-09-04T00:00:00.000Z" };
  await assert.rejects(() => tx.insertOutcome(badOutcome));
});

test("insertNutritionEventWithOutcome writes both rows atomically", async () => {
  const db = freshDatabase();
  insertUser(db, "u1");
  const tx = new DurableObjectV1Transaction(wrapDatabase(db), emptyCatalog);
  // The outcome's FK requires an existing confirmed proposal+decision, exactly like the real mutation flow.
  await tx.insertProposalIfAbsent({ id: "a1", userSubject: "u1", actionType: "water-log", schemaVersion: "WaterLogActionV1", payloadJson: "{}", payloadSha256: "a".repeat(64), idempotencyKey: "k1", createdAt: "2026-09-04T00:00:00.000Z" });
  await tx.insertDecision({ actionId: "a1", userSubject: "u1", decision: "confirmed", decidedAt: "2026-09-04T00:00:00.000Z" });
  const event: StoredNutritionEvent = { id: "e1", userSubject: "u1", eventType: "water-log", occurredAt: "2026-09-04T00:00:00.000Z", localDate: "2026-09-04", payloadJson: "{}", createdAt: "2026-09-04T00:00:00.000Z" };
  const outcome: StoredOutcome = { actionId: "a1", userSubject: "u1", actionType: "water-log", confirmationMarker: "confirmed", outcome: "applied", resultEventId: "e1", failureCode: null, recordedAt: "2026-09-04T00:00:00.000Z" };
  await tx.insertNutritionEventWithOutcome(event, outcome);
  assert.ok(await tx.getNutritionEvent("u1", "e1"));
  assert.equal((await tx.getOutcome("u1", "a1"))?.resultEventId, "e1");
});

test("insertGoalVersionAndSetCurrent writes and selects the goal atomically", async () => {
  const db = freshDatabase();
  insertUser(db, "u1");
  const tx = new DurableObjectV1Transaction(wrapDatabase(db), emptyCatalog);
  const goal: StoredGoalVersion = { id: "g1", userSubject: "u1", source: "arven-calculated", calculatorId: "mifflin-st-jeor@v1", calculatorInputsJson: "{}", referenceSnapshotsJson: '[{"id":"ref-1","title":"Ref","citation":"Citation"}]', energyKcal: 2000, proteinG: 120, carbsG: 200, fatG: 70, fiberG: 28, waterMl: 2500, mealAllocationsJson: "[]", createdAt: "2026-09-04T00:00:00.000Z" };
  await tx.insertGoalVersionAndSetCurrent(goal, "2026-09-04T00:00:00.000Z");
  const current = db.prepare("SELECT goal_version_id FROM user_current_goal WHERE user_subject=?").get("u1") as { goal_version_id: string } | undefined;
  assert.equal(current?.goal_version_id, "g1");
});

test("getCurrentGoalVersion returns null before any goal exists, then the selected version", async () => {
  const db = freshDatabase();
  insertUser(db, "u1");
  const tx = new DurableObjectV1Transaction(wrapDatabase(db), emptyCatalog);
  assert.equal(await tx.getCurrentGoalVersion("u1"), null);
  const goal: StoredGoalVersion = { id: "g1", userSubject: "u1", source: "arven-calculated", calculatorId: "mifflin-st-jeor@v1", calculatorInputsJson: "{}", referenceSnapshotsJson: '[{"id":"ref-1","title":"Ref","citation":"Citation"}]', energyKcal: 2000, proteinG: 120, carbsG: 200, fatG: 70, fiberG: 28, waterMl: 2500, mealAllocationsJson: "[]", createdAt: "2026-09-04T00:00:00.000Z" };
  await tx.insertGoalVersionAndSetCurrent(goal, "2026-09-04T00:00:00.000Z");
  const current = await tx.getCurrentGoalVersion("u1");
  assert.equal(current?.id, "g1");
  assert.equal(current?.energyKcal, 2000);
});

test("listNutritionEventsForLocalDate scopes to one authenticated subject and one local date", async () => {
  const db = freshDatabase();
  insertUser(db, "u1");
  insertUser(db, "u2");
  const tx = new DurableObjectV1Transaction(wrapDatabase(db), emptyCatalog);
  await tx.insertNutritionEvent({ id: "e1", userSubject: "u1", eventType: "water-log", occurredAt: "2026-09-04T08:00:00.000Z", localDate: "2026-09-04", payloadJson: "{}", createdAt: "2026-09-04T08:00:00.000Z" });
  await tx.insertNutritionEvent({ id: "e2", userSubject: "u1", eventType: "water-log", occurredAt: "2026-09-03T08:00:00.000Z", localDate: "2026-09-03", payloadJson: "{}", createdAt: "2026-09-03T08:00:00.000Z" });
  await tx.insertNutritionEvent({ id: "e3", userSubject: "u2", eventType: "water-log", occurredAt: "2026-09-04T08:00:00.000Z", localDate: "2026-09-04", payloadJson: "{}", createdAt: "2026-09-04T08:00:00.000Z" });
  const events = await tx.listNutritionEventsForLocalDate("u1", "2026-09-04");
  assert.deepEqual(events.map((e) => e.id), ["e1"]);
});

test("searchFoodVersions and findFoodVersionByBarcode never resolve another user's private custom food", async () => {
  const db = freshDatabase();
  insertUser(db, "u1");
  insertUser(db, "u2");
  const now = "2026-09-04T00:00:00.000Z";
  db.prepare("INSERT INTO food_versions (id, food_key, version, owner_subject, name, normalized_name, barcode, energy_kcal_100g, protein_g_100g, carbs_g_100g, fat_g_100g, allergen_data_status, dietary_safety_data_status, source_provider, verified_at, created_at) VALUES ('f1','elma',1,NULL,'Elma','elma','1111',52,0.3,14,0.2,'unknown','unknown','manual-verified',?,?)").run(now, now);
  db.prepare("INSERT INTO food_versions (id, food_key, version, owner_subject, name, normalized_name, barcode, energy_kcal_100g, protein_g_100g, carbs_g_100g, fat_g_100g, allergen_data_status, dietary_safety_data_status, source_provider, verified_at, created_at) VALUES ('f2','ozel',1,'u2','u2 Özel','ozel','2222',10,1,1,1,'unknown','unknown','manual-verified',?,?)").run(now, now);
  const tx = new DurableObjectV1Transaction(wrapDatabase(db), (sql, params) => Promise.resolve(db.prepare(sql).all(...(params as never[])) as Record<string, unknown>[]));
  const bySearch = await tx.searchFoodVersions("u1", "elma", 10);
  assert.deepEqual(bySearch.map((f) => f.id), ["f1"]);
  assert.equal((await tx.searchFoodVersions("u1", "özel", 10)).length, 0);
  assert.ok(await tx.findFoodVersionByBarcode("u1", "1111"));
  assert.equal(await tx.findFoodVersionByBarcode("u1", "2222"), null);
  assert.ok(await tx.findFoodVersionByBarcode("u2", "2222"));
});

test("insertMealPlanVersionAndSetCurrent writes and selects the plan atomically", async () => {
  const db = freshDatabase();
  insertUser(db, "u1");
  const tx = new DurableObjectV1Transaction(wrapDatabase(db), emptyCatalog);
  assert.equal(await tx.getCurrentMealPlan("u1"), null);
  await tx.insertMealPlanVersionAndSetCurrent({ id: "mp1", userSubject: "u1", slotsJson: '[{"mealType":"breakfast","items":[]}]', createdAt: "2026-09-04T00:00:00.000Z" }, "2026-09-04T00:00:00.000Z");
  const current = await tx.getCurrentMealPlan("u1");
  assert.equal(current?.id, "mp1");
  await tx.insertMealPlanVersionAndSetCurrent({ id: "mp2", userSubject: "u1", slotsJson: "[]", createdAt: "2026-09-04T01:00:00.000Z" }, "2026-09-04T01:00:00.000Z");
  assert.equal((await tx.getCurrentMealPlan("u1"))?.id, "mp2");
});

test("purgeAuthenticatedUser removes every row for that subject across all owned tables, leaves others untouched", async () => {
  const db = freshDatabase();
  insertUser(db, "u1");
  insertUser(db, "u2");
  const tx1 = new DurableObjectV1Transaction(wrapDatabase(db), emptyCatalog);
  const tx2 = new DurableObjectV1Transaction(wrapDatabase(db), emptyCatalog);

  await tx1.upsertProfile({ userSubject: "u1", displayName: "A", birthDate: null, sexAtBirth: null, heightCm: null, activityLevel: null, updatedAt: "2026-09-04T00:00:00.000Z" });
  await tx2.upsertProfile({ userSubject: "u2", displayName: "B", birthDate: null, sexAtBirth: null, heightCm: null, activityLevel: null, updatedAt: "2026-09-04T00:00:00.000Z" });

  const proposal: StoredProposal = { id: "p1", userSubject: "u1", actionType: "water-log", schemaVersion: "WaterLogActionV1", payloadJson: "{}", payloadSha256: "a".repeat(64), idempotencyKey: "k1", createdAt: "2026-09-04T00:00:00.000Z" };
  await tx1.insertProposalIfAbsent(proposal);
  await tx1.insertDecision({ actionId: "p1", userSubject: "u1", decision: "confirmed", decidedAt: "2026-09-04T00:00:00.000Z" });
  const event: StoredNutritionEvent = { id: "e1", userSubject: "u1", eventType: "water-log", occurredAt: "2026-09-04T00:00:00.000Z", localDate: "2026-09-04", payloadJson: "{}", createdAt: "2026-09-04T00:00:00.000Z" };
  await tx1.insertNutritionEventWithOutcome(event, { actionId: "p1", userSubject: "u1", actionType: "water-log", confirmationMarker: "confirmed", outcome: "applied", resultEventId: "e1", failureCode: null, recordedAt: "2026-09-04T00:00:00.000Z" });

  const goal: StoredGoalVersion = { id: "g1", userSubject: "u1", source: "arven-calculated", calculatorId: "mifflin-st-jeor@v1", calculatorInputsJson: "{}", referenceSnapshotsJson: '[{"id":"ref-1","title":"Ref","citation":"Citation"}]', energyKcal: 2000, proteinG: 120, carbsG: 200, fatG: 70, fiberG: 28, waterMl: 2500, mealAllocationsJson: "[]", createdAt: "2026-09-04T00:00:00.000Z" };
  await tx1.insertGoalVersionAndSetCurrent(goal, "2026-09-04T00:00:00.000Z");
  await tx1.insertAssessmentSnapshot({ id: "as1", userSubject: "u1", completedAt: "2026-09-04T00:00:00.000Z", payloadJson: "{\"answers\":{\"x\":1}}", createdAt: "2026-09-04T00:00:00.000Z" });
  await tx1.insertSafetyAcknowledgement({ id: "ack1", userSubject: "u1", acknowledgementType: "non-diagnostic-health-boundary", policyVersion: "v1", acknowledgedAt: "2026-09-04T00:00:00.000Z", createdAt: "2026-09-04T00:00:00.000Z" });
  // food_versions lives in the shared D1 catalog in production, not this user's Durable Object
  // storage, so the adapter's purgeAuthenticatedUser issues no statement against it at all. This
  // single in-memory test database still has both tables on one connection with foreign_keys=ON,
  // so SQLite's own `food_versions.owner_subject ... ON DELETE CASCADE` fires when the final
  // `DELETE FROM users` runs below — proving the schema, not the adapter, is what reaches this row.
  // In real production D1 and a per-user DO are separate database instances; a foreign key can't be
  // enforced across them at all, so that CASCADE clause needs reconsidering once the schema is
  // actually split — tracked as follow-up D1-side work, not fixed here.
  db.prepare("INSERT INTO food_versions (id, food_key, version, owner_subject, name, normalized_name, energy_kcal_100g, protein_g_100g, carbs_g_100g, fat_g_100g, allergen_data_status, dietary_safety_data_status, source_provider, verified_at, created_at) VALUES ('f1','custom-food',1,'u1','Custom','custom',100,1,1,1,'unknown','unknown','manual-verified','2026-09-04T00:00:00.000Z','2026-09-04T00:00:00.000Z')").run();
  await tx1.insertMealPlanVersionAndSetCurrent({ id: "mp1", userSubject: "u1", slotsJson: "[]", createdAt: "2026-09-04T00:00:00.000Z" }, "2026-09-04T00:00:00.000Z");
  await tx1.insertPhotoAsset({ id: "ph1", userSubject: "u1", kind: "meal-photo", mimeType: "image/jpeg", byteSize: 12345, storageKey: "u1/ph1", createdAt: "2026-09-04T00:00:00.000Z" });
  await tx1.insertLabDocument({ id: "ld1", userSubject: "u1", mimeType: "image/jpeg", byteSize: 12345, storageKey: "u1/ld1", createdAt: "2026-09-04T00:00:00.000Z" });
  await tx1.insertLabResultEntry({ id: "lr1", userSubject: "u1", labDocumentId: "ld1", markerName: "Glukoz", valueText: "95", unitText: "mg/dL", referenceRangeText: "70-100", status: "extracted", createdAt: "2026-09-04T00:00:00.000Z" });
  await tx1.insertSupplementRecord({ id: "sr1", userSubject: "u1", foodVersionId: null, name: "D Vitamini", note: null, isActive: true, createdAt: "2026-09-04T00:00:00.000Z" });
  await tx1.insertRecipe({ id: "rc1", userSubject: "u1", name: "Tarif", servings: 2, ingredientsJson: "[]", createdAt: "2026-09-04T00:00:00.000Z" });
  await tx1.insertWeeklyPlanVersionAndSetCurrent({ id: "wp1", userSubject: "u1", weekStartLocalDate: "2026-08-31", daysJson: "[]", createdAt: "2026-09-04T00:00:00.000Z" }, "2026-09-04T00:00:00.000Z");
  await tx1.insertPantryItem({ id: "pi1", userSubject: "u1", foodVersionId: null, label: "Un", quantityGrams: 1000, quantityNote: null, createdAt: "2026-09-04T00:00:00.000Z", updatedAt: "2026-09-04T00:00:00.000Z" });
  await tx1.replaceShoppingListItems("u1", "2026-08-31", [{ id: "sl1", userSubject: "u1", weekStartLocalDate: "2026-08-31", foodVersionId: null, label: "Un", neededGrams: 500, isChecked: false, createdAt: "2026-09-04T00:00:00.000Z" }]);
  await tx1.upsertWeekPrepPreferences({ userSubject: "u1", enabled: true, prepDayOfWeek: 0, prepLocalTime: "09:00", updatedAt: "2026-09-04T00:00:00.000Z" });
  await tx1.upsertWeekPrepStatus({ userSubject: "u1", weekStartLocalDate: "2026-08-31", isCompleted: true, updatedAt: "2026-09-04T00:00:00.000Z" });

  await assert.doesNotReject(() => tx1.purgeAuthenticatedUser("u1"));

  for (const table of ["users", "profiles", "ai_action_proposals", "ai_action_decisions", "ai_action_outcomes", "nutrition_events", "goal_versions", "user_current_goal", "assessment_snapshots", "safety_acknowledgements", "meal_plan_versions", "user_current_meal_plan", "photo_assets", "lab_documents", "lab_result_entries", "supplement_records", "recipes", "weekly_plan_versions", "user_current_weekly_plan", "pantry_items", "shopping_list_items", "week_prep_preferences", "week_prep_status"]) {
    const count = (db.prepare(`SELECT count(*) as n FROM ${table} WHERE ${table === "users" ? "subject" : "user_subject"}='u1'`).get() as { n: number }).n;
    assert.equal(count, 0, `${table} should have no rows left for u1`);
  }
  assert.equal((db.prepare("SELECT count(*) as n FROM users WHERE subject='u2'").get() as { n: number }).n, 1, "u2 must be untouched");
  assert.equal((db.prepare("SELECT count(*) as n FROM profiles WHERE user_subject='u2'").get() as { n: number }).n, 1, "u2's profile must be untouched");
});

test("deleteManualNutritionEvent removes a manually-logged event but is blocked by the DB itself for a confirmed AI-outcome event", async () => {
  const db = freshDatabase();
  insertUser(db, "u1");
  const tx = new DurableObjectV1Transaction(wrapDatabase(db), emptyCatalog);

  // Plain manual event: nothing references it, so deletion just succeeds.
  await tx.insertNutritionEvent({ id: "manual-1", userSubject: "u1", eventType: "water-log", occurredAt: "2026-09-04T08:00:00.000Z", localDate: "2026-09-04", payloadJson: "{}", createdAt: "2026-09-04T08:00:00.000Z" });
  await tx.deleteManualNutritionEvent("u1", "manual-1");
  assert.equal(await tx.getNutritionEvent("u1", "manual-1"), null);

  // Deleting something that was never there (or already gone) is reported clearly rather than silently no-op'd.
  await assert.rejects(() => tx.deleteManualNutritionEvent("u1", "does-not-exist"), /Nutrition event not found/);

  // An AI-confirmed event has a row in ai_action_outcomes pointing at it via
  // result_event_id (ON DELETE RESTRICT) — the real SQLite foreign key must be
  // what blocks this, not application logic re-checking the same thing.
  await tx.insertProposalIfAbsent({ id: "a1", userSubject: "u1", actionType: "water-log", schemaVersion: "WaterLogActionV1", payloadJson: "{}", payloadSha256: "a".repeat(64), idempotencyKey: "k1", createdAt: "2026-09-04T00:00:00.000Z" });
  await tx.insertDecision({ actionId: "a1", userSubject: "u1", decision: "confirmed", decidedAt: "2026-09-04T00:00:00.000Z" });
  const aiEvent: StoredNutritionEvent = { id: "ai-1", userSubject: "u1", eventType: "water-log", occurredAt: "2026-09-04T09:00:00.000Z", localDate: "2026-09-04", payloadJson: "{}", createdAt: "2026-09-04T09:00:00.000Z" };
  const outcome: StoredOutcome = { actionId: "a1", userSubject: "u1", actionType: "water-log", confirmationMarker: "confirmed", outcome: "applied", resultEventId: "ai-1", failureCode: null, recordedAt: "2026-09-04T09:00:00.000Z" };
  await tx.insertNutritionEventWithOutcome(aiEvent, outcome);

  await assert.rejects(() => tx.deleteManualNutritionEvent("u1", "ai-1"), /Cannot delete a nutrition event created by a confirmed AI action/);
  assert.ok(await tx.getNutritionEvent("u1", "ai-1"), "the AI-confirmed event must still be there — the delete must not have partially applied");
});

test("insertCustomFoodVersion writes a food and its portions that searchFoodVersions/getFoodVersion/findFoodVersionByBarcode can read back, scoped to its owner", async () => {
  const db = freshDatabase();
  insertUser(db, "u1");
  insertUser(db, "u2");
  const catalog = (sql: string, params: unknown[]) => Promise.resolve(db.prepare(sql).all(...(params as never[])) as Record<string, unknown>[]);
  const tx1 = new DurableObjectV1Transaction(wrapDatabase(db), catalog);
  const tx2 = new DurableObjectV1Transaction(wrapDatabase(db), catalog);

  const food: StoredCustomFoodVersion = {
    id: "custom-1",
    foodKey: "custom-1",
    ownerSubject: "u1",
    name: "Ev Yapımı Mercimek Köftesi",
    isLiquid: false,
    energyKcal: 180,
    proteinG: 6,
    carbsG: 30,
    fatG: 4,
    fiberG: 5,
    allergenDataStatus: "unknown",
    allergenIds: [],
    dietarySafetyDataStatus: "unknown",
    dietaryConflictRuleIds: [],
    verifiedAt: "2026-09-04T00:00:00.000Z",
    createdAt: "2026-09-04T00:00:00.000Z",
    portions: [{ id: "portion-1", measure: "piece", label: "1 adet", gramsPerUnit: 40 }],
  };
  await tx1.insertCustomFoodVersion(food);

  const resolved = await tx1.getFoodVersion("u1", "custom-1");
  assert.equal(resolved?.name, "Ev Yapımı Mercimek Köftesi");
  assert.equal(resolved?.nutrition.energyKcal, 180);
  assert.equal(resolved?.nutrition.fiberG, 5);
  assert.deepEqual((resolved?.portionOptions ?? []).map((p) => ({ measure: p.measure, label: p.label, gramsPerUnit: p.gramsPerUnit })), [{ measure: "piece", label: "1 adet", gramsPerUnit: 40 }]);

  const bySearch = await tx1.searchFoodVersions("u1", "mercimek köftesi", 10);
  assert.deepEqual(bySearch.map((f) => f.id), ["custom-1"]);

  // Another user must never resolve, search, or barcode-match someone else's private custom food.
  assert.equal(await tx2.getFoodVersion("u2", "custom-1"), null);
  assert.equal((await tx2.searchFoodVersions("u2", "mercimek köftesi", 10)).length, 0);
});

test("searchFoodVersions collapses multiple catalog sources sharing one food_key down to the most recently verified row", async () => {
  const db = freshDatabase();
  insertUser(db, "u1");
  const older = "2026-01-01T00:00:00.000Z";
  const newer = "2026-06-01T00:00:00.000Z";
  db.prepare("INSERT INTO food_versions (id, food_key, version, owner_subject, name, normalized_name, energy_kcal_100g, protein_g_100g, carbs_g_100g, fat_g_100g, allergen_data_status, dietary_safety_data_status, source_provider, source_external_id, verified_at, created_at) VALUES ('f-old','elma',1,NULL,'Elma (Eski Kaynak)','elma',50,0.2,13,0.1,'unknown','unknown','open-food-facts','off-1',?,?)").run(older, older);
  db.prepare("INSERT INTO food_versions (id, food_key, version, owner_subject, name, normalized_name, energy_kcal_100g, protein_g_100g, carbs_g_100g, fat_g_100g, allergen_data_status, dietary_safety_data_status, source_provider, source_external_id, verified_at, created_at) VALUES ('f-new','elma',2,NULL,'Elma','elma',52,0.3,14,0.2,'unknown','unknown','manual-verified',NULL,?,?)").run(newer, newer);
  const tx = new DurableObjectV1Transaction(wrapDatabase(db), (sql, params) => Promise.resolve(db.prepare(sql).all(...(params as never[])) as Record<string, unknown>[]));

  const results = await tx.searchFoodVersions("u1", "elma", 10);
  assert.deepEqual(results.map((f) => f.id), ["f-new"], "only the most recently verified source for this food_key should be returned");
});

test("importVerifiedFoodVersion inserts a new global catalog row that getFoodVersionByFoodKey/findFoodVersionByBarcode/searchFoodVersions can read back", async () => {
  const db = freshDatabase();
  insertUser(db, "u1");
  const catalog = (sql: string, params: unknown[]) => Promise.resolve(db.prepare(sql).all(...(params as never[])) as Record<string, unknown>[]);
  const tx = new DurableObjectV1Transaction(wrapDatabase(db), catalog);

  const imported: StoredVerifiedFoodImport = {
    id: "off-1",
    foodKey: "off-3017620422003",
    name: "Nutella",
    brand: "Ferrero",
    barcode: "3017620422003",
    isLiquid: false,
    energyKcal: 539,
    proteinG: 6.3,
    carbsG: 57.5,
    fatG: 30.9,
    fiberG: null,
    sourceProvider: "open-food-facts",
    sourceExternalId: "3017620422003",
    sourceEvidenceUrl: "https://world.openfoodfacts.org/api/v2/product/3017620422003.json",
    verifiedAt: "2026-09-04T00:00:00.000Z",
    createdAt: "2026-09-04T00:00:00.000Z",
  };
  await tx.importVerifiedFoodVersion(imported);

  const byFoodKey = await tx.getFoodVersionByFoodKey("u1", "off-3017620422003");
  assert.equal(byFoodKey?.name, "Nutella");
  assert.equal(byFoodKey?.nutrition.energyKcal, 539);
  assert.equal(byFoodKey?.nutrition.fiberG, undefined, "OFF's real payloads frequently omit fiber — must round-trip as absent, not 0");
  assert.equal(byFoodKey?.source.provider, "open-food-facts");
  assert.equal(byFoodKey?.source.externalId, "3017620422003");
  assert.deepEqual(byFoodKey?.portionOptions, [], "OFF imports carry no household portions — the app logs these by exact grams instead");

  const byBarcode = await tx.findFoodVersionByBarcode("u1", "3017620422003");
  assert.equal(byBarcode?.id, "off-1");

  const bySearch = await tx.searchFoodVersions("u1", "nutella", 10);
  assert.deepEqual(bySearch.map((f) => f.id), ["off-1"]);

  assert.equal(await tx.getFoodVersionByFoodKey("u1", "off-does-not-exist"), null);
});

test("insertMemoryFact/listMemoryFacts/deleteMemoryFact scope strictly to the owning subject", async () => {
  const db = freshDatabase();
  insertUser(db, "u1");
  insertUser(db, "u2");
  const tx1 = new DurableObjectV1Transaction(wrapDatabase(db), emptyCatalog);
  const tx2 = new DurableObjectV1Transaction(wrapDatabase(db), emptyCatalog);

  const fact1: StoredMemoryFact = { id: "f1", userSubject: "u1", factText: "Kahvaltıda genelde yumurta tercih ediyor.", provenance: "ai-inferred", confidence: "medium", createdAt: "2026-09-04T00:00:00.000Z" };
  const fact2: StoredMemoryFact = { id: "f2", userSubject: "u1", factText: "Süt alerjisi olduğunu belirtti.", provenance: "user-stated", confidence: "high", createdAt: "2026-09-04T00:01:00.000Z" };
  await tx1.insertMemoryFact(fact1);
  await tx1.insertMemoryFact(fact2);

  const listed = await tx1.listMemoryFacts("u1");
  assert.deepEqual(listed.map((f) => f.id), ["f2", "f1"], "most recent first");
  assert.equal(await tx2.listMemoryFacts("u2").then((r) => r.length), 0);

  // Deleting another user's fact id (or one that never existed) must be a silent no-op, never an error.
  await tx2.deleteMemoryFact("u2", "f1");
  assert.equal((await tx1.listMemoryFacts("u1")).length, 2, "u2 must not be able to delete u1's fact");
  await tx1.deleteMemoryFact("u1", "f1");
  assert.deepEqual((await tx1.listMemoryFacts("u1")).map((f) => f.id), ["f2"]);
});

test("insertWeeklyInsightSnapshot/getLatestWeeklyInsightSnapshot returns the most recently generated snapshot for an exact week", async () => {
  const db = freshDatabase();
  insertUser(db, "u1");
  const tx = new DurableObjectV1Transaction(wrapDatabase(db), emptyCatalog);

  assert.equal(await tx.getLatestWeeklyInsightSnapshot("u1", "2026-08-31"), null);

  const withoutNarrative: StoredWeeklyInsightSnapshot = { id: "wi-1", userSubject: "u1", weekStartLocalDate: "2026-08-31", metricsJson: '{"averageEnergyKcal":1950}', narrativeJson: null, createdAt: "2026-09-04T00:00:00.000Z" };
  await tx.insertWeeklyInsightSnapshot(withoutNarrative);
  assert.equal((await tx.getLatestWeeklyInsightSnapshot("u1", "2026-08-31"))?.id, "wi-1");

  const withNarrative: StoredWeeklyInsightSnapshot = { id: "wi-2", userSubject: "u1", weekStartLocalDate: "2026-08-31", metricsJson: '{"averageEnergyKcal":1950}', narrativeJson: '{"schemaVersion":"WeeklyInsightV1","summary":"Bu hafta düzenli bir ritim oluştu."}', createdAt: "2026-09-04T00:01:00.000Z" };
  await tx.insertWeeklyInsightSnapshot(withNarrative);
  const latest = await tx.getLatestWeeklyInsightSnapshot("u1", "2026-08-31");
  assert.equal(latest?.id, "wi-2", "the most recently generated snapshot for this week must win");
  assert.ok(latest?.narrativeJson?.includes("WeeklyInsightV1"));

  assert.equal(await tx.getLatestWeeklyInsightSnapshot("u1", "2026-09-07"), null, "a different week must not match");
});

test("insertPhotoAsset/getPhotoAsset/listPhotoAssets/deletePhotoAsset scope strictly to the owning subject", async () => {
  const db = freshDatabase();
  insertUser(db, "u1");
  insertUser(db, "u2");
  const tx1 = new DurableObjectV1Transaction(wrapDatabase(db), emptyCatalog);
  const tx2 = new DurableObjectV1Transaction(wrapDatabase(db), emptyCatalog);

  const photo1: StoredPhotoAsset = { id: "p1", userSubject: "u1", kind: "meal-photo", mimeType: "image/jpeg", byteSize: 12345, storageKey: "u1/p1", createdAt: "2026-09-04T00:00:00.000Z" };
  const photo2: StoredPhotoAsset = { id: "p2", userSubject: "u1", kind: "menu-photo", mimeType: "image/png", byteSize: 54321, storageKey: "u1/p2", createdAt: "2026-09-04T00:01:00.000Z" };
  await tx1.insertPhotoAsset(photo1);
  await tx1.insertPhotoAsset(photo2);

  const listed = await tx1.listPhotoAssets("u1");
  assert.deepEqual(listed.map((p) => p.id), ["p2", "p1"], "most recent first");
  assert.equal((await tx2.listPhotoAssets("u2")).length, 0);
  assert.equal(await tx2.getPhotoAsset("u2", "p1"), null, "u2 must not be able to read u1's photo");
  assert.equal((await tx1.getPhotoAsset("u1", "p1"))?.storageKey, "u1/p1");

  // Deleting another user's photo id (or one that never existed) must be a silent no-op, never an error.
  await tx2.deletePhotoAsset("u2", "p1");
  assert.equal((await tx1.listPhotoAssets("u1")).length, 2, "u2 must not be able to delete u1's photo");
  await tx1.deletePhotoAsset("u1", "p1");
  assert.deepEqual((await tx1.listPhotoAssets("u1")).map((p) => p.id), ["p2"]);
});

test("insertLabDocument/getLabDocument/listLabDocuments/deleteLabDocument scope strictly to the owning subject", async () => {
  const db = freshDatabase();
  insertUser(db, "u1");
  insertUser(db, "u2");
  const tx1 = new DurableObjectV1Transaction(wrapDatabase(db), emptyCatalog);
  const tx2 = new DurableObjectV1Transaction(wrapDatabase(db), emptyCatalog);

  const doc1: StoredLabDocument = { id: "d1", userSubject: "u1", mimeType: "image/jpeg", byteSize: 12345, storageKey: "u1/d1", createdAt: "2026-09-04T00:00:00.000Z" };
  const doc2: StoredLabDocument = { id: "d2", userSubject: "u1", mimeType: "image/png", byteSize: 54321, storageKey: "u1/d2", createdAt: "2026-09-04T00:01:00.000Z" };
  await tx1.insertLabDocument(doc1);
  await tx1.insertLabDocument(doc2);

  const listed = await tx1.listLabDocuments("u1");
  assert.deepEqual(listed.map((d) => d.id), ["d2", "d1"], "most recent first");
  assert.equal((await tx2.listLabDocuments("u2")).length, 0);
  assert.equal(await tx2.getLabDocument("u2", "d1"), null, "u2 must not be able to read u1's lab document");
  assert.equal((await tx1.getLabDocument("u1", "d1"))?.storageKey, "u1/d1");

  await tx2.deleteLabDocument("u2", "d1");
  assert.equal((await tx1.listLabDocuments("u1")).length, 2, "u2 must not be able to delete u1's lab document");
  await tx1.deleteLabDocument("u1", "d1");
  assert.deepEqual((await tx1.listLabDocuments("u1")).map((d) => d.id), ["d2"]);
});

test("insertLabResultEntry/listLabResultEntries/confirmLabResultEntry/deleteLabResultEntry scope strictly to the owning subject, and confirming edits the transcribed text", async () => {
  const db = freshDatabase();
  insertUser(db, "u1");
  insertUser(db, "u2");
  const tx1 = new DurableObjectV1Transaction(wrapDatabase(db), emptyCatalog);
  const tx2 = new DurableObjectV1Transaction(wrapDatabase(db), emptyCatalog);
  await tx1.insertLabDocument({ id: "d1", userSubject: "u1", mimeType: "image/jpeg", byteSize: 12345, storageKey: "u1/d1", createdAt: "2026-09-04T00:00:00.000Z" });

  const entry: StoredLabResultEntry = { id: "e1", userSubject: "u1", labDocumentId: "d1", markerName: "Glukoz", valueText: "95", unitText: "mg/dL", referenceRangeText: "70-100", status: "extracted", createdAt: "2026-09-04T00:00:00.000Z" };
  await tx1.insertLabResultEntry(entry);

  assert.equal((await tx2.listLabResultEntries("u2")).length, 0);
  await assert.rejects(() => tx2.confirmLabResultEntry("u2", "e1", { markerName: "Glukoz", valueText: "95", unitText: "mg/dL", referenceRangeText: "70-100" }), "u2 must not be able to confirm u1's entry");

  const confirmed = await tx1.confirmLabResultEntry("u1", "e1", { markerName: "Açlık glukoz", valueText: "96", unitText: "mg/dL", referenceRangeText: "70-100" });
  assert.equal(confirmed.status, "confirmed");
  assert.equal(confirmed.markerName, "Açlık glukoz");
  assert.equal(confirmed.valueText, "96");

  await tx2.deleteLabResultEntry("u2", "e1");
  assert.equal((await tx1.listLabResultEntries("u1")).length, 1, "u2 must not be able to delete u1's entry");
  await tx1.deleteLabResultEntry("u1", "e1");
  assert.equal((await tx1.listLabResultEntries("u1")).length, 0);

  // Deleting the source document must not cascade-delete a confirmed reading — only null out the link.
  await tx1.insertLabResultEntry({ ...entry, id: "e2", status: "confirmed" });
  await tx1.deleteLabDocument("u1", "d1");
  const survivors = await tx1.listLabResultEntries("u1");
  assert.equal(survivors.length, 1);
  assert.equal(survivors[0]?.labDocumentId, null);
});

test("insertSupplementRecord/listSupplementRecords/setSupplementRecordActive/deleteSupplementRecord scope strictly to the owning subject", async () => {
  const db = freshDatabase();
  insertUser(db, "u1");
  insertUser(db, "u2");
  const tx1 = new DurableObjectV1Transaction(wrapDatabase(db), emptyCatalog);
  const tx2 = new DurableObjectV1Transaction(wrapDatabase(db), emptyCatalog);

  const record: StoredSupplementRecord = { id: "s1", userSubject: "u1", foodVersionId: null, name: "D Vitamini", note: "Kahvaltıda", isActive: true, createdAt: "2026-09-04T00:00:00.000Z" };
  await tx1.insertSupplementRecord(record);

  assert.equal((await tx2.listSupplementRecords("u2")).length, 0);
  await assert.rejects(() => tx2.setSupplementRecordActive("u2", "s1", false), "u2 must not be able to deactivate u1's supplement");

  await tx1.setSupplementRecordActive("u1", "s1", false);
  assert.equal((await tx1.listSupplementRecords("u1"))[0]?.isActive, false);

  await tx2.deleteSupplementRecord("u2", "s1");
  assert.equal((await tx1.listSupplementRecords("u1")).length, 1, "u2 must not be able to delete u1's supplement");
  await tx1.deleteSupplementRecord("u1", "s1");
  assert.equal((await tx1.listSupplementRecords("u1")).length, 0);
});
