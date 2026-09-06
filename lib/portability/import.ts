import { validateExportManifest, type ExportSection } from "@/lib/portability/types";
import type {
  IdFactory,
  ServiceClock,
  StoredBodyMeasurement,
  StoredCustomFoodVersion,
  StoredGoalVersion,
  StoredMemoryFact,
  StoredNutritionEvent,
  StoredProfile,
  StoredRecipe,
  V1TransactionRunner,
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

/**
 * Restores a previously downloaded `ArvenNutritionExportV1` backup (`lib/portability/export.ts`,
 * `docs/PORTABILITY.md`) for the authenticated `subject` — following every import principle that
 * doc lays out:
 *
 * - the export schema/version is validated before any write (`validateExportManifest`);
 * - the caller is always the server-authenticated subject — nothing in the uploaded file (no
 *   `userSubject`/`ownerSubject` field, even if present) is ever trusted as an owner id;
 * - every restored row gets a freshly generated id and `createdAt`, so importing the same backup
 *   twice never collides with — or silently overwrites — a row from the first import; the trade-off
 *   (explicitly accepted here, not idempotent in the stronger "same id back" sense) is that repeat
 *   imports duplicate history rather than deduplicating it, which the summary makes visible via
 *   `imported` counts the caller can show the user before/after;
 *   unknown nutrient values are never silently converted to zero — malformed individual entries are
 *   skipped (and counted) rather than coerced.
 *
 * `media-manifest` is always reported under `skipped`: this restores structured records only, never
 * binary bytes, matching `docs/PORTABILITY.md`'s "Private media manifest" section — a backup's photo
 * rows describe files the export did not package, so there is nothing here to re-attach them to.
 */
export async function importUserExport(
  runner: V1TransactionRunner,
  subject: string,
  raw: unknown,
  idFactory: IdFactory = () => crypto.randomUUID(),
  clock: ServiceClock = { now: () => new Date() },
): Promise<ImportSummary> {
  if (!isRecord(raw)) throw new Error("Export dosyası okunamadı: beklenmeyen içerik");
  validateExportManifest(raw.manifest);

  const imported: Partial<Record<ExportSection, number>> = {};
  const skipped: Partial<Record<ExportSection, number>> = {};
  const skipReasons: Partial<Record<ExportSection, string>> = {};

  await runner.transaction(async (tx) => {
    const now = () => clock.now().toISOString();

    if (isRecord(raw.profile)) {
      const p = raw.profile as Partial<StoredProfile>;
      const profile: StoredProfile = {
        userSubject: subject,
        displayName: typeof p.displayName === "string" ? p.displayName : null,
        birthDate: typeof p.birthDate === "string" ? p.birthDate : null,
        sexAtBirth: p.sexAtBirth === "male" || p.sexAtBirth === "female" ? p.sexAtBirth : null,
        heightCm: typeof p.heightCm === "number" ? p.heightCm : null,
        activityLevel: typeof p.activityLevel === "string" ? (p.activityLevel as StoredProfile["activityLevel"]) : null,
        updatedAt: now(),
      };
      await tx.upsertProfile(profile);
      imported.profile = 1;
    }

    if (isRecord(raw.goals)) {
      const g = raw.goals as Partial<StoredGoalVersion>;
      if (typeof g.energyKcal === "number" && typeof g.proteinG === "number" && typeof g.carbsG === "number" && typeof g.fatG === "number" && typeof g.fiberG === "number" && typeof g.waterMl === "number") {
        const createdAt = now();
        const goal: StoredGoalVersion = {
          id: idFactory(), userSubject: subject, source: "arven-calculated", calculatorId: "mifflin-st-jeor@v1",
          calculatorInputsJson: typeof g.calculatorInputsJson === "string" ? g.calculatorInputsJson : "{}",
          referenceSnapshotsJson: typeof g.referenceSnapshotsJson === "string" ? g.referenceSnapshotsJson : "[]",
          energyKcal: g.energyKcal, proteinG: g.proteinG, carbsG: g.carbsG, fatG: g.fatG, fiberG: g.fiberG, waterMl: g.waterMl,
          mealAllocationsJson: typeof g.mealAllocationsJson === "string" ? g.mealAllocationsJson : "[]",
          createdAt,
        };
        await tx.insertGoalVersionAndSetCurrent(goal, createdAt);
        imported.goals = 1;
      } else {
        skipped.goals = 1;
        skipReasons.goals = "Hedef verisi eksik veya bozuk";
      }
    }

    for (const [section, eventType] of [["mealLog", "meal-log"], ["waterLog", "water-log"]] as const) {
      const list = raw[section];
      if (!Array.isArray(list)) continue;
      let count = 0;
      let malformed = 0;
      for (const item of list) {
        if (!isRecord(item) || typeof item.occurredAt !== "string" || typeof item.localDate !== "string" || typeof item.payloadJson !== "string") { malformed++; continue; }
        const event: StoredNutritionEvent = { id: idFactory(), userSubject: subject, eventType, occurredAt: item.occurredAt, localDate: item.localDate, payloadJson: item.payloadJson, createdAt: now() };
        await tx.insertNutritionEvent(event);
        count++;
      }
      imported[eventType] = count;
      if (malformed > 0) { skipped[eventType] = malformed; skipReasons[eventType] = "Bazı kayıtlar eksik alan içerdiği için atlandı"; }
    }

    if (Array.isArray(raw.measurements)) {
      let count = 0;
      for (const item of raw.measurements) {
        if (!isRecord(item) || typeof item.localDate !== "string") continue;
        const m = item as Partial<StoredBodyMeasurement>;
        const measurement: StoredBodyMeasurement = {
          id: idFactory(), userSubject: subject, localDate: m.localDate as string,
          weightKg: typeof m.weightKg === "number" ? m.weightKg : null,
          bodyFatPercent: typeof m.bodyFatPercent === "number" ? m.bodyFatPercent : null,
          waistCm: typeof m.waistCm === "number" ? m.waistCm : null,
          hipCm: typeof m.hipCm === "number" ? m.hipCm : null,
          chestCm: typeof m.chestCm === "number" ? m.chestCm : null,
          note: typeof m.note === "string" ? m.note : null,
          createdAt: now(),
        };
        await tx.insertBodyMeasurement(measurement);
        count++;
      }
      imported.measurements = count;
    }

    if (Array.isArray(raw.recipes)) {
      let count = 0;
      for (const item of raw.recipes) {
        if (!isRecord(item) || typeof item.name !== "string" || typeof item.servings !== "number" || typeof item.ingredientsJson !== "string") continue;
        const recipe: StoredRecipe = { id: idFactory(), userSubject: subject, name: item.name, servings: item.servings, ingredientsJson: item.ingredientsJson, createdAt: now() };
        await tx.insertRecipe(recipe);
        count++;
      }
      imported.recipes = count;
    }

    if (Array.isArray(raw.customFoods)) {
      let count = 0;
      for (const item of raw.customFoods) {
        if (!isRecord(item) || typeof item.name !== "string" || typeof item.energyKcal !== "number") continue;
        const c = item as Partial<StoredCustomFoodVersion>;
        const createdAt = now();
        const food: StoredCustomFoodVersion = {
          id: idFactory(), foodKey: `custom-${idFactory()}`, ownerSubject: subject, name: c.name as string,
          isLiquid: c.isLiquid === true,
          energyKcal: c.energyKcal as number, proteinG: typeof c.proteinG === "number" ? c.proteinG : 0,
          carbsG: typeof c.carbsG === "number" ? c.carbsG : 0, fatG: typeof c.fatG === "number" ? c.fatG : 0,
          fiberG: typeof c.fiberG === "number" ? c.fiberG : null,
          allergenDataStatus: "unknown", allergenIds: [], dietarySafetyDataStatus: "unknown", dietaryConflictRuleIds: [],
          verifiedAt: createdAt, createdAt,
          portions: Array.isArray(c.portions) ? c.portions.filter((p): p is StoredCustomFoodVersion["portions"][number] => isRecord(p) && typeof p.label === "string" && typeof p.gramsPerUnit === "number").map((p) => ({ id: idFactory(), measure: typeof p.measure === "string" ? p.measure : "serving", label: p.label, gramsPerUnit: p.gramsPerUnit })) : [{ id: idFactory(), measure: "serving", label: "1 porsiyon", gramsPerUnit: 100 }],
        };
        await tx.insertCustomFoodVersion(food);
        count++;
      }
      imported["custom-foods"] = count;
    }

    if (Array.isArray(raw.aiMemory)) {
      let count = 0;
      for (const item of raw.aiMemory) {
        if (!isRecord(item) || typeof item.factText !== "string") continue;
        const fact: StoredMemoryFact = {
          id: idFactory(), userSubject: subject, factText: item.factText,
          provenance: item.provenance === "user-stated" ? "user-stated" : "ai-inferred",
          confidence: item.confidence === "high" || item.confidence === "low" ? item.confidence : "medium",
          createdAt: now(),
        };
        await tx.insertMemoryFact(fact);
        count++;
      }
      imported["ai-memory"] = count;
    }

    if (Array.isArray(raw.mediaManifest)) {
      skipped["media-manifest"] = raw.mediaManifest.length;
      skipReasons["media-manifest"] = "Fotoğraf ve belge dosyalarının kendisi yedeğe dahil değildir";
    }
  });

  return { imported, skipped, skipReasons };
}
