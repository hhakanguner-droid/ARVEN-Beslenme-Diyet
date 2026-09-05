import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { USER_DURABLE_OBJECT_SCHEMA_V1 } from "@/db/migrations/durable-object/0001_user_schema";
import {
  DurableObjectV1Transaction,
  DurableObjectV1TransactionRunner,
  type D1LikeQuery,
  type SyncSqlStorage,
} from "@/lib/persistence/durable-object-adapter";
import type { V1TransactionRunner } from "@/lib/persistence/v1-boundary";

/**
 * Local development persistence, Node-only (uses `node:sqlite`).
 *
 * Production runs on Cloudflare: the shared verified-food catalog lives in D1, and every other
 * user-scoped table lives in that user's own Durable Object (see `lib/persistence/user-durable-object.ts`
 * and `wrangler.jsonc`) — real request routing there is a separate, still-pending follow-up
 * (`custom-worker.ts` needs the `@opennextjs/cloudflare` adapter wired in). Until that exists, this
 * module gives `next dev`/`next start` a real, working stand-in with the exact same shape: one
 * SQLite file for the catalog, one SQLite file per authenticated user, talking to each other only
 * through `DurableObjectV1Transaction`'s injected `D1LikeQuery` — the same adapter class production
 * will use, completely unmodified. Swapping this module out for real D1/DO bindings later does not
 * touch a single line of business logic in `v1-boundary.ts` or `durable-object-adapter.ts`.
 *
 * Files live under `.data/` at the repo root (gitignored) so a developer's local data survives
 * restarts but never gets committed.
 */

const DATA_DIR = path.join(process.cwd(), ".data");

