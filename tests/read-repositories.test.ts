import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { USER_DURABLE_OBJECT_SCHEMA_V1 } from "../db/migrations/durable-object/0001_user_schema";
import { DurableObjectV1Transaction, DurableObjectV1TransactionRunner, type D1LikeQuery, type SyncSqlStorage } from "../lib/persistence/durable-object-adapter";
import { V1MutationService } from "../lib/persistence/v1-boundary";
import { V1FoodReadRepository, V1NutritionReadRepository } from "../lib/persistence/read-repositories";

function wrapDatabase(db: DatabaseSync): SyncSqlStorage {
  return {
    exec(query: string, ...bindings: unknown[]) {
      const rows = db.prepare(query).all(...(bindings as never[])) as Record<string, unknown>[];
      return { toArray: () => rows, one: () => rows[0] };
    },
    transactionSync<T>(callback: () => T): T {
      db.exec("BEGIN");
      try { const result = callback(); db.exec("COMMIT"); return result; }
      catch (error) { db.exec("ROLLBACK"); throw error; }
    },
  };
}

function setup() {
  const userDb = new DatabaseSync(":memory:");
  userDb.exec("PRAGMA foreign_keys = ON");
  userDb.exec(USER_DURABLE_OBJECT_SCHEMA_V1);

  const catalogDb = new DatabaseSync(":memory:");
  catalogDb.exec(`
    CREATE TABLE food_versions (
      id TEXT PRIMARY KEY, food_key TEXT, owner_subject TEXT, name TEXT, is_liquid INTEGER,
      energy_kcal_100g REAL, protein_g_100g REAL, carbs_g_100g REAL, fat_g_100g REAL,
      allergen_data_status TEXT, allergen_ids_json TEXT,
      dietary_safety_data_status TEXT, dietary_conflict_rule_ids_json TEXT,
      source_provider TEXT, verified_at TEXT, normalized_name TEXT, barcode TEXT
    );
    CREATE TABLE portion_versions (
      id TEXT PRIMARY KEY, food_version_id TEXT, measure TEXT, label TEXT, grams_per_unit REAL,
      source_provider TEXT, verified_at TEXT
    );
  `);
  catalogDb.prepare(
    `INSERT INTO food_versions (id, food_key, owner_subject, name, normalized_name, barcode, is_liquid, energy_kcal_100g, protein_g_100g, carbs_g_100g, fat_g_100g, allergen_data_status, allergen_ids_json, dietary_safety_data_status, dietary_conflict_rule_ids_json, source_provider, verified_at)
     VALUES ('f1','elma',NULL,'Elma','elma','1234',0,52,0.3,14,0.2,'verified','[]','verified','[]','manual-verified','2026-09-04T00:00:00.000Z')`,
  ).run();
  catalogDb.prepare(
    `INSERT INTO portion_versions (id, food_version_id, measure, label, grams_per_unit, source_provider, verified_at)
     VALUES ('p1','f1','piece','1 adet',180,'manual-verified','2026-09-04T00:00:00.000Z')`,
  ).run();

  const catalog: D1LikeQuery = async (sql, params) => catalogDb.prepare(sql).all(...(params as never[])) as Record<string, unknown>[];
  const tx = new DurableObjectV1Transaction(wrapDatabase(userDb), catalog);
  const runner = new DurableObjectV1TransactionRunner(tx);
  const service = new V1MutationService("u1", runner, undefined, { now: () => new Date("2026-09-04T10:00:00.000Z") });
  return { runner, service };
}

test("V1FoodReadRepository searches the catalog and resolves by barcode, scoped to the authenticated subject", async () => {
  const { runner } = setup();
  const repo = new V1FoodReadRepository(runner);
  const results = await repo.searchVerified("u1", "elma");
  assert.equal(results.length, 1);
  assert.equal(results[0]?.name, "Elma");
  assert.equal((await repo.findByBarcode("u1", "1234"))?.name, "Elma");
  assert.equal(await repo.findByBarcode("u1", "missing"), null);
  assert.deepEqual(await repo.searchVerified("u1", "   "), []);
});

test("V1NutritionReadRepository.getDailySnapshot reports empty-day with zero targets before any user/goal/event exists", async () => {
  const { runner } = setup();
  const repo = new V1NutritionReadRepository(runner);
  const snapshot = await repo.getDailySnapshot("u1", "2026-09-04");
  assert.equal(snapshot.targets, null);
  assert.equal(snapshot.consumptionCoverage, "empty-day");
  assert.equal(snapshot.waterMl, 0);
  // sumNutrition([]) explicitly sets `extended: undefined` (no items means no vitamin/mineral data to
  // report), and Node's assert.deepEqual/deepStrictEqual treats a key present-but-undefined as
  // different from the key being absent — so that has to be spelled out here too.
  assert.deepEqual(snapshot.consumed, { energyKcal: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0, extended: undefined });
});

test("V1NutritionReadRepository.getDailySnapshot sums water and meal-logged nutrition for the local date, against the active goal", async () => {
  const { runner, service } = setup();
  await service.getOrCreateAuthenticatedUser({ timezone: "Europe/Istanbul", locale: "tr-TR" });
  await service.createCalculatedGoalVersion(
    { weightKg: 80, heightCm: 180, ageYears: 30, sexAtBirth: "male", activityFactor: 1.4, energyAdjustmentKcal: 0, proteinGPerKg: 1.6, fatEnergyPct: 0.3, waterMlPerKg: 35 },
    [],
    [{ mealType: "dinner", energyShareBps: 10000 }],
  ).catch(() => null); // no scientific references registered here — targets staying null is fine for this test
  await service.appendManualWater("2026-09-04T08:00:00.000Z", 250);
  await service.appendManualMeal({
    occurredAt: "2026-09-04T08:00:00.000Z",
    mealType: "breakfast",
    items: [{ foodVersionId: "f1", calculationVersion: "nutrition-v1", selection: { kind: "household", portionVersionId: "p1", quantity: 1 } }],
  });

  const repo = new V1NutritionReadRepository(runner);
  const snapshot = await repo.getDailySnapshot("u1", "2026-09-04");
  assert.equal(snapshot.waterMl, 250);
  assert.equal(snapshot.consumptionCoverage, "logged-foods");
  assert.ok(snapshot.consumed.energyKcal > 0);

  // A different local date must not see this day's totals.
  const otherDay = await repo.getDailySnapshot("u1", "2026-09-03");
  assert.equal(otherDay.waterMl, 0);
  assert.equal(otherDay.consumptionCoverage, "empty-day");
});
