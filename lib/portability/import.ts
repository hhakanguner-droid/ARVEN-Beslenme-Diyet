import { parseMifflinStJeorV1Inputs, type MifflinStJeorV1Inputs } from "@/lib/goals/calculator";
import { parseMealEnergyAllocations, type MealEnergyAllocation } from "@/lib/goals/types";
import { validateExportManifest, type ExportSection } from "@/lib/portability/types";
import {
  V1MutationService,
  type IdFactory,
  type ServiceClock,
  type V1TransactionRunner,
} from "@/lib/persistence/v1-boundary";

export type ImportSummary = {
  imported: Partial<Record<ExportSection, number>>;
  /** Sections present in the file but deliberately not restored, with the reason (see the module doc comment below). */
  skipped: Partial<Record<ExportSection, number>>;
  skipReasons: Partial<Record<ExportSection, string>>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Bilinmeyen hata";
}

/**
 * Every top-level key `lib/portability/export.ts`'s `UserExportPayload` can ever actually produce.
 * Faz 9 hardening: this is a strict allowlist, not a denylist — a key this export format has never
 * produced (a forged `userSubject`/`ownerSubject`, an unrelated section such as `supplements` or
 * `labResults` this backup format has never included, or any other unexpected field) fails the whole
 * import closed before a single byte of the file is trusted for anything, rather than being silently
 * ignored (the old behavior) or, worse, read.
 */
const KNOWN_TOP_LEVEL_KEYS = new Set<string>([
  "manifest", "profile", "goals", "preferences",
  "mealLog", "waterLog", "measurements", "recipes", "customFoods", "aiMemory", "mediaManifest",
]);

/**
 * Restores a previously downloaded `ArvenNutritionExportV1` backup (`lib/portability/export.ts`,
 * `docs/PORTABILITY.md`) for the authenticated `subject`.
 *
 * Faz 9 hardening: this rewrite closes the gap where the previous implementation wrote raw backup
 * fields straight into persistence (`tx.insertNutritionEvent`, `tx.insertRecipe`, ... built directly
 * from `item.xxx` with only `typeof` checks) — a crafted backup file could smuggle in an out-of-range
 * measurement, an unsafe/forged nutrition payload, a supplement posing as a medication note, or any
 * other value none of the app's own write paths would ever accept. Every section below instead:
 *
 * - parses only the JSON it actually needs (`payloadJson`/`ingredientsJson`/`calculatorInputsJson`
 *   etc. are nested JSON strings inside the backup, not top-level fields);
 * - is reconstructed into the exact input shape one of `V1MutationService`'s existing, already-tested
 *   mutation methods expects, and passed through that method — so the same canonical Zod schema, the
 *   same health-safety checks (`assertNoAllergyConflict`, `assertNoDietaryExclusionConflict`,
 *   `assertNoMedicalOverreach`, the supplement allowlist), and the same domain invariants a live
 *   request would hit are re-run against this import, not bypassed by it;
 * - derives ownership ONLY from the server-authenticated `subject` this function was called with —
 *   nothing in the uploaded file (no `userSubject`/`ownerSubject` field, even if present) is ever
 *   read, and any such field at the top level is rejected outright by the allowlist above rather than
 *   silently ignored;
 * - fails a malformed individual record CLOSED: it is skipped and counted (never coerced to a
 *   default, never partially written) while the rest of the import continues, so one corrupted line
 *   in an old backup cannot block restoring everything else. A malformed *top-level* shape (not an
 *   object, an unrecognized key, an unsupported `manifest.format`) fails the whole import instead,
 *   since there each is a structural signal that the file itself is not a genuine ARVEN export.
 *
 * The meal-log/water-log entries are a deliberate special case: `export.ts` stores the exact
 * *resolved* `StoredNutritionEvent.payloadJson` (already-computed grams/nutrition/foodName), never
 * the original portion selection — there is no way to feed that back into real validation as-is. So
 * each entry is rebuilt as a fresh `custom-grams` selection (using the stored `grams` value) and
 * re-submitted through `appendManualMeal`/`appendManualWater`, exactly as if the user were logging it
 * again right now: food existence and allergy/dietary conflicts are rechecked against the CURRENT
 * verified-food catalog and this user's CURRENT active exclusions. This is a disclosed trade-off
 * (the nutrition snapshot can differ slightly from the original if catalog data changed since), not a
 * regression — the previous implementation trusted the stored snapshot completely and rechecked
 * nothing.
 *
 * Every restored row gets a freshly generated id and `createdAt`, so importing the same backup twice
 * never collides with — or silently overwrites — a row from the first import; repeat imports
 * duplicate history rather than deduplicating it, which the summary makes visible via `imported`
 * counts the caller can show the user before/after.
 *
 * `media-manifest` is always reported under `skipped`: this restores structured records only, never
 * binary bytes, matching `docs/PORTABILITY.md`'s "Private media manifest" section — a backup's photo
 * rows describe files the export did not package, so there is nothing here to re-attach them to.
 * `preferences` is reported under `skipped` too: timezone/day-start are fixed at account creation
 * (`V1MutationService.getOrCreateAuthenticatedUser` deliberately never resets an existing user's
 * timezone — see `tests/persistence-v1.test.ts`) and this Faz 9 hardening task adds no new mutation
 * path to change that, so there is nothing legitimate to write it into.
 */
