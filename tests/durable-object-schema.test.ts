import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { USER_DURABLE_OBJECT_SCHEMA_V1 } from "../db/migrations/durable-object/0001_user_schema";
import { DurableObjectV1Transaction, type D1LikeQuery, type SyncSqlStorage } from "../lib/persistence/durable-object-adapter";
import type { VersionedFood } from "../lib/persistence/v1-boundary";

/** Same wrapping shape as tests/durable-object-adapter.test.ts, applied to the trimmed per-user schema. */
function wrapDatabase(db: DatabaseSync): SyncSqlStorage {
  return {
    exec(query: string, ...bindings: unknown[]) {
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

function freshUserDatabase(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(USER_DURABLE_OBJECT_SCHEMA_V1);
  return db;
}

function tableNames(db: DatabaseSync): string[] {
  return (db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as { name: string }[]).map((row) => row.name);
}

test("the per-user Durable Object schema owns exactly the per-user tables, not the shared catalog", () => {
  const db = freshUserDatabase();
  const names = tableNames(db);
  for (const owned of [
    "users", "profiles", "user_ui_preferences", "goal_versions", "user_current_goal",
    "user_safety_exclusions", "ai_action_proposals", "ai_action_decisions", "nutrition_events",
    "ai_action_outcomes", "assessment_snapshots", "safety_acknowledgements",
  ]) {
    assert.ok(names.includes(owned), `expected per-user table ${owned} to exist`);
  }
  // The whole point of the split: these live in the shared D1 catalog instead, and a foreign key
  // cannot be enforced across two separate SQLite database instances in production.
  for (const catalogOnly of ["food_versions", "portion_versions", "scientific_reference_versions", "allergen_catalog", "dietary_rule_catalog"]) {
    assert.ok(!names.includes(catalogOnly), `expected catalog-only table ${catalogOnly} to be absent from the per-user schema`);
  }
});

test("applying the schema twice (simulating a Durable Object waking up warm) does not throw", () => {
  const db = freshUserDatabase();
  assert.doesNotThrow(() => db.exec(USER_DURABLE_OBJECT_SCHEMA_V1));
});

test("DurableObjectV1Transaction works against the trimmed schema, reading the catalog from a genuinely separate SQLite connection", async () => {
  const userDb = freshUserDatabase();

  // A second, wholly separate in-memory database standing in for D1 in production: no shared
  // connection, no foreign_keys=ON spanning both, proving the adapter never relies on a
  // cross-database constraint to do its job.
  const catalogDb = new DatabaseSync(":memory:");
  catalogDb.exec(`
    CREATE TABLE food_versions (
      id TEXT PRIMARY KEY, food_key TEXT, owner_subject TEXT, name TEXT, is_liquid INTEGER,
      energy_kcal_100g REAL, protein_g_100g REAL, carbs_g_100g REAL, fat_g_100g REAL,
      allergen_data_status TEXT, allergen_ids_json TEXT,
      dietary_safety_data_status TEXT, dietary_conflict_rule_ids_json TEXT,
      source_provider TEXT, verified_at TEXT
    );
    CREATE TABLE portion_versions (
      id TEXT PRIMARY KEY, food_version_id TEXT, measure TEXT, label TEXT, grams_per_unit REAL,
      source_provider TEXT, verified_at TEXT
    );
  `);
  catalogDb.prepare(
    `INSERT INTO food_versions (id, food_key, owner_subject, name, is_liquid, energy_kcal_100g, protein_g_100g, carbs_g_100g, fat_g_100g, allergen_data_status, allergen_ids_json, dietary_safety_data_status, dietary_conflict_rule_ids_json, source_provider, verified_at)
     VALUES ('f1','elma',NULL,' Elma',0,52,0.3,14,0.2,'verified','[]','verified','[]','manual-verified','2026-09-04T00:00:00.000Z')`,
  ).run();
  // A second food privately owned by a different user ('u2') — must never resolve for 'u1'.
  catalogDb.prepare(
    `INSERT INTO food_versions (id, food_key, owner_subject, name, is_liquid, energy_kcal_100g, protein_g_100g, carbs_g_100g, fat_g_100g, allergen_data_status, allergen_ids_json, dietary_safety_data_status, dietary_conflict_rule_ids_json, source_provider, verified_at)
     VALUES ('f2','ozel-yemek','u2','u2''s private food',0,10,1,1,1,'unknown','[]','unknown','[]','manual-verified','2026-09-04T00:00:00.000Z')`,
  ).run();

  const catalog: D1LikeQuery = async (sql, params) => {
    if (sql.includes("food_versions")) return catalogDb.prepare(sql).all(...(params as any[])) as Record<string, unknown>[];
    if (sql.includes("portion_versions")) return catalogDb.prepare(sql).all(...(params as any[])) as Record<string, unknown>[];
    return [];
  };

  const tx = new DurableObjectV1Transaction(wrapDatabase(userDb), catalog);
  const created = await tx.getOrCreateUser("u1", { timezone: "Europe/Istanbul", locale: "tr-TR" });
  assert.equal(created.timezone, "Europe/Istanbul");

  await tx.upsertProfile({ userSubject: "u1", displayName: "Test", birthDate: null, sexAtBirth: null, heightCm: null, activityLevel: null, updatedAt: "2026-09-04T00:00:00.000Z" });
  const profile = await tx.getProfile("u1");
  assert.equal(profile?.displayName, "Test");

  const food: VersionedFood | null = await tx.getFoodVersion("u1", "f1");
  assert.equal(food?.name.trim(), "Elma");

  // Global catalog food (owner_subject NULL) resolves for any authenticated subject...
  const globalFoodForOtherUser = await tx.getFoodVersion("someone-else", "f1");
  assert.equal(globalFoodForOtherUser?.name.trim(), "Elma");
  // ...but a private custom food owned by 'u2' must never resolve for 'u1'.
  const otherUsersPrivateFood = await tx.getFoodVersion("u1", "f2");
  assert.equal(otherUsersPrivateFood, null, "a user must not be able to read another user's private custom food by id");
  assert.equal(food?.nutrition.energyKcal, 52);

  await tx.purgeAuthenticatedUser("u1");
  assert.equal(await tx.getProfile("u1"), null);
  // purgeAuthenticatedUser must never touch the catalog connection at all — it is a different database.
  const stillThere = (catalogDb.prepare("SELECT count(*) as n FROM food_versions").get() as { n: number }).n;
  assert.equal(stillThere, 2, "the shared catalog is untouched by a per-user purge");
});