function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function wrapDatabase(db: DatabaseSync): SyncSqlStorage {
  return {
    exec(query: string, ...bindings: unknown[]) {
      const rows = db.prepare(query).all(...(bindings as never[])) as Record<string, unknown>[];
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

function d1Catalog(db: DatabaseSync): D1LikeQuery {
  return async (sql, params) => db.prepare(sql).all(...(params as never[])) as Record<string, unknown>[];
}

/**
 * Local stand-in for the shared D1 catalog. Notably `owner_subject` carries no `REFERENCES
 * users(subject)` — the catalog and a user's own storage are genuinely separate databases here,
 * exactly like production D1 vs. a Durable Object, so a foreign key across them is not just
 * unnecessary but impossible to express (see the same note in `durable-object-adapter.ts`).
 */
const LOCAL_CATALOG_SCHEMA = `
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS food_versions (
  id TEXT PRIMARY KEY NOT NULL,
  food_key TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  owner_subject TEXT,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  brand TEXT,
  barcode TEXT,
  is_liquid INTEGER NOT NULL DEFAULT 0 CHECK (is_liquid IN (0,1)),
  energy_kcal_100g REAL NOT NULL,
  protein_g_100g REAL NOT NULL,
  carbs_g_100g REAL NOT NULL,
  fat_g_100g REAL NOT NULL,
  fiber_g_100g REAL,
  extended_nutrition_json TEXT NOT NULL DEFAULT '{}',
  allergen_data_status TEXT NOT NULL CHECK (allergen_data_status IN ('verified','unknown','not-applicable')),
  allergen_ids_json TEXT NOT NULL DEFAULT '[]',
  dietary_safety_data_status TEXT NOT NULL CHECK (dietary_safety_data_status IN ('verified','unknown','not-applicable')),
  dietary_conflict_rule_ids_json TEXT NOT NULL DEFAULT '[]',
  source_provider TEXT NOT NULL CHECK (source_provider IN ('open-food-facts','usda','turkomp','bls','swiss-fcd','manual-verified')),
  source_external_id TEXT,
  source_evidence_url TEXT,
  source_license_id TEXT,
  verified_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS food_versions_name_idx ON food_versions(normalized_name);
CREATE INDEX IF NOT EXISTS food_versions_barcode_idx ON food_versions(barcode);

CREATE TABLE IF NOT EXISTS portion_versions (
  id TEXT PRIMARY KEY NOT NULL,
  portion_key TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  food_version_id TEXT NOT NULL REFERENCES food_versions(id) ON DELETE RESTRICT,
  measure TEXT NOT NULL,
  size TEXT,
  label TEXT NOT NULL,
  grams_per_unit REAL NOT NULL,
  source_provider TEXT NOT NULL,
  source_external_id TEXT,
  source_evidence_url TEXT,
  source_license_id TEXT,
  verified_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS portion_versions_food_idx ON portion_versions(food_version_id);
`;

type SeedPortion = { measure: string; label: string; gramsPerUnit: number };
/** amount + unit only — completeness is always "complete" for these hand-entered reference figures. */
type SeedNutrient = { mg?: number; mcg?: number };
type SeedFood = {
  key: string;
  name: string;
  isLiquid?: boolean;
  energyKcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG?: number;
  /** A handful of well-known per-100g vitamin/mineral figures — illustrative dev-seed data, not a full micronutrient profile. */
  extended?: Record<string, SeedNutrient>;
  portions: SeedPortion[];
};

function nutrientJson(extended?: Record<string, SeedNutrient>): string {
  if (!extended) return "{}";
  const result: Record<string, { amount: number; unit: "mg" | "mcg"; completeness: "complete" }> = {};
  for (const [key, value] of Object.entries(extended)) {
    if (value.mg != null) result[key] = { amount: value.mg, unit: "mg", completeness: "complete" };
    else if (value.mcg != null) result[key] = { amount: value.mcg, unit: "mcg", completeness: "complete" };
  }
  return JSON.stringify(result);
}

/** A modest set of common Turkish foods so search/quick-add works out of the box in a fresh dev environment. */
const SEED_FOODS: SeedFood[] = [
  { key: "elma", name: "Elma", energyKcal: 52, proteinG: 0.3, carbsG: 14, fatG: 0.2, fiberG: 2.4, extended: { "vitamin-c": { mg: 4.6 }, potassium: { mg: 107 } }, portions: [{ measure: "piece", label: "1 orta boy elma", gramsPerUnit: 180 }] },
  { key: "yogurt-suzme", name: "Süzme yoğurt", energyKcal: 97, proteinG: 9, carbsG: 4, fatG: 5, extended: { calcium: { mg: 110 }, sodium: { mg: 36 } }, portions: [{ measure: "bowl", label: "1 kase", gramsPerUnit: 200 }] },
  { key: "tavuk-gogsu-izgara", name: "Izgara tavuk göğsü", energyKcal: 165, proteinG: 31, carbsG: 0, fatG: 3.6, extended: { potassium: { mg: 256 }, iron: { mg: 0.7 } }, portions: [{ measure: "serving", label: "1 porsiyon (150 g)", gramsPerUnit: 150 }] },
  { key: "pirinc-pilavi", name: "Pirinç pilavı", energyKcal: 130, proteinG: 2.7, carbsG: 28, fatG: 0.3, portions: [{ measure: "serving", label: "1 porsiyon", gramsPerUnit: 150 }] },
  { key: "tam-bugday-ekmek", name: "Tam buğday ekmeği", energyKcal: 247, proteinG: 13, carbsG: 41, fatG: 3.4, fiberG: 7, extended: { magnesium: { mg: 76 }, iron: { mg: 2.5 } }, portions: [{ measure: "slice", label: "1 dilim", gramsPerUnit: 30 }] },
  { key: "yumurta-haslanmis", name: "Haşlanmış yumurta", energyKcal: 155, proteinG: 13, carbsG: 1.1, fatG: 11, extended: { "vitamin-b12": { mcg: 0.89 }, selenium: { mcg: 30.8 } }, portions: [{ measure: "piece", label: "1 adet", gramsPerUnit: 50 }] },
  { key: "zeytinyagi", name: "Zeytinyağı", isLiquid: true, energyKcal: 884, proteinG: 0, carbsG: 0, fatG: 100, extended: { "vitamin-e": { mg: 14.4 } }, portions: [{ measure: "tablespoon", label: "1 yemek kaşığı", gramsPerUnit: 13.5 }] },
  { key: "sut-yagli", name: "Tam yağlı süt", isLiquid: true, energyKcal: 61, proteinG: 3.2, carbsG: 4.8, fatG: 3.3, extended: { calcium: { mg: 113 }, "vitamin-b12": { mcg: 0.45 } }, portions: [{ measure: "water-glass", label: "1 su bardağı", gramsPerUnit: 200 }] },
  { key: "mercimek-corbasi", name: "Mercimek çorbası", isLiquid: true, energyKcal: 90, proteinG: 5, carbsG: 14, fatG: 1.8, fiberG: 3, extended: { iron: { mg: 3.3 }, potassium: { mg: 369 } }, portions: [{ measure: "bowl", label: "1 kase", gramsPerUnit: 250 }] },
  { key: "muz", name: "Muz", energyKcal: 89, proteinG: 1.1, carbsG: 23, fatG: 0.3, fiberG: 2.6, extended: { potassium: { mg: 358 }, "vitamin-b6": { mg: 0.4 }, "vitamin-c": { mg: 8.7 } }, portions: [{ measure: "piece", label: "1 orta boy muz", gramsPerUnit: 120 }] },
  { key: "badem", name: "Badem", energyKcal: 579, proteinG: 21, carbsG: 22, fatG: 50, fiberG: 12.5, extended: { calcium: { mg: 269 }, magnesium: { mg: 270 }, iron: { mg: 3.7 }, "vitamin-e": { mg: 25.6 } }, portions: [{ measure: "handful", label: "1 avuç (yaklaşık 20 adet)", gramsPerUnit: 24 }] },
  { key: "su", name: "Su", isLiquid: true, energyKcal: 0, proteinG: 0, carbsG: 0, fatG: 0, portions: [{ measure: "water-glass", label: "1 su bardağı", gramsPerUnit: 200 }] },
];

function normalize(value: string): string {
  return value.toLocaleLowerCase("tr-TR").trim();
}

function seedCatalogIfEmpty(db: DatabaseSync): void {
  const { n } = db.prepare("SELECT count(*) as n FROM food_versions").get() as { n: number };
  if (n > 0) return;
  const now = new Date().toISOString();
  const insertFood = db.prepare(
    `INSERT INTO food_versions (id, food_key, owner_subject, name, normalized_name, brand, barcode, is_liquid, energy_kcal_100g, protein_g_100g, carbs_g_100g, fat_g_100g, fiber_g_100g, extended_nutrition_json, allergen_data_status, dietary_safety_data_status, source_provider, verified_at, created_at)
     VALUES (?,?,NULL,?,?,NULL,NULL,?,?,?,?,?,?,?,'unknown','not-applicable','manual-verified',?,?)`,
  );
  const insertPortion = db.prepare(
    `INSERT INTO portion_versions (id, food_version_id, measure, size, label, grams_per_unit, source_provider, verified_at, created_at)
     VALUES (?,?,?,NULL,?,?,'manual-verified',?,?)`,
  );
  db.exec("BEGIN");
  try {
    for (const food of SEED_FOODS) {
      const id = randomUUID();
      insertFood.run(id, food.key, food.name, normalize(food.name), food.isLiquid ? 1 : 0, food.energyKcal, food.proteinG, food.carbsG, food.fatG, food.fiberG ?? null, nutrientJson(food.extended), now, now);
      for (const portion of food.portions) {
        insertPortion.run(randomUUID(), id, portion.measure, portion.label, portion.gramsPerUnit, now, now);
      }
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

let catalogDb: DatabaseSync | null = null;
function getCatalogDb(): DatabaseSync {
  if (catalogDb) return catalogDb;
  ensureDataDir();
  const db = new DatabaseSync(path.join(DATA_DIR, "catalog.db"));
  db.exec(LOCAL_CATALOG_SCHEMA);
  seedCatalogIfEmpty(db);
  catalogDb = db;
  return db;
}

const userDbs = new Map<string, DatabaseSync>();
function getUserDb(subject: string): DatabaseSync {
  const existing = userDbs.get(subject);
  if (existing) return existing;
  ensureDataDir();
  const safeName = subject.replace(/[^a-zA-Z0-9_-]/g, "_") || "user";
  const db = new DatabaseSync(path.join(DATA_DIR, `user-${safeName}.db`));
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(USER_DURABLE_OBJECT_SCHEMA_V1);
  userDbs.set(subject, db);
  return db;
}

/** One `V1TransactionRunner` per authenticated subject, backed by that subject's local SQLite file plus the shared local catalog. */
export function getLocalRunner(userSubject: string): V1TransactionRunner {
  const tx = new DurableObjectV1Transaction(wrapDatabase(getUserDb(userSubject)), d1Catalog(getCatalogDb()));
  return new DurableObjectV1TransactionRunner(tx);
}
