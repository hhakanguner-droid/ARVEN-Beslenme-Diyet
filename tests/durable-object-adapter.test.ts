import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { DurableObjectV1Transaction, type D1LikeQuery, type SyncSqlStorage } from "../lib/persistence/durable-object-adapter";
import type { StoredGoalVersion, StoredNutritionEvent, StoredOutcome, StoredProposal } from "../lib/persistence/v1-boundary";

const MIGRATIONS = ["0001_initial.sql", "0002_phase2_identity.sql"].map(
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
  // food_versions lives in the shared D1 catalog, not this user's Durable Object storage — purge must
  // not touch it (and if it tried to delete by owner_subject here, a real catalog would reject it: any
  // portion_versions row referencing that food has an ON DELETE RESTRICT foreign key back to it).
  db.prepare("INSERT INTO food_versions (id, food_key, version, owner_subject, name, normalized_name, energy_kcal_100g, protein_g_100g, carbs_g_100g, fat_g_100g, allergen_data_status, dietary_safety_data_status, source_provider, verified_at, created_at) VALUES ('f1','custom-food',1,'u1','Custom','custom',100,1,1,1,'unknown','unknown','manual-verified','2026-09-04T00:00:00.000Z','2026-09-04T00:00:00.000Z')").run();

  await assert.doesNotReject(() => tx1.purgeAuthenticatedUser("u1"));

  for (const table of ["users", "profiles", "ai_action_proposals", "ai_action_decisions", "ai_action_outcomes", "nutrition_events", "goal_versions", "user_current_goal", "assessment_snapshots", "safety_acknowledgements"]) {
    const count = (db.prepare(`SELECT count(*) as n FROM ${table} WHERE ${table === "users" ? "subject" : "user_subject"}='u1'`).get() as { n: number }).n;
    assert.equal(count, 0, `${table} should have no rows left for u1`);
  }
  assert.equal((db.prepare("SELECT count(*) as n FROM food_versions WHERE id='f1'").get() as { n: number }).n, 1, "purge must not touch the shared D1 catalog — food_versions cleanup is out of scope here");
  assert.equal((db.prepare("SELECT count(*) as n FROM users WHERE subject='u2'").get() as { n: number }).n, 1, "u2 must be untouched");
  assert.equal((db.prepare("SELECT count(*) as n FROM profiles WHERE user_subject='u2'").get() as { n: number }).n, 1, "u2's profile must be untouched");
});