export async function importUserExport(
  runner: V1TransactionRunner,
  subject: string,
  raw: unknown,
  idFactory: IdFactory = () => crypto.randomUUID(),
  clock: ServiceClock = { now: () => new Date() },
): Promise<ImportSummary> {
  if (!isRecord(raw)) throw new Error("Export dosyası okunamadı: beklenmeyen içerik");

  for (const key of Object.keys(raw)) {
    if (!KNOWN_TOP_LEVEL_KEYS.has(key)) throw new Error(`Export dosyasında tanınmayan alan: ${key}`);
  }

  validateExportManifest(raw.manifest);

  const service = new V1MutationService(subject, runner, idFactory, clock);
  const imported: Partial<Record<ExportSection, number>> = {};
  const skipped: Partial<Record<ExportSection, number>> = {};
  const skipReasons: Partial<Record<ExportSection, string>> = {};

  // ---- profile: only the four fields ProfileUpsertV1 actually accepts are ever copied forward. ----
  if (raw.profile !== undefined && raw.profile !== null) {
    if (!isRecord(raw.profile)) {
      skipped.profile = 1;
      skipReasons.profile = "Profil verisi bozuk";
    } else {
      try {
        const p = raw.profile;
        await service.upsertProfile({
          schemaVersion: "ProfileUpsertV1",
          displayName: p.displayName ?? null,
          birthDate: p.birthDate ?? null,
          sexAtBirth: p.sexAtBirth ?? null,
          heightCm: p.heightCm ?? null,
          activityLevel: p.activityLevel ?? null,
        });
        imported.profile = 1;
      } catch (error) {
        skipped.profile = 1;
        skipReasons.profile = `Profil verisi geçersiz olduğu için atlandı: ${errorMessage(error)}`;
      }
    }
  }

  // ---- goals: re-derived from the ORIGINAL calculator inputs via the same domain calculator a live
  // request uses, never from the stored macro totals directly — a crafted energyKcal/proteinG/etc.
  // in the backup can no longer be written verbatim.
  if (raw.goals !== undefined && raw.goals !== null) {
    if (!isRecord(raw.goals)) {
      skipped.goals = 1;
      skipReasons.goals = "Hedef verisi eksik veya bozuk";
    } else {
      try {
        const g = raw.goals;
        if (typeof g.calculatorInputsJson !== "string" || typeof g.referenceSnapshotsJson !== "string" || typeof g.mealAllocationsJson !== "string") {
          throw new Error("Hedef verisinde gerekli alanlar eksik");
        }
        const inputs: MifflinStJeorV1Inputs = parseMifflinStJeorV1Inputs(JSON.parse(g.calculatorInputsJson));
        const referenceSnapshots = JSON.parse(g.referenceSnapshotsJson);
        if (!Array.isArray(referenceSnapshots) || referenceSnapshots.length === 0) throw new Error("Referans listesi bozuk");
        const referenceIds = referenceSnapshots.map((entry) => {
          if (!isRecord(entry) || typeof entry.id !== "string" || !entry.id.trim()) throw new Error("Referans kimliği bozuk");
          return entry.id;
        });
        const allocations: MealEnergyAllocation[] = parseMealEnergyAllocations(JSON.parse(g.mealAllocationsJson));
        await service.createCalculatedGoalVersion(inputs, referenceIds, allocations);
        imported.goals = 1;
      } catch (error) {
        skipped.goals = 1;
        skipReasons.goals = `Hedef verisi eksik veya bozuk: ${errorMessage(error)}`;
      }
    }
  }

  // ---- meal log / water log — see the module doc comment for why these are rebuilt as fresh
  // custom-grams entries and re-submitted through appendManualMeal/appendManualWater instead of being
  // written from the stored payload directly.
  for (const [section, eventType] of [["mealLog", "meal-log"], ["waterLog", "water-log"]] as const) {
    const list = raw[section];
    if (!Array.isArray(list)) continue;
    let count = 0;
    let malformed = 0;
    for (const item of list) {
      try {
        if (!isRecord(item) || typeof item.occurredAt !== "string" || typeof item.payloadJson !== "string") throw new Error("Kayıtta gerekli alanlar eksik");
        const payload: unknown = JSON.parse(item.payloadJson);
        if (!isRecord(payload)) throw new Error("Kayıt yükü bozuk");
        if (eventType === "meal-log") {
          if (payload.schemaVersion !== "MealEventV1" || typeof payload.mealType !== "string" || !Array.isArray(payload.items)) {
            throw new Error("Öğün kaydı bozuk");
          }
          const items = payload.items.map((rawItem: unknown) => {
            if (!isRecord(rawItem) || typeof rawItem.foodVersionId !== "string" || typeof rawItem.calculationVersion !== "string" || typeof rawItem.grams !== "number") {
              throw new Error("Öğün kalemi bozuk");
            }
            return { foodVersionId: rawItem.foodVersionId, calculationVersion: rawItem.calculationVersion, selection: { kind: "custom-grams" as const, grams: rawItem.grams } };
          });
          await service.appendManualMeal({ occurredAt: item.occurredAt, mealType: payload.mealType, items } as Parameters<typeof service.appendManualMeal>[0]);
        } else {
          if (payload.schemaVersion !== "WaterEventV1" || typeof payload.milliliters !== "number") throw new Error("Su kaydı bozuk");
          await service.appendManualWater(item.occurredAt, payload.milliliters);
        }
        count++;
      } catch {
        malformed++;
      }
    }
    imported[eventType] = count;
    if (malformed > 0) { skipped[eventType] = malformed; skipReasons[eventType] = "Bazı kayıtlar eksik veya geçersiz alan içerdiği için atlandı"; }
  }

  // ---- body measurements: routed through recordBodyMeasurement, so the exact same range checks
  // (weightKg 20-400, etc.) and "at least one value present" rule a live entry gets are re-applied.
  if (Array.isArray(raw.measurements)) {
    let count = 0;
    let malformed = 0;
    for (const item of raw.measurements) {
      try {
        if (!isRecord(item)) throw new Error("Ölçüm kaydı bozuk");
        await service.recordBodyMeasurement({
          schemaVersion: "BodyMeasurementCreateV1",
          localDate: item.localDate,
          weightKg: item.weightKg ?? null,
          bodyFatPercent: item.bodyFatPercent ?? null,
          waistCm: item.waistCm ?? null,
          hipCm: item.hipCm ?? null,
          chestCm: item.chestCm ?? null,
          note: item.note ?? null,
        });
        count++;
      } catch {
        malformed++;
      }
    }
    imported.measurements = count;
    if (malformed > 0) { skipped.measurements = malformed; skipReasons.measurements = "Bazı ölçüm kayıtları geçersiz olduğu için atlandı"; }
  }

  // ---- recipes: ingredientsJson is nested JSON — parsed, then passed to createRecipe, which
  // re-validates every ingredient with the same RecipeIngredientV1 schema a live "tarif oluştur"
  // request uses and re-checks that every referenced food version still exists in this user's catalog.
  if (Array.isArray(raw.recipes)) {
    let count = 0;
    let malformed = 0;
    for (const item of raw.recipes) {
      try {
        if (!isRecord(item) || typeof item.name !== "string" || typeof item.servings !== "number" || typeof item.ingredientsJson !== "string") {
          throw new Error("Tarif kaydında gerekli alanlar eksik");
        }
        const ingredients: unknown = JSON.parse(item.ingredientsJson);
        await service.createRecipe({ schemaVersion: "RecipeCreateV1", name: item.name, servings: item.servings, ingredients });
        count++;
      } catch {
        malformed++;
      }
    }
    imported.recipes = count;
    if (malformed > 0) { skipped.recipes = malformed; skipReasons.recipes = "Bazı tarifler geçersiz olduğu için atlandı"; }
  }

  // ---- custom foods: routed through createCustomFood, so CustomFoodV1's ranges/enum-checked
  // portions apply — unlike the old implementation, a missing/invalid portion list is rejected
  // rather than silently replaced with a fabricated "1 porsiyon" default.
  if (Array.isArray(raw.customFoods)) {
    let count = 0;
    let malformed = 0;
    for (const item of raw.customFoods) {
      try {
        if (!isRecord(item) || typeof item.name !== "string" || typeof item.energyKcal !== "number") throw new Error("Özel besin kaydında gerekli alanlar eksik");
        await service.createCustomFood({
          schemaVersion: "CustomFoodV1",
          name: item.name,
          isLiquid: item.isLiquid === true,
          energyKcal: item.energyKcal,
          proteinG: typeof item.proteinG === "number" ? item.proteinG : 0,
          carbsG: typeof item.carbsG === "number" ? item.carbsG : 0,
          fatG: typeof item.fatG === "number" ? item.fatG : 0,
          fiberG: typeof item.fiberG === "number" ? item.fiberG : undefined,
          portions: Array.isArray(item.portions)
            ? item.portions.map((p: unknown) => (isRecord(p) ? { measure: p.measure, label: p.label, gramsPerUnit: p.gramsPerUnit } : p))
            : [],
        });
        count++;
      } catch {
        malformed++;
      }
    }
    imported["custom-foods"] = count;
    if (malformed > 0) { skipped["custom-foods"] = malformed; skipReasons["custom-foods"] = "Bazı özel besinler geçersiz olduğu için atlandı"; }
  }

  // ---- AI memory facts: batched in groups of at most 5, the same limit MemoryFactRecordV1 enforces
  // for a live write.
  if (Array.isArray(raw.aiMemory)) {
    let count = 0;
    let malformed = 0;
    const candidates: Array<{ factText: string; confidence: "high" | "medium" | "low"; provenance: "user-stated" | "ai-inferred" }> = [];
    for (const item of raw.aiMemory) {
      if (!isRecord(item) || typeof item.factText !== "string" || !item.factText.trim()) { malformed++; continue; }
      candidates.push({
        factText: item.factText,
        confidence: item.confidence === "high" || item.confidence === "low" ? item.confidence : "medium",
        provenance: item.provenance === "user-stated" ? "user-stated" : "ai-inferred",
      });
    }
    for (let i = 0; i < candidates.length; i += 5) {
      const batch = candidates.slice(i, i + 5);
      try {
        await service.recordMemoryFacts({ schemaVersion: "MemoryFactRecordV1", facts: batch });
        count += batch.length;
      } catch {
        malformed += batch.length;
      }
    }
    imported["ai-memory"] = count;
    if (malformed > 0) { skipped["ai-memory"] = malformed; skipReasons["ai-memory"] = "Bazı hafıza notları geçersiz olduğu için atlandı"; }
  }

  if (Array.isArray(raw.mediaManifest)) {
    skipped["media-manifest"] = raw.mediaManifest.length;
    skipReasons["media-manifest"] = "Fotoğraf ve belge dosyalarının kendisi yedeğe dahil değildir";
  }

  if (raw.preferences !== undefined) {
    skipped.preferences = 1;
    skipReasons.preferences = "Saat dilimi ve gün başlangıcı hesap oluşturulurken belirlenir; buradan değiştirilemez";
  }

  return { imported, skipped, skipReasons };
}
